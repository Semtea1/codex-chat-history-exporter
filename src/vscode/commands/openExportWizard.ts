import * as vscode from "vscode";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { exportSession } from "../../core/exporter";
import { getBuiltinProfiles, validateProfile } from "../../core/profile";
import { getAllSectionDefinitions } from "../../core/section-groups";
import { buildChildSessionMap, scanSessions } from "../../core/session-index";
import { loadSessionRowsFromSummary } from "../../core/session-loader";
import { normalizeTimeline } from "../../core/timeline";
import type { ExportProfile, SessionSummary } from "../../core/types";
import type { ExtensionRuntimeConfig } from "../config";
import { ProfileStore } from "../state/profileStore";
import { UiStateStore } from "../state/uiStateStore";
import { renderExportWizardHtml } from "../webview/exportWizard";

interface ChildSessionPreview {
  sessionId: string;
  title: string;
  updatedAt: string;
  agentNickname?: string;
  agentRole?: string;
  parentSessionId?: string;
  previewText: string;
}

interface WizardPayload {
  selectedProfileId: string;
  selectedSessionIds: string[];
  outputDir: string;
  documentMode: ExportProfile["documentMode"];
  hiddenContentMode: ExportProfile["hiddenContentMode"];
  toolTraceLevel: ExportProfile["toolTraceLevel"];
  includeMessageTimestamps: boolean;
  includeChildSessionsAsAppendix: boolean;
  includedSections: ExportProfile["includedSections"];
  start?: string;
  end?: string;
  customProfileName?: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom-profile";
}

function buildProfileFromWizardPayload(payload: WizardPayload, sourceProfile?: ExportProfile): ExportProfile {
  return {
    id: sourceProfile?.id ?? "reading",
    name: sourceProfile?.name ?? "临时导出模式",
    description: sourceProfile?.description ?? "由导出向导生成的临时配置。",
    includedSections: payload.includedSections,
    documentMode: payload.documentMode,
    hiddenContentMode: payload.hiddenContentMode,
    toolTraceLevel: payload.toolTraceLevel,
    includeMessageTimestamps: payload.includeMessageTimestamps,
    includeChildSessionsAsAppendix: payload.includeChildSessionsAsAppendix,
    transcriptTimeFilter:
      payload.start || payload.end
        ? {
            enabled: true,
            start: payload.start,
            end: payload.end
          }
        : undefined,
    linkedTraceTimeBehavior: sourceProfile?.linkedTraceTimeBehavior ?? "related_only",
    defaultOutputDir: payload.outputDir || sourceProfile?.defaultOutputDir,
    builtin: sourceProfile?.builtin ?? false
  };
}

async function writeIndex(outputDir: string, rows: Array<{ title: string; sessionDir: string }>): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const lines = ["# Export Index", ""];
  for (const row of rows) {
    const folderName = row.sessionDir.split(/[\\/]/).pop() ?? row.sessionDir;
    lines.push(`- [${row.title}](${folderName}/transcript.md)`);
  }
  await writeFile(join(outputDir, "index.md"), `${lines.join("\n")}\n`, "utf8");
}

async function postProfilesUpdated(
  panel: vscode.WebviewPanel,
  profileStore: ProfileStore,
  selectedProfileId: string
): Promise<void> {
  const profiles = await profileStore.listProfiles();
  await panel.webview.postMessage({
    type: "profilesUpdated",
    payload: {
      profiles,
      selectedProfileId
    }
  });
}

