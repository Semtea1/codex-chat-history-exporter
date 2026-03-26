import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { exportSession } from "../../src/core/exporter";
import { getBuiltinProfiles } from "../../src/core/profile";
import type { SessionSummary } from "../../src/core/types";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk6cAAAAASUVORK5CYII=";

const tempRoots: string[] = [];

describe("exporter", () => {
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("exports a reading profile session into a single transcript document", async () => {
    const root = await mkdtemp(join(tmpdir(), "chat-exporter-"));
    tempRoots.push(root);

    const codexRoot = join(root, ".codex");
    const sessionsDir = join(codexRoot, "sessions", "2026", "03", "24");
    await mkdir(sessionsDir, { recursive: true });

    const sessionPath = join(sessionsDir, "session.jsonl");
    await writeFile(
      sessionPath,
      [
        JSON.stringify({
          timestamp: "2026-03-24T10:00:00Z",
          type: "session_meta",
          payload: {
            id: "session-1",
            timestamp: "2026-03-24T10:00:00Z",
            cwd: "C:/repo",
            originator: "Codex Desktop",
            source: "exec"
          }
        }),
        JSON.stringify({
          type: "turn_context",
          payload: { turn_id: "turn-1" }
        }),
        JSON.stringify({
          timestamp: "2026-03-24T10:00:01Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "用户消息",
            images: [`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`],
            local_images: []
          }
        }),
        JSON.stringify({
          timestamp: "2026-03-24T10:00:02Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "助手回复" }]
          }
        })
      ].join("\n"),
      "utf8"
    );

    const summary: SessionSummary = {
      sessionId: "session-1",
      title: "Test Session",
      kind: "desktop",
      originator: "Codex Desktop",
      source: "exec",
      cwd: "C:/repo",
      timestamp: "2026-03-24T10:00:00Z",
      updatedAt: "2026-03-24T10:00:00Z",
      path: sessionPath
    };

    const outputRoot = join(root, "outputs");
    const result = await exportSession(summary, getBuiltinProfiles()[0]!, outputRoot);

    expect(result.documents.some((path) => path.endsWith("transcript.md"))).toBe(true);
    expect(result.assetFiles).toHaveLength(1);

    const { readFile } = await import("node:fs/promises");
    const transcript = await readFile(result.documents[0]!, "utf8");
    expect(transcript).toContain("用户消息");
    expect(transcript).toContain("助手回复");
  });

  it("exports a forensics profile session into split documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "chat-exporter-"));
    tempRoots.push(root);

    const codexRoot = join(root, ".codex");
    const sessionsDir = join(codexRoot, "sessions", "2026", "03", "24");
    await mkdir(sessionsDir, { recursive: true });

    const sessionPath = join(sessionsDir, "session.jsonl");
    await writeFile(
      sessionPath,
      [
        JSON.stringify({
          timestamp: "2026-03-24T10:00:00Z",
          type: "session_meta",
          payload: {
            id: "session-2",
            timestamp: "2026-03-24T10:00:00Z",
            cwd: "C:/repo",
            originator: "Codex Desktop",
            source: "exec"
          }
        }),
        JSON.stringify({
          timestamp: "2026-03-24T10:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "developer",
            content: [{ type: "input_text", text: "<permissions instructions>\n...\n</permissions instructions>" }]
          }
        }),
        JSON.stringify({
          timestamp: "2026-03-24T10:00:02Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "shell",
            call_id: "call-1",
            arguments: "{\"command\": [\"echo\", \"hello\"]}"
          }
        })
      ].join("\n"),
      "utf8"
    );

    const summary: SessionSummary = {
      sessionId: "session-2",
      title: "Forensics Session",
      kind: "desktop",
      originator: "Codex Desktop",
      source: "exec",
      cwd: "C:/repo",
      timestamp: "2026-03-24T10:00:00Z",
      updatedAt: "2026-03-24T10:00:00Z",
      path: sessionPath
    };

    const childSessionPath = join(sessionsDir, "child-session.jsonl");
    await writeFile(
      childSessionPath,
      [
        JSON.stringify({
          timestamp: "2026-03-24T10:05:00Z",
          type: "session_meta",
          payload: {
            id: "session-2-child",
            timestamp: "2026-03-24T10:05:00Z",
            cwd: "C:/repo",
            originator: "Codex Desktop",
            source: {
              subagent: {
                thread_spawn: {
                  parent_thread_id: "session-2",
                  depth: 1
                }
              }
            }
          }
        }),
        JSON.stringify({
          timestamp: "2026-03-24T10:05:01Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "child session message",
            images: [],
            local_images: []
          }
        })
      ].join("\n"),
      "utf8"
    );

    const outputRoot = join(root, "outputs");
    const result = await exportSession(summary, getBuiltinProfiles()[2]!, outputRoot, {
      childSessions: [
        {
          sessionId: "session-2-child",
          title: "Child Session",
          kind: "desktop",
          originator: "Codex Desktop",
          source: "{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\"session-2\"}}}",
          cwd: "C:/repo",
          timestamp: "2026-03-24T10:05:00Z",
          updatedAt: "2026-03-24T10:05:00Z",
          path: childSessionPath,
          parentSessionId: "session-2"
        }
      ]
    });

    expect(result.documents.some((path) => path.endsWith("hidden-context.md"))).toBe(true);
    expect(result.documents.some((path) => path.endsWith("tool-trace.md"))).toBe(true);
    expect(result.documents.some((path) => path.endsWith("child-sessions.md"))).toBe(true);
  });
});
