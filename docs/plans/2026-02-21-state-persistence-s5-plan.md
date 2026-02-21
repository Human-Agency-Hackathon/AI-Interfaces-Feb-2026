# S5: Process-Aware Resume — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `handleResumeRealm` restore a running brainstorm process (ProcessController + stage agents) instead of always spawning Oracle.

**Architecture:** Extract delegate creation and event wiring into two reusable helpers: `createProcessDelegate()` (returns delegate object) and `wireProcessControllerEvents(pc)` (wires movement-bias listener). In `handleResumeRealm`, branch on `processState.status === 'running'`: reconstruct ProcessController via `fromJSON()` using the delegate helper, spawn stage agents with resume context. Fall back to Oracle if template not found or no running process. Restore navigation state from `worldState.navigationState` (activates when S3 lands).

**Tech Stack:** TypeScript (strict mode), Vitest

---

### Task 1: Extract `createProcessDelegate` + `wireProcessControllerEvents` from `handleStartProcess`

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (~lines 345-447)

**Step 1: Read the current code**

Read `ha-agent-rpg/server/src/BridgeServer.ts` lines 345-455 (the delegate creation + event wiring in `handleStartProcess`). Understand the 7 delegate callbacks and the `stage:started` event listener.

**Step 2: Add import for ProcessControllerDelegate**

At the top of BridgeServer.ts, update the ProcessController import to also import the delegate type:

```typescript
import { ProcessController, type ProcessControllerDelegate } from './ProcessController.js';
```

**Step 3: Add the two helper methods**

Add these two private methods to BridgeServer (place them right before `handleStartProcess`, around line 345):

```typescript
  /**
   * Build the ProcessControllerDelegate that bridges ProcessController
   * back to BridgeServer's subsystems.
   */
  private createProcessDelegate(): ProcessControllerDelegate {
    return {
      dismissStageAgents: async (stage: StageDefinition) => {
        for (const roleId of stage.roles) {
          await this.sessionManager.dismissAgent(roleId);
          this.worldState.removeAgent(roleId);
          this.broadcast({ type: 'agent:left', agent_id: roleId });
        }
      },
      spawnStageAgents: async (tpl: ProcessDefinition, idx: number, prob: string) => {
        await this.spawnProcessAgents(tpl, idx, prob);
      },
      broadcast: (msg) => this.broadcast(msg as unknown as ServerMessage),
      saveArtifact: (stageId, artifactId, content) => {
        this.worldState.setArtifact(stageId, artifactId, content);
      },
      onStageAdvanced: (completedStageId, artifacts) => {
        this.worldState.advanceStage(completedStageId, artifacts);
      },
      onProcessCompleted: (finalStageId, artifacts) => {
        this.worldState.completeProcess(finalStageId, artifacts);
      },
      sendFollowUp: async (agentId, prompt) => {
        await this.sessionManager.sendFollowUp(agentId, prompt);
      },
    };
  }

  /** Wire movement-bias listener onto a ProcessController. */
  private wireProcessControllerEvents(pc: ProcessController): void {
    pc.on('stage:started', (event: any) => {
      const stageId: string = event.stageId ?? '';
      const divergent = ['divergent_thinking', 'precedent_research'];
      const convergent = ['convergent_thinking', 'fact_checking', 'pushback'];
      if (divergent.some(s => stageId.includes(s))) {
        this.movementBias = 'outward';
      } else if (convergent.some(s => stageId.includes(s))) {
        this.movementBias = 'inward';
      } else {
        this.movementBias = 'neutral';
      }
    });
  }
```

**Step 4: Refactor `handleStartProcess` to use the helpers**

Replace the inline delegate creation + event wiring + `new ProcessController(...)` in `handleStartProcess` (approximately lines 401-447) with:

```typescript
      // Create process controller with delegate callbacks
      this.processController = new ProcessController(this.createProcessDelegate());
      this.wireProcessControllerEvents(this.processController);

      // Spawn the first stage's agents
      await this.spawnProcessAgents(template, 0, msg.problem);

      // Start stage tracking after agents are spawned
      this.processController.start(msg.problem, template);
```

**Step 5: Run the full test suite to verify no regression**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (this is a pure refactor — same behavior, different structure)