function summarizeChildSessionContent(summary: SessionSummary, limit = 260): Promise<string> {
  return loadSessionRowsFromSummary(summary)
    .then((rows) => normalizeTimeline(rows))
    .then((items) => {
      const transcript = items
        .filter((item) => item.kind === "transcript")
        .slice(0, 4)
        .map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.text}`)
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (!transcript) {
        return "该子会话暂无可预览的正文内容。";
      }

      return transcript.length <= limit ? transcript : `${transcript.slice(0, limit)}…`;
    })
    .catch(() => "该子会话预览读取失败。");
}

async function buildChildSessionPreviewMap(sessions: SessionSummary[]): Promise<Record<string, ChildSessionPreview[]>> {
  const childSessionMap = buildChildSessionMap(sessions);
  const previewEntries = await Promise.all(
    [...childSessionMap.entries()].map(async ([parentSessionId, childSessions]) => {
      const previews = await Promise.all(
        childSessions.map(async (session) => ({
          sessionId: session.sessionId,
          title: session.title,
          updatedAt: session.updatedAt || session.timestamp,
          agentNickname: session.agentNickname,
          agentRole: session.agentRole,
          parentSessionId: session.parentSessionId,
          previewText: await summarizeChildSessionContent(session)
        }))
      );

      return [parentSessionId, previews] as const;
    })
  );

  return Object.fromEntries(previewEntries);
}

export async function openExportWizard(
  profileStore: ProfileStore,
  uiStateStore: UiStateStore,
  runtimeConfig: ExtensionRuntimeConfig
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "codexChatExporter.exportWizard",
    "Codex Chat Exporter",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const render = async () => {
    const [profiles, sessions] = await Promise.all([profileStore.listProfiles(), scanSessions(runtimeConfig.codexRoot)]);
    const childPreviewMap = await buildChildSessionPreviewMap(sessions);
    const state = uiStateStore.getState();

    if (!state.outputDir && runtimeConfig.defaultOutputDir) {
      await uiStateStore.updateState({ outputDir: runtimeConfig.defaultOutputDir });
    }

    panel.webview.html = renderExportWizardHtml({
      profiles,
      sections: getAllSectionDefinitions(),
      sessions,
      childPreviewMap,
      uiState: {
        ...uiStateStore.getState(),
        outputDir: uiStateStore.getState().outputDir ?? runtimeConfig.defaultOutputDir
      },
      maxSessionsInWizard: runtimeConfig.maxSessionsInWizard
    });
  };

  await render();

  panel.webview.onDidReceiveMessage(async (message: { type: string; payload?: WizardPayload }) => {
    if (message.type === "pickOutputDir") {
      const pickedFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择导出目录"
      });

      if (!pickedFolder?.[0]) {
        return;
      }

      await uiStateStore.updateState({ outputDir: pickedFolder[0].fsPath });
      await panel.webview.postMessage({
        type: "outputDirSelected",
        payload: { outputDir: pickedFolder[0].fsPath }
      });
      return;
    }

    if (!message.payload) {
      return;
    }

    const payload = message.payload;
    const sourceProfile = (await profileStore.getProfile(payload.selectedProfileId)) ?? getBuiltinProfiles()[0];
    if (!sourceProfile) {
      throw new Error("No export profile is available.");
    }

    if (message.type === "deleteProfile") {
      const selectedProfile = await profileStore.getProfile(payload.selectedProfileId);
      if (!selectedProfile || selectedProfile.builtin) {
        await panel.webview.postMessage({
          type: "status",
          payload: { text: "内置模式不能删除。" }
        });
        return;
      }

      await profileStore.deleteProfile(selectedProfile.id);
      await uiStateStore.updateState({ selectedProfileId: "reading" });
      await postProfilesUpdated(panel, profileStore, "reading");
      await panel.webview.postMessage({
        type: "status",
        payload: { text: `已删除自定义模式：${selectedProfile.name}` }
      });
      return;
    }

    const transientProfile = buildProfileFromWizardPayload(payload, sourceProfile);
    const validation = validateProfile(transientProfile);
    if (!validation.valid) {
      await panel.webview.postMessage({
        type: "status",
        payload: { text: validation.errors.join("；") }
      });
      return;
    }

    await uiStateStore.updateState({
      selectedProfileId: payload.selectedProfileId,
      selectedSessionIds: payload.selectedSessionIds,
      outputDir: payload.outputDir,
      includeMessageTimestamps: payload.includeMessageTimestamps,
      includeChildSessionsAsAppendix: payload.includeChildSessionsAsAppendix,
      start: payload.start,
      end: payload.end
    });

    if (message.type === "saveProfile") {
      const name = payload.customProfileName?.trim();
      if (!name) {
        await panel.webview.postMessage({
          type: "status",
          payload: { text: "请输入自定义模式名称后再保存。" }
        });
        return;
      }

      const customProfile: ExportProfile = {
        ...transientProfile,
        id: `${slugify(name)}-${Date.now()}`,
        name,
        description: `由导出向导保存的自定义模式：${name}`,
        builtin: false
      };
      await profileStore.saveProfile(customProfile);
      await uiStateStore.updateState({ selectedProfileId: customProfile.id });
      await postProfilesUpdated(panel, profileStore, customProfile.id);
      await panel.webview.postMessage({
        type: "status",
        payload: { text: `已保存自定义模式：${name}` }
      });
      return;
    }

    if (message.type === "updateProfile") {
      const selectedProfile = await profileStore.getProfile(payload.selectedProfileId);
      if (!selectedProfile || selectedProfile.builtin) {
        await panel.webview.postMessage({
          type: "status",
          payload: { text: "只有自定义模式可以更新。" }
        });
        return;
      }

      const updatedProfile: ExportProfile = {
        ...transientProfile,
        id: selectedProfile.id,
        name: payload.customProfileName?.trim() || selectedProfile.name,
        description: selectedProfile.description || `由导出向导更新的自定义模式：${selectedProfile.name}`,
        builtin: false
      };
      await profileStore.saveProfile(updatedProfile);
      await postProfilesUpdated(panel, profileStore, updatedProfile.id);
      await panel.webview.postMessage({
        type: "status",
        payload: { text: `已更新自定义模式：${updatedProfile.name}` }
      });
      return;
    }

    if (message.type !== "export") {
      return;
    }

    if (!payload.outputDir?.trim()) {
      await panel.webview.postMessage({
        type: "status",
        payload: { text: "请先选择导出目录。" }
      });
      return;
    }

    if (payload.selectedSessionIds.length === 0) {
      await panel.webview.postMessage({
        type: "status",
        payload: { text: "请至少勾选一条会话再导出。" }
      });
      return;
    }

    const allSessions = await scanSessions(runtimeConfig.codexRoot);
    const childSessionMap = buildChildSessionMap(allSessions);
    const selectedSessions = allSessions.filter((session) => payload.selectedSessionIds.includes(session.sessionId));

    if (selectedSessions.length === 0) {
      await panel.webview.postMessage({
        type: "status",
        payload: { text: "未找到已勾选的会话。" }
      });
      return;
    }

    const indexRows: Array<{ title: string; sessionDir: string }> = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "正在导出 Codex 会话",
        cancellable: false
      },
      async (progress) => {
        let completed = 0;
        for (const session of selectedSessions) {
          progress.report({
            message: session.title,
            increment: 100 / selectedSessions.length
          });

          const result = await exportSession(session, transientProfile, payload.outputDir, {
            childSessions: transientProfile.includeChildSessionsAsAppendix ? childSessionMap.get(session.sessionId) ?? [] : []
          });

          indexRows.push({ title: session.title, sessionDir: result.outputDir });
          completed += 1;

          await panel.webview.postMessage({
            type: "status",
            payload: { text: `已导出 ${completed} / ${selectedSessions.length} 条会话。` }
          });
        }
      }
    );

    await writeIndex(payload.outputDir, indexRows);
    const action = await vscode.window.showInformationMessage(
      `已导出 ${selectedSessions.length} 条会话到 ${payload.outputDir}`,
      "打开文件夹"
    );

    if (action === "打开文件夹") {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(payload.outputDir));
    }
  });
}
