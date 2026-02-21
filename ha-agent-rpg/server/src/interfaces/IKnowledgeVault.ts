import type { AgentKnowledge } from '../KnowledgeVault.js';

export interface IKnowledgeVault {
  load(): Promise<void>;
  save(): Promise<void>;
  getKnowledge(): AgentKnowledge;
  addInsight(insight: string): void;
  recordFileAnalyzed(filePath: string): void;
  incrementExpertise(area: string, amount?: number): void;
  addTaskHistory(task: string, outcome: string): void;
  getExpertiseSummary(): string;
  getRealmSummary(): string;
}
