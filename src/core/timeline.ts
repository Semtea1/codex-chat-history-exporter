import { classifyContextText } from "./section-groups";

import type {
  ContextTimelineItem,
  RawSessionRow,
  TimelineItem,
  TranscriptContentBlock,
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
    .map((item) => ensureText(item.image_url || item.image_file || item.file_path))
    .filter(Boolean);
}

function compactContentBlocks(blocks: TranscriptContentBlock[]): TranscriptContentBlock[] {
  const compacted: TranscriptContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      if (!block.text) {
        continue;
      }
      const previous = compacted[compacted.length - 1];
      if (previous?.type === "text") {
        previous.text += block.text;
        continue;
      }
      compacted.push({ ...block });
      continue;
    }

    compacted.push({ ...block });
  }

  return compacted.filter((block) => block.type === "image" || block.text.trim().length > 0);
}

function summarizeTextBlocks(blocks: TranscriptContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<TranscriptContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function collectBlockImages(blocks: TranscriptContentBlock[]): string[] {
  return blocks
    .filter((block): block is Extract<TranscriptContentBlock, { type: "image" }> => block.type === "image")
    .map((block) => block.image);
}

function buildTranscriptContent(blocks: TranscriptContentBlock[]): Pick<TranscriptTimelineItem, "text" | "images" | "contentBlocks"> {
  const compacted = compactContentBlocks(blocks);
  return {
    text: summarizeTextBlocks(compacted),
    images: collectBlockImages(compacted),
    contentBlocks: compacted.length > 0 ? compacted : undefined
  };
}

function isImagePlaceholderText(value: string): boolean {
  return /^\[Image #\d+\]$/.test(value.trim());
}

function imageAltText(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
}

function extractImageMarker(value: string): string | null {
  const match = /^<image name=(.+)>$/.exec(value.trim());
  return match?.[1] ?? null;
}

function extractResponseContentBlocks(content: unknown[]): TranscriptContentBlock[] {
  const blocks: TranscriptContentBlock[] = [];
  let openImageMarker: string | null = null;

  for (const rawItem of content) {
    if (typeof rawItem !== "object" || rawItem === null) {
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const type = ensureText(item.type);

    if (type === "input_text" || type === "output_text") {
      const text = ensureText(item.text);
      const imageMarker = extractImageMarker(text);
      if (imageMarker) {
        openImageMarker = imageMarker;
        continue;
      }
      if (text.trim() === "</image>") {
        openImageMarker = null;
        continue;
      }
      if (text.trim()) {
        blocks.push({ type: "text", text: text.trim() });
      }
      continue;
    }

    if (type === "input_image") {
      const image = ensureText(item.image_url || item.image_file || item.file_path);
      if (!image) {
        continue;
      }
      blocks.push({
        type: "image",
        image,
        inline: Boolean(openImageMarker),
        alt: openImageMarker ? imageAltText(openImageMarker) : undefined,
        placeholder: openImageMarker ?? undefined
      });
    }
  }

  return compactContentBlocks(blocks);
}

function buildEventMessageBlocks(
  message: string,
  imageSources: string[],
  placeholders: string[]
): TranscriptContentBlock[] {
  const blocks: TranscriptContentBlock[] = [];
  const imagePlaceholders = placeholders.filter(isImagePlaceholderText);

  if (imagePlaceholders.length === 0) {
    if (message.trim()) {
      blocks.push({ type: "text", text: message.trim() });
    }
    for (const image of imageSources) {
      blocks.push({ type: "image", image, inline: false });
    }
    return compactContentBlocks(blocks);
  }

  let cursor = 0;
  let imageIndex = 0;

  for (const placeholder of imagePlaceholders) {
    const position = message.indexOf(placeholder, cursor);
    if (position < 0) {
      continue;
    }

    const before = message.slice(cursor, position);
    if (before) {
      blocks.push({ type: "text", text: before });
    }

    const image = imageSources[imageIndex];
    if (image) {
      blocks.push({
        type: "image",
        image,
        inline: true,
        alt: imageAltText(placeholder),
        placeholder
      });
    } else {
      blocks.push({ type: "text", text: placeholder });
    }

    imageIndex += 1;
    cursor = position + placeholder.length;
  }

  const after = message.slice(cursor);
  if (after) {
    blocks.push({ type: "text", text: after });
  }

  for (const image of imageSources.slice(imageIndex)) {
    blocks.push({ type: "image", image, inline: false });
  }

  return compactContentBlocks(blocks);
}

function extractEventMessageBlocks(
  payload: Record<string, unknown>,
  mirroredImages: string[]
): TranscriptContentBlock[] {
  const message = ensureText(payload.message);
  const embeddedImages = Array.isArray(payload.images)
    ? payload.images.map((item) => ensureText(item)).filter((item) => item.startsWith("data:image/"))
    : [];
  const localImages = Array.isArray(payload.local_images)
    ? payload.local_images.map((item) => ensureText(item)).filter(Boolean)
    : [];
  const placeholders = Array.isArray(payload.text_elements)
    ? payload.text_elements
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ensureText(item.placeholder))
        .filter(Boolean)
    : [];

  const preferredImages = mirroredImages.length > 0 ? mirroredImages : [...embeddedImages, ...localImages];
  return buildEventMessageBlocks(message, preferredImages, placeholders);
}

function createTranscriptItem(
  id: string,
  turn: number,
  timestamp: string | undefined,
  role: "user" | "assistant",
  content: Pick<TranscriptTimelineItem, "text" | "images" | "contentBlocks">,
  source: "event_msg" | "response_item"
): TranscriptTimelineItem | null {
  const text = content.text.trim();
  if (!text && content.images.length === 0) {
    return null;
  }

  return {
    id,
    kind: "transcript",
    role,
    text,
    images: content.images,
    contentBlocks: content.contentBlocks,
    source,
    turn,
    timestamp,
    sectionId: "transcript",
    segments: text
      ? [
          {
            timestamp,
            text
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
      if (previous.contentBlocks || item.contentBlocks) {
        previous.contentBlocks = compactContentBlocks([...(previous.contentBlocks ?? []), ...(item.contentBlocks ?? [])]);
      }
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

      const mirroredImages = pendingUserItem?.images ?? [];
      const transcriptContent = buildTranscriptContent(extractEventMessageBlocks(payload, mirroredImages));

      const item = createTranscriptItem(
        createId("transcript"),
        currentTurn || 1,
        row.timestamp,
        "user",
        transcriptContent,
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

      if (role === "user") {
        if (userEventSeenInTurn) {
          continue;
        }
        const responseBlocks = extractResponseContentBlocks(content);
        const transcriptContent =
          responseBlocks.length > 0
            ? buildTranscriptContent(responseBlocks)
            : {
                text: extractTextParts(content).join("\n\n"),
                images: extractImageParts(content),
                contentBlocks: undefined
              };
        pendingUserItem = createTranscriptItem(
          createId("transcript"),
          currentTurn || 1,
          row.timestamp,
          "user",
          transcriptContent,
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
          {
            text: extractTextParts(content).join("\n\n"),
            images: [],
            contentBlocks: undefined
          },
          "response_item"
        );
        if (item) {
          items.push(item);
        }
        continue;
      }

      const text = extractTextParts(content).join("\n\n");
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
