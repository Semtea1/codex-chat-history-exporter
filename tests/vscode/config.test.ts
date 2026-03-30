import { describe, expect, it } from "vitest";

import { resolveExtensionRuntimeConfig } from "../../src/vscode/config";

describe("resolveExtensionRuntimeConfig", () => {
  it("uses explicit settings when provided", () => {
    const config = {
      get<T>(key: string, defaultValue?: T): T | undefined {
        const values: Record<string, unknown> = {
          codexRoot: "D:/custom/.codex",
          defaultOutputDir: "E:/exports",
          maxSessionsInWizard: 50
        };
        return (values[key] as T | undefined) ?? defaultValue;
      }
    };

    const resolved = resolveExtensionRuntimeConfig(config, { USERPROFILE: "C:/Users/test" });

    expect(resolved).toEqual({
      codexRoot: "D:/custom/.codex",
      defaultOutputDir: "E:/exports",
      maxSessionsInWizard: 50,
      showInternalSessions: false
    });
  });

  it("falls back to CODEX_HOME or USERPROFILE", () => {
    const config = {
      get<T>(_key: string, defaultValue?: T): T | undefined {
        return defaultValue;
      }
    };

    const resolved = resolveExtensionRuntimeConfig(config, {
      CODEX_HOME: "C:/Users/test/.codex",
      USERPROFILE: "C:/Users/test"
    });

    expect(resolved.codexRoot).toBe("C:/Users/test/.codex");
    expect(resolved.maxSessionsInWizard).toBe(1000);
    expect(resolved.showInternalSessions).toBe(false);
  });

  it("falls back to HOME/.codex on Unix-like systems", () => {
    const config = {
      get<T>(_key: string, defaultValue?: T): T | undefined {
        return defaultValue;
      }
    };

    const resolved = resolveExtensionRuntimeConfig(config, {
      HOME: "/home/testuser"
    });

    expect(resolved.codexRoot).toBe("/home/testuser/.codex");
    expect(resolved.maxSessionsInWizard).toBe(1000);
    expect(resolved.showInternalSessions).toBe(false);
  });
});
