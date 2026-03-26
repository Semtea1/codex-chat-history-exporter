import { readFile } from "node:fs/promises";

import type { RawSessionRow, SessionSummary } from "./types";

export async function loadSessionRows(path: string): Promise<RawSessionRow[]> {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawSessionRow);
}

export async function loadSessionRowsFromSummary(summary: Pick<SessionSummary, "path">): Promise<RawSessionRow[]> {
  return loadSessionRows(summary.path);
}
