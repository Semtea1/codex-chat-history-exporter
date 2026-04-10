import { describe, expect, it } from "vitest";

import { normalizeTimeline } from "../../src/core/timeline";
import type { RawSessionRow } from "../../src/core/types";

describe("timeline", () => {
  it("prefers event_msg user messages over mirrored response_item user messages", () => {
    const rows: RawSessionRow[] = [
      {
        type: "turn_context",
        payload: { turn_id: "turn-1" }
      },
      {
        timestamp: "2026-03-24T14:00:03Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "镜像层消息" },
            { type: "input_image", image_url: "data:image/png;base64,abc" }
          ]
        }
      },
      {
        timestamp: "2026-03-24T14:00:04Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "用户原始消息",
          images: ["data:image/png;base64,abc"],
          local_images: []
        }
      },
      {
        timestamp: "2026-03-24T14:00:05Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "助手回复" }]
        }
      }
    ];

    const items = normalizeTimeline(rows);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "transcript",
      role: "user",
      text: "用户原始消息",
      images: ["data:image/png;base64,abc"],
      source: "event_msg"
    });
    expect(items[1]).toMatchObject({
      kind: "transcript",
      role: "assistant",
      text: "助手回复"
    });
  });

  it("replaces event_msg image placeholders with mirrored response_item images", () => {
    const rows: RawSessionRow[] = [
      {
        type: "turn_context",
        payload: { turn_id: "turn-2" }
      },
      {
        timestamp: "2026-04-10T02:20:57.530Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "<image name=[Image #1]>" },
            { type: "input_image", image_url: "data:image/png;base64,abc" },
            { type: "input_text", text: "</image>" },
            { type: "input_text", text: "Fix this [Image #1] please" }
          ]
        }
      },
      {
        timestamp: "2026-04-10T02:20:57.530Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Fix this [Image #1] please",
          images: [],
          local_images: ["C:\\temp\\clipboard.png"],
          text_elements: [
            {
              placeholder: "[Image #1]"
            }
          ]
        }
      }
    ];

    const items = normalizeTimeline(rows);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "transcript",
      role: "user",
      source: "event_msg",
      images: ["data:image/png;base64,abc"]
    });

    const userItem = items[0] as Extract<(typeof items)[number], { kind: "transcript" }>;
    expect(userItem.text).not.toContain("[Image #1]");
    expect(userItem.contentBlocks).toEqual([
      { type: "text", text: "Fix this " },
      {
        type: "image",
        image: "data:image/png;base64,abc",
        inline: true,
        alt: "Image #1",
        placeholder: "[Image #1]"
      },
      { type: "text", text: " please" }
    ]);
  });

  it("emits tool call and tool output items in order", () => {
    const rows: RawSessionRow[] = [
      {
        type: "turn_context",
        payload: { turn_id: "turn-1" }
      },
      {
        timestamp: "2026-03-24T12:00:03Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call-1",
          arguments: "{\"command\": [\"echo\", \"hello\"]}"
        }
      },
      {
        timestamp: "2026-03-24T12:00:04Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call-1",
          output: "{\"output\":\"hello\"}"
        }
      }
    ];

    const items = normalizeTimeline(rows);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "tool_call",
      name: "shell",
      callId: "call-1",
      sectionId: "tool_trace"
    });
    expect(items[1]).toMatchObject({
      kind: "tool_output",
      callId: "call-1",
      outputText: "{\"output\":\"hello\"}",
      sectionId: "tool_trace"
    });
  });

  it("classifies developer context messages into hidden sections", () => {
    const rows: RawSessionRow[] = [
      {
        timestamp: "2026-03-24T10:00:00Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "<permissions instructions>\n...\n</permissions instructions>" }]
        }
      },
      {
        timestamp: "2026-03-24T10:00:01Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "## Memory\n..." }]
        }
      },
      {
        timestamp: "2026-03-24T10:00:02Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "# AGENTS.md instructions for C:\\repo" }]
        }
      },
      {
        timestamp: "2026-03-24T10:00:03Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "<collaboration_mode>Default</collaboration_mode>" }]
        }
      }
    ];

    const items = normalizeTimeline(rows);

    expect(items.map((item) => item.sectionId)).toEqual([
      "system_context",
      "memory_context",
      "workspace_context",
      "collaboration_context"
    ]);
  });

  it("merges consecutive assistant transcript messages in the same turn", () => {
    const rows: RawSessionRow[] = [
      {
        type: "turn_context",
        payload: { turn_id: "turn-15" }
      },
      {
        timestamp: "2026-03-24T10:06:48.356Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "第一段助手输出" }]
        }
      },
      {
        timestamp: "2026-03-24T10:07:47.972Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "第二段助手输出" }]
        }
      }
    ];

    const items = normalizeTimeline(rows);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "transcript",
      role: "assistant",
      turn: 1
    });
    expect((items[0] as { text: string }).text).toContain("第一段助手输出");
    expect((items[0] as { text: string }).text).toContain("第二段助手输出");
  });
});
