# S1: Expand ProcessState for Persistence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 optional fields to the `ProcessState` interface so ProcessController's turn counts and timing can be serialized into WorldState snapshots.

**Architecture:** Purely additive type change in two files (`shared/process.ts` and `server/src/types.ts`). New fields are optional, so no existing code breaks. A test verifies the new fields round-trip through WorldState serialization.

**Tech Stack:** TypeScript (strict mode), Vitest

---

### Task 1: Add persistence fields to shared ProcessState

**Files:**
- Modify: `ha-agent-rpg/shared/process.ts:155-179` (ProcessState interface)

**Step 1: Edit `shared/process.ts`**

Add 4 optional fields after the existing `completedAt` field in the `ProcessState` interface:

```typescript
export interface ProcessState {
  /** The template this instance was created from */
  processId: string;

  /** The user's brainstorming problem, verbatim */
  problem: string;

  /** Index into ProcessDefinition.stages for the currently active stage */
  currentStageIndex: number;

  /** Status of the overall process */
  status: 'running' | 'completed' | 'paused';

  /**
   * Artifacts collected so far, keyed by stageId then artifactId.
   * e.g. collectedArtifacts["ideation"]["initial_ideas"] = "..."
   */
  collectedArtifacts: Record<string, Record<string, string>>;

  /** ISO timestamp when this process was started */
  startedAt: string;

  /** ISO timestamp when the process completed (if status === 'completed') */
  completedAt?: string;

  // ── Persistence fields (S1) ──────────────────────────

  /**
   * Original problem text, preserved verbatim for resume.
   * May differ from `problem` if that field gets truncated or reformatted
   * in future versions.
   */
  problemStatement?: string;

  /**
   * Total turns completed per stage, keyed by stage ID.
   * Populated by ProcessController.toJSON() (S2).
   * e.g. { "ideation": 6, "critique": 4 }
   */
  stageTurnCounts?: Record<string, number>;

  /**
   * Turns completed per agent within each stage, keyed as "stageId:agentId".
   * Populated by ProcessController.toJSON() (S2).
   * e.g. { "ideation:wild_ideator_1": 3, "ideation:cross_pollinator_1": 3 }
   */
  agentTurnCounts?: Record<string, number>;

  /**
   * ISO 8601 timestamp for when the current stage started.
   * Used to calculate stage duration on resume.
   */
  stageStartedAt?: string;
}
```

**Step 2: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS (fields are optional, no call sites need updating)

**Step 3: Commit**

```bash
git add ha-agent-rpg/shared/process.ts
git commit -m "feat(S1): add persistence fields to ProcessState in shared/process.ts"
```

---

### Task 2: Mirror persistence fields to server types

**Files:**
- Modify: `ha-agent-rpg/server/src/types.ts:7-15` (ProcessState mirror)

**Step 1: Edit `server/src/types.ts`**

Update the `ProcessState` interface to match `shared/process.ts` exactly. Add the same 4 optional fields after `completedAt`:

```typescript
export interface ProcessState {
  processId: string;
  problem: string;
  currentStageIndex: number;
  status: 'running' | 'completed' | 'paused';
  collectedArtifacts: Record<string, Record<string, string>>;
  startedAt: string;
  completedAt?: string;

  // Persistence fields (S1) — see shared/process.ts for docs
  problemStatement?: string;
  stageTurnCounts?: Record<string, number>;
  agentTurnCounts?: Record<string, number>;
  stageStartedAt?: string;
}
```

**Step 2: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add ha-agent-rpg/server/src/types.ts
git commit -m "feat(S1): mirror persistence fields to server types.ts"
```

---

### Task 3: Add serialization round-trip test

**Files:**
- Modify: `ha-agent-rpg/server/src/__tests__/WorldState.test.ts`

**Step 1: Write the failing test**

Add a new test inside the existing `describe('Process State')` → `describe('toJSON/fromJSON round-trip')` block (after line 416):

```typescript
    it('round-trips persistence fields (S1: stageTurnCounts, agentTurnCounts, stageStartedAt, problemStatement)', () => {
      const state = {
        ...makeProcessState(),
        problemStatement: 'How to build an agent?',
        stageTurnCounts: { ideation: 6, critique: 4 },
        agentTurnCounts: { 'ideation:wild_ideator_1': 3, 'ideation:cross_pollinator_1': 3 },
        stageStartedAt: '2026-02-21T15:00:00.000Z',
      };
      world.setProcessState(state);

      const ws2 = WorldState.fromJSON(world.toJSON());
      const ps = ws2.getProcessState()!;
      expect(ps.problemStatement).toBe('How to build an agent?');
      expect(ps.stageTurnCounts).toEqual({ ideation: 6, critique: 4 });
      expect(ps.agentTurnCounts).toEqual({ 'ideation:wild_ideator_1': 3, 'ideation:cross_pollinator_1': 3 });
      expect(ps.stageStartedAt).toBe('2026-02-21T15:00:00.000Z');
    });

    it('round-trips process state without persistence fields (backward compat)', () => {
      // Simulates loading a saved state from before S1
      const oldState = makeProcessState();
      world.setProcessState(oldState);

      const ws2 = WorldState.fromJSON(world.toJSON());
      const ps = ws2.getProcessState()!;
      expect(ps.processId).toBe('test_process');
      expect(ps.problemStatement).toBeUndefined();
      expect(ps.stageTurnCounts).toBeUndefined();
      expect(ps.agentTurnCounts).toBeUndefined();
      expect(ps.stageStartedAt).toBeUndefined();
    });
```

**Step 2: Run the tests to verify they pass**

These tests should pass immediately because:
- The fields are optional on ProcessState (TypeScript compiles)
- WorldState.toJSON() serializes processState as-is (JSON.stringify preserves all fields)
- WorldState.fromJSON() deserializes processState as-is (JSON.parse preserves all fields)
- Optional fields that aren't set serialize as `undefined` (not included in JSON)

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (including new tests)

**Step 3: Commit**

```bash
git add ha-agent-rpg/server/src/__tests__/WorldState.test.ts
git commit -m "test(S1): add round-trip tests for ProcessState persistence fields"
```

---

### Task 4: Run full test suite and push

**Step 1: Run all server tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (should be 210+ tests)

**Step 2: Type-check client (ensure no breakage)**

Run: `npm run build -w client` from `ha-agent-rpg/`
Expected: SUCCESS (client doesn't use ProcessState)

**Step 3: Push to main**

```bash
git push origin main
```
