import * as vscode from "vscode";

import { scanSessions } from "../../core/session-index";
import type { SessionSummary } from "../../core/types";

export class SessionTreeItem extends vscode.TreeItem {
  public constructor(public readonly session: SessionSummary) {
    super(session.title, vscode.TreeItemCollapsibleState.None);
    this.id = session.sessionId;

    const markers = [
      session.parentSessionId ? "子会话" : undefined,
      session.childSessionCount ? `附 ${session.childSessionCount} 子会话` : undefined,
      session.kind,
      (session.updatedAt || session.timestamp).replace("T", " ").replace("Z", "")
    ].filter(Boolean);

    this.description = markers.join(" · ");
    this.tooltip = new vscode.MarkdownString(
      [
        `**${session.title}**`,
        "",
        `- kind: \`${session.kind}\``,
        `- updated: \`${session.updatedAt || session.timestamp}\``,
        `- session: \`${session.sessionId}\``,
        ...(session.parentSessionId ? [`- parent: \`${session.parentSessionId}\``] : []),
        ...(session.childSessionCount ? [`- child sessions: \`${session.childSessionCount}\``] : []),
        `- cwd: \`${session.cwd}\``
      ].join("\n")
    );

    this.iconPath =
      session.kind === "desktop"
        ? new vscode.ThemeIcon("device-desktop")
        : session.kind === "vscode"
          ? new vscode.ThemeIcon("code")
          : new vscode.ThemeIcon("terminal");
    this.contextValue = "codexChatExporter.session";
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SessionTreeItem | undefined | void>();
  private cachedItems: SessionTreeItem[] | undefined;

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(
    private readonly codexRoot: string,
    private readonly options: {
      showInternalSessions: boolean;
    }
  ) {}

  public refresh(): void {
    this.cachedItems = undefined;
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (element) {
      return [];
    }

    if (!this.cachedItems) {
      const sessions = await scanSessions(this.codexRoot);
      this.cachedItems = sessions
        .filter((session) => this.options.showInternalSessions || !session.isInternal)
        .map((session) => new SessionTreeItem(session));
    }

    return this.cachedItems;
  }
}
