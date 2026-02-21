import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FindingsBoard } from '../FindingsBoard.js';
import { getRedisClient } from '../RedisClient.js';

const TEST_SESSION = `test-findings-${Date.now()}`;

describe('FindingsBoard', () => {
  let board: FindingsBoard;

  beforeEach(async () => {
    board = new FindingsBoard(TEST_SESSION);
    // Clear any leftover keys from previous runs
    await getRedisClient().del(`session:${TEST_SESSION}:findings`);
  });

  afterEach(async () => {
    await getRedisClient().del(`session:${TEST_SESSION}:findings`);
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
    it('load() and save() are no-ops (Redis is always live)', async () => {
      await board.load();
      await board.save();
      expect(await board.getAll()).toHaveLength(0);
    });

    it('findings persist across board instances with the same key', async () => {
      await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'test', severity: 'medium' });

      const board2 = new FindingsBoard(TEST_SESSION);
      const all = await board2.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].finding).toBe('test');
    });
  });
});
