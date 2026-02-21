import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

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
  private findings: Finding[] = [];
  private filePath: string;

  constructor(repoPath: string) {
    this.filePath = join(repoPath, '.agent-rpg', 'findings', 'board.json');
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      this.findings = JSON.parse(data);
    } catch {
      this.findings = [];
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.findings, null, 2));
  }

  addFinding(finding: Omit<Finding, 'id' | 'timestamp'>): Finding {
    const entry: Finding = {
      ...finding,
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.findings.push(entry);
    return entry;
  }

  getAll(): Finding[] {
    return [...this.findings];
  }

  getRecent(limit = 20): Finding[] {
    return this.findings.slice(-limit);
  }

  getSummary(): string {
    if (this.findings.length === 0) return 'No findings yet.';
    return this.findings
      .slice(-10)
      .map(f => `- [${f.agent_name}] ${f.finding}`)
      .join('\n');
  }
}
