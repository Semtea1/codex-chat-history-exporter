import { describe, expect, it } from "vitest";

import { getBuiltinProfiles } from "../../src/core/profile";
import {
  renderChildSessionsDocument,
  renderHiddenContextDocument,
  renderMainDocument,
  renderToolTraceDocument
} from "../../src/core/markdown-renderer";
import type { SessionSummary, TimelineItem } from "../../src/core/types";

const summary: SessionSummary = {
  sessionId: "session-1",
  title: "Test Session",
  kind: "desktop",
  originator: "Codex Desktop",
  source: "exec",
  cwd: "C:/repo",
  timestamp: "2026-03-24T10:00:00Z",
  updatedAt: "2026-03-24T10:10:00Z",
  path: "C:/tmp/session.jsonl"
};

const items: TimelineItem[] = [
  {
    id: "t1",
    kind: "transcript",
    role: "user",
    text: "用户消息",
    images: ["assets/example.png"],
    source: "event_msg",
    turn: 1,
    timestamp: "2026-03-24T10:00:00Z",
    sectionId: "transcript"
  },
  {
    id: "ctx1",
    kind: "context",
    title: "workspace_context",
    content: "# AGENTS.md instructions for C:/repo",
    turn: 0,
    timestamp: "2026-03-24T09:59:00Z",
    sectionId: "workspace_context"
  },
  {
    id: "tool1",
    kind: "tool_call",
    callId: "call-1",
    name: "shell",
    argumentsText: "{\"command\":[\"echo\",\"hello\"]}",
    turn: 1,
    timestamp: "2026-03-24T10:01:00Z",
    sectionId: "tool_trace"
  }
];

describe("markdown-renderer", () => {
  it("renders main document with transcript and timestamps", () => {
    const profile = {
      ...getBuiltinProfiles()[1]!,
      includeMessageTimestamps: true
    };

    const markdown = renderMainDocument(summary, items, profile);

    expect(markdown).toContain("# Test Session");
    expect(markdown).toContain("## Metadata");
    expect(markdown).toContain("[`2026-03-24 18:00:00 UTC+08:00`] 用户消息");
    expect(markdown).toContain("![user-1](assets/example.png)");
  });

  it("renders hidden context documents with section labels", () => {
    const markdown = renderHiddenContextDocument(summary, items);

    expect(markdown).toContain("工作区规则上下文");
    expect(markdown).toContain("项目规则、技能清单、环境上下文与当前工作边界");
  });

  it("renders tool trace documents", () => {
    const markdown = renderToolTraceDocument(summary, items, getBuiltinProfiles()[2]!);

    expect(markdown).toContain("Tool call: shell (call-1)");
    expect(markdown).toContain('{"command":["echo","hello"]}');
  });

  it("renders child session appendix documents", () => {
    const childMarkdown = renderChildSessionsDocument(
      summary,
      [
        {
          summary: {
            ...summary,
            sessionId: "child-1",
            title: "Child Session",
            parentSessionId: "session-1",
            agentNickname: "Erdos",
            agentRole: "worker"
          },
          items
        }
      ],
      getBuiltinProfiles()[2]!
    );

    expect(childMarkdown).toContain("# Test Session - Child Sessions Appendix");
    expect(childMarkdown).toContain("Includes only verifiable child sessions");
    expect(childMarkdown).toContain("## 1. Child Session");
    expect(childMarkdown).toContain("Parent Session ID");
  });
});
