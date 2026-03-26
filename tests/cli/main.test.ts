import { describe, expect, it } from "vitest";

import { parseArgs } from "../../src/cli/main";

describe("cli main", () => {
  it("parses export arguments with time filter and timestamp flag", () => {
    const options = parseArgs([
      "export",
      "--root",
      "C:\\Users\\20312\\.codex",
      "--kind",
      "desktop",
      "--latest",
      "2",
      "--profile",
      "audit",
      "--output-dir",
      "E:\\exports",
      "--start",
      "2026-03-24T10:00:00Z",
      "--end",
      "2026-03-24T11:00:00Z",
      "--include-message-timestamps"
    ]);

    expect(options.command).toBe("export");
    expect(options.kind).toBe("desktop");
    expect(options.latest).toBe(2);
    expect(options.profile).toBe("audit");
    expect(options.outputDir).toContain("E:\\exports");
    expect(options.start).toBe("2026-03-24T10:00:00Z");
    expect(options.end).toBe("2026-03-24T11:00:00Z");
    expect(options.includeMessageTimestamps).toBe(true);
  });
});
