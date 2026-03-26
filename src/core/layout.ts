import type { ExportProfile, ExportSectionId } from "./types";

export interface PlannedDocument {
  id: "main" | "transcript" | "hidden-context" | "tool-trace" | "child-sessions";
  fileName: string;
  sections: ExportSectionId[];
}

export function createDocumentPlan(profile: ExportProfile): PlannedDocument[] {
  const included = new Set(profile.includedSections);

  if (profile.documentMode === "single") {
    const documents: PlannedDocument[] = [
      {
        id: "main",
        fileName: "transcript.md",
        sections: [...profile.includedSections]
      }
    ];

    if (profile.includeChildSessionsAsAppendix) {
      documents.push({
        id: "child-sessions",
        fileName: "child-sessions.md",
        sections: [...profile.includedSections]
      });
    }

    return documents;
  }

  if (profile.hiddenContentMode === "split") {
    const documents: PlannedDocument[] = [];
    if (included.has("transcript")) {
      documents.push({
        id: "transcript",
        fileName: "transcript.md",
        sections: ["transcript", ...(included.has("session_meta") ? (["session_meta"] as ExportSectionId[]) : [])]
      });
    }

    const hiddenSections = profile.includedSections.filter(
      (section) => section !== "transcript" && section !== "tool_trace" && section !== "session_meta"
    );
    if (hiddenSections.length > 0 || (!included.has("transcript") && included.has("session_meta"))) {
      documents.push({
        id: "hidden-context",
        fileName: "hidden-context.md",
        sections: [
          ...(included.has("session_meta") && !included.has("transcript") ? (["session_meta"] as ExportSectionId[]) : []),
          ...hiddenSections
        ]
      });
    }

    if (included.has("tool_trace")) {
      documents.push({
        id: "tool-trace",
        fileName: "tool-trace.md",
        sections: ["tool_trace"]
      });
    }

    if (profile.includeChildSessionsAsAppendix) {
      documents.push({
        id: "child-sessions",
        fileName: "child-sessions.md",
        sections: [...profile.includedSections]
      });
    }

    return documents;
  }

  const mainSections = profile.includedSections.filter((section) => section !== "tool_trace");
  const documents: PlannedDocument[] = [
    {
      id: "main",
      fileName: "transcript.md",
      sections: mainSections
    }
  ];

  if (included.has("tool_trace")) {
    documents.push({
      id: "tool-trace",
      fileName: "tool-trace.md",
      sections: ["tool_trace"]
    });
  }

  if (profile.includeChildSessionsAsAppendix) {
    documents.push({
      id: "child-sessions",
      fileName: "child-sessions.md",
      sections: [...profile.includedSections]
    });
  }

  return documents;
}
