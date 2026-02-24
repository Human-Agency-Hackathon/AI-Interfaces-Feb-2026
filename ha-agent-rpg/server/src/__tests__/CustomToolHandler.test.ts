import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CustomToolHandler } from '../CustomToolHandler.js';
import { FindingsBoard } from '../FindingsBoard.js';
import { QuestManager } from '../QuestManager.js';
import { KnowledgeVault } from '../KnowledgeVault.js';
import { makeQuest } from './helpers/fixtures.js';

describe('CustomToolHandler', () => {
  let tempDir: string;
  let board: FindingsBoard;
  let qm: QuestManager;
  let vaults: Map<string, KnowledgeVault>;
  let handler: CustomToolHandler;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'toolhandler-test-'));
    board = new FindingsBoard(tempDir);
    qm = new QuestManager();
    qm.loadQuests([
      makeQuest({ quest_id: 'q1' }),
      makeQuest({ quest_id: 'q2', title: 'Quest 2' }),
    ]);

    vaults = new Map();
    const vault = new KnowledgeVault(tempDir, 'agent1', { agent_name: 'Oracle' });
    vaults.set('agent1', vault);

    handler = new CustomToolHandler(
      board,
      qm,
      (id) => vaults.get(id),
      (id) => (id === 'agent1' ? 'Oracle' : id),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('SummonAgent', () => {
    it('returns acknowledged result and emits summon:request', async () => {
      const emitted: any[] = [];
      handler.on('summon:request', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'SummonAgent',
        tool_input: {
          name: 'Scout',
          role: 'Explorer',
          realm: 'src/',
          mission: 'Explore',
          priority: 'high',
        },
        agent_id: 'agent1',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].name).toBe('Scout');
      expect(emitted[0].requestingAgent).toBe('agent1');
    });
  });

  describe('RequestHelp', () => {
    it('returns acknowledged result and emits help:request', async () => {
      const emitted: any[] = [];
      handler.on('help:request', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'RequestHelp',
        tool_input: { target_agent: 'agent2', question: 'How does auth work?' },
        agent_id: 'agent1',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].targetAgent).toBe('agent2');
    });
  });

  describe('PostFindings', () => {
    it('adds finding to board, saves, and emits findings:posted', async () => {
      const emitted: any[] = [];
      handler.on('findings:posted', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'PostFindings',
        tool_input: { realm: 'src/', finding: 'No test coverage', severity: 'high' },
        agent_id: 'agent1',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(result.result.finding_id).toBeTruthy();
      const all = await board.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].finding).toBe('No test coverage');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].agentName).toBe('Oracle');
    });
  });

  describe('UpdateKnowledge', () => {
    it('adds insight, increments expertise, saves, and emits knowledge:updated', async () => {
      const emitted: any[] = [];
      handler.on('knowledge:updated', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'UpdateKnowledge',
        tool_input: { insight: 'Project uses Vitest', area: 'testing', amount: 2 },
        agent_id: 'agent1',
      });

      expect(result.result.saved).toBe(true);
      const vault = vaults.get('agent1')!;
      expect(vault.getKnowledge().insights).toContain('Project uses Vitest');
      expect(vault.getKnowledge().expertise.testing).toBe(2);
      expect(emitted).toHaveLength(1);
    });

    it('returns error when vault not found', async () => {
      const result = await handler.handleToolCall({
        tool_name: 'UpdateKnowledge',
        tool_input: { insight: 'x', area: 'y' },
        agent_id: 'nonexistent',
      });
      expect(result.result.error).toContain('No vault found');
    });

    it('defaults amount to 1 when not provided', async () => {
      await handler.handleToolCall({
        tool_name: 'UpdateKnowledge',
        tool_input: { insight: 'x', area: 'coding' },
        agent_id: 'agent1',
      });
      expect(vaults.get('agent1')!.getKnowledge().expertise.coding).toBe(1);
    });
  });

  describe('ClaimQuest', () => {
    it('assigns quest and emits quest:claimed', async () => {
      const emitted: any[] = [];
      handler.on('quest:claimed', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'ClaimQuest',
        tool_input: { quest_id: 'q1' },
        agent_id: 'agent1',
      });

      expect(result.result.assigned).toBe(true);
      expect(qm.getStatus('q1')).toBe('assigned');
      expect(qm.getAssignee('q1')).toBe('agent1');
      expect(emitted).toHaveLength(1);
    });

    it('returns error for non-existent quest', async () => {
      const result = await handler.handleToolCall({
        tool_name: 'ClaimQuest',
        tool_input: { quest_id: 'nonexistent' },
        agent_id: 'agent1',
      });
      expect(result.result.error).toBeTruthy();
    });

    it('returns error for already-assigned quest', async () => {
      await handler.handleToolCall({
        tool_name: 'ClaimQuest',
        tool_input: { quest_id: 'q1' },
        agent_id: 'agent1',
      });
      const result = await handler.handleToolCall({
        tool_name: 'ClaimQuest',
        tool_input: { quest_id: 'q1' },
        agent_id: 'agent1',
      });
      expect(result.result.error).toBeTruthy();
    });
  });

  describe('CompleteQuest', () => {
    it('transitions quest to done and emits quest:completed', async () => {
      const emitted: any[] = [];
      handler.on('quest:completed', (data) => emitted.push(data));

      qm.assignQuest('q1', 'agent1');
      qm.updateStatus('q1', 'in_progress');

      const result = await handler.handleToolCall({
        tool_name: 'CompleteQuest',
        tool_input: { quest_id: 'q1', outcome: 'Fixed the bug' },
        agent_id: 'agent1',
      });

      expect(result.result.closed).toBe(true);
      expect(qm.getStatus('q1')).toBe('done');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].outcome).toBe('Fixed the bug');
    });

    it('records completion in agent vault', async () => {
      qm.assignQuest('q1', 'agent1');
      qm.updateStatus('q1', 'in_progress');

      await handler.handleToolCall({
        tool_name: 'CompleteQuest',
        tool_input: { quest_id: 'q1' },
        agent_id: 'agent1',
      });

      const vault = vaults.get('agent1')!;
      const history = vault.getKnowledge().task_history;
      expect(history.some((h) => h.task.includes('q1'))).toBe(true);
      expect(vault.getKnowledge().expertise.quests_completed).toBe(1);
    });

    it('returns error for invalid transition', async () => {
      const result = await handler.handleToolCall({
        tool_name: 'CompleteQuest',
        tool_input: { quest_id: 'q1' },
        agent_id: 'agent1',
      });
      expect(result.result.error).toBeTruthy();
    });
  });

  describe('CompleteStage', () => {
    it('returns acknowledged result and emits stage:complete', async () => {
      const emitted: any[] = [];
      handler.on('stage:complete', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'CompleteStage',
        tool_input: { summary: 'Generated 10 ideas', artifacts: { idea_list: 'idea1, idea2' } },
        agent_id: 'agent1',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(result.result.message).toContain('Stage completion');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].agentId).toBe('agent1');
      expect(emitted[0].summary).toBe('Generated 10 ideas');
      expect(emitted[0].artifacts).toEqual({ idea_list: 'idea1, idea2' });
    });

    it('defaults artifacts to empty object when not provided', async () => {
      const emitted: any[] = [];
      handler.on('stage:complete', (data) => emitted.push(data));

      await handler.handleToolCall({
        tool_name: 'CompleteStage',
        tool_input: { summary: 'Done' },
        agent_id: 'agent1',
      });

      expect(emitted[0].artifacts).toEqual({});
    });
  });

  describe('SealChamber', () => {
    it('returns acknowledged result and emits stage:complete', async () => {
      const emitted: any[] = [];
      handler.on('stage:complete', (data) => emitted.push(data));

      const result = await handler.handleToolCall({
        tool_name: 'SealChamber',
        tool_input: { summary: 'Chamber sealed with findings' },
        agent_id: 'agent1',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(result.result.message).toContain('Chamber sealed');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].agentId).toBe('agent1');
      expect(emitted[0].summary).toBe('Chamber sealed with findings');
      expect(emitted[0].artifacts).toEqual({});
    });
  });

  describe('unknown tool', () => {
    it('returns error for unrecognized tool name', async () => {
      const result = await handler.handleToolCall({
        tool_name: 'FakeToolXYZ',
        tool_input: {},
        agent_id: 'agent1',
      });
      expect(result.result.error).toContain('Unknown tool');
    });
  });

  describe('Oracle tool handlers', () => {
    it('handles SelectHeroes and emits oracle:select-heroes', async () => {
      const events: any[] = [];
      handler.on('oracle:select-heroes', (e: any) => events.push(e));

      const result = await handler.handleToolCall({
        tool_name: 'SelectHeroes',
        tool_input: {
          activityType: 'code_review',
          processId: 'code_review',
          heroes: [
            { roleId: 'architect', mission: 'Map the architecture' },
            { roleId: 'sentinel', mission: 'Find security issues' },
          ],
        },
        agent_id: 'oracle',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0].heroes).toHaveLength(2);
    });

    it('handles SummonReinforcement and emits oracle:summon-reinforcement', async () => {
      const events: any[] = [];
      handler.on('oracle:summon-reinforcement', (e: any) => events.push(e));

      const result = await handler.handleToolCall({
        tool_name: 'SummonReinforcement',
        tool_input: {
          roleId: 'healer',
          reason: 'Error handling issues found',
        },
        agent_id: 'oracle',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0].roleId).toBe('healer');
    });

    it('handles DismissHero and emits oracle:dismiss-hero', async () => {
      const events: any[] = [];
      handler.on('oracle:dismiss-hero', (e: any) => events.push(e));

      const result = await handler.handleToolCall({
        tool_name: 'DismissHero',
        tool_input: {
          agentId: 'scout',
          reason: 'No longer needed',
        },
        agent_id: 'oracle',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0].heroId).toBe('scout');
    });

    it('handles PresentReport and emits oracle:present-report', async () => {
      const events: any[] = [];
      handler.on('oracle:present-report', (e: any) => events.push(e));

      const result = await handler.handleToolCall({
        tool_name: 'PresentReport',
        tool_input: {
          report: '## Executive Summary\nThe codebase is well-structured...',
        },
        agent_id: 'oracle',
      });

      expect(result.result.acknowledged).toBe(true);
      expect(events).toHaveLength(1);
    });
  });
});
