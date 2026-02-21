import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessController } from '../ProcessController.js';
import type { ProcessControllerDelegate } from '../ProcessController.js';
import type { ProcessDefinition, StageDefinition } from '../ProcessTemplates.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    id: 'test_process',
    name: 'Test Process',
    description: 'A test process',
    roles: [
      { id: 'agent_a', name: 'Agent A', persona: 'You are A' },
      { id: 'agent_b', name: 'Agent B', persona: 'You are B' },
      { id: 'agent_c', name: 'Agent C', persona: 'You are C' },
    ],
    stages: [
      {
        id: 'stage_1',
        name: 'Stage One',
        goal: 'First goal',
        roles: ['agent_a', 'agent_b'],
        turnStructure: { type: 'sequential', order: ['agent_a', 'agent_b'] },
        completionCriteria: { type: 'turn_count', turns: 2 },
        artifacts: [{ id: 'art_1', label: 'Artifact 1', producedBy: 'all' }],
      },
      {
        id: 'stage_2',
        name: 'Stage Two',
        goal: 'Second goal',
        roles: ['agent_c'],
        turnStructure: { type: 'single', role: 'agent_c' },
        completionCriteria: { type: 'explicit_signal' },
        artifacts: [{ id: 'art_2', label: 'Artifact 2', producedBy: 'agent_c' }],
      },
    ],
    ...overrides,
  };
}

