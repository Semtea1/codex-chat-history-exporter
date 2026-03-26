import { getBuiltinProfiles, validateProfile } from "../../core/profile";

import type { ExportProfile } from "../../core/types";

export interface MementoLike {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export class InMemoryMemento implements MementoLike {
  private readonly state = new Map<string, unknown>();

  public get<T>(key: string, defaultValue: T): T {
    return (this.state.has(key) ? this.state.get(key) : defaultValue) as T;
  }

  public async update(key: string, value: unknown): Promise<void> {
    this.state.set(key, value);
  }
}

const CUSTOM_PROFILES_KEY = "codexChatExporter.customProfiles";

export class ProfileStore {
  public constructor(private readonly memento: MementoLike) {}

  public async listProfiles(): Promise<ExportProfile[]> {
    const builtins = getBuiltinProfiles();
    const customProfiles = this.getCustomProfiles();
    return [...builtins, ...customProfiles];
  }

  public async getProfile(profileId: string): Promise<ExportProfile | undefined> {
    const profiles = await this.listProfiles();
    return profiles.find((profile) => profile.id === profileId);
  }

  public async saveProfile(profile: ExportProfile): Promise<void> {
    const validation = validateProfile(profile);
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }

    const customProfiles = this.getCustomProfiles().filter((item) => item.id !== profile.id);
    customProfiles.push({ ...profile, builtin: false });
    await this.memento.update(CUSTOM_PROFILES_KEY, customProfiles);
  }

  public async deleteProfile(profileId: string): Promise<void> {
    if (getBuiltinProfiles().some((profile) => profile.id === profileId)) {
      throw new Error("Cannot delete builtin profile");
    }

    const customProfiles = this.getCustomProfiles().filter((profile) => profile.id !== profileId);
    await this.memento.update(CUSTOM_PROFILES_KEY, customProfiles);
  }

  public async cloneProfile(sourceProfileId: string, targetProfileId: string, targetName: string): Promise<ExportProfile> {
    const source = await this.getProfile(sourceProfileId);
    if (!source) {
      throw new Error(`Profile not found: ${sourceProfileId}`);
    }

    const cloned: ExportProfile = {
      ...source,
      id: targetProfileId,
      name: targetName,
      builtin: false
    };

    await this.saveProfile(cloned);
    return cloned;
  }

  private getCustomProfiles(): ExportProfile[] {
    return this.memento.get<ExportProfile[]>(CUSTOM_PROFILES_KEY, []);
  }
}
