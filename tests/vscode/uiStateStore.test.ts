import { describe, expect, it } from "vitest";

import { InMemoryMemento } from "../../src/vscode/state/profileStore";
import { UiStateStore } from "../../src/vscode/state/uiStateStore";

describe("UiStateStore", () => {
  it("returns default state", () => {
    const store = new UiStateStore(new InMemoryMemento());

    expect(store.getState()).toEqual({
      selectedProfileId: "reading",
      selectedSessionIds: []
    });
  });

  it("merges partial updates", async () => {
    const store = new UiStateStore(new InMemoryMemento());

    await store.updateState({
      selectedProfileId: "audit",
      outputDir: "E:/exports",
      includeMessageTimestamps: true
    });
    await store.updateState({
      selectedSessionIds: ["session-1"],
      start: "2026-03-24T10:00:00Z"
    });

    expect(store.getState()).toEqual({
      selectedProfileId: "audit",
      outputDir: "E:/exports",
      includeMessageTimestamps: true,
      selectedSessionIds: ["session-1"],
      start: "2026-03-24T10:00:00Z"
    });
  });
});
