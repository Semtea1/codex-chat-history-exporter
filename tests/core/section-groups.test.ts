import { describe, expect, it } from "vitest";

import {
  classifyContextText,
  getAllSectionDefinitions,
  getSectionDefinition,
  isExportSectionId
} from "../../src/core/section-groups";

describe("section-groups", () => {
  it("exposes all expected export sections", () => {
    const definitions = getAllSectionDefinitions();

    expect(definitions.map((item) => item.id)).toEqual([
      "transcript",
      "session_meta",
      "system_context",
      "memory_context",
      "workspace_context",
      "collaboration_context",
      "tool_trace"
    ]);
  });

  it("returns human labels with raw field names", () => {
    const transcript = getSectionDefinition("transcript");
    const toolTrace = getSectionDefinition("tool_trace");

    expect(transcript.label).toContain("聊天正文与图片");
    expect(transcript.rawFieldNames).toContain("user_message");
    expect(toolTrace.rawFieldNames).toContain("function_call");
  });

  it("classifies hidden context text blocks with heuristics", () => {
    expect(classifyContextText("<permissions instructions>\n...\n</permissions instructions>")).toBe("system_context");
    expect(classifyContextText("## Memory\n...")).toBe("memory_context");
    expect(classifyContextText("# AGENTS.md instructions for C:\\repo")).toBe("workspace_context");
    expect(classifyContextText("<collaboration_mode>Default</collaboration_mode>")).toBe(
      "collaboration_context"
    );
  });

  it("validates export section ids", () => {
    expect(isExportSectionId("transcript")).toBe(true);
    expect(isExportSectionId("not-real")).toBe(false);
  });
});
