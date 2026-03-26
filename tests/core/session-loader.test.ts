import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadSessionRows, loadSessionRowsFromSummary } from "../../src/core/session-loader";

const tempRoots: string[] = [];

describe("session-loader", () => {
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      tempRoots.splice(0).map(async (root) => {
        await rm(root, { recursive: true, force: true });
      })
    );
  });

  it("loads raw session rows from a jsonl file", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-chat-loader-"));
    tempRoots.push(root);

    const sessionsDir = join(root, ".codex", "sessions", "2026", "03", "24");
    await mkdir(sessionsDir, { recursive: true });

    const path = join(sessionsDir, "sample.jsonl");
    await writeFile(
      path,
      [
        JSON.stringify({ timestamp: "2026-03-24T10:00:00Z", type: "session_meta", payload: { id: "s1" } }),
        "",
        JSON.stringify({ timestamp: "2026-03-24T10:00:01Z", type: "turn_context", payload: { turn_id: "turn-1" } })
      ].join("\n"),
      "utf8"
    );

    const rows = await loadSessionRows(path);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.type).toBe("session_meta");
    expect(rows[1]?.type).toBe("turn_context");
  });

  it("loads raw session rows from a session summary", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-chat-loader-"));
    tempRoots.push(root);

    const sessionsDir = join(root, ".codex", "sessions", "2026", "03", "24");
    await mkdir(sessionsDir, { recursive: true });

    const path = join(sessionsDir, "sample.jsonl");
    await writeFile(
      path,
      JSON.stringify({ timestamp: "2026-03-24T10:00:00Z", type: "session_meta", payload: { id: "s1" } }),
      "utf8"
    );

    const rows = await loadSessionRowsFromSummary({ path });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({ id: "s1" });
  });
});
