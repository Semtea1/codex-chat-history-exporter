import { describe, expect, it } from "vitest";

import { getBuiltinProfiles } from "../../src/core/profile";
import { getAllSectionDefinitions } from "../../src/core/section-groups";
import { renderExportWizardHtml } from "../../src/vscode/webview/exportWizard";
import type { SessionSummary } from "../../src/core/types";

const sessions: SessionSummary[] = [
  {
    sessionId: "session-1",
    title: "First Session",
    kind: "desktop",
    originator: "Codex Desktop",
    source: "exec",
    cwd: "C:/repo",
    timestamp: "2026-03-24T10:00:00Z",
    updatedAt: "2026-03-24T10:10:00Z",
    firstMessageAt: "2026-03-24T10:00:00Z",
    lastMessageAt: "2026-03-24T10:10:00Z",
    path: "C:/tmp/session-1.jsonl",
    childSessionCount: 2
  },
  {
    sessionId: "session-2",
    title: "Second Session",
    kind: "vscode",
    originator: "codex_vscode",
    source: "vscode",
    cwd: "C:/repo2",
    timestamp: "2026-03-24T11:00:00Z",
    updatedAt: "2026-03-24T11:10:00Z",
    firstMessageAt: "2026-03-24T11:00:00Z",
    lastMessageAt: "2026-03-24T11:10:00Z",
    path: "C:/tmp/session-2.jsonl",
    parentSessionId: "session-1"
  },
  {
    sessionId: "session-3",
    title: "Internal Session",
    kind: "desktop",
    originator: "Codex Desktop",
    source: "{\"subagent\":\"memory_consolidation\"}",
    cwd: "C:/repo3",
    timestamp: "2026-03-24T12:00:00Z",
    updatedAt: "2026-03-24T12:10:00Z",
    firstMessageAt: "2026-03-24T12:00:00Z",
    lastMessageAt: "2026-03-24T12:10:00Z",
    path: "C:/tmp/session-3.jsonl",
    isInternal: true,
    internalCategory: "memory_consolidation"
  }
];

describe("exportWizard", () => {
  it("renders stacked layout, type filtering and child-session hints", () => {
    const html = renderExportWizardHtml({
      profiles: getBuiltinProfiles(),
      sections: getAllSectionDefinitions(),
      sessions,
      childPreviewMap: {
        "session-1": [
          {
            sessionId: "child-1",
            title: "Child Session",
            updatedAt: "2026-03-24T10:15:00Z",
            agentNickname: "Erdos",
            agentRole: "worker",
            previewText: "用户：请检查日志\n\n助手：已完成检查"
          },
          {
            sessionId: "child-2",
            title: "Child Session 2",
            updatedAt: "2026-03-24T10:16:00Z",
            agentNickname: "Nash",
            agentRole: "worker",
            previewText: "用户：继续检查\n\n助手：已补充结果"
          }
        ]
      },
      uiState: {
        selectedProfileId: "reading",
        selectedSessionIds: ["session-2"],
        outputDir: "E:/exports",
        includeChildSessionsAsAppendix: true
      }
    });

    expect(html).toContain("Codex Chat Exporter");
    expect(html).toContain("会话选择");
    expect(html).toContain("导出设置");
    expect(html).toContain("总会话");
    expect(html).toContain("内部会话");
    expect(html).toContain("子会话");
    expect(html).toContain("主会话");
    expect(html).toContain("session-type-filter");
    expect(html).toContain("附 2 个子会话");
    expect(html).toContain("子会话");
    expect(html).toContain("内部维护会话");
    expect(html).toContain("准备导出");
    expect(html).toContain("确认当前选择后再生成导出文件");
    expect(html).toContain("附带子会话附录");
    expect(html).toContain("展开查看子会话");
    expect(html).toContain("按末句日期排序");
    expect(html).toContain("按首句日期排序");
    expect(html).toContain("按末句日期筛选");
    expect(html).toContain("首句：2026-03-24T10:00:00Z");
    expect(html).toContain("末句：2026-03-24T10:10:00Z");
    expect(html).toContain("Child Session");
    expect(html).toContain("session_meta");
    expect(html).toContain("生成导出文件");
  });

  it("embeds initial JSON payload for client-side interactivity", () => {
    const html = renderExportWizardHtml({
      profiles: getBuiltinProfiles(),
      sections: getAllSectionDefinitions(),
      sessions,
      childPreviewMap: {},
      uiState: {
        selectedProfileId: "audit",
        selectedSessionIds: ["session-1"],
        includeMessageTimestamps: true,
        includeChildSessionsAsAppendix: true,
        start: "2026-03-24T10:00:00Z",
        end: "2026-03-24T11:00:00Z"
      }
    });

    expect(html).toContain('"selectedProfileId":"audit"');
    expect(html).toContain('"selectedSessionIds":["session-1"]');
    expect(html).toContain('"includeChildSessionsAsAppendix":true');
    expect(html).toContain("acquireVsCodeApi");
    expect(html).toContain('window.addEventListener("message"');
  });
});
