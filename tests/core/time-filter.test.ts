import { describe, expect, it } from "vitest";

import { filterTimelineByTimeRange } from "../../src/core/time-filter";
import type { TimelineItem } from "../../src/core/types";

const timelineItems: TimelineItem[] = [
  {
    id: "t1",
    kind: "transcript",
    role: "user",
    text: "A",
    images: [],
    source: "event_msg",
    turn: 1,
    timestamp: "2026-03-24T10:00:00Z",
    sectionId: "transcript"
  },
  {
    id: "tool1",
    kind: "tool_call",
    callId: "call-1",
    name: "shell",
    argumentsText: "{}",
    turn: 1,
    timestamp: "2026-03-24T10:05:00Z",
    sectionId: "tool_trace"
  },
  {
    id: "t2",
    kind: "transcript",
    role: "assistant",
    text: "B",
    images: [],
    source: "response_item",
    turn: 1,
    timestamp: "2026-03-24T10:10:00Z",
    sectionId: "transcript"
  },
  {
    id: "ctx1",
    kind: "context",
    title: "Memory",
    content: "...",
    turn: 0,
    timestamp: "2026-03-24T09:50:00Z",
    sectionId: "memory_context"
  }
];

describe("time-filter", () => {
  it("filters only transcript items by default", () => {
    const filtered = filterTimelineByTimeRange(
      timelineItems,
      {
        enabled: true,
        start: "2026-03-24T10:01:00Z",
        end: "2026-03-24T10:11:00Z"
      },
      "none"
    );

    expect(filtered.map((item) => item.id)).toEqual(["tool1", "t2", "ctx1"]);
  });

  it("can filter related tool trace items alongside transcript", () => {
    const filtered = filterTimelineByTimeRange(
      timelineItems,
      {
        enabled: true,
        start: "2026-03-24T10:01:00Z",
        end: "2026-03-24T10:11:00Z"
      },
      "related_only"
    );

    expect(filtered.map((item) => item.id)).toEqual(["tool1", "t2", "ctx1"]);
  });

  it("keeps everything when time filter is disabled", () => {
    const filtered = filterTimelineByTimeRange(timelineItems, { enabled: false }, "none");

    expect(filtered).toEqual(timelineItems);
  });
});
