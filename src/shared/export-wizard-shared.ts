import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildChildSessionMap } from "../core/session-index";
import { loadSessionRowsFromSummary } from "../core/session-loader";
import { normalizeTimeline } from "../core/timeline";

import type { ExportProfile, SessionSummary } from "../core/types";

export interface ChildSessionPreview {
  sessionId: string;
  title: string;
  updatedAt: string;
  agentNickname?: string;
  agentRole?: string;
  parentSessionId?: string;
  previewText: string;
}

export interface WizardPayload {
  selectedProfileId: string;
  selectedSessionIds: string[];
  outputDir: string;
  codexRoot?: string;
  documentMode: ExportProfile["documentMode"];
  hiddenContentMode: ExportProfile["hiddenContentMode"];
  toolTraceLevel: ExportProfile["toolTraceLevel"];
  includeMessageTimestamps: boolean;
  includeChildSessionsAsAppendix: boolean;
  includedSections: ExportProfile["includedSections"];
  start?: string;
  end?: string;
  customProfileName?: string;
}

export function buildProfileFromWizardPayload(payload: WizardPayload, sourceProfile?: ExportProfile): ExportProfile {
  return {
    id: sourceProfile?.id ?? "reading",
    name: sourceProfile?.name ?? "临时导出模式",
    description: sourceProfile?.description ?? "由导出向导生成的临时配置。",
    includedSections: payload.includedSections,
    documentMode: payload.documentMode,
    hiddenContentMode: payload.hiddenContentMode,
    toolTraceLevel: payload.toolTraceLevel,
    includeMessageTimestamps: payload.includeMessageTimestamps,
    includeChildSessionsAsAppendix: payload.includeChildSessionsAsAppendix,
    transcriptTimeFilter:
      payload.start || payload.end
        ? {
            enabled: true,
            start: payload.start,
            end: payload.end
          }
        : undefined,
    linkedTraceTimeBehavior: sourceProfile?.linkedTraceTimeBehavior ?? "related_only",
    defaultOutputDir: payload.outputDir || sourceProfile?.defaultOutputDir,
    builtin: sourceProfile?.builtin ?? false
  };
}

export async function writeExportIndex(outputDir: string, rows: Array<{ title: string; sessionDir: string }>): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const lines = ["# Export Index", ""];
  for (const row of rows) {
    const folderName = row.sessionDir.split(/[\\/]/).pop() ?? row.sessionDir;
    lines.push(`- [${row.title}](${folderName}/transcript.md)`);
  }
  await writeFile(join(outputDir, "index.md"), `${lines.join("\n")}\n`, "utf8");
}

export async function summarizeChildSessionContent(summary: SessionSummary, limit = 260): Promise<string> {
  try {
    const rows = await loadSessionRowsFromSummary(summary);
    const items = normalizeTimeline(rows);
    const transcript = items
      .filter((item) => item.kind === "transcript")
      .slice(0, 4)
      .map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.text}`)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!transcript) {
      return "该子会话暂无可预览的正文内容。";
    }

    return transcript.length <= limit ? transcript : `${transcript.slice(0, limit)}…`;
  } catch {
    return "该子会话预览读取失败。";
  }
}

export async function buildChildSessionPreviewMap(
  sessions: SessionSummary[]
): Promise<Record<string, ChildSessionPreview[]>> {
  const childSessionMap = buildChildSessionMap(sessions);
  const previewEntries = await Promise.all(
    [...childSessionMap.entries()].map(async ([parentSessionId, childSessions]) => {
      const previews = await Promise.all(
        childSessions.map(async (session) => ({
          sessionId: session.sessionId,
          title: session.title,
          updatedAt: session.updatedAt || session.timestamp,
          agentNickname: session.agentNickname,
          agentRole: session.agentRole,
          parentSessionId: session.parentSessionId,
          previewText: await summarizeChildSessionContent(session)
        }))
      );

      return [parentSessionId, previews] as const;
    })
  );

  return Object.fromEntries(previewEntries);
}
