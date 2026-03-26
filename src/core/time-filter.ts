import { parseTimestamp } from "./session-index";

import type { TimeRangeFilter, TimelineItem } from "./types";

function isWithinRange(timestamp: string | undefined, filter: TimeRangeFilter): boolean {
  if (!timestamp) {
    return false;
  }
  const value = parseTimestamp(timestamp);
  const start = filter.start ? parseTimestamp(filter.start) : Number.NEGATIVE_INFINITY;
  const end = filter.end ? parseTimestamp(filter.end) : Number.POSITIVE_INFINITY;
  return value >= start && value <= end;
}

export function filterTimelineByTimeRange(
  items: TimelineItem[],
  filter: TimeRangeFilter | undefined,
  linkedTraceTimeBehavior: "none" | "related_only"
): TimelineItem[] {
  if (!filter?.enabled) {
    return items;
  }

  return items.filter((item) => {
    if (item.kind === "transcript") {
      return isWithinRange(item.timestamp, filter);
    }

    if ((item.kind === "tool_call" || item.kind === "tool_output") && linkedTraceTimeBehavior === "related_only") {
      return isWithinRange(item.timestamp, filter);
    }

    return true;
  });
}
