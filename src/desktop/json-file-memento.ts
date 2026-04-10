import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { MementoLike } from "../vscode/state/profileStore";

export class JsonFileMemento implements MementoLike {
  private readonly state: Record<string, unknown>;

  public constructor(private readonly filePath: string) {
    this.state = this.loadState();
  }

  public get<T>(key: string, defaultValue: T): T {
    return Object.prototype.hasOwnProperty.call(this.state, key) ? (this.state[key] as T) : defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    this.state[key] = value;
    this.persist();
  }

  private loadState(): Record<string, unknown> {
    if (!existsSync(this.filePath)) {
      return {};
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
