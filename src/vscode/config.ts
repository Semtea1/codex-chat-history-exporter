export interface ConfigurationLike {
  get<T>(key: string, defaultValue?: T): T | undefined;
}

export interface ExtensionRuntimeConfig {
  codexRoot: string;
  defaultOutputDir?: string;
  maxSessionsInWizard: number;
  showInternalSessions: boolean;
}

export function resolveExtensionRuntimeConfig(
  configuration: ConfigurationLike,
  env: NodeJS.ProcessEnv
): ExtensionRuntimeConfig {
  const configuredCodexRoot = configuration.get<string | null>("codexRoot", null) ?? null;
  const configuredOutputDir = configuration.get<string | null>("defaultOutputDir", null) ?? null;
  const configuredMaxSessions = configuration.get<number>("maxSessionsInWizard", 1000) ?? 1000;
  const showInternalSessions = configuration.get<boolean>("showInternalSessions", false) ?? false;

  const homeDir = env.USERPROFILE ?? env.HOME ?? "";
  const defaultCodexRoot =
    env.CODEX_HOME ||
    (homeDir ? `${homeDir}${homeDir.includes("\\") ? "\\" : "/"}${".codex"}` : ".codex");

  const codexRoot =
    configuredCodexRoot && configuredCodexRoot.trim() ? configuredCodexRoot.trim() : defaultCodexRoot;

  const defaultOutputDir =
    configuredOutputDir && configuredOutputDir.trim() ? configuredOutputDir.trim() : undefined;

  return {
    codexRoot,
    defaultOutputDir,
    maxSessionsInWizard: Number.isFinite(configuredMaxSessions) && configuredMaxSessions > 0 ? configuredMaxSessions : 1000,
    showInternalSessions
  };
}
