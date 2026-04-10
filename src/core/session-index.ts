import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import readline from "node:readline";

import type { InternalCategory, SessionKind, SessionSummary } from "./types";

interface SessionIndexRow {
  id?: string;
  thread_name?: string;
  updated_at?: string;
}

interface HistoryRow {
  session_id?: string;
  text?: string;
}

interface SessionMetaPayload {
  id?: string;
  timestamp?: string;
  cwd?: unknown;
  originator?: unknown;
  source?: unknown;
  agent_nickname?: unknown;
  agent_role?: unknown;
}

interface SessionMetaRow {
  timestamp?: string;
  type?: string;
  payload?: SessionMetaPayload;
}

interface MessageRange {
  firstMessageAt: string;
  lastMessageAt: string;
}

export function stringifyMetadata(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function classifySessionKind(originator: unknown, source: unknown): SessionKind {
  const originatorLower = stringifyMetadata(originator).toLowerCase();
  const sourceLower = stringifyMetadata(source).toLowerCase();

  if (originatorLower === "codex_vscode") {
    return "vscode";
  }
  if (originatorLower.includes("desktop")) {
    return "desktop";
  }
  if (originatorLower === "codex_cli_rs" || sourceLower === "cli") {
    return "cli";
  }

  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractThreadSpawnRecord(source: unknown): Record<string, unknown> | undefined {
  const sourceRecord = asRecord(source);
  const subagentRecord = asRecord(sourceRecord?.subagent);
  return asRecord(subagentRecord?.thread_spawn);
}

function extractParentSessionId(source: unknown): string | undefined {
  const parentThreadId = extractThreadSpawnRecord(source)?.parent_thread_id;
  return typeof parentThreadId === "string" && parentThreadId.trim() ? parentThreadId.trim() : undefined;
}

function isMemoryConsolidationSource(source: unknown): boolean {
  const sourceRecord = asRecord(source);
  const subagentValue = sourceRecord?.subagent;
  if (typeof subagentValue === "string" && subagentValue.toLowerCase().includes("memory_consolidation")) {
    return true;
  }
  return stringifyMetadata(source).toLowerCase().includes("memory_consolidation");
}

export function firstLine(text: string, maxLength = 80): string {
  const trimmed = text.trim();
  const line = trimmed ? trimmed.split(/\r?\n/, 1)[0] ?? "Untitled Session" : "Untitled Session";
  const normalized = line.replace(/\[Image #\d+\]/g, "（图片）").replace(/\s{2,}/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}

function isUsefulTitle(title: string, sessionId: string): boolean {
  const normalized = title.trim();
  if (!normalized) {
    return false;
  }
  if (normalized === sessionId) {
    return false;
  }
  if (
    normalized.startsWith("# AGENTS.md instructions for ") ||
    normalized.startsWith("AGENTS.md instructions for ") ||
    normalized.startsWith("<environment_context>") ||
    normalized.startsWith("<collaboration_mode>") ||
    normalized.startsWith("<permissions instructions>")
  ) {
    return false;
  }
  return true;
}

function isInternalSessionTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    normalized.startsWith("## memory writing agent:") ||
    normalized.startsWith("memory writing agent:") ||
    normalized.startsWith("memory consolidation")
  );
}

function isInternalSessionContext(cwd: string, source: unknown): boolean {
  const normalizedCwd = cwd.toLowerCase();
  const normalizedSource = stringifyMetadata(source).toLowerCase();
  return (
    normalizedCwd.includes("\\.codex\\memories") ||
    normalizedCwd.includes("/.codex/memories") ||
    normalizedSource.includes("memory_consolidation")
  );
}

function classifyInternalCategory(title: string, cwd: string, source: unknown, parentSessionId?: string): InternalCategory | undefined {
  if (isInternalSessionTitle(title) || isInternalSessionContext(cwd, source) || isMemoryConsolidationSource(source)) {
    return "memory_consolidation";
  }

  if (parentSessionId) {
    return "subagent";
  }

  return undefined;
}

export function parseTimestamp(value: string): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

async function readJsonlRows<T>(path: string): Promise<T[]> {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => JSON.parse(line) as T);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readFirstJsonlRow<T>(path: string): Promise<T | undefined> {
  const input = createReadStream(path, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      return JSON.parse(trimmed) as T;
    }
    return undefined;
  } finally {
    rl.close();
    input.close();
  }
}

function extractUserTextFromPayload(payload: Record<string, unknown>): string | undefined {
  if (payload.type === "user_message") {
    const message = payload.message;
    return typeof message === "string" && message.trim() ? firstLine(message) : undefined;
  }

  return undefined;
}

function isVisibleTranscriptRow(rowType: string | undefined, payload: Record<string, unknown>): boolean {
  if (rowType === "event_msg" && payload.type === "user_message") {
    return true;
  }

  return (
    rowType === "response_item" &&
    payload.type === "message" &&
    (payload.role === "user" || payload.role === "assistant")
  );
}

async function extractMessageRange(path: string, fallbackTimestamp: string): Promise<MessageRange> {
  const input = createReadStream(path, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let firstMessageAt: string | undefined;
  let lastMessageAt: string | undefined;

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const row = JSON.parse(trimmed) as SessionMetaRow;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (!isVisibleTranscriptRow(row.type, payload)) {
        continue;
      }

      const timestamp = stringifyMetadata(row.timestamp ?? "");
      if (!timestamp) {
        continue;
      }

      if (!firstMessageAt) {
        firstMessageAt = timestamp;
      }
      lastMessageAt = timestamp;
    }
  } finally {
    rl.close();
    input.close();
  }

  return {
    firstMessageAt: firstMessageAt ?? fallbackTimestamp,
    lastMessageAt: lastMessageAt ?? firstMessageAt ?? fallbackTimestamp
  };
}

async function inferSessionTitle(path: string, sessionId: string): Promise<string> {
  const input = createReadStream(path, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lineCount = 0;

  try {
    for await (const line of rl) {
      lineCount += 1;
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const row = JSON.parse(trimmed) as SessionMetaRow;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const inferred = extractUserTextFromPayload(payload);
      if (inferred) {
        return inferred;
      }

      if (lineCount >= 400) {
        break;
      }
    }
  } finally {
    rl.close();
    input.close();
  }

  return sessionId;
}

export function buildChildSessionMap(sessions: SessionSummary[]): Map<string, SessionSummary[]> {
  const childMap = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    if (!session.parentSessionId) {
      continue;
    }

    const siblings = childMap.get(session.parentSessionId) ?? [];
    siblings.push(session);
    childMap.set(session.parentSessionId, siblings);
  }

  for (const [parentSessionId, children] of childMap) {
    childMap.set(
      parentSessionId,
      [...children].sort(
        (left, right) => parseTimestamp(left.timestamp || left.updatedAt) - parseTimestamp(right.timestamp || right.updatedAt)
      )
    );
  }

  return childMap;
}

async function loadSessionIndex(root: string): Promise<Map<string, SessionIndexRow>> {
  const path = join(root, "session_index.jsonl");
  if (!(await pathExists(path))) {
    return new Map();
  }

  const rows = await readJsonlRows<SessionIndexRow>(path);
  return new Map(rows.filter((row) => row.id).map((row) => [row.id as string, row]));
}

async function loadHistoryTitles(root: string): Promise<Map<string, string>> {
  const path = join(root, "history.jsonl");
  if (!(await pathExists(path))) {
    return new Map();
  }

  const rows = await readJsonlRows<HistoryRow>(path);
  const titles = new Map<string, string>();
  for (const row of rows) {
    if (!row.session_id || !row.text || titles.has(row.session_id)) {
      continue;
    }
    titles.set(row.session_id, firstLine(row.text));
  }
  return titles;
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonlFiles(fullPath);
      }
      if (entry.isFile() && fullPath.endsWith(".jsonl")) {
        return [fullPath];
      }
      return [];
    })
  );

  return paths.flat();
}

