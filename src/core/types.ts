export type SessionKind = "desktop" | "vscode" | "cli" | "unknown";
export type InternalCategory = "memory_consolidation" | "subagent" | "other";

export type ExportSectionId =
  | "transcript"
  | "session_meta"
  | "system_context"
  | "memory_context"
  | "workspace_context"
  | "collaboration_context"
  | "tool_trace";

export interface SessionSummary {
  sessionId: string;
  title: string;
  kind: SessionKind;
  originator: string;
  source: string;
  cwd: string;
  timestamp: string;
  updatedAt: string;
  firstMessageAt?: string;
  lastMessageAt?: string;
  path: string;
  isInternal?: boolean;
  internalCategory?: InternalCategory;
  parentSessionId?: string;
  childSessionCount?: number;
  agentNickname?: string;
  agentRole?: string;
}

export interface ExportSectionDefinition {
  id: ExportSectionId;
  label: string;
  rawFieldNames: string[];
  shortDescription: string;
  longDescription: string;
  visibility: "visible" | "partially_hidden" | "hidden";
}

export interface TimeRangeFilter {
  enabled: boolean;
  start?: string;
  end?: string;
}

export interface ExportProfile {
  id: string;
  name: string;
  description: string;
  includedSections: ExportSectionId[];
  documentMode: "single" | "multi";
  hiddenContentMode: "inline" | "appendix" | "split";
  toolTraceLevel: "summary" | "full";
  includeMessageTimestamps: boolean;
  includeChildSessionsAsAppendix: boolean;
  transcriptTimeFilter?: TimeRangeFilter;
  linkedTraceTimeBehavior: "none" | "related_only";
  defaultOutputDir?: string;
  builtin: boolean;
}

export interface ExportResult {
  sessionId: string;
  outputDir: string;
  documents: string[];
  assetFiles: string[];
  warnings: string[];
}

export interface RawSessionRow {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export interface TimelineBaseItem {
  id: string;
  turn: number;
  timestamp?: string;
  sectionId: ExportSectionId;
}

export interface TranscriptTimelineItem extends TimelineBaseItem {
  kind: "transcript";
  role: "user" | "assistant";
  text: string;
  images: string[];
  source: "event_msg" | "response_item";
  segments?: Array<{
    timestamp?: string;
    text: string;
  }>;
}

export interface ToolCallTimelineItem extends TimelineBaseItem {
  kind: "tool_call";
  callId: string;
  name: string;
  argumentsText: string;
}

export interface ToolOutputTimelineItem extends TimelineBaseItem {
  kind: "tool_output";
  callId: string;
  outputText: string;
}

export interface ContextTimelineItem extends TimelineBaseItem {
  kind: "context";
  title: string;
  content: string;
}

export type TimelineItem =
  | TranscriptTimelineItem
  | ToolCallTimelineItem
  | ToolOutputTimelineItem
  | ContextTimelineItem;
