import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CustomToolHandler } from '../../CustomToolHandler.js';
import { FindingsBoard } from '../../FindingsBoard.js';
import { QuestManager } from '../../QuestManager.js';
import { KnowledgeVault } from '../../KnowledgeVault.js';
import { makeQuest } from '../helpers/fixtures.js';

describe('CustomToolHandler integration', () => {
  let tempDir: string;
  let board: FindingsBoard;
  let qm: QuestManager;
  let vaults: Map<string, KnowledgeVault>;
  let handler: CustomToolHandler;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'integration-test-'));
    board = new FindingsBoard(tempDir);
    await board.load();

    qm = new QuestManager();
    qm.loadQuests([
      makeQuest({ quest_id: 'q1', title: 'Fix auth bug', labels: ['bug'] }),
      makeQuest({ quest_id: 'q2', title: 'Add tests', labels: ['enhancement'] }),
    ]);

    vaults = new Map();
    const createVault = (id: string, name: string) => {
      const v = new KnowledgeVault(tempDir, id, {
        agent_name: name,
        role: 'specialist',
        realm: 'src/',
      });
      vaults.set(id, v);
      return v;
    };
    createVault('oracle', 'Oracle');
    createVault('engineer', 'Engineer');

    handler = new CustomToolHandler(
      board,
      qm,
      (id) => vaults.get(id),
      (id) => vaults.get(id)?.getKnowledge().agent_name ?? id,
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('full agent workflow: post findings → claim quest → update knowledge → complete quest', async () => {
    // 1. Oracle posts a finding
    await handler.handleToolCall({
      tool_name: 'PostFindings',
      tool_input: { realm: 'src/auth/', finding: 'Auth module has no error handling', severity: 'high' },
      agent_id: 'oracle',
    });
    expect(await board.getAll()).toHaveLength(1);

    // 2. Engineer claims the auth quest
    const claimResult = await handler.handleToolCall({
      tool_name: 'ClaimQuest',
      tool_input: { quest_id: 'q1' },
      agent_id: 'engineer',
    });
    expect(claimResult.result.assigned).toBe(true);
    expect(qm.getAssignee('q1')).toBe('engineer');

    // 3. Engineer updates knowledge
    await handler.handleToolCall({
      tool_name: 'UpdateKnowledge',
      tool_input: { insight: 'Auth uses JWT tokens', area: 'authentication', amount: 3 },
      agent_id: 'engineer',
    });

    // 4. Transition to in_progress
    qm.updateStatus('q1', 'in_progress');

    // 5. Engineer completes the quest
    const completeResult = await handler.handleToolCall({
      tool_name: 'CompleteQuest',
      tool_input: { quest_id: 'q1', outcome: 'Added error handling to all auth endpoints' },
      agent_id: 'engineer',
    });
    expect(completeResult.result.closed).toBe(true);

    // Verify final state
    expect(qm.getStatus('q1')).toBe('done');
    const engineerVault = vaults.get('engineer')!;
    const knowledge = engineerVault.getKnowledge();
    expect(knowledge.insights).toContain('Auth uses JWT tokens');
    expect(knowledge.expertise.authentication).toBe(3);
    expect(knowledge.expertise.quests_completed).toBe(1);
    expect(knowledge.task_history.length).toBe(1);
    expect(await board.getAll()).toHaveLength(1);
  });

  it('findings persist across save/load cycle', async () => {
    await handler.handleToolCall({
      tool_name: 'PostFindings',
      tool_input: { realm: '/', finding: 'Persisted finding', severity: 'medium' },
      agent_id: 'oracle',
    });

    const board2 = new FindingsBoard(tempDir);
    await board2.load();
    const all = await board2.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].finding).toBe('Persisted finding');
  });

  it('knowledge vault persists across save/load cycle', async () => {
    await handler.handleToolCall({
      tool_name: 'UpdateKnowledge',
      tool_input: { insight: 'Persistent insight', area: 'architecture', amount: 5 },
      agent_id: 'oracle',
    });

    const vault2 = new KnowledgeVault(tempDir, 'oracle', {});
    await vault2.load();
    expect(vault2.getKnowledge().insights).toContain('Persistent insight');
    expect(vault2.getKnowledge().expertise.architecture).toBe(5);
  });

  it('multiple agents can work independently without interference', async () => {
    await handler.handleToolCall({
      tool_name: 'ClaimQuest',
      tool_input: { quest_id: 'q1' },
      agent_id: 'oracle',
    });
    await handler.handleToolCall({
      tool_name: 'ClaimQuest',
      tool_input: { quest_id: 'q2' },
      agent_id: 'engineer',
    });

    expect(qm.getAssignee('q1')).toBe('oracle');
    expect(qm.getAssignee('q2')).toBe('engineer');
    expect(qm.getQuestsForAgent('oracle')).toHaveLength(1);
    expect(qm.getQuestsForAgent('engineer')).toHaveLength(1);
  });
});
