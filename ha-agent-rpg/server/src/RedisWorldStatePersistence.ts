import { getRedisClient } from './RedisClient.js';
import { WorldState } from './WorldState.js';
import { sanitizePathComponent } from './PathSafety.js';
import type { IWorldStatePersistence } from './interfaces/index.js';

/**
 * Redis-backed WorldStatePersistence.
 * Stores serialised WorldState JSON at key `world:{realmId}:state`.
 * Use when STORAGE_BACKEND=redis.
 */
export class RedisWorldStatePersistence implements IWorldStatePersistence {
  private keyFor(realmId: string): string {
    return `world:${sanitizePathComponent(realmId)}:state`;
  }

  async save(realmId: string, worldState: WorldState): Promise<void> {
    await getRedisClient().set(this.keyFor(realmId), worldState.toJSON());
  }

  async load(realmId: string): Promise<WorldState | null> {
    const data = await getRedisClient().get(this.keyFor(realmId));
    if (!data) return null;
    return WorldState.fromJSON(data);
  }

  async exists(realmId: string): Promise<boolean> {
    return (await getRedisClient().exists(this.keyFor(realmId))) === 1;
  }

  async remove(realmId: string): Promise<void> {
    await getRedisClient().del(this.keyFor(realmId));
  }
}
