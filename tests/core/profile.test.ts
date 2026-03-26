import { describe, expect, it } from "vitest";

import { getBuiltinProfiles, validateProfile } from "../../src/core/profile";
import type { ExportProfile } from "../../src/core/types";

describe("profile", () => {
  it("provides three builtin export profiles", () => {
    const profiles = getBuiltinProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual(["reading", "audit", "forensics"]);
    expect(profiles[0]?.includedSections).toEqual(["transcript"]);
    expect(profiles[1]?.includedSections).toEqual(["transcript", "tool_trace", "session_meta"]);
    expect(profiles[2]?.includedSections).toContain("system_context");
    expect(profiles.every((profile) => profile.includeChildSessionsAsAppendix)).toBe(true);
  });

  it("rejects invalid layout combinations", () => {
    const profile: ExportProfile = {
      id: "custom",
      name: "Custom",
      description: "test",
      includedSections: ["transcript"],
      documentMode: "single",
      hiddenContentMode: "split",
      toolTraceLevel: "summary",
      includeMessageTimestamps: false,
      includeChildSessionsAsAppendix: true,
      linkedTraceTimeBehavior: "none",
      builtin: false
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("single");
  });

  it("accepts a valid custom profile with time filter", () => {
    const profile: ExportProfile = {
      id: "custom",
      name: "Custom",
      description: "test",
      includedSections: ["transcript", "workspace_context"],
      documentMode: "multi",
      hiddenContentMode: "split",
      toolTraceLevel: "full",
      includeMessageTimestamps: true,
      includeChildSessionsAsAppendix: true,
      transcriptTimeFilter: {
        enabled: true,
        start: "2026-03-24T10:00:00Z",
        end: "2026-03-24T11:00:00Z"
      },
      linkedTraceTimeBehavior: "related_only",
      defaultOutputDir: "E:/exports",
      builtin: false
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
