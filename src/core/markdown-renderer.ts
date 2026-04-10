import { getSectionDefinition } from "./section-groups";

import type { ExportProfile, ExportSectionId, SessionSummary, TimelineItem } from "./types";

function heading(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}`;
}

function renderSessionMeta(summary: SessionSummary, level = 2, title = "Metadata"): string {
  const agentLine =
    summary.agentNickname || summary.agentRole
      ? [`- Agent: \`${summary.agentNickname || "unknown"}\``, summary.agentRole ? `(\`${summary.agentRole}\`)` : ""]
          .filter(Boolean)
          .join(" ")
      : undefined;

  return [
    heading(level, title),
    "",
    `- Session ID: \`${summary.sessionId}\``,
    `- Kind: \`${summary.kind}\``,
    `- Originator: \`${summary.originator || "unknown"}\``,
    `- Source: \`${summary.source || "unknown"}\``,
    ...(summary.parentSessionId ? [`- Parent Session ID: \`${summary.parentSessionId}\``] : []),
    ...(agentLine ? [agentLine] : []),
    `- Started At: \`${summary.timestamp || "unknown"}\``,
    `- Updated At: \`${summary.updatedAt || "unknown"}\``,
    `- CWD: \`${summary.cwd || "unknown"}\``,
    `- Raw File: \`${summary.path}\``
  ].join("\n");
}

function renderTimestamp(prefixEnabled: boolean, timestamp?: string): string {
  if (!prefixEnabled || !timestamp) {
    return "";
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return `[\`${timestamp}\`] `;
  }
  const shifted = new Date(parsed + 8 * 60 * 60 * 1000);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const formatted = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(
    shifted.getUTCHours()
  )}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} UTC+08:00`;
  return `[\`${formatted}\`] `;
}

function renderTranscriptContentBlocks(
  item: Extract<TimelineItem, { kind: "transcript" }>,
  includeMessageTimestamps: boolean
): string {
  if (!item.contentBlocks || item.contentBlocks.length === 0) {
    return "";
  }

  const parts: string[] = [];
  let textBuffer = "";

  const flushTextBuffer = (): void => {
    const normalized = textBuffer.trim();
    if (normalized) {
      parts.push(normalized);
    }
    textBuffer = "";
  };

  for (const block of item.contentBlocks) {
    if (block.type === "text") {
      textBuffer += block.text;
      continue;
    }

    flushTextBuffer();
    parts.push(`![${block.alt || `${item.role}-${item.turn}`}](${block.image})`);
  }

  flushTextBuffer();

  if (parts.length === 0) {
    return "";
  }

  const normalized = parts.join("\n\n");
  return includeMessageTimestamps ? `${renderTimestamp(true, item.timestamp)}${normalized}` : normalized;
}

