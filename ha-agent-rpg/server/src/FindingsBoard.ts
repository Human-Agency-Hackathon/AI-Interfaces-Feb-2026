import { getRedisClient } from './RedisClient.js';

export interface Finding {
  id: string;
  agent_id: string;
  agent_name: string;
  realm: string;
  finding: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export class FindingsBoard {
  private key: string;

  constructor(sessionId: string) {
    // sessionId is the repoPath or session identifier — hash it into a safe Redis key
    const safe = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    this.key = `session:${safe}:findings`;
  }

  // No-op: Redis needs no explicit load step
  async load(): Promise<void> {}

  // No-op: every write goes straight to Redis
  async save(): Promise<void> {}

  async addFinding(finding: Omit<Finding, 'id' | 'timestamp'>): Promise<Finding> {
    const entry: Finding = {
      ...finding,
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    await getRedisClient().rpush(this.key, JSON.stringify(entry));
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
