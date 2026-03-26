import { classifyContextText } from "./section-groups";

import type {
  ContextTimelineItem,
  RawSessionRow,
  TimelineItem,
  TranscriptTimelineItem,
  ToolCallTimelineItem,
  ToolOutputTimelineItem
} from "./types";

function ensureText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value);
}

function extractTextParts(content: unknown[]): string[] {
  return content
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.type === "input_text" || item.type === "output_text")
    .map((item) => ensureText(item.text).trim())
    .filter(Boolean);
}

function extractImageParts(content: unknown[]): string[] {
  return content
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.type === "input_image")
    .map((item) => ensureText(item.image_url))
    .filter((imageUrl) => imageUrl.startsWith("data:image/"));
}

function createTranscriptItem(
  id: string,
  turn: number,
  timestamp: string | undefined,
  role: "user" | "assistant",
  text: string,
  images: string[],
  source: "event_msg" | "response_item"
): TranscriptTimelineItem | null {
  if (!text.trim() && images.length === 0) {
    return null;
  }

  return {
    id,
    kind: "transcript",
    role,
    text: text.trim(),
    images,
    source,
    turn,
    timestamp,
    sectionId: "transcript",
    segments: text.trim()
      ? [
          {
            timestamp,
            text: text.trim()
          }
        ]
      : []
  };
}

function mergeConsecutiveTranscriptItems(items: TimelineItem[]): TimelineItem[] {
  const merged: TimelineItem[] = [];

  for (const item of items) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.kind === "transcript" &&
      item.kind === "transcript" &&
      previous.turn === item.turn &&
      previous.role === item.role
    ) {
      const previousSegments = previous.segments ?? [{ timestamp: previous.timestamp, text: previous.text }];
      const currentSegments = item.segments ?? [{ timestamp: item.timestamp, text: item.text }];
      previous.text = [previous.text, item.text].filter(Boolean).join("\n\n");
      previous.images = [...previous.images, ...item.images];
      previous.segments = [...previousSegments, ...currentSegments];
      continue;
    }
    merged.push(item);
  }

  return merged;
}

function createContextItem(
  id: string,
  turn: number,
  timestamp: string | undefined,
  content: string
): ContextTimelineItem | null {
  if (!content.trim()) {
    return null;
  }

  const sectionId = classifyContextText(content);
  return {
    id,
    kind: "context",
    title: sectionId,
    content,
    turn,
    timestamp,
    sectionId
  };
}

export function normalizeTimeline(rows: RawSessionRow[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let currentTurn = 0;
  let nextId = 0;
  let pendingUserItem: TranscriptTimelineItem | null = null;
  let userEventSeenInTurn = false;

  const createId = (prefix: string): string => {
    nextId += 1;
    return `${prefix}-${nextId}`;
  };

  const flushPendingUserItem = (): void => {
    if (pendingUserItem) {
      items.push(pendingUserItem);
      pendingUserItem = null;
    }
  };

  for (const row of rows) {
    const rowType = row.type;
    const payload = row.payload ?? {};

    if (rowType === "turn_context") {
      flushPendingUserItem();
      currentTurn += 1;
      userEventSeenInTurn = false;
      continue;
    }

    if (rowType === "event_msg") {
      if (payload.type !== "user_message") {
        continue;
      }

      const text = ensureText(payload.message);
      const images = Array.isArray(payload.images)
        ? payload.images.map((item) => ensureText(item)).filter((item) => item.startsWith("data:image/"))
        : [];

      const item = createTranscriptItem(
        createId("transcript"),
        currentTurn || 1,
        row.timestamp,
        "user",
        text,
        images,
        "event_msg"
      );

      if (item) {
        pendingUserItem = null;
        items.push(item);
        userEventSeenInTurn = true;
      }
      continue;
    }

    if (rowType !== "response_item") {
      continue;
    }

    const payloadType = payload.type;

    if (payloadType === "message") {
      const role = ensureText(payload.role) as "user" | "assistant" | "developer";
      const content = Array.isArray(payload.content) ? payload.content : [];
      const text = extractTextParts(content).join("\n\n");
      const images = extractImageParts(content);

      if (role === "user") {
        if (userEventSeenInTurn) {
          continue;
        }
        pendingUserItem = createTranscriptItem(
          createId("transcript"),
          currentTurn || 1,
          row.timestamp,
          "user",
          text,
          images,
          "response_item"
        );
        continue;
      }

      flushPendingUserItem();

      if (role === "assistant") {
        const item = createTranscriptItem(
          createId("transcript"),
          currentTurn || 1,
          row.timestamp,
          "assistant",
          text,
          [],
          "response_item"
        );
        if (item) {
          items.push(item);
        }
        continue;
      }

      const contextItem = createContextItem(createId("context"), currentTurn, row.timestamp, text);
      if (contextItem) {
        items.push(contextItem);
      }
      continue;
    }

    if (payloadType === "function_call" || payloadType === "custom_tool_call" || payloadType === "web_search_call") {
      flushPendingUserItem();
      const item: ToolCallTimelineItem = {
        id: createId("tool-call"),
        kind: "tool_call",
        callId: ensureText(payload.call_id || payload.id || "unknown"),
        name: ensureText(payload.name || payload.action || payloadType),
        argumentsText: ensureText(payload.arguments ?? payload),
        turn: currentTurn,
        timestamp: row.timestamp,
        sectionId: "tool_trace"
      };
      items.push(item);
      continue;
    }

    if (payloadType === "function_call_output" || payloadType === "custom_tool_call_output") {
      flushPendingUserItem();
      const item: ToolOutputTimelineItem = {
        id: createId("tool-output"),
        kind: "tool_output",
        callId: ensureText(payload.call_id || payload.id || "unknown"),
        outputText: ensureText(payload.output ?? payload),
        turn: currentTurn,
        timestamp: row.timestamp,
        sectionId: "tool_trace"
      };
      items.push(item);
    }
  }

  flushPendingUserItem();
  return mergeConsecutiveTranscriptItems(items);
}
