import { isExportSectionId } from "./section-groups";
import { parseTimestamp } from "./session-index";

import type { ExportProfile } from "./types";

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

const BUILTIN_PROFILES: ExportProfile[] = [
  {
    id: "reading",
    name: "阅读版",
    description: "只导出聊天正文与图片，适合整理与回看。",
    includedSections: ["transcript"],
    documentMode: "single",
    hiddenContentMode: "appendix",
    toolTraceLevel: "summary",
    includeMessageTimestamps: false,
    includeChildSessionsAsAppendix: true,
    linkedTraceTimeBehavior: "none",
    builtin: true
  },
  {
    id: "audit",
    name: "审计版",
    description: "导出正文、工具轨迹和会话基础信息，适合复盘执行过程。",
    includedSections: ["transcript", "tool_trace", "session_meta"],
    documentMode: "single",
    hiddenContentMode: "appendix",
    toolTraceLevel: "summary",
    includeMessageTimestamps: true,
    includeChildSessionsAsAppendix: true,
    linkedTraceTimeBehavior: "related_only",
    builtin: true
  },
  {
    id: "forensics",
    name: "取证版",
    description: "导出正文、隐藏上下文、工具轨迹和可验证子会话，适合完整留档与排障。",
    includedSections: [
      "transcript",
      "session_meta",
      "system_context",
      "memory_context",
      "workspace_context",
      "collaboration_context",
      "tool_trace"
    ],
    documentMode: "multi",
    hiddenContentMode: "split",
    toolTraceLevel: "full",
    includeMessageTimestamps: true,
    includeChildSessionsAsAppendix: true,
    linkedTraceTimeBehavior: "related_only",
    builtin: true
  }
];

export function getBuiltinProfiles(): ExportProfile[] {
  return BUILTIN_PROFILES.map((profile) => ({
    ...profile,
    includedSections: [...profile.includedSections]
  }));
}

export function validateProfile(profile: ExportProfile): ProfileValidationResult {
  const errors: string[] = [];

  if (!profile.name.trim()) {
    errors.push("Profile name is required.");
  }

  if (profile.includedSections.length === 0) {
    errors.push("At least one export section must be selected.");
  }

  for (const sectionId of profile.includedSections) {
    if (!isExportSectionId(sectionId)) {
      errors.push(`Unknown export section: ${sectionId}`);
    }
  }

  if (profile.documentMode === "single" && profile.hiddenContentMode === "split") {
    errors.push('documentMode "single" cannot be combined with hiddenContentMode "split".');
  }

  if (profile.transcriptTimeFilter?.enabled) {
    const start = profile.transcriptTimeFilter.start;
    const end = profile.transcriptTimeFilter.end;
    if (start && end && parseTimestamp(start) > parseTimestamp(end)) {
      errors.push("Transcript time filter start must be earlier than end.");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
