import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { exportSession } from "../core/exporter";
import { getBuiltinProfiles, validateProfile } from "../core/profile";
import { getAllSectionDefinitions } from "../core/section-groups";
import { buildChildSessionMap, scanSessions } from "../core/session-index";
import type { ExportProfile } from "../core/types";
import {
  buildChildSessionPreviewMap,
  buildProfileFromWizardPayload,
  writeExportIndex
} from "../shared/export-wizard-shared";
import type { WizardPayload } from "../shared/export-wizard-shared";
import { resolveDesktopRuntimeConfig } from "./runtime-config";
import { JsonFileMemento } from "./json-file-memento";
import { ProfileStore } from "../vscode/state/profileStore";
import { UiStateStore } from "../vscode/state/uiStateStore";
import { renderExportWizardHtml } from "../vscode/webview/exportWizard";
import type { RecentExportEntry } from "../vscode/webview/exportWizard";

const IPC_CHANNEL = "codex-chat-exporter:message";
const DESKTOP_CODEX_ROOT_KEY = "codexChatExporter.desktop.codexRoot";
const DESKTOP_RECENT_EXPORTS_KEY = "codexChatExporter.desktop.recentExports";

let mainWindow: BrowserWindow | null = null;
let profileStore: ProfileStore;
let uiStateStore: UiStateStore;
let desktopMemento: JsonFileMemento;
let runtimeConfig = resolveDesktopRuntimeConfig(process.env, process.cwd());

function createMainWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    autoHideMenuBar: true,
    title: "Codex Chat Exporter Desktop",
    icon: join(process.cwd(), "media", "desktop-app.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
}

function sendToRenderer(window: BrowserWindow, message: unknown): void {
  window.webContents.send(IPC_CHANNEL, message);
}

function getRecentExports(): RecentExportEntry[] {
  return desktopMemento.get<RecentExportEntry[]>(DESKTOP_RECENT_EXPORTS_KEY, []);
}

async function saveRecentExports(entries: RecentExportEntry[]): Promise<void> {
  await desktopMemento.update(DESKTOP_RECENT_EXPORTS_KEY, entries);
}

async function pushRecentExport(outputDir: string, exportedCount: number, primaryDocumentPath: string): Promise<RecentExportEntry[]> {
  const nextEntry: RecentExportEntry = {
    id: `${Date.now()}`,
    outputDir,
    createdAt: new Date().toISOString(),
    exportedCount,
    primaryDocumentPath
  };
  const nextEntries = [nextEntry, ...getRecentExports().filter((entry) => entry.outputDir !== outputDir)].slice(0, 8);
  await saveRecentExports(nextEntries);
  return nextEntries;
}

async function updateCodexRoot(nextCodexRoot: string): Promise<void> {
  runtimeConfig = {
    ...runtimeConfig,
    codexRoot: nextCodexRoot
  };
  await desktopMemento.update(DESKTOP_CODEX_ROOT_KEY, nextCodexRoot);
}

function resolvePrimaryDocumentPath(outputDir: string, selectedCount: number, sessionDir?: string): string {
  if (selectedCount === 1 && sessionDir) {
    return join(sessionDir, "transcript.md");
  }
  return join(outputDir, "index.md");
}

async function createDesktopShortcut(): Promise<string> {
  const shortcutPath = join(app.getPath("desktop"), "Codex Chat Exporter Desktop.lnk");
  const packagedExecutable = process.execPath;
  const fallbackExecutable = join(process.cwd(), "release", "Codex-Chat-Exporter-Desktop-0.1.6.exe");
  const target = app.isPackaged ? packagedExecutable : existsSync(fallbackExecutable) ? fallbackExecutable : packagedExecutable;
  const created = shell.writeShortcutLink(shortcutPath, "create", {
    target,
    cwd: dirname(target),
    description: "Codex Chat Exporter Desktop",
    icon: target,
    iconIndex: 0
  });
  if (!created) {
    throw new Error("创建桌面快捷方式失败。");
  }
  return shortcutPath;
}

async function renderDesktopShell(window: BrowserWindow): Promise<void> {
  const [profiles, sessions] = await Promise.all([profileStore.listProfiles(), scanSessions(runtimeConfig.codexRoot)]);
  const childPreviewMap = await buildChildSessionPreviewMap(sessions);
  const state = uiStateStore.getState();

  if (!state.outputDir && runtimeConfig.defaultOutputDir) {
    await uiStateStore.updateState({ outputDir: runtimeConfig.defaultOutputDir });
  }

  const html = renderExportWizardHtml({
    profiles,
    sections: getAllSectionDefinitions(),
    sessions,
    childPreviewMap,
    uiState: {
      ...uiStateStore.getState(),
      outputDir: uiStateStore.getState().outputDir ?? runtimeConfig.defaultOutputDir
    },
    maxSessionsInWizard: runtimeConfig.maxSessionsInWizard,
    appShell: {
      mode: "desktop",
      codexRoot: runtimeConfig.codexRoot,
      canCreateDesktopShortcut: true,
      recentExports: getRecentExports()
    }
  });

  await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
}

