import * as vscode from "vscode";

import { exportSelectedSessions } from "./commands/exportSelectedSessions";
import { openExportWizard } from "./commands/openExportWizard";
import { resolveExtensionRuntimeConfig } from "./config";
import { InMemoryMemento, ProfileStore } from "./state/profileStore";
import { UiStateStore } from "./state/uiStateStore";
import { SessionTreeItem, SessionTreeProvider } from "./views/sessionTreeProvider";

function extractSelectedSessionIds(items: unknown[]): string[] {
  return items
    .filter((item): item is SessionTreeItem => item instanceof SessionTreeItem)
    .map((item) => item.session.sessionId);
}

export function activate(context: vscode.ExtensionContext): void {
  const runtimeConfig = resolveExtensionRuntimeConfig(
    vscode.workspace.getConfiguration("codexChatExporter"),
    process.env
  );
  const profileStore = new ProfileStore(context.globalState ?? new InMemoryMemento());
  const uiStateStore = new UiStateStore(context.workspaceState ?? new InMemoryMemento());
  void uiStateStore.updateState(uiStateStore.getState());

  const sessionTreeProvider = new SessionTreeProvider(runtimeConfig.codexRoot, {
    showInternalSessions: runtimeConfig.showInternalSessions
  });
  const sessionTreeView = vscode.window.createTreeView("codexChatExporter.sessions", {
    treeDataProvider: sessionTreeProvider,
    canSelectMany: true
  });

  context.subscriptions.push(
    sessionTreeView,
    sessionTreeView.onDidChangeSelection(async (event) => {
      await uiStateStore.updateState({
        selectedSessionIds: event.selection.map((item) => item.session.sessionId)
      });
    }),
    vscode.commands.registerCommand("codexChatExporter.refreshSessions", () => {
      sessionTreeProvider.refresh();
    }),
    vscode.commands.registerCommand("codexChatExporter.openExportWizard", async (...items: SessionTreeItem[]) => {
      const selectedSessionIds = extractSelectedSessionIds(items);
      if (selectedSessionIds.length > 0) {
        await uiStateStore.updateState({
          selectedSessionIds
        });
      }
      await openExportWizard(profileStore, uiStateStore, runtimeConfig);
    }),
    vscode.commands.registerCommand("codexChatExporter.exportSelectedSessions", async (...items: SessionTreeItem[]) => {
      const selectedSessionIds = extractSelectedSessionIds(items);
      if (selectedSessionIds.length > 0) {
        await uiStateStore.updateState({
          selectedSessionIds
        });
      }
      await exportSelectedSessions(profileStore, uiStateStore, runtimeConfig);
    })
  );
}

export function deactivate(): void {
  // noop
}