function makeDelegate(): ProcessControllerDelegate & {
  calls: Record<string, any[][]>;
} {
  const calls: Record<string, any[][]> = {
    dismissStageAgents: [],
    spawnStageAgents: [],
    broadcast: [],
    saveArtifact: [],
    onStageAdvanced: [],
    onProcessCompleted: [],
    sendFollowUp: [],
  };
  return {
    calls,
    dismissStageAgents: vi.fn(async (...args) => { calls.dismissStageAgents.push(args); }),
    spawnStageAgents: vi.fn(async (...args) => { calls.spawnStageAgents.push(args); }),
    broadcast: vi.fn((...args) => { calls.broadcast.push(args); }),
    saveArtifact: vi.fn((...args) => { calls.saveArtifact.push(args); }),
    onStageAdvanced: vi.fn((...args) => { calls.onStageAdvanced.push(args); }),
    onProcessCompleted: vi.fn((...args) => { calls.onProcessCompleted.push(args); }),
    sendFollowUp: vi.fn(async (...args) => { calls.sendFollowUp.push(args); }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('ProcessController', () => {
  let delegate: ReturnType<typeof makeDelegate>;
  let controller: ProcessController;

  beforeEach(() => {
    delegate = makeDelegate();
    controller = new ProcessController(delegate);
  });

  describe('start()', () => {
    it('sets the context to stage 0', () => {
      const template = makeTemplate();
      controller.start('Test problem', template);
      const ctx = controller.getContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.stageIndex).toBe(0);
      expect(ctx!.problem).toBe('Test problem');
      expect(ctx!.template).toBe(template);
    });

    it('emits stage:started for the first stage', () => {
      const events: any[] = [];
      controller.on('stage:started', (e) => events.push(e));

      const template = makeTemplate();
      controller.start('Test problem', template);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('stage:started');
      expect(events[0].stageId).toBe('stage_1');
      expect(events[0].stageName).toBe('Stage One');
      expect(events[0].stageIndex).toBe(0);
      expect(events[0].totalStages).toBe(2);
    });

    it('handles empty stages array gracefully', () => {
      const template = makeTemplate({ stages: [] });
      controller.start('Test', template);
      expect(controller.getCurrentStage()).toBeNull();
    });
  });

  describe('getCurrentStage()', () => {
    it('returns null when no process is running', () => {
      expect(controller.getCurrentStage()).toBeNull();
    });

    it('returns the current stage when running', () => {
      controller.start('Test', makeTemplate());
      const stage = controller.getCurrentStage();
      expect(stage).not.toBeNull();
      expect(stage!.id).toBe('stage_1');
    });
  });

  describe('getContext()', () => {
    it('returns null when no process is running', () => {
      expect(controller.getContext()).toBeNull();
    });

    it('returns the full context when running', () => {
      const template = makeTemplate();
      controller.start('Problem X', template);
      const ctx = controller.getContext();
      expect(ctx!.problem).toBe('Problem X');
      expect(ctx!.template).toBe(template);
    });
  });

  describe('stop()', () => {
    it('clears context and resets state', () => {
      controller.start('Test', makeTemplate());
      expect(controller.getContext()).not.toBeNull();
      controller.stop();
      expect(controller.getContext()).toBeNull();
      expect(controller.getCurrentStage()).toBeNull();
    });
  });

  describe('onAgentTurnComplete()', () => {
    it('ignores turns when no process is running', async () => {
      await controller.onAgentTurnComplete('agent_a');
      // Should not throw or call delegate
      expect(delegate.calls.sendFollowUp).toHaveLength(0);
    });

    it('ignores turns from agents not in the current stage', async () => {
      controller.start('Test', makeTemplate());
      await controller.onAgentTurnComplete('agent_c'); // not in stage_1
      expect(delegate.calls.sendFollowUp).toHaveLength(0);
    });

    it('drives the next sequential agent after a turn completes', async () => {
      controller.start('Test', makeTemplate());
      // agent_a finishes turn, should drive agent_b
      await controller.onAgentTurnComplete('agent_a');
      expect(delegate.calls.sendFollowUp).toHaveLength(1);
      expect(delegate.calls.sendFollowUp[0][0]).toBe('agent_b');
    });

    it('wraps around sequential order', async () => {
      controller.start('Test', makeTemplate());
      await controller.onAgentTurnComplete('agent_b');
      // After agent_b, should wrap to agent_a
      expect(delegate.calls.sendFollowUp).toHaveLength(1);
      expect(delegate.calls.sendFollowUp[0][0]).toBe('agent_a');
    });

    it('advances stage when turn count is reached (sequential)', async () => {
      const events: any[] = [];
      controller.on('stage:completed', (e) => events.push(e));
      controller.on('stage:started', (e) => events.push(e));

      controller.start('Test', makeTemplate());

      // Stage 1 needs 2 turns total. Roles: agent_a, agent_b
      await controller.onAgentTurnComplete('agent_a'); // turn 1
      await controller.onAgentTurnComplete('agent_b'); // turn 2 -- completes

      // Should have emitted stage:completed for stage_1 and stage:started for stage_2
      const completed = events.find(e => e.type === 'stage:completed');
      expect(completed).toBeDefined();
      expect(completed.stageId).toBe('stage_1');

      expect(delegate.calls.dismissStageAgents.length).toBeGreaterThanOrEqual(1);
      expect(delegate.calls.spawnStageAgents.length).toBeGreaterThanOrEqual(1);
    });

    it('drives parallel agents individually and completes when all reach target', async () => {
      const template = makeTemplate({
        stages: [
          {
            id: 'parallel_stage',
            name: 'Parallel Stage',
            goal: 'Test parallel',
            roles: ['agent_a', 'agent_b'],
            turnStructure: { type: 'parallel' },
            completionCriteria: { type: 'turn_count', turns: 2 },
            artifacts: [],
          },
        ],
      });

      const events: any[] = [];
      controller.on('stage:completed', (e) => events.push(e));
      controller.start('Test', template);

      // agent_a turn 1 (should get a follow-up since 1 < 2)
      await controller.onAgentTurnComplete('agent_a');
      expect(delegate.calls.sendFollowUp.length).toBeGreaterThanOrEqual(1);

      // agent_b turn 1
      await controller.onAgentTurnComplete('agent_b');

      // agent_a turn 2
      await controller.onAgentTurnComplete('agent_a');

      // agent_b turn 2 -- now both have 2 turns, stage should complete
      await controller.onAgentTurnComplete('agent_b');

      // Process should be complete (only 1 stage)
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('does not send follow-ups for single turn structure', async () => {
      const template = makeTemplate({
        stages: [
          {
            id: 'single_stage',
            name: 'Single Stage',
            goal: 'Test single',
            roles: ['agent_a'],
            turnStructure: { type: 'single', role: 'agent_a' },
            completionCriteria: { type: 'turn_count', turns: 1 },
            artifacts: [],
          },
        ],
      });

      controller.start('Test', template);
      await controller.onAgentTurnComplete('agent_a');
      // Single turn structure: no follow-ups, stage auto-completes
      expect(delegate.calls.sendFollowUp).toHaveLength(0);
    });
  });

  describe('onExplicitStageComplete()', () => {
    it('ignores when no process is running', async () => {
      await controller.onExplicitStageComplete('agent_a');
      expect(delegate.calls.onStageAdvanced).toHaveLength(0);
    });

    it('ignores agents not in the current stage roles', async () => {
      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_c'); // not in stage_1
      expect(delegate.calls.onStageAdvanced).toHaveLength(0);
    });

    it('immediately advances the stage', async () => {
      const events: any[] = [];
      controller.on('stage:completed', (e) => events.push(e));

      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_a');

      expect(events).toHaveLength(1);
      expect(events[0].stageId).toBe('stage_1');
      expect(delegate.calls.onStageAdvanced).toHaveLength(1);
    });

    it('saves provided artifacts via delegate', async () => {
      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_a', {
        'doc1': 'Some content',
        'doc2': 'Other content',
      });

      expect(delegate.calls.saveArtifact).toHaveLength(2);
      expect(delegate.calls.saveArtifact[0]).toEqual(['stage_1', 'doc1', 'Some content']);
      expect(delegate.calls.saveArtifact[1]).toEqual(['stage_1', 'doc2', 'Other content']);
    });
  });

  describe('stage advancement', () => {
    it('broadcasts stage:advanced message', async () => {
      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_a');

      const advanceMsg = delegate.calls.broadcast.find(
        ([msg]) => msg.type === 'stage:advanced',
      );
      expect(advanceMsg).toBeDefined();
      expect(advanceMsg![0].fromStageId).toBe('stage_1');
      expect(advanceMsg![0].toStageId).toBe('stage_2');
    });

    it('calls delegate.onStageAdvanced with stage ID', async () => {
      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_a');
      expect(delegate.calls.onStageAdvanced[0][0]).toBe('stage_1');
    });

    it('dismisses current stage agents and spawns next stage agents', async () => {
      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_a');

      expect(delegate.dismissStageAgents).toHaveBeenCalled();
      expect(delegate.spawnStageAgents).toHaveBeenCalled();
    });

    it('updates context to next stage index', async () => {
      controller.start('Test', makeTemplate());
      await controller.onExplicitStageComplete('agent_a');

      const ctx = controller.getContext();
      expect(ctx!.stageIndex).toBe(1);
      expect(controller.getCurrentStage()!.id).toBe('stage_2');
    });
  });

  describe('process completion', () => {
    it('emits process:completed when the last stage finishes', async () => {
      const template = makeTemplate({
        stages: [
          {
            id: 'only_stage',
            name: 'Only Stage',
            goal: 'Test',
            roles: ['agent_a'],
            turnStructure: { type: 'single', role: 'agent_a' },
            completionCriteria: { type: 'explicit_signal' },
            artifacts: [],
          },
        ],
      });

      const events: any[] = [];
      controller.on('process:completed', (e) => events.push(e));

      controller.start('My problem', template);
      await controller.onExplicitStageComplete('agent_a');

      expect(events).toHaveLength(1);
      expect(events[0].processId).toBe('test_process');
      expect(events[0].problem).toBe('My problem');
    });

    it('clears context after process completes', async () => {
      const template = makeTemplate({
        stages: [
          {
            id: 'only_stage',
            name: 'Only Stage',
            goal: 'Test',
            roles: ['agent_a'],
            turnStructure: { type: 'single', role: 'agent_a' },
            completionCriteria: { type: 'explicit_signal' },
            artifacts: [],
          },
        ],
      });

      controller.start('Test', template);
      await controller.onExplicitStageComplete('agent_a');

      expect(controller.getContext()).toBeNull();
      expect(controller.getCurrentStage()).toBeNull();
    });

    it('broadcasts process:completed message with process info', async () => {
      const template = makeTemplate({
        stages: [
          {
            id: 'only_stage',
            name: 'Only Stage',
            goal: 'Test',
            roles: ['agent_a'],
            turnStructure: { type: 'single', role: 'agent_a' },
            completionCriteria: { type: 'explicit_signal' },
            artifacts: [],
          },
        ],
      });

      controller.start('Test', template);
      await controller.onExplicitStageComplete('agent_a');

      const completeMsg = delegate.calls.broadcast.find(
        ([msg]) => msg.type === 'process:completed',
      );
      expect(completeMsg).toBeDefined();
      expect(completeMsg![0].processId).toBe('test_process');
    });
  });

  describe('error handling', () => {
    it('emits error if spawning next stage agents fails', async () => {
      const errors: any[] = [];
      const failDelegate = makeDelegate();
      failDelegate.spawnStageAgents = vi.fn(async () => {
        throw new Error('Spawn failed');
      });
      const ctrl = new ProcessController(failDelegate);
      ctrl.on('error', (e) => errors.push(e));

      ctrl.start('Test', makeTemplate());
      await ctrl.onExplicitStageComplete('agent_a');

      expect(errors).toHaveLength(1);
    });

    it('continues gracefully if dismissing agents fails', async () => {
      const failDelegate = makeDelegate();
      failDelegate.dismissStageAgents = vi.fn(async () => {
        throw new Error('Dismiss failed');
      });
      const ctrl = new ProcessController(failDelegate);

      ctrl.start('Test', makeTemplate());
      // Should not throw
      await ctrl.onExplicitStageComplete('agent_a');

      // Should still have advanced
      const ctx = ctrl.getContext();
      expect(ctx!.stageIndex).toBe(1);
    });

    it('handles sendFollowUp failure gracefully', async () => {
      const failDelegate = makeDelegate();
      failDelegate.sendFollowUp = vi.fn(async () => {
        throw new Error('Follow-up failed');
      });
      const ctrl = new ProcessController(failDelegate);

      ctrl.start('Test', makeTemplate());
      // Should not throw
      await ctrl.onAgentTurnComplete('agent_a');
    });
  });

  describe('stageStartedAt tracking', () => {
    it('is set when start() is called', () => {
      const before = new Date().toISOString();
      controller.start('Test', makeTemplate());
      const after = new Date().toISOString();

      const startedAt = (controller as any).stageStartedAt;
      expect(startedAt).not.toBeNull();
      expect(startedAt >= before).toBe(true);
      expect(startedAt <= after).toBe(true);
    });

    it('is updated when stage advances', async () => {
      controller.start('Test', makeTemplate());
      const firstStartedAt = (controller as any).stageStartedAt;

      await new Promise(r => setTimeout(r, 5));

      await controller.onExplicitStageComplete('agent_a');
      const secondStartedAt = (controller as any).stageStartedAt;

      expect(secondStartedAt).not.toBeNull();
      expect(secondStartedAt > firstStartedAt).toBe(true);
    });

    it('is cleared when stop() is called', () => {
      controller.start('Test', makeTemplate());
      expect((controller as any).stageStartedAt).not.toBeNull();
      controller.stop();
      expect((controller as any).stageStartedAt).toBeNull();
    });
  });
});