export async function scanSessions(root: string): Promise<SessionSummary[]> {
  const sessionIndex = await loadSessionIndex(root);
  const historyTitles = await loadHistoryTitles(root);
  const sessionsRoot = join(root, "sessions");
  const sessionFiles = await listJsonlFiles(sessionsRoot);

  const summaries: SessionSummary[] = [];

  for (const filePath of sessionFiles) {
    const firstRow = await readFirstJsonlRow<SessionMetaRow>(filePath);
    if (!firstRow || firstRow.type !== "session_meta") {
      continue;
    }

    const payload = firstRow.payload ?? {};
    const sessionId = payload.id;
    if (!sessionId) {
      continue;
    }

    const indexRow = sessionIndex.get(sessionId);
    const updatedAt = indexRow?.updated_at ?? payload.timestamp ?? firstRow.timestamp ?? "";
    const rawTitle = (indexRow?.thread_name ?? historyTitles.get(sessionId) ?? "").trim();
    const title = isUsefulTitle(rawTitle, sessionId) ? rawTitle : await inferSessionTitle(filePath, sessionId);

    const parentSessionId = extractParentSessionId(payload.source);
    const internalCategory = classifyInternalCategory(title, stringifyMetadata(payload.cwd), payload.source, parentSessionId);

    const messageRange = await extractMessageRange(
      filePath,
      stringifyMetadata(payload.timestamp ?? firstRow.timestamp ?? updatedAt)
    );

    summaries.push({
      sessionId,
      title,
      kind: classifySessionKind(payload.originator, payload.source),
      originator: stringifyMetadata(payload.originator),
      source: stringifyMetadata(payload.source),
      cwd: stringifyMetadata(payload.cwd),
      timestamp: stringifyMetadata(payload.timestamp ?? firstRow.timestamp ?? ""),
      updatedAt: stringifyMetadata(updatedAt),
      firstMessageAt: messageRange.firstMessageAt,
      lastMessageAt: messageRange.lastMessageAt,
      path: filePath,
      isInternal: internalCategory === "memory_consolidation",
      internalCategory,
      parentSessionId,
      agentNickname: stringifyMetadata(payload.agent_nickname),
      agentRole: stringifyMetadata(payload.agent_role)
    });
  }

  const stats = await Promise.all(
    summaries.map(async (summary) => ({
      summary,
      mtime: (await stat(summary.path)).mtimeMs
    }))
  );

  const sortedSummaries = stats
    .sort((left, right) => {
      const delta = parseTimestamp(right.summary.updatedAt) - parseTimestamp(left.summary.updatedAt);
      return delta !== 0 ? delta : right.mtime - left.mtime;
    })
    .map((entry) => entry.summary);

  const childMap = buildChildSessionMap(sortedSummaries);
  return sortedSummaries.map((summary) => ({
    ...summary,
    childSessionCount: childMap.get(summary.sessionId)?.length ?? 0
  }));
}