async function postProfilesUpdated(window: BrowserWindow, selectedProfileId: string): Promise<void> {
  const profiles = await profileStore.listProfiles();
  sendToRenderer(window, {
    type: "profilesUpdated",
    payload: {
      profiles,
      selectedProfileId
    }
  });
}

async function handleRendererMessage(
  window: BrowserWindow,
  message: { type?: string; payload?: WizardPayload | { outputDir?: string; path?: string } }
): Promise<void> {
  if (message.type === "pickOutputDir") {
    const pickedFolder = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "选择导出目录"
    });

    if (!pickedFolder.filePaths[0]) {
      return;
    }

    await uiStateStore.updateState({ outputDir: pickedFolder.filePaths[0] });
    sendToRenderer(window, {
      type: "outputDirSelected",
      payload: { outputDir: pickedFolder.filePaths[0] }
    });
    return;
  }

  if (!message.payload) {
    return;
  }

  if (message.type === "pickCodexRoot") {
    const pickedFolder = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      buttonLabel: "选择 Codex 数据目录"
    });

    if (!pickedFolder.filePaths[0]) {
      return;
    }

    await updateCodexRoot(pickedFolder.filePaths[0]);
    await renderDesktopShell(window);
    sendToRenderer(window, {
      type: "codexRootSelected",
      payload: { codexRoot: pickedFolder.filePaths[0] }
    });
    return;
  }

  if (message.type === "createDesktopShortcut") {
    const shortcutPath = await createDesktopShortcut();
    sendToRenderer(window, {
      type: "status",
      payload: { text: `已创建桌面快捷方式：${basename(shortcutPath)}`, tone: "success" }
    });
    return;
  }

  if (message.type === "openExportFolder") {
    const outputDir = (message.payload as { outputDir?: string } | undefined)?.outputDir;
    if (outputDir?.trim()) {
      await shell.openPath(outputDir);
    }
    return;
  }

  if (message.type === "openExportDocument") {
    const path = (message.payload as { path?: string } | undefined)?.path;
    if (path?.trim()) {
      await shell.openPath(path);
    }
    return;
  }

  const payload = message.payload as WizardPayload;
  if (payload.codexRoot?.trim() && payload.codexRoot.trim() !== runtimeConfig.codexRoot) {
    await updateCodexRoot(payload.codexRoot.trim());
  }
  const sourceProfile = (await profileStore.getProfile(payload.selectedProfileId)) ?? getBuiltinProfiles()[0];
  if (!sourceProfile) {
    throw new Error("No export profile is available.");
  }

  if (message.type === "deleteProfile") {
    const selectedProfile = await profileStore.getProfile(payload.selectedProfileId);
    if (!selectedProfile || selectedProfile.builtin) {
      sendToRenderer(window, { type: "status", payload: { text: "内置模式不能删除。" } });
      return;
    }

    await profileStore.deleteProfile(selectedProfile.id);
    await uiStateStore.updateState({ selectedProfileId: "reading" });
    await postProfilesUpdated(window, "reading");
    sendToRenderer(window, {
      type: "status",
      payload: { text: `已删除自定义模式：${selectedProfile.name}` }
    });
    return;
  }

  const transientProfile = buildProfileFromWizardPayload(payload, sourceProfile);
  const validation = validateProfile(transientProfile);
  if (!validation.valid) {
    const text = validation.errors.join("；");
    sendToRenderer(window, { type: "status", payload: { text, tone: "error" } });
    if (message.type === "export") {
      sendToRenderer(window, { type: "exportFailed", payload: { text } });
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
      sendToRenderer(window, { type: "status", payload: { text: "请输入自定义模式名称后再保存。", tone: "error" } });
      return;
    }

    const customProfile: ExportProfile = {
      ...transientProfile,
      id: `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom"}-${Date.now()}`,
      name,
      description: `由桌面导出器保存的自定义模式：${name}`,
      builtin: false
    };
    await profileStore.saveProfile(customProfile);
    await uiStateStore.updateState({ selectedProfileId: customProfile.id });
    await postProfilesUpdated(window, customProfile.id);
    sendToRenderer(window, { type: "status", payload: { text: `已保存自定义模式：${name}`, tone: "success" } });
    return;
  }

  if (message.type === "updateProfile") {
    const selectedProfile = await profileStore.getProfile(payload.selectedProfileId);
    if (!selectedProfile || selectedProfile.builtin) {
      sendToRenderer(window, { type: "status", payload: { text: "只有自定义模式可以更新。", tone: "error" } });
      return;
    }

    const updatedProfile: ExportProfile = {
      ...transientProfile,
      id: selectedProfile.id,
      name: payload.customProfileName?.trim() || selectedProfile.name,
      description: selectedProfile.description || `由桌面导出器更新的自定义模式：${selectedProfile.name}`,
      builtin: false
    };
    await profileStore.saveProfile(updatedProfile);
    await postProfilesUpdated(window, updatedProfile.id);
    sendToRenderer(window, { type: "status", payload: { text: `已更新自定义模式：${updatedProfile.name}`, tone: "success" } });
    return;
  }

  if (message.type !== "export") {
    return;
  }

  if (!payload.outputDir?.trim()) {
    const text = "请先选择导出目录。";
    sendToRenderer(window, { type: "status", payload: { text, tone: "error" } });
    sendToRenderer(window, { type: "exportFailed", payload: { text } });
    return;
  }

  if (payload.selectedSessionIds.length === 0) {
    const text = "请至少勾选一条会话再导出。";
    sendToRenderer(window, { type: "status", payload: { text, tone: "error" } });
    sendToRenderer(window, { type: "exportFailed", payload: { text } });
    return;
  }

  const allSessions = await scanSessions(runtimeConfig.codexRoot);
  const childSessionMap = buildChildSessionMap(allSessions);
  const selectedSessions = allSessions.filter((session) => payload.selectedSessionIds.includes(session.sessionId));

  if (selectedSessions.length === 0) {
    const text = "未找到已勾选的会话。";
    sendToRenderer(window, { type: "status", payload: { text, tone: "error" } });
    sendToRenderer(window, { type: "exportFailed", payload: { text } });
    return;
  }

  const indexRows: Array<{ title: string; sessionDir: string }> = [];
  sendToRenderer(window, {
    type: "exportStarted",
    payload: {
      text: `正在导出 ${selectedSessions.length} 条会话，请稍候。`,
      label: "正在导出...",
      percent: 8
    }
  });

  try {
    let completed = 0;
    for (const session of selectedSessions) {
      const result = await exportSession(session, transientProfile, payload.outputDir, {
        childSessions: transientProfile.includeChildSessionsAsAppendix ? childSessionMap.get(session.sessionId) ?? [] : []
      });

      indexRows.push({ title: session.title, sessionDir: result.outputDir });
      completed += 1;
      sendToRenderer(window, {
        type: "status",
        payload: { text: `已导出 ${completed} / ${selectedSessions.length} 条会话。`, tone: "progress" }
      });
      sendToRenderer(window, {
        type: "exportProgress",
        payload: {
          text: `已导出 ${completed} / ${selectedSessions.length} 条会话。`,
          percent: Math.round((completed / selectedSessions.length) * 100)
        }
      });
    }

    await writeExportIndex(payload.outputDir, indexRows);
    const primaryDocumentPath = resolvePrimaryDocumentPath(
      payload.outputDir,
      selectedSessions.length,
      indexRows[0]?.sessionDir
    );
    const recentExports = await pushRecentExport(payload.outputDir, selectedSessions.length, primaryDocumentPath);
    sendToRenderer(window, {
      type: "exportFinished",
      payload: {
        text: `已导出 ${selectedSessions.length} 条会话到 ${payload.outputDir}`,
        outputDir: payload.outputDir,
        exportedCount: selectedSessions.length,
        primaryDocumentPath,
        recentExports
      }
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    sendToRenderer(window, { type: "exportFailed", payload: { text } });
  }
}

async function bootstrap(): Promise<void> {
  runtimeConfig = resolveDesktopRuntimeConfig(process.env, app.getPath("documents"));
  desktopMemento = new JsonFileMemento(join(app.getPath("userData"), "desktop-state.json"));
  const persistedCodexRoot = desktopMemento.get<string | undefined>(DESKTOP_CODEX_ROOT_KEY, undefined);
  if (persistedCodexRoot?.trim()) {
    runtimeConfig = {
      ...runtimeConfig,
      codexRoot: persistedCodexRoot.trim()
    };
  }
  profileStore = new ProfileStore(desktopMemento);
  uiStateStore = new UiStateStore(desktopMemento);

  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  ipcMain.removeAllListeners(IPC_CHANNEL);
  ipcMain.on(IPC_CHANNEL, (_event, message) => {
    const targetWindow = BrowserWindow.fromWebContents(_event.sender);
    if (!targetWindow) {
      return;
    }

    void handleRendererMessage(targetWindow, message as { type?: string; payload?: WizardPayload }).catch((error) => {
      sendToRenderer(targetWindow, {
        type: "exportFailed",
        payload: { text: error instanceof Error ? error.message : String(error) }
      });
    });
  });

  await renderDesktopShell(mainWindow);
}

app.whenReady().then(() => {
  void bootstrap();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
