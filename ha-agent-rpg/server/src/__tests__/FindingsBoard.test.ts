import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FindingsBoard } from '../FindingsBoard.js';

describe('FindingsBoard', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'findings-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('addFinding()', () => {
    it('creates a finding with auto-generated id and timestamp', () => {
      const board = new FindingsBoard(tempDir);
      const finding = board.addFinding({
        agent_id: 'a1',
        agent_name: 'Oracle',
        realm: '/',
        finding: 'Project uses TypeScript',
        severity: 'low',
      });
      expect(finding.id).toMatch(/^finding_/);
      expect(finding.timestamp).toBeTruthy();
      expect(finding.agent_id).toBe('a1');
      expect(finding.finding).toBe('Project uses TypeScript');
      expect(finding.severity).toBe('low');
    });
  });

  describe('getAll()', () => {
    it('returns a copy of all findings', () => {
      const board = new FindingsBoard(tempDir);
      board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'f1', severity: 'low' });
      board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'f2', severity: 'high' });
      const all = board.getAll();
      expect(all).toHaveLength(2);
      all.pop();
      expect(board.getAll()).toHaveLength(2);
    });
  });

  describe('getRecent()', () => {
    it('returns the last N findings', () => {
      const board = new FindingsBoard(tempDir);
      for (let i = 0; i < 25; i++) {
        board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: `f${i}`, severity: 'low' });
      }
      const recent = board.getRecent(5);
      expect(recent).toHaveLength(5);
      expect(recent[0].finding).toBe('f20');
    });

    it('defaults to 20 when no limit given', () => {
      const board = new FindingsBoard(tempDir);
      for (let i = 0; i < 25; i++) {
        board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: `f${i}`, severity: 'low' });
      }
      expect(board.getRecent()).toHaveLength(20);
    });
  });

  describe('getSummary()', () => {
    it('returns "No findings yet." when empty', () => {
      const board = new FindingsBoard(tempDir);
      expect(board.getSummary()).toBe('No findings yet.');
    });

    it('returns formatted summary of recent findings', () => {
      const board = new FindingsBoard(tempDir);
      board.addFinding({
        agent_id: 'a1',
        agent_name: 'Oracle',
        realm: '/',
        finding: 'Uses ESM',
        severity: 'low',
      });
      const summary = board.getSummary();
      expect(summary).toContain('[Oracle]');
      expect(summary).toContain('Uses ESM');
    });
  });

  describe('save() and load()', () => {
    it('persists findings to disk and loads them back', async () => {
      const board1 = new FindingsBoard(tempDir);
      board1.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'test', severity: 'medium' });
      await board1.save();

      const board2 = new FindingsBoard(tempDir);
      await board2.load();
      expect(board2.getAll()).toHaveLength(1);
      expect(board2.getAll()[0].finding).toBe('test');
    });

    it('writes valid JSON to the expected path', async () => {
      const board = new FindingsBoard(tempDir);
      board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'x', severity: 'low' });
      await board.save();

      const filePath = join(tempDir, '.agent-rpg', 'findings', 'board.json');
      const data = JSON.parse(await readFile(filePath, 'utf-8'));
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].finding).toBe('x');
    });

    it('load() starts with empty array when no file exists', async () => {
      const board = new FindingsBoard(tempDir);
      await board.load();
      expect(board.getAll()).toEqual([]);
    });
  });
});
