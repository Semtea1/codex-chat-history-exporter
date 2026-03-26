import { join } from "node:path";

import { AssetExtractor } from "./asset-extractor";
import { prepareSessionOutputDir, writeDocument } from "./export-writer";
import { createDocumentPlan } from "./layout";
import {
  renderChildSessionsDocument,
  renderHiddenContextDocument,
  renderMainDocument,
  renderToolTraceDocument
} from "./markdown-renderer";
import { loadSessionRowsFromSummary } from "./session-loader";
import { filterTimelineByTimeRange } from "./time-filter";
import { normalizeTimeline } from "./timeline";

import type { ExportProfile, ExportResult, SessionSummary, TimelineItem, TranscriptTimelineItem } from "./types";

function slugify(value: string): string {
  const cleaned = value
    .trim()
    .split("")
    .map((char) => (/[a-z0-9_-]/i.test(char) ? char : "-"))
    .join("");
  return cleaned.replace(/-+/g, "-").replace(/^-|-$/g, "") || "session";
}

function sessionFolderName(summary: SessionSummary): string {
  const timestamp = (summary.updatedAt || summary.timestamp || "unknown-time")
    .replace(/[:]/g, "")
    .replace("T", "-")
    .replace("Z", "")
    .slice(0, 15);
  return `${timestamp}_${summary.kind}_${summary.sessionId}_${slugify(summary.title).slice(0, 60)}`;
}

interface ExportSessionOptions {
  childSessions?: SessionSummary[];
}

async function materializeTranscriptAssets(
  items: TimelineItem[],
  sessionDir: string,
  assetPrefix = "session"
): Promise<TimelineItem[]> {
  const extractor = new AssetExtractor(sessionDir);
  const mapped: TimelineItem[] = [];

  for (const item of items) {
    if (item.kind !== "transcript") {
      mapped.push(item);
      continue;
    }

    const images: string[] = [];
    for (const image of item.images) {
      if (image.startsWith("data:image/")) {
        images.push(await extractor.writeDataUrl(image, `${assetPrefix}-turn${item.turn}-${item.role}-image`));
      } else {
        images.push(image);
      }
    }

    mapped.push({
      ...item,
      images
    } satisfies TranscriptTimelineItem);
  }

  return mapped;
}

async function prepareChildSessionExports(
  childSessions: SessionSummary[],
  profile: ExportProfile,
  sessionDir: string
): Promise<Array<{ summary: SessionSummary; items: TimelineItem[] }>> {
  const preparedChildren: Array<{ summary: SessionSummary; items: TimelineItem[] }> = [];

  for (const childSession of childSessions) {
    const childRows = await loadSessionRowsFromSummary(childSession);
    const childTimeline = normalizeTimeline(childRows);
    const filteredChildTimeline = filterTimelineByTimeRange(
      childTimeline,
      profile.transcriptTimeFilter,
      profile.linkedTraceTimeBehavior
    );

    preparedChildren.push({
      summary: childSession,
      items: await materializeTranscriptAssets(filteredChildTimeline, sessionDir, `child-${slugify(childSession.sessionId)}`)
    });
  }

  return preparedChildren;
}

export async function exportSession(
  summary: SessionSummary,
  profile: ExportProfile,
  outputRoot: string,
  options: ExportSessionOptions = {}
): Promise<ExportResult> {
  const rows = await loadSessionRowsFromSummary(summary);
  const timeline = normalizeTimeline(rows);
  const filteredTimeline = filterTimelineByTimeRange(
    timeline,
    profile.transcriptTimeFilter,
    profile.linkedTraceTimeBehavior
  );

  const sessionDir = join(outputRoot, sessionFolderName(summary));
  await prepareSessionOutputDir(sessionDir);
  const timelineWithAssets = await materializeTranscriptAssets(filteredTimeline, sessionDir, slugify(summary.sessionId));
  const preparedChildSessions =
    profile.includeChildSessionsAsAppendix && (options.childSessions?.length ?? 0) > 0
      ? await prepareChildSessionExports(options.childSessions ?? [], profile, sessionDir)
      : [];

  const documents = createDocumentPlan(profile);
  const writtenDocuments: string[] = [];

  for (const document of documents) {
    if (document.id === "main" || document.id === "transcript") {
      writtenDocuments.push(await writeDocument(sessionDir, document.fileName, renderMainDocument(summary, timelineWithAssets, profile)));
      continue;
    }

    if (document.id === "hidden-context") {
      writtenDocuments.push(
        await writeDocument(sessionDir, document.fileName, renderHiddenContextDocument(summary, timelineWithAssets))
      );
      continue;
    }

    if (document.id === "tool-trace") {
      writtenDocuments.push(
        await writeDocument(sessionDir, document.fileName, renderToolTraceDocument(summary, timelineWithAssets, profile))
      );
      continue;
    }

    if (document.id === "child-sessions" && preparedChildSessions.length > 0) {
      writtenDocuments.push(
        await writeDocument(
          sessionDir,
          document.fileName,
          renderChildSessionsDocument(summary, preparedChildSessions, profile)
        )
      );
    }
  }

  return {
    sessionId: summary.sessionId,
    outputDir: sessionDir,
    documents: writtenDocuments,
    assetFiles: [
      ...timelineWithAssets.flatMap((item) => (item.kind === "transcript" ? item.images : [])),
      ...preparedChildSessions.flatMap((child) =>
        child.items.flatMap((item) => (item.kind === "transcript" ? item.images : []))
      )
    ],
    warnings: []
  };
}
