import { openExportWizard } from "./openExportWizard";
import type { ExtensionRuntimeConfig } from "../config";
import { ProfileStore } from "../state/profileStore";
import { UiStateStore } from "../state/uiStateStore";

export async function exportSelectedSessions(
  profileStore: ProfileStore,
  uiStateStore: UiStateStore,
  runtimeConfig: ExtensionRuntimeConfig
): Promise<void> {
  await openExportWizard(profileStore, uiStateStore, runtimeConfig);
}
