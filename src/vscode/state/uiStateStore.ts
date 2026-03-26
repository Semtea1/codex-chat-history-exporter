import type { MementoLike } from "./profileStore";

export interface UiState {
  selectedProfileId: string;
  selectedSessionIds: string[];
  outputDir?: string;
  includeMessageTimestamps?: boolean;
  includeChildSessionsAsAppendix?: boolean;
  start?: string;
  end?: string;
}

const UI_STATE_KEY = "codexChatExporter.uiState";

export class UiStateStore {
  public constructor(private readonly memento: MementoLike) {}

  public getState(): UiState {
    return this.memento.get<UiState>(UI_STATE_KEY, {
      selectedProfileId: "reading",
      selectedSessionIds: []
    });
  }

  public async updateState(patch: Partial<UiState>): Promise<void> {
    const current = this.getState();
    await this.memento.update(UI_STATE_KEY, {
      ...current,
      ...patch
    });
  }
}