**Step 6: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 7: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "refactor(S5): extract createProcessDelegate + wireProcessControllerEvents from handleStartProcess"
```

---

### Task 2: Add resume context option to `spawnProcessAgents`

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (~lines 457-511, the `spawnProcessAgents` method)

**Step 1: Add optional `options` parameter**

Change the `spawnProcessAgents` signature to accept an optional options object:

```typescript
  private async spawnProcessAgents(
    template: ProcessDefinition,
    stageIndex: number,
    problem: string,
    options?: { resumed?: boolean },
  ): Promise<void> {
```

**Step 2: Add resume note to processContext**

Inside `spawnProcessAgents`, where `processContext` is built (around line 498-508), add a `resumeNote` field when `options?.resumed` is true:

```typescript
        processContext: {
          problem,
          processName: template.name,
          stageId: stage.id,
          stageName: stage.name,
          stageGoal: stage.goal,
          stageIndex,
          totalStages: template.stages.length,
          persona: roleDef.persona,
          priorArtifacts,
          ...(options?.resumed ? {
            resumeNote: 'You are resuming a paused brainstorm session. Prior stage artifacts are available in your system prompt. Continue where the previous agents left off.',
          } : {}),
        },
```

**Step 3: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (optional param, no call sites changed)

**Step 4: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat(S5): add resume context option to spawnProcessAgents"
```

---

### Task 3: Add process-aware branch to `handleResumeRealm`

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (~lines 1027-1032, the Oracle spawn in `handleResumeRealm`)

**Step 1: Replace the Oracle-only spawn**

In `handleResumeRealm`, find the section that unconditionally spawns Oracle (approximately):

```typescript
      this.gamePhase = 'playing';

      // Respawn oracle
      await this.spawnOracle(realm.path);

      console.log(`[Bridge] Realm resumed: ${realm.displayName}`);
```

Replace with process-aware branching using the helpers from Task 1:

```typescript
      this.gamePhase = 'playing';

      // Check if a brainstorm process was running when state was saved
      const processState = this.worldState.getProcessState();
      if (processState && processState.status === 'running') {
        const template = PROCESS_TEMPLATES[processState.processId];
        if (template) {
          // Restore ProcessController from saved state (silent — no events emitted)
          this.processController = ProcessController.fromJSON(
            processState,
            template,
            this.createProcessDelegate(),
          );
          this.wireProcessControllerEvents(this.processController);

          // Respawn agents for the current stage with resume context
          await this.spawnProcessAgents(
            template,
            processState.currentStageIndex,
            processState.problemStatement ?? processState.problem,
            { resumed: true },
          );

          console.log(`[Bridge] Realm resumed with running process: ${realm.displayName} (stage ${processState.currentStageIndex})`);
        } else {
          console.warn(`[Bridge] Template "${processState.processId}" not found for resumed process, falling back to Oracle`);
          await this.spawnOracle(realm.path);
          console.log(`[Bridge] Realm resumed (Oracle fallback): ${realm.displayName}`);
        }
      } else {
        // No running process — spawn Oracle as usual
        await this.spawnOracle(realm.path);
        console.log(`[Bridge] Realm resumed: ${realm.displayName}`);
      }
```

**Step 2: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 3: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat(S5): process-aware resume in handleResumeRealm with Oracle fallback"
```

---

### Task 4: Add navigation state restoration

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (inside `handleResumeRealm`, after loading worldState)

**Step 1: Add navigation restoration**

In `handleResumeRealm`, after `this.worldState = savedState;` and before the `gamePhase = 'playing'` line, add:

```typescript
      // Restore navigation state if present (populated by S3's save triggers)
      const navState = this.worldState.navigationState;
      if (navState) {
        for (const [agentId, stack] of Object.entries(navState.agentNavStacks)) {
          this.agentNavStacks.set(agentId, stack);
        }
        for (const [agentId, path] of Object.entries(navState.agentCurrentPath)) {
          this.agentCurrentPath.set(agentId, path);
        }
      }
```

**Step 2: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (this code is a no-op until S3 populates navigationState)

**Step 3: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat(S5): restore navigation state on realm resume"
```

---

### Task 5: Add tests

**Files:**
- Create: `ha-agent-rpg/server/src/__tests__/BridgeServer.resume.test.ts`

Since the E2E test file doesn't mock WorldStatePersistence or RealmRegistry, and testing `handleResumeRealm` via WebSocket would be very complex, we create a focused test file that tests the extracted helpers and resume logic by accessing BridgeServer internals.

**Step 1: Create the test file**

Create `ha-agent-rpg/server/src/__tests__/BridgeServer.resume.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks ──

vi.mock('../AgentSessionManager.js', async () => {
  const { EventEmitter } = await import('node:events');
  class MockAgentSessionManager extends EventEmitter {
    sessions = new Map<string, any>();
    async spawnAgent(config: any) {
      this.sessions.set(config.agentId, {
        config,
        vault: {
          getKnowledge: () => ({ expertise: {} }),
          getExpertiseSummary: () => 'No expertise yet.',
          save: async () => {},
          load: async () => {},
          addInsight: () => {},
          incrementExpertise: () => {},
          addTaskHistory: () => {},
        },
      });
      setTimeout(() => this.emit('agent:complete', config.agentId), 50);
    }
    async sendFollowUp(agentId: string, prompt: string) {
      setTimeout(() => {
        this.emit('agent:message', agentId, {
          type: 'assistant',
          message: { content: [{ type: 'text', text: `Response` }] },
        });
        this.emit('agent:complete', agentId);
      }, 20);
    }
    async dismissAgent(agentId: string) {
      this.sessions.delete(agentId);
      this.emit('agent:dismissed', agentId);
    }
    getActiveAgentIds() { return Array.from(this.sessions.keys()); }
    getSession(id: string) { return this.sessions.get(id); }
    getVault(id: string) { return this.sessions.get(id)?.vault; }
    getTeamRoster() { return []; }
  }
  return { AgentSessionManager: MockAgentSessionManager };
});

vi.mock('../RepoAnalyzer.js', () => ({
  RepoAnalyzer: class {
    async analyze() {
      return {
        owner: 'testowner', repo: 'testrepo',
        tree: [{ path: 'src', type: 'tree' }],
        issues: [], languages: { TypeScript: 500 },
        totalFiles: 1, defaultBranch: 'main',
      };
    }
  },
}));

vi.mock('../LocalTreeReader.js', () => ({
  LocalTreeReader: class {
    async analyze(repoPath: string) {
      return {
        repoPath, repoName: 'testrepo',
        tree: [{ path: 'src', type: 'tree' }],
        totalFiles: 1, languages: { TypeScript: 500 }, hasRemote: false,
      };
    }
  },
}));

vi.mock('../TranscriptLogger.js', () => ({
  TranscriptLogger: class {
    async log() {}
    async readTranscript() { return []; }
  },
}));

vi.mock('../FindingsBoard.js', () => ({
  FindingsBoard: class {
    findings: any[] = [];
    constructor(_path: string) {}
    async load() {}
    async save() {}
    addFinding(f: any) { return { ...f, id: 'f1', timestamp: new Date().toISOString() }; }
    getAll() { return []; }
    getRecent() { return []; }
    getSummary() { return 'No findings yet.'; }
  },
}));

import { BridgeServer } from '../BridgeServer.js';
import { WorldState } from '../WorldState.js';
import type { ProcessState } from '../types.js';
import { PROCESS_TEMPLATES, DEEP_BRAINSTORM } from '../ProcessTemplates.js';

describe('BridgeServer resume', () => {
  let server: BridgeServer;

  beforeEach(() => {
    server = new BridgeServer(0);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      (server as any).wss.close(() => resolve());
    });
  });

  describe('createProcessDelegate()', () => {
    it('returns a delegate with all 7 required callbacks', () => {
      const delegate = (server as any).createProcessDelegate();
      expect(delegate.dismissStageAgents).toBeInstanceOf(Function);
      expect(delegate.spawnStageAgents).toBeInstanceOf(Function);
      expect(delegate.broadcast).toBeInstanceOf(Function);
      expect(delegate.saveArtifact).toBeInstanceOf(Function);
      expect(delegate.onStageAdvanced).toBeInstanceOf(Function);
      expect(delegate.onProcessCompleted).toBeInstanceOf(Function);
      expect(delegate.sendFollowUp).toBeInstanceOf(Function);
    });
  });

  describe('process-aware resume', () => {
    function makeRunningProcessState(): ProcessState {
      return {
        processId: DEEP_BRAINSTORM.id,
        problem: 'How to improve testing?',
        currentStageIndex: 1,
        status: 'running',
        collectedArtifacts: { stage_0: { ideas: 'some ideas' } },
        startedAt: '2026-02-21T10:00:00.000Z',
        problemStatement: 'How to improve testing?',
        stageTurnCounts: { stage_0: 4 },
        agentTurnCounts: { 'stage_0:agent_a': 2 },
        stageStartedAt: '2026-02-21T10:05:00.000Z',
      };
    }

    it('restores ProcessController when processState.status is running', async () => {
      const ws = new WorldState();
      ws.setProcessState(makeRunningProcessState());

      (server as any).worldState = ws;
      (server as any).repoPath = '/tmp';
      (server as any).gamePhase = 'playing';

      // Manually init required subsystems
      const { FindingsBoard } = await import('../FindingsBoard.js');
      (server as any).findingsBoard = new FindingsBoard('/tmp');
      const { TranscriptLogger } = await import('../TranscriptLogger.js');
      (server as any).transcriptLogger = new TranscriptLogger('/tmp');
      const { CustomToolHandler } = await import('../CustomToolHandler.js');
      (server as any).toolHandler = new CustomToolHandler(
        (server as any).findingsBoard,
        (server as any).questManager,
        () => null,
        () => 'agent',
      );
      const { AgentSessionManager } = await import('../AgentSessionManager.js');
      (server as any).sessionManager = new AgentSessionManager(
        (server as any).findingsBoard,
        (server as any).toolHandler,
      );

      // Call the resume logic
      const processState = ws.getProcessState()!;
      const template = PROCESS_TEMPLATES[processState.processId];
      expect(template).toBeDefined();

      const { ProcessController } = await import('../ProcessController.js');
      const pc = ProcessController.fromJSON(
        processState,
        template!,
        (server as any).createProcessDelegate(),
      );
      (server as any).processController = pc;
      (server as any).wireProcessControllerEvents(pc);

      // Verify ProcessController state
      const ctx = pc.getContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.stageIndex).toBe(1);
      expect(ctx!.problem).toBe('How to improve testing?');
    });

    it('falls back to null processController when template is missing', () => {
      const ws = new WorldState();
      const state = makeRunningProcessState();
      state.processId = 'nonexistent_template';
      ws.setProcessState(state);

      (server as any).worldState = ws;

      const processState = ws.getProcessState()!;
      const template = PROCESS_TEMPLATES[processState.processId];
      expect(template).toBeUndefined();

      // When template is missing, processController stays null (Oracle fallback)
      expect((server as any).processController).toBeNull();
    });

    it('does not create ProcessController when process is completed', () => {
      const ws = new WorldState();
      const state = makeRunningProcessState();
      state.status = 'completed';
      ws.setProcessState(state);

      (server as any).worldState = ws;

      const processState = ws.getProcessState()!;
      expect(processState.status).toBe('completed');
      expect((server as any).processController).toBeNull();
    });

    it('does not create ProcessController when processState is null', () => {
      const ws = new WorldState();
      (server as any).worldState = ws;

      expect(ws.getProcessState()).toBeNull();
      expect((server as any).processController).toBeNull();
    });
  });

  describe('navigation state restoration', () => {
    it('restores agentNavStacks and agentCurrentPath from worldState.navigationState', () => {
      const ws = new WorldState();
      ws.navigationState = {
        agentNavStacks: {
          agent_1: [{ path: 'src', returnPosition: { x: 5, y: 5 } }],
        },
        agentCurrentPath: {
          agent_1: 'src/utils',
        },
      };

      (server as any).worldState = ws;

      // Simulate the restoration logic from handleResumeRealm
      const navState = ws.navigationState;
      if (navState) {
        for (const [agentId, stack] of Object.entries(navState.agentNavStacks)) {
          (server as any).agentNavStacks.set(agentId, stack);
        }
        for (const [agentId, path] of Object.entries(navState.agentCurrentPath)) {
          (server as any).agentCurrentPath.set(agentId, path);
        }
      }

      expect((server as any).agentNavStacks.get('agent_1')).toEqual([
        { path: 'src', returnPosition: { x: 5, y: 5 } },
      ]);
      expect((server as any).agentCurrentPath.get('agent_1')).toBe('src/utils');
    });

    it('does nothing when navigationState is null', () => {
      const ws = new WorldState();
      (server as any).worldState = ws;

      const navState = ws.navigationState;
      expect(navState).toBeNull();

      expect((server as any).agentNavStacks.size).toBe(0);
      expect((server as any).agentCurrentPath.size).toBe(0);
    });
  });
});
```

**Step 2: Run the new tests**

Run: `npx vitest run src/__tests__/BridgeServer.resume.test.ts` from `ha-agent-rpg/server/`
Expected: ALL PASS

**Step 3: Run full suite**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add ha-agent-rpg/server/src/__tests__/BridgeServer.resume.test.ts
git commit -m "test(S5): add resume tests for process-aware realm resume"
```

---

### Task 6: Final verification and push

**Step 1: Run all server tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 2: Type-check server**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 3: Type-check client (no breakage)**

Run: `npm run build -w client` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 4: Push**

```bash
git push origin main
```