function renderTranscriptItems(
  items: TimelineItem[],
  includeMessageTimestamps: boolean,
  sectionLevel = 2,
  itemLevel = sectionLevel + 1
): string {
  const parts = [heading(sectionLevel, "Transcript"), ""];
  for (const item of items) {
    if (item.kind !== "transcript") {
      continue;
    }
    parts.push(`${heading(itemLevel, `${item.role === "user" ? "User" : "Assistant"} ${item.turn}`)}`);
    parts.push("");

    const renderedBlocks = renderTranscriptContentBlocks(item, includeMessageTimestamps);
    if (renderedBlocks) {
      parts.push(renderedBlocks);
      parts.push("");
      continue;
    }

    const segments =
      item.segments && item.segments.length > 0
        ? item.segments
        : item.text
          ? [
              {
                timestamp: item.timestamp,
                text: item.text
              }
            ]
          : [];

    if (segments.length > 0) {
      if (includeMessageTimestamps) {
        for (const segment of segments) {
          parts.push(`${renderTimestamp(true, segment.timestamp)}${segment.text}`);
          parts.push("");
        }
      } else {
        parts.push(segments.map((segment) => segment.text).join("\n\n"));
        parts.push("");
      }
    }
    for (const imagePath of item.images) {
      parts.push(`![${item.role}-${item.turn}](${imagePath})`);
      parts.push("");
    }
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderContextSections(
  items: TimelineItem[],
  sections: ExportSectionId[],
  sectionLevel = 2,
  itemLevel = sectionLevel + 1
): string {
  const filtered = items.filter(
    (item): item is Extract<TimelineItem, { kind: "context" }> =>
      item.kind === "context" && sections.includes(item.sectionId)
  );
  if (filtered.length === 0) {
    return "";
  }

  const parts = [heading(sectionLevel, "Hidden Context"), ""];
  for (const item of filtered) {
    const definition = getSectionDefinition(item.sectionId);
    parts.push(heading(itemLevel, `${definition.label} (${definition.rawFieldNames.join(", ")})`));
    parts.push("");
    parts.push(`> ${definition.shortDescription}`);
    parts.push("");
    parts.push(item.content);
    parts.push("");
  }
  return parts.join("\n").trim();
}

function renderToolTrace(items: TimelineItem[], profile: ExportProfile, sectionLevel = 2): string {
  const filtered = items.filter((item) => item.sectionId === "tool_trace");
  if (filtered.length === 0) {
    return "";
  }

  const parts = [heading(sectionLevel, "Tool Trace"), ""];
  for (const item of filtered) {
    if (item.kind === "tool_call") {
      parts.push(`<details>`);
      parts.push(`<summary>Tool call: ${item.name} (${item.callId})</summary>`);
      parts.push("");
      parts.push("```json");
      parts.push(item.argumentsText);
      parts.push("```");
      parts.push("");
      parts.push("</details>");
      parts.push("");
      continue;
    }

    if (item.kind === "tool_output") {
      parts.push(`<details>`);
      parts.push(`<summary>Tool output: ${item.callId}</summary>`);
      parts.push("");
      parts.push(profile.toolTraceLevel === "full" ? "```json" : "```text");
      parts.push(item.outputText);
      parts.push("```");
      parts.push("");
      parts.push("</details>");
      parts.push("");
    }
  }
  return parts.join("\n").trim();
}

export function renderMainDocument(summary: SessionSummary, items: TimelineItem[], profile: ExportProfile): string {
  const parts = [`# ${summary.title}`, ""];

  if (profile.includedSections.includes("session_meta")) {
    parts.push(renderSessionMeta(summary));
    parts.push("");
  }

  if (profile.includedSections.includes("transcript")) {
    parts.push(renderTranscriptItems(items, profile.includeMessageTimestamps));
    parts.push("");
  }

  if (profile.hiddenContentMode === "appendix") {
    const hidden = renderContextSections(items, profile.includedSections);
    if (hidden) {
      parts.push(hidden);
      parts.push("");
    }
  } else if (profile.hiddenContentMode === "inline") {
    const hidden = renderContextSections(items, profile.includedSections);
    if (hidden) {
      parts.push(hidden);
      parts.push("");
    }
  }

  if (profile.documentMode === "single" && profile.includedSections.includes("tool_trace")) {
    const toolTrace = renderToolTrace(items, profile);
    if (toolTrace) {
      parts.push(toolTrace);
      parts.push("");
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function renderHiddenContextDocument(summary: SessionSummary, items: TimelineItem[]): string {
  const parts = [
    `# ${summary.title} - Hidden Context`,
    "",
    renderContextSections(items, ["system_context", "memory_context", "workspace_context", "collaboration_context"])
  ];
  return parts.join("\n").trim() + "\n";
}

export function renderToolTraceDocument(summary: SessionSummary, items: TimelineItem[], profile: ExportProfile): string {
  const parts = [`# ${summary.title} - Tool Trace`, "", renderToolTrace(items, profile)];
  return parts.join("\n").trim() + "\n";
}

export function renderChildSessionsDocument(
  parentSummary: SessionSummary,
  children: Array<{ summary: SessionSummary; items: TimelineItem[] }>,
  profile: ExportProfile
): string {
  if (children.length === 0) {
    return "";
  }

  const parts = [
    `# ${parentSummary.title} - Child Sessions Appendix`,
    "",
    "> Includes only verifiable child sessions linked by `source.subagent.thread_spawn.parent_thread_id`.",
    "> Internal maintenance runs such as `memory_consolidation` are intentionally excluded because no reliable parent mapping exists.",
    ""
  ];

  children.forEach((child, index) => {
    const labelParts = [child.summary.title];
    if (child.summary.agentNickname) {
      labelParts.push(`· ${child.summary.agentNickname}`);
    }
    if (child.summary.agentRole) {
      labelParts.push(`(${child.summary.agentRole})`);
    }

    parts.push(heading(2, `${index + 1}. ${labelParts.join(" ")}`.trim()));
    parts.push("");

    if (profile.includedSections.includes("session_meta")) {
      parts.push(renderSessionMeta(child.summary, 3, "Metadata"));
      parts.push("");
    }

    if (profile.includedSections.includes("transcript")) {
      parts.push(renderTranscriptItems(child.items, profile.includeMessageTimestamps, 3, 4));
      parts.push("");
    }

    const hiddenContext = renderContextSections(child.items, profile.includedSections, 3, 4);
    if (hiddenContext) {
      parts.push(hiddenContext);
      parts.push("");
    }

    if (profile.includedSections.includes("tool_trace")) {
      const trace = renderToolTrace(child.items, profile, 3);
      if (trace) {
        parts.push(trace);
        parts.push("");
      }
    }
  });

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
