import type { Finding } from '../FindingsBoard.js';

export interface IFindingsBoard {
  load(): Promise<void>;
  save(): Promise<void>;
  addFinding(finding: Omit<Finding, 'id' | 'timestamp'>): Promise<Finding>;
  getAll(): Promise<Finding[]>;
  getRecent(limit?: number): Promise<Finding[]>;
  getSummary(): Promise<string>;
}
