import { getRedisClient, isRedisAvailable } from './RedisClient.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface Finding {
  id: string;
  agent_id: string;
  agent_name: string;
  realm: string;
  finding: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

/**
 * FindingsBoard stores agent findings.
 * Uses Redis when available; falls back to a JSON file on disk.
 */
export class FindingsBoard {
  private redisKey: string;
  private jsonPath: string;
  private findings: Finding[] = [];
  private useRedis = false;

  constructor(sessionId: string) {
    const safe = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    this.redisKey = `session:${safe}:findings`;
    this.jsonPath = join(sessionId, '.agent-rpg', 'findings', 'board.json');
  }

  async load(): Promise<void> {
    this.useRedis = await isRedisAvailable();

    if (this.useRedis) {
      // Redis handles persistence — nothing to preload
      return;
    }

    // JSON fallback: load from disk
    try {
      const raw = await readFile(this.jsonPath, 'utf-8');
      this.findings = JSON.parse(raw) as Finding[];
    } catch {
      this.findings = [];
    }
  }

  async save(): Promise<void> {
    if (this.useRedis) return;

    // JSON fallback: persist to disk
    const dir = join(this.jsonPath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(this.jsonPath, JSON.stringify(this.findings, null, 2));
  }

  async addFinding(finding: Omit<Finding, 'id' | 'timestamp'>): Promise<Finding> {
    const entry: Finding = {
      ...finding,
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };

    if (this.useRedis) {
      await getRedisClient().rpush(this.redisKey, JSON.stringify(entry));
    } else {
      this.findings.push(entry);
      await this.save();
    }

    return entry;
  }

  async getAll(): Promise<Finding[]> {
    if (this.useRedis) {
      const items = await getRedisClient().lrange(this.redisKey, 0, -1);
      return items.map((s) => JSON.parse(s) as Finding);
    }
    return [...this.findings];
  }

  async getRecent(limit = 20): Promise<Finding[]> {
    if (this.useRedis) {
      const items = await getRedisClient().lrange(this.redisKey, -limit, -1);
      return items.map((s) => JSON.parse(s) as Finding);
    }
    return this.findings.slice(-limit);
  }

  async getSummary(): Promise<string> {
    const recent = await this.getRecent(10);
    if (recent.length === 0) return 'No findings yet.';
    return recent.map((f) => `- [${f.agent_name}] ${f.finding}`).join('\n');
  }
}
