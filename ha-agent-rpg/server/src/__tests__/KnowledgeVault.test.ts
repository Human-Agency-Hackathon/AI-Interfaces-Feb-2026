import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeVault } from '../KnowledgeVault.js';

describe('KnowledgeVault', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vault-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('initializes with defaults when no file exists', () => {
    const vault = new KnowledgeVault(tempDir, 'agent1', {
      agent_name: 'Oracle',
      role: 'oracle',
      realm: '/',
    });
    const k = vault.getKnowledge();
    expect(k.agent_id).toBe('agent1');
    expect(k.agent_name).toBe('Oracle');
    expect(k.role).toBe('oracle');
    expect(k.realm).toBe('/');
    expect(k.insights).toEqual([]);
    expect(k.expertise).toEqual({});
    expect(k.files_analyzed).toEqual([]);
    expect(k.task_history).toEqual([]);
  });

  it('save() creates the directory tree and writes JSON', async () => {
    const vault = new KnowledgeVault(tempDir, 'agent1', { agent_name: 'Oracle' });
    await vault.save();
    const filePath = join(tempDir, '.agent-rpg', 'knowledge', 'agent1.json');
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(data.agent_id).toBe('agent1');
  });

  it('load() reads back saved data', async () => {
    const vault1 = new KnowledgeVault(tempDir, 'agent1', { agent_name: 'Oracle' });
    vault1.addInsight('TypeScript project');
    vault1.incrementExpertise('api', 3);
    await vault1.save();

    const vault2 = new KnowledgeVault(tempDir, 'agent1', {});
    await vault2.load();
    const k = vault2.getKnowledge();
    expect(k.insights).toContain('TypeScript project');
    expect(k.expertise.api).toBe(3);
  });

  it('load() does not throw when file does not exist', async () => {
    const vault = new KnowledgeVault(tempDir, 'nonexistent', {});
    await expect(vault.load()).resolves.toBeUndefined();
  });

  describe('addInsight()', () => {
    it('appends insights to the list', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.addInsight('first');
      vault.addInsight('second');
      expect(vault.getKnowledge().insights).toEqual(['first', 'second']);
    });
  });

  describe('incrementExpertise()', () => {
    it('initializes expertise from zero', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.incrementExpertise('testing', 2);
      expect(vault.getKnowledge().expertise.testing).toBe(2);
    });

    it('increments existing expertise', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', { expertise: { testing: 3 } });
      vault.incrementExpertise('testing', 5);
      expect(vault.getKnowledge().expertise.testing).toBe(8);
    });

    it('defaults to increment of 1', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.incrementExpertise('area');
      expect(vault.getKnowledge().expertise.area).toBe(1);
    });
  });

  describe('recordFileAnalyzed()', () => {
    it('adds file to files_analyzed list', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.recordFileAnalyzed('src/index.ts');
      expect(vault.getKnowledge().files_analyzed).toContain('src/index.ts');
    });

    it('does not add duplicates', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.recordFileAnalyzed('src/index.ts');
      vault.recordFileAnalyzed('src/index.ts');
      expect(vault.getKnowledge().files_analyzed).toHaveLength(1);
    });

    it('increments realm_knowledge for the file directory', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.recordFileAnalyzed('src/api/handler.ts');
      expect(vault.getKnowledge().realm_knowledge['src/api']).toBe(1);
    });

    it('uses "/" for root-level files', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.recordFileAnalyzed('package.json');
      expect(vault.getKnowledge().realm_knowledge['/']).toBe(1);
    });
  });

  describe('addTaskHistory()', () => {
    it('records a task with timestamp', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      vault.addTaskHistory('Review PR', 'approved');
      const history = vault.getKnowledge().task_history;
      expect(history).toHaveLength(1);
      expect(history[0].task).toBe('Review PR');
      expect(history[0].outcome).toBe('approved');
      expect(history[0].timestamp).toBeTruthy();
    });
  });

  describe('getExpertiseSummary()', () => {
    it('returns "No expertise yet." when empty', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      expect(vault.getExpertiseSummary()).toBe('No expertise yet.');
    });

    it('returns top 5 entries sorted by score', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      for (const [area, score] of [
        ['a', 10],
        ['b', 5],
        ['c', 20],
        ['d', 1],
        ['e', 15],
        ['f', 3],
      ] as const) {
        vault.incrementExpertise(area, score);
      }
      const summary = vault.getExpertiseSummary();
      expect(summary).toContain('c: 20');
      // Top 5 by score: c(20), e(15), a(10), b(5), f(3) — d(1) is excluded
      expect(summary).not.toContain('d: 1');
    });
  });

  describe('getRealmSummary()', () => {
    it('returns "No realm knowledge yet." when empty', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      expect(vault.getRealmSummary()).toBe('No realm knowledge yet.');
    });
  });

  describe('getKnowledge()', () => {
    it('returns a copy (not the internal reference)', () => {
      const vault = new KnowledgeVault(tempDir, 'a1', {});
      const k1 = vault.getKnowledge();
      const k2 = vault.getKnowledge();
      expect(k1).not.toBe(k2);
      expect(k1).toEqual(k2);
    });
  });
});
