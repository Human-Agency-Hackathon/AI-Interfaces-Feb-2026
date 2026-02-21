# S2: ProcessController.toJSON/fromJSON — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add serialization/deserialization to ProcessController so its turn-tracking state survives server restarts.

**Architecture:** Add a `stageStartedAt` field to track stage timing, an instance `toJSON(existingState)` method that merges PC data into a full ProcessState, and a static `fromJSON()` factory that silently reconstructs the controller from saved state. No events emitted on restore.

**Tech Stack:** TypeScript (strict mode), Vitest

---

### Task 1: Add `stageStartedAt` runtime tracking

**Files:**
- Modify: `ha-agent-rpg/server/src/ProcessController.ts:45-51` (add field), `:62-77` (start), `:243-298` (advanceStage), `:162-168` (stop)

**Step 1: Write the failing test**

Add a new `describe('stageStartedAt tracking')` block at the end of `ha-agent-rpg/server/src/__tests__/ProcessController.test.ts` (after line 447, before the closing of the outer describe):

```typescript
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

      // Small delay to ensure timestamps differ
      await new Promise(r => setTimeout(r, 5));

      // Advance to stage 2 via explicit signal
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ProcessController.test.ts` from `ha-agent-rpg/server/`
Expected: FAIL — `stageStartedAt` is undefined (field doesn't exist yet)

**Step 3: Implement `stageStartedAt`**

In `ha-agent-rpg/server/src/ProcessController.ts`:

1. Add the field after line 51 (`private advancing = false;`):

```typescript
  private stageStartedAt: string | null = null;
```

2. In `start()` (line 62-77), add after line 66 (`this.advancing = false;`):

```typescript
    this.stageStartedAt = new Date().toISOString();
```

3. In `advanceStage()` (line 243-315), add after line 297 (`this.context = { problem, template, stageIndex: nextIndex };`):

```typescript
    this.stageStartedAt = new Date().toISOString();
```

4. In `stop()` (line 162-168), add after line 167 (`this.advancing = false;`):

```typescript
    this.stageStartedAt = null;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ProcessController.test.ts` from `ha-agent-rpg/server/`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add ha-agent-rpg/server/src/ProcessController.ts ha-agent-rpg/server/src/__tests__/ProcessController.test.ts
git commit -m "feat(S2): add stageStartedAt tracking to ProcessController"
```

---

### Task 2: Add `toJSON()` method

**Files:**
- Modify: `ha-agent-rpg/server/src/ProcessController.ts` (add import + method)
- Modify: `ha-agent-rpg/server/src/__tests__/ProcessController.test.ts` (add test)

**Step 1: Write the failing test**

Add a new `describe('toJSON()')` block inside the outer `describe('ProcessController')` in the test file:

```typescript
  describe('toJSON()', () => {
    it('merges ProcessController data into existingState', () => {
      const template = makeTemplate();
      controller.start('My brainstorm problem', template);

      // Simulate some turns
      const existingState: ProcessState = {
        processId: 'test_process',
        problem: 'My brainstorm problem',
        currentStageIndex: 0,
        status: 'running',
        collectedArtifacts: { stage_0: { doc: 'prior artifact' } },
        startedAt: '2026-02-21T10:00:00.000Z',
      };

      const snapshot = controller.toJSON(existingState);

      // Fields from ProcessController
      expect(snapshot.processId).toBe('test_process');
      expect(snapshot.problem).toBe('My brainstorm problem');
      expect(snapshot.currentStageIndex).toBe(0);
      expect(snapshot.problemStatement).toBe('My brainstorm problem');
      expect(snapshot.stageTurnCounts).toEqual({});
      expect(snapshot.agentTurnCounts).toEqual({});
      expect(snapshot.stageStartedAt).toBeTruthy();

      // Fields preserved from existingState
      expect(snapshot.collectedArtifacts).toEqual({ stage_0: { doc: 'prior artifact' } });
      expect(snapshot.startedAt).toBe('2026-02-21T10:00:00.000Z');
      expect(snapshot.status).toBe('running');
    });

    it('includes turn counts after agents take turns', async () => {
      controller.start('Test', makeTemplate());
      await controller.onAgentTurnComplete('agent_a'); // 1 turn

      const existingState: ProcessState = {
        processId: 'test_process',
        problem: 'Test',
        currentStageIndex: 0,
        status: 'running',
        collectedArtifacts: {},
        startedAt: '2026-02-21T10:00:00.000Z',
      };

      const snapshot = controller.toJSON(existingState);
      expect(snapshot.stageTurnCounts).toEqual({ stage_1: 1 });
      expect(snapshot.agentTurnCounts).toEqual({ 'stage_1:agent_a': 1 });
    });

    it('falls back to existingState when context is null', () => {
      // Controller not started — context is null
      const existingState: ProcessState = {
        processId: 'fallback_id',
        problem: 'Fallback problem',
        currentStageIndex: 2,
        status: 'completed',
        collectedArtifacts: {},
        startedAt: '2026-02-21T10:00:00.000Z',
        completedAt: '2026-02-21T11:00:00.000Z',
      };

      const snapshot = controller.toJSON(existingState);
      expect(snapshot.processId).toBe('fallback_id');
      expect(snapshot.problem).toBe('Fallback problem');
      expect(snapshot.currentStageIndex).toBe(2);
      expect(snapshot.stageTurnCounts).toEqual({});
      expect(snapshot.agentTurnCounts).toEqual({});
    });
  });
```

Also add this import at the top of the test file (after line 4):

```typescript
import type { ProcessState } from '../types.js';
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ProcessController.test.ts` from `ha-agent-rpg/server/`
Expected: FAIL — `controller.toJSON is not a function`

**Step 3: Implement `toJSON()`**

In `ha-agent-rpg/server/src/ProcessController.ts`:

1. Add import at line 15 (after the ProcessDefinition import):

```typescript
import type { ProcessState } from './types.js';
```

2. Add the method after `getContext()` (after line 160), before `stop()`:

```typescript
  /**
   * Serialize ProcessController state into a full ProcessState.
   * Merges PC's turn-tracking data with the existing ProcessState from WorldState
   * (which owns collectedArtifacts, startedAt, completedAt, status).
   */
  toJSON(existingState: ProcessState): ProcessState {
    return {
      ...existingState,
      processId: this.context?.template.id ?? existingState.processId,
      problem: this.context?.problem ?? existingState.problem,
      currentStageIndex: this.context?.stageIndex ?? existingState.currentStageIndex,
      problemStatement: this.context?.problem ?? existingState.problemStatement,
      stageTurnCounts: Object.fromEntries(this.stageTurnCounts),
      agentTurnCounts: Object.fromEntries(this.agentTurnCounts),
      stageStartedAt: this.stageStartedAt ?? existingState.stageStartedAt,
    };
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ProcessController.test.ts` from `ha-agent-rpg/server/`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add ha-agent-rpg/server/src/ProcessController.ts ha-agent-rpg/server/src/__tests__/ProcessController.test.ts
git commit -m "feat(S2): add toJSON() to ProcessController"
```

---

### Task 3: Add `static fromJSON()` method

**Files:**
- Modify: `ha-agent-rpg/server/src/ProcessController.ts` (add static method)
- Modify: `ha-agent-rpg/server/src/__tests__/ProcessController.test.ts` (add tests)

**Step 1: Write the failing tests**

Add a `describe('fromJSON()')` block inside the outer `describe('ProcessController')`:

```typescript
  describe('fromJSON()', () => {
    it('reconstructs controller state from a saved ProcessState', () => {
      const template = makeTemplate();
      const savedState: ProcessState = {
        processId: 'test_process',
        problem: 'Saved problem',
        currentStageIndex: 1,
        status: 'running',
        collectedArtifacts: { stage_1: { art_1: 'content' } },
        startedAt: '2026-02-21T10:00:00.000Z',
        problemStatement: 'Saved problem',
        stageTurnCounts: { stage_1: 3 },
        agentTurnCounts: { 'stage_1:agent_a': 2, 'stage_1:agent_b': 1 },
        stageStartedAt: '2026-02-21T10:05:00.000Z',
      };

      const restored = ProcessController.fromJSON(savedState, template, delegate);

      const ctx = restored.getContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.problem).toBe('Saved problem');
      expect(ctx!.stageIndex).toBe(1);
      expect(ctx!.template).toBe(template);

      // Verify turn counts restored via a round-trip through toJSON
      const snapshot = restored.toJSON(savedState);
      expect(snapshot.stageTurnCounts).toEqual({ stage_1: 3 });
      expect(snapshot.agentTurnCounts).toEqual({ 'stage_1:agent_a': 2, 'stage_1:agent_b': 1 });
      expect(snapshot.stageStartedAt).toBe('2026-02-21T10:05:00.000Z');
    });

    it('does NOT emit any events on restore', () => {
      const template = makeTemplate();
      const savedState: ProcessState = {
        processId: 'test_process',
        problem: 'Test',
        currentStageIndex: 0,
        status: 'running',
        collectedArtifacts: {},
        startedAt: '2026-02-21T10:00:00.000Z',
      };

      const events: any[] = [];
      const restored = ProcessController.fromJSON(savedState, template, delegate);
      restored.on('stage:started', (e) => events.push(e));
      restored.on('stage:completed', (e) => events.push(e));
      restored.on('process:completed', (e) => events.push(e));

      // No events should have been emitted during fromJSON
      expect(events).toHaveLength(0);
    });

    it('handles missing S1 fields gracefully (backward compat)', () => {
      const template = makeTemplate();
      const oldState: ProcessState = {
        processId: 'test_process',
        problem: 'Old problem',
        currentStageIndex: 0,
        status: 'running',
        collectedArtifacts: {},
        startedAt: '2026-02-21T10:00:00.000Z',
        // No S1 fields: problemStatement, stageTurnCounts, agentTurnCounts, stageStartedAt
      };

      const restored = ProcessController.fromJSON(oldState, template, delegate);

      const ctx = restored.getContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.problem).toBe('Old problem');
      expect(ctx!.stageIndex).toBe(0);

      // Turn counts should be empty maps
      const snapshot = restored.toJSON(oldState);
      expect(snapshot.stageTurnCounts).toEqual({});
      expect(snapshot.agentTurnCounts).toEqual({});
      expect(snapshot.stageStartedAt).toBeUndefined();
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ProcessController.test.ts` from `ha-agent-rpg/server/`
Expected: FAIL — `ProcessController.fromJSON is not a function`

**Step 3: Implement `static fromJSON()`**

In `ha-agent-rpg/server/src/ProcessController.ts`, add after the `toJSON()` method:

```typescript
  /**
   * Reconstruct a ProcessController from a saved ProcessState.
   * Does NOT emit any events — BridgeServer is responsible for
   * spawning agents and broadcasting after calling this.
   */
  static fromJSON(
    state: ProcessState,
    template: ProcessDefinition,
    delegate: ProcessControllerDelegate,
  ): ProcessController {
    const pc = new ProcessController(delegate);
    pc.context = {
      problem: state.problemStatement ?? state.problem,
      template,
      stageIndex: state.currentStageIndex,
    };
    pc.stageTurnCounts = new Map(Object.entries(state.stageTurnCounts ?? {}));
    pc.agentTurnCounts = new Map(Object.entries(state.agentTurnCounts ?? {}));
    pc.stageStartedAt = state.stageStartedAt ?? null;
    return pc;
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ProcessController.test.ts` from `ha-agent-rpg/server/`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add ha-agent-rpg/server/src/ProcessController.ts ha-agent-rpg/server/src/__tests__/ProcessController.test.ts
git commit -m "feat(S2): add static fromJSON() to ProcessController"
```

---

### Task 4: Round-trip integration test + full suite verification

**Files:**
- Modify: `ha-agent-rpg/server/src/__tests__/ProcessController.test.ts` (add round-trip test)

**Step 1: Write the round-trip test**

Add inside the `describe('fromJSON()')` block:

```typescript
    it('round-trips: start → advance turns → toJSON → fromJSON → verify match', async () => {
      const template = makeTemplate();
      controller.start('Round-trip problem', template);

      // Simulate turns in stage 1
      await controller.onAgentTurnComplete('agent_a');

      const existingState: ProcessState = {
        processId: 'test_process',
        problem: 'Round-trip problem',
        currentStageIndex: 0,
        status: 'running',
        collectedArtifacts: {},
        startedAt: '2026-02-21T10:00:00.000Z',
      };

      // Snapshot the original
      const snapshot = controller.toJSON(existingState);

      // Restore from snapshot
      const restored = ProcessController.fromJSON(snapshot, template, makeDelegate());

      // Round-trip back to JSON
      const snapshot2 = restored.toJSON(snapshot);

      // Should match original snapshot
      expect(snapshot2.currentStageIndex).toBe(snapshot.currentStageIndex);
      expect(snapshot2.problemStatement).toBe(snapshot.problemStatement);
      expect(snapshot2.stageTurnCounts).toEqual(snapshot.stageTurnCounts);
      expect(snapshot2.agentTurnCounts).toEqual(snapshot.agentTurnCounts);
      expect(snapshot2.stageStartedAt).toBe(snapshot.stageStartedAt);
    });
```

**Step 2: Run full server test suite**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (all existing + new tests)

**Step 3: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 4: Commit and push**

```bash
git add ha-agent-rpg/server/src/__tests__/ProcessController.test.ts
git commit -m "test(S2): add round-trip integration test for ProcessController serialization"
git push origin main
```
