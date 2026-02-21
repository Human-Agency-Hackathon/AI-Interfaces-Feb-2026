import { describe, it, expect, beforeEach } from 'vitest';
import { FindingsBoard } from '../FindingsBoard.js';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FindingsBoard', () => {
  let board: FindingsBoard;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'findings-test-'));
    board = new FindingsBoard(tempDir);
    await board.load();
  });

  describe('addFinding()', () => {
    it('creates a finding with auto-generated id and timestamp', async () => {
      const finding = await board.addFinding({
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
    it('returns all findings', async () => {
      await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'f1', severity: 'low' });
      await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'f2', severity: 'high' });
      const all = await board.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('getRecent()', () => {
    it('returns the last N findings', async () => {
      for (let i = 0; i < 25; i++) {
        await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: `f${i}`, severity: 'low' });
      }
      const recent = await board.getRecent(5);
      expect(recent).toHaveLength(5);
      expect(recent[0].finding).toBe('f20');
    });

    it('defaults to 20 when no limit given', async () => {
      for (let i = 0; i < 25; i++) {
        await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: `f${i}`, severity: 'low' });
      }
      expect(await board.getRecent()).toHaveLength(20);
    });
  });

  describe('getSummary()', () => {
    it('returns "No findings yet." when empty', async () => {
      expect(await board.getSummary()).toBe('No findings yet.');
    });

    it('returns formatted summary of recent findings', async () => {
      await board.addFinding({
        agent_id: 'a1',
        agent_name: 'Oracle',
        realm: '/',
        finding: 'Uses ESM',
        severity: 'low',
      });
      const summary = await board.getSummary();
      expect(summary).toContain('[Oracle]');
      expect(summary).toContain('Uses ESM');
    });
  });

  describe('load() and save()', () => {
    it('starts empty after load', async () => {
      await board.load();
      await board.save();
      expect(await board.getAll()).toHaveLength(0);
    });

    it('findings persist across board instances with the same session path', async () => {
      await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'test', severity: 'medium' });

      const board2 = new FindingsBoard(tempDir);
      await board2.load();
      const all = await board2.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].finding).toBe('test');
    });
  });
});
