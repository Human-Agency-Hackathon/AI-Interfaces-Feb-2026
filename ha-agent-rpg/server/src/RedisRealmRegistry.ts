import { getRedisClient } from './RedisClient.js';
import { createHash } from 'node:crypto';
import type { IRealmRegistry } from './interfaces/index.js';
import type { RealmEntry } from './types.js';

/**
 * Redis-backed RealmRegistry.
 * Stores the full realm list as a JSON blob at key `realms:registry`.
 * Use when STORAGE_BACKEND=redis.
 */
export class RedisRealmRegistry implements IRealmRegistry {
  private readonly key = 'realms:registry';
  private readonly lastActiveKey = 'realms:lastActiveRealmId';
  private realms: RealmEntry[] = [];
  private lastActiveRealmId: string | undefined = undefined;

  async load(): Promise<void> {
    const data = await getRedisClient().get(this.key);
    if (data) {
      const parsed = JSON.parse(data) as { realms: RealmEntry[]; lastActiveRealmId?: string };
      this.realms = parsed.realms ?? [];
      this.lastActiveRealmId = parsed.lastActiveRealmId;
    }
  }

  async save(): Promise<void> {
    await getRedisClient().set(this.key, JSON.stringify({ realms: this.realms, lastActiveRealmId: this.lastActiveRealmId }));
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
