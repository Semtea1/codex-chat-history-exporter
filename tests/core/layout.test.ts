import { describe, expect, it } from "vitest";

import { createDocumentPlan } from "../../src/core/layout";
import { getBuiltinProfiles } from "../../src/core/profile";

describe("layout", () => {
  it("creates a single-document plan for reading profile", () => {
    const profile = getBuiltinProfiles()[0]!;

    const plan = createDocumentPlan(profile);

    expect(plan.map((item) => item.fileName)).toEqual(["transcript.md", "child-sessions.md"]);
  });

  it("creates split documents for forensics profile", () => {
    const profile = getBuiltinProfiles()[2]!;

    const plan = createDocumentPlan(profile);

    expect(plan.map((item) => item.fileName)).toEqual([
      "transcript.md",
      "hidden-context.md",
      "tool-trace.md",
      "child-sessions.md"
    ]);
  });
});
