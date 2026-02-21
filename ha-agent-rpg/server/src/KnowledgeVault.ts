import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sanitizePathComponent } from './PathSafety.js';

export interface AgentKnowledge {
  agent_id: string;
  agent_name: string;
  role: string;
  realm: string;
  expertise: Record<string, number>;
  realm_knowledge: Record<string, number>;
  insights: string[];
  task_history: Array<{ task: string; outcome: string; timestamp: string }>;
  files_analyzed: string[];
}

export class KnowledgeVault {
  private knowledge: AgentKnowledge;
  private filePath: string;

  constructor(repoPath: string, agentId: string, defaults: Partial<AgentKnowledge>) {
    const safeAgentId = sanitizePathComponent(agentId);
    this.filePath = join(repoPath, '.agent-rpg', 'knowledge', `${safeAgentId}.json`);
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
    try {
      const data = await readFile(this.filePath, 'utf-8');
      this.knowledge = JSON.parse(data);
    } catch {
      // No existing knowledge — start fresh
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.knowledge, null, 2));
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
