import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleManager } from '../OracleManager.js';

describe('OracleManager', () => {
  let mockSessionManager: any;
  let mockToolHandler: any;
  let mockFindingsBoard: any;
  let oracle: OracleManager;

  beforeEach(() => {
    mockSessionManager = {
      spawnAgent: vi.fn(async () => {}),
      dismissAgent: vi.fn(async () => {}),
      sendFollowUp: vi.fn(async () => {}),
    };
    mockToolHandler = {
      on: vi.fn(),
    };
    mockFindingsBoard = {
      getRecent: vi.fn(async () => []),
    };
    oracle = new OracleManager(mockSessionManager, mockToolHandler, mockFindingsBoard);
  });

  describe('spawn()', () => {
    it('spawns an Oracle agent session', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'How to improve auth?',
        repoInput: '/test/repo',
        permissionLevel: 'read-only',
      });

      expect(mockSessionManager.spawnAgent).toHaveBeenCalledTimes(1);
      const config = mockSessionManager.spawnAgent.mock.calls[0][0];
      expect(config.agentId).toBe('oracle');
      expect(config.agentName).toBe('The Oracle');
    });

    it('throws if Oracle is already spawned', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });

      await expect(oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test2',
        permissionLevel: 'read-only',
      })).rejects.toThrow('Oracle is already active');
    });
  });

  describe('isActive()', () => {
    it('returns false before spawn', () => {
      expect(oracle.isActive()).toBe(false);
    });

    it('returns true after spawn', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });
      expect(oracle.isActive()).toBe(true);
    });
  });

  describe('dismiss()', () => {
    it('dismisses the Oracle session', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });
      await oracle.dismiss();
      expect(mockSessionManager.dismissAgent).toHaveBeenCalledWith('oracle');
      expect(oracle.isActive()).toBe(false);
    });
  });

  describe('feedInterStageContext()', () => {
    it('sends a follow-up prompt to the Oracle with stage info and findings', async () => {
      mockFindingsBoard.getRecent = vi.fn(async () => [
        { id: '1', agent_id: 'architect', agent_name: 'The Architect', realm: '/', finding: 'Monolithic structure', severity: 'high', timestamp: '' },
      ]);

      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });

      await oracle.feedInterStageContext('Reconnaissance', 'Deep Analysis');

      expect(mockSessionManager.sendFollowUp).toHaveBeenCalledTimes(1);
      const [agentId, prompt] = mockSessionManager.sendFollowUp.mock.calls[0];
      expect(agentId).toBe('oracle');
      expect(prompt).toContain('Reconnaissance');
      expect(prompt).toContain('Deep Analysis');
      expect(prompt).toContain('Monolithic structure');
    });

    it('does nothing if Oracle is not active', async () => {
      await oracle.feedInterStageContext('Reconnaissance', 'Deep Analysis');
      expect(mockSessionManager.sendFollowUp).not.toHaveBeenCalled();
    });
  });

  describe('tool event wiring', () => {
    it('wires oracle:select-heroes to oracle:decision event', () => {
      const events: any[] = [];
      oracle.on('oracle:decision', (e: any) => events.push(e));

      // Get the registered handler for 'oracle:select-heroes'
      const selectHeroesCall = mockToolHandler.on.mock.calls.find(
        (c: any) => c[0] === 'oracle:select-heroes'
      );
      expect(selectHeroesCall).toBeDefined();

      // Call the handler
      selectHeroesCall[1]({ activityType: 'code_review', heroes: [] });
      expect(events).toHaveLength(1);
    });

    it('wires oracle:summon-reinforcement to oracle:summon event', () => {
      const events: any[] = [];
      oracle.on('oracle:summon', (e: any) => events.push(e));

      const summonCall = mockToolHandler.on.mock.calls.find(
        (c: any) => c[0] === 'oracle:summon-reinforcement'
      );
      expect(summonCall).toBeDefined();
      summonCall[1]({ roleId: 'healer' });
      expect(events).toHaveLength(1);
    });

    it('wires oracle:dismiss-hero to oracle:dismiss event', () => {
      const events: any[] = [];
      oracle.on('oracle:dismiss', (e: any) => events.push(e));

      const dismissCall = mockToolHandler.on.mock.calls.find(
        (c: any) => c[0] === 'oracle:dismiss-hero'
      );
      expect(dismissCall).toBeDefined();
      dismissCall[1]({ heroId: 'scout' });
      expect(events).toHaveLength(1);
    });

    it('wires oracle:present-report to oracle:report event', () => {
      const events: any[] = [];
      oracle.on('oracle:report', (e: any) => events.push(e));

      const reportCall = mockToolHandler.on.mock.calls.find(
        (c: any) => c[0] === 'oracle:present-report'
      );
      expect(reportCall).toBeDefined();
      reportCall[1]({ report: 'test report' });
      expect(events).toHaveLength(1);
    });
  });
});
