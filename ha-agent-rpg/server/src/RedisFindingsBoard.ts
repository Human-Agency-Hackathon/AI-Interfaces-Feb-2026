import { getRedisClient } from './RedisClient.js';
import { redisPubSub } from './RedisPubSub.js';
import type { IFindingsBoard } from './interfaces/index.js';
import type { Finding } from './FindingsBoard.js';

/**
 * Redis-backed FindingsBoard.
 * Stores findings as a Redis list at key `session:{sessionId}:findings`.
 * Use when STORAGE_BACKEND=redis.
 */
export class RedisFindingsBoard implements IFindingsBoard {
  private key: string;

  constructor(sessionId: string) {
    const safe = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    this.key = `session:${safe}:findings`;
  }

  async load(): Promise<void> {
    // No-op — Redis is always ready, nothing to preload
  }

  async save(): Promise<void> {
    // No-op — Redis persists immediately on every write
  }

  async addFinding(finding: Omit<Finding, 'id' | 'timestamp'>): Promise<Finding> {
    const entry: Finding = {
      ...finding,
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    await getRedisClient().rpush(this.key, JSON.stringify(entry));
    redisPubSub.publish('findings:broadcast', JSON.stringify(entry)).catch(() => {});
    return entry;
  }

  async getAll(): Promise<Finding[]> {
    const items = await getRedisClient().lrange(this.key, 0, -1);
    return items.map((s) => JSON.parse(s) as Finding);
  }

  async getRecent(limit = 20): Promise<Finding[]> {
    const items = await getRedisClient().lrange(this.key, -limit, -1);
    return items.map((s) => JSON.parse(s) as Finding);
  }

  async getSummary(): Promise<string> {
    const recent = await this.getRecent(10);
    if (recent.length === 0) return 'No findings yet.';
    return recent.map((f) => `- [${f.agent_name}] ${f.finding}`).join('\n');
  }
}
