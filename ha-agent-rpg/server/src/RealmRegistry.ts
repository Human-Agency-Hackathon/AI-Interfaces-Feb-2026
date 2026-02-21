import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { RealmEntry } from './types.js';
import type { IRealmRegistry } from './interfaces/index.js';

interface RealmRegistryData {
  realms: RealmEntry[];
  lastActiveRealmId?: string;
}

export class RealmRegistry implements IRealmRegistry {
  private realms: RealmEntry[] = [];
  private filePath: string;
  private lastActiveRealmId: string | undefined = undefined;

  constructor(baseDir: string) {
    this.filePath = join(baseDir, '.agent-rpg', 'realms.json');
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed: RealmRegistryData = JSON.parse(data);
      this.realms = parsed.realms ?? [];
      this.lastActiveRealmId = parsed.lastActiveRealmId;
    } catch {
      this.realms = [];
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const data: RealmRegistryData = { realms: this.realms, lastActiveRealmId: this.lastActiveRealmId };
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  listRealms(): RealmEntry[] {
    return [...this.realms].sort(
      (a, b) => new Date(b.lastExplored).getTime() - new Date(a.lastExplored).getTime(),
    );
  }

  getRealm(id: string): RealmEntry | undefined {
    return this.realms.find((r) => r.id === id);
  }

  saveRealm(entry: RealmEntry): void {
    const idx = this.realms.findIndex((r) => r.id === entry.id);
    if (idx >= 0) {
      this.realms[idx] = entry;
    } else {
      this.realms.push(entry);
    }
  }

  removeRealm(id: string): void {
    this.realms = this.realms.filter((r) => r.id !== id);
  }

  generateRealmId(repoPath: string): string {
    return createHash('sha256').update(repoPath).digest('hex').slice(0, 12);
  }

  getLastActiveRealmId(): string | undefined {
    return this.lastActiveRealmId;
  }

  setLastActiveRealmId(id: string): void {
    this.lastActiveRealmId = id;
  }

  clearLastActiveRealmId(): void {
    this.lastActiveRealmId = undefined;
  }
}
