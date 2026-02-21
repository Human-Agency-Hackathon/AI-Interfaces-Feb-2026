import { getRedisClient } from './RedisClient.js';
import { sanitizePathComponent } from './PathSafety.js';
import type { IKnowledgeVault } from './interfaces/index.js';
import type { AgentKnowledge } from './KnowledgeVault.js';

/**
 * Redis-backed KnowledgeVault.
 * Stores agent knowledge as a JSON string at key `vault:{agentId}:knowledge`.
 * Use when STORAGE_BACKEND=redis.
 */
export class RedisKnowledgeVault implements IKnowledgeVault {
  private key: string;
  private knowledge: AgentKnowledge;

  constructor(agentId: string, defaults: Partial<AgentKnowledge>) {
    const safeId = sanitizePathComponent(agentId);
    this.key = `vault:${safeId}:knowledge`;
    this.knowledge = {
      agent_id: agentId,
      agent_name: defaults.agent_name ?? agentId,
      role: defaults.role ?? 'unknown',
      realm: defaults.realm ?? '/',
      expertise: defaults.expertise ?? {},
      realm_knowledge: defaults.realm_knowledge ?? {},
      insights: defaults.insights ?? [],
      task_history: defaults.task_history ?? [],
      files_analyzed: defaults.files_analyzed ?? [],
    };
  }

  async load(): Promise<void> {
    const data = await getRedisClient().get(this.key);
    if (data) {
      this.knowledge = JSON.parse(data) as AgentKnowledge;
    }
  }

  async save(): Promise<void> {
    await getRedisClient().set(this.key, JSON.stringify(this.knowledge));
  }

  getKnowledge(): AgentKnowledge {
    return { ...this.knowledge };
  }

  addInsight(insight: string): void {
    this.knowledge.insights.push(insight);
  }

  recordFileAnalyzed(filePath: string): void {
    if (!this.knowledge.files_analyzed.includes(filePath)) {
      this.knowledge.files_analyzed.push(filePath);
    }
    const dir = filePath.split('/').slice(0, -1).join('/') || '/';
    this.knowledge.realm_knowledge[dir] = (this.knowledge.realm_knowledge[dir] ?? 0) + 1;
  }

  incrementExpertise(area: string, amount = 1): void {
    this.knowledge.expertise[area] = (this.knowledge.expertise[area] ?? 0) + amount;
  }

  addTaskHistory(task: string, outcome: string): void {
    this.knowledge.task_history.push({
      task,
      outcome,
      timestamp: new Date().toISOString(),
    });
  }

  getExpertiseSummary(): string {
    const entries = Object.entries(this.knowledge.expertise)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (entries.length === 0) return 'No expertise yet.';
    return entries.map(([area, score]) => `${area}: ${score}`).join(', ');
  }

  getRealmSummary(): string {
    const entries = Object.entries(this.knowledge.realm_knowledge)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (entries.length === 0) return 'No realm knowledge yet.';
    return entries.map(([dir, score]) => `${dir}: ${score}`).join(', ');
  }
}
