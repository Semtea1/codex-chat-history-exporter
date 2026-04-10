import * as vscode from "vscode";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { exportSession } from "../../core/exporter";
import { getBuiltinProfiles, validateProfile } from "../../core/profile";
import { getAllSectionDefinitions } from "../../core/section-groups";
import { buildChildSessionMap, scanSessions } from "../../core/session-index";
import {
  buildChildSessionPreviewMap,
  buildProfileFromWizardPayload,
  writeExportIndex
} from "../../shared/export-wizard-shared";
import type { ExportProfile, SessionSummary } from "../../core/types";
import type { ExtensionRuntimeConfig } from "../config";
import { ProfileStore } from "../state/profileStore";
import { UiStateStore } from "../state/uiStateStore";
import { renderExportWizardHtml } from "../webview/exportWizard";
import type { WizardPayload } from "../../shared/export-wizard-shared";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "custom-profile";
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

  panel.webview.onDidReceiveMessage(async (message: { type: string; payload?: WizardPayload | { outputDir?: string; path?: string } }) => {
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

    if (message.type === "openExportFolder") {
      const outputDir = (message.payload as { outputDir?: string } | undefined)?.outputDir;
      if (outputDir?.trim()) {
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(outputDir));
      }
      return;
    }

    if (message.type === "openExportDocument") {
      const path = (message.payload as { path?: string } | undefined)?.path;
      if (path?.trim()) {
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path));
      }
      return;
    }

    if (!message.payload) {
      return;
    }

    const payload = message.payload as WizardPayload;
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
      if (message.type === "export") {
        await panel.webview.postMessage({
          type: "exportFailed",
          payload: { text: validation.errors.join("；") }
        });
      }
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
      await panel.webview.postMessage({
        type: "exportFailed",
        payload: { text: "请先选择导出目录。" }
      });
      return;
    }

    if (payload.selectedSessionIds.length === 0) {
      await panel.webview.postMessage({
        type: "status",
        payload: { text: "请至少勾选一条会话再导出。" }
      });
      await panel.webview.postMessage({
        type: "exportFailed",
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
      await panel.webview.postMessage({
        type: "exportFailed",
        payload: { text: "未找到已勾选的会话。" }
      });
      return;
    }

    const indexRows: Array<{ title: string; sessionDir: string }> = [];
    await panel.webview.postMessage({
      type: "exportStarted",
      payload: {
        text: `正在导出 ${selectedSessions.length} 条会话，请稍候。`,
        label: "正在导出..."
      }
    });

    try {
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
              payload: { text: `已导出 ${completed} / ${selectedSessions.length} 条会话。`, tone: "progress" }
            });
            await panel.webview.postMessage({
              type: "exportProgress",
              payload: {
                text: `已导出 ${completed} / ${selectedSessions.length} 条会话。`,
                percent: Math.round((completed / selectedSessions.length) * 100)
              }
            });
          }
        }
      );

      await writeExportIndex(payload.outputDir, indexRows);
      const primaryDocumentPath =
        selectedSessions.length === 1
          ? join(indexRows[0]!.sessionDir, "transcript.md")
          : join(payload.outputDir, "index.md");
      await panel.webview.postMessage({
        type: "exportFinished",
        payload: {
          text: `已导出 ${selectedSessions.length} 条会话到 ${payload.outputDir}`,
          outputDir: payload.outputDir,
          exportedCount: selectedSessions.length,
          primaryDocumentPath
        }
      });
    } catch (error) {
      await panel.webview.postMessage({
        type: "exportFailed",
        payload: { text: error instanceof Error ? error.message : String(error) }
      });
    }
  });
}
