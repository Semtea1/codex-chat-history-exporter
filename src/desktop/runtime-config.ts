import { join } from "node:path";

import type { ExtensionRuntimeConfig } from "../vscode/config";

export function resolveDesktopRuntimeConfig(env: NodeJS.ProcessEnv, documentsDir: string): ExtensionRuntimeConfig {
  const homeDir = env.USERPROFILE ?? env.HOME ?? "";
  const codexRoot =
    env.CODEX_HOME ||
    (homeDir ? join(homeDir, ".codex") : ".codex");

  return {
    codexRoot,
    defaultOutputDir: join(documentsDir, "Codex Chat Exports"),
    maxSessionsInWizard: 1000,
    showInternalSessions: false
  };
}
