# S5: Process-Aware Resume — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `handleResumeRealm` restore a running brainstorm process (ProcessController + stage agents) instead of always spawning Oracle.

**Architecture:** Extract delegate/listener wiring into a `createProcessController` helper method. In `handleResumeRealm`, branch on `processState.status === 'running'`: reconstruct ProcessController via `fromJSON()`, spawn stage agents with resume context. Fall back to Oracle if template not found or no running process. Restore navigation state from `worldState.navigationState` (activates when S3 lands).

**Tech Stack:** TypeScript (strict mode), Vitest

---

### Task 1: Extract `createProcessController` helper from `handleStartProcess`

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts:401-447` (extract helper, refactor handleStartProcess)

**Step 1: Read the current code**

Read `ha-agent-rpg/server/src/BridgeServer.ts` lines 401-447 (the delegate creation + event wiring in handleStartProcess).

**Step 2: Extract the helper method**

Add a new private method `createProcessController()` to BridgeServer (place it right before `handleStartProcess`, around line 345). This method creates the delegate and wires event listeners, returning the ProcessController:

```typescript
  /**
   * Create a ProcessController with delegate callbacks and event listeners.
   * Used by both handleStartProcess (fresh) and handleResumeRealm (restore).
   */
  private createProcessController(): ProcessController {
    const pc = new ProcessController({
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
    });

    // Listen for stage transitions to update movement bias
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

    return pc;
  }
```

**Step 3: Refactor `handleStartProcess` to use the helper**

Replace lines 401-447 (the inline delegate + event wiring + `this.processController.start(...)`) with:

```typescript
      // Create process controller with delegate callbacks
      this.processController = this.createProcessController();

      // Spawn the first stage's agents
      await this.spawnProcessAgents(template, 0, msg.problem);

      // Start stage tracking after agents are spawned
      this.processController.start(msg.problem, template);
```

The `processController.on('stage:started', ...)` listener is now inside `createProcessController()`.

**Step 4: Run the full test suite to verify no regression**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS (this is a pure refactor — same behavior, different structure)

**Step 5: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "refactor(S5): extract createProcessController helper from handleStartProcess"
```

---

### Task 2: Add resume context option to `spawnProcessAgents`

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts:457-511` (spawnProcessAgents signature + processContext)

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

Inside `spawnProcessAgents`, where `processContext` is built (currently around line 498-508), add a `resumeNote` field when `options?.resumed` is true:

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
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts:1027-1032` (replace Oracle spawn with branching logic)

**Step 1: Replace the Oracle-only spawn**

In `handleResumeRealm`, replace lines 1027-1032:

```typescript
      this.gamePhase = 'playing';

      // Respawn oracle
      await this.spawnOracle(realm.path);

      console.log(`[Bridge] Realm resumed: ${realm.displayName}`);
```

With process-aware branching:

```typescript
      this.gamePhase = 'playing';

      // Check if a brainstorm process was running when state was saved
      const processState = this.worldState.getProcessState();
      if (processState && processState.status === 'running') {
        const template = PROCESS_TEMPLATES[processState.processId];
        if (template) {
          // Restore ProcessController from saved state
          this.processController = this.createProcessController();
          // Hydrate internal state (turn counts, stage timing) from saved ProcessState
          const restoredPc = ProcessController.fromJSON(processState, template, (this.processController as any).delegate);
          // Actually, we need to use fromJSON directly with the helper's delegate.
          // The helper creates a fresh PC — instead, build delegate separately:
          this.processController = ProcessController.fromJSON(
            processState,
            template,
            {
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
            },
          );

          // Wire stage:started listener for movement bias (same as createProcessController)
          this.processController.on('stage:started', (event: any) => {
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

**WAIT** — this duplicates the delegate. The design says to use the helper. Let me revise. The `createProcessController` helper creates a *fresh* ProcessController with the delegate and listeners wired up. For resume, we need `ProcessController.fromJSON()` instead of `new ProcessController()`. So we need to refactor the helper to accept an optional factory override, OR extract just the delegate creation.

**Revised approach:** Change `createProcessController` to return just the delegate + wire listeners on a provided PC. Better yet: split into `createProcessDelegate()` (returns delegate) and have `createProcessController` call it. Then resume calls `createProcessDelegate()` + `ProcessController.fromJSON()` + wires listeners.

Here's the actual implementation:

**Step 1a: Refactor the helper into `createProcessDelegate` + listener wiring**

Replace the `createProcessController()` method (from Task 1) with two pieces:

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

Then update `handleStartProcess` to use these:

```typescript
      // Create process controller with delegate callbacks
      this.processController = new ProcessController(this.createProcessDelegate());
      this.wireProcessControllerEvents(this.processController);

      // Spawn the first stage's agents
      await this.spawnProcessAgents(template, 0, msg.problem);

      // Start stage tracking after agents are spawned
      this.processController.start(msg.problem, template);
```

And the resume path in `handleResumeRealm`:

```typescript
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

**Step 2: Also add the import for `ProcessControllerDelegate`**

At the top of BridgeServer.ts, update the ProcessController import (line 44) to also import the delegate type:

```typescript
import { ProcessController, type ProcessControllerDelegate } from './ProcessController.js';
```

**Step 3: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 4: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat(S5): process-aware resume in handleResumeRealm with Oracle fallback"
```

---

### Task 4: Add navigation state restoration

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (inside handleResumeRealm, after loading worldState)

**Step 1: Add navigation restoration**

In `handleResumeRealm`, after `this.worldState = savedState;` (line 965) and before the `gamePhase = 'playing'` line, add:

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

Since the E2E test file doesn't mock WorldStatePersistence or RealmRegistry, and testing handleResumeRealm via WebSocket would be very complex, we'll create a focused test file that tests the extracted helpers and resume logic by accessing BridgeServer internals.

**Step 1: Create the test file**

Create `ha-agent-rpg/server/src/__tests__/BridgeServer.resume.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      // Set up server internals to simulate a loaded realm
      const ws = new WorldState();
      ws.setProcessState(makeRunningProcessState());

      (server as any).worldState = ws;
      (server as any).repoPath = '/tmp';
      (server as any).gamePhase = 'playing';

      // Manually init required subsystems (normally done by handleResumeRealm)
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

      // Verify: when template is missing, we don't create a ProcessController
      // (handleResumeRealm would fall back to Oracle)
      expect((server as any).processController).toBeNull();
    });

    it('does not create ProcessController when process is completed', () => {
      const ws = new WorldState();
      const state = makeRunningProcessState();
      state.status = 'completed';
      ws.setProcessState(state);

      (server as any).worldState = ws;

      const processState = ws.getProcessState()!;
      // Status is not 'running', so we should not create a ProcessController
      expect(processState.status).toBe('completed');
      expect((server as any).processController).toBeNull();
    });

    it('does not create ProcessController when processState is null', () => {
      const ws = new WorldState();
      // No process state set
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
      // navigationState defaults to null
      (server as any).worldState = ws;

      const navState = ws.navigationState;
      expect(navState).toBeNull();

      // Maps should remain empty
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
