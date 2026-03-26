import { describe, expect, it } from "vitest";

import { InMemoryMemento, ProfileStore } from "../../src/vscode/state/profileStore";
import type { ExportProfile } from "../../src/core/types";

function createCustomProfile(): ExportProfile {
  return {
    id: "custom-one",
    name: "Custom One",
    description: "custom profile",
    includedSections: ["transcript", "tool_trace"],
    documentMode: "multi",
    hiddenContentMode: "split",
    toolTraceLevel: "full",
    includeMessageTimestamps: true,
    linkedTraceTimeBehavior: "related_only",
    defaultOutputDir: "E:/exports",
    builtin: false
  };
}

describe("ProfileStore", () => {
  it("merges builtin and custom profiles", async () => {
    const store = new ProfileStore(new InMemoryMemento());

    await store.saveProfile(createCustomProfile());
    const profiles = await store.listProfiles();

    expect(profiles.map((profile) => profile.id)).toContain("reading");
    expect(profiles.map((profile) => profile.id)).toContain("custom-one");
  });

  it("does not allow deleting builtin profiles", async () => {
    const store = new ProfileStore(new InMemoryMemento());

    await expect(store.deleteProfile("reading")).rejects.toThrow("Cannot delete builtin profile");
  });

  it("can clone a profile with a new id and name", async () => {
    const store = new ProfileStore(new InMemoryMemento());
    await store.saveProfile(createCustomProfile());

    const cloned = await store.cloneProfile("custom-one", "custom-two", "Custom Two");

    expect(cloned.id).toBe("custom-two");
    expect(cloned.name).toBe("Custom Two");
    expect(cloned.builtin).toBe(false);
  });
});
