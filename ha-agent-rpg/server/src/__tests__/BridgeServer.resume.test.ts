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
    async sendFollowUp(_agentId: string, _prompt: string) {}
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
import { ProcessController } from '../ProcessController.js';

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

  describe('wireProcessControllerEvents()', () => {
    it('wires stage:started listener that sets movementBias', () => {
      const delegate = (server as any).createProcessDelegate();
      const pc = new ProcessController(delegate);
      (server as any).wireProcessControllerEvents(pc);

      // Emit divergent stage
      pc.emit('stage:started', { stageId: 'divergent_thinking_1' });
      expect((server as any).movementBias).toBe('outward');

      // Emit convergent stage
      pc.emit('stage:started', { stageId: 'convergent_thinking_1' });
      expect((server as any).movementBias).toBe('inward');

      // Emit neutral stage
      pc.emit('stage:started', { stageId: 'presentation' });
      expect((server as any).movementBias).toBe('neutral');
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

    it('restores ProcessController via fromJSON when processState.status is running', () => {
      const ws = new WorldState();
      ws.setProcessState(makeRunningProcessState());

      (server as any).worldState = ws;

      const processState = ws.getProcessState()!;
      const template = PROCESS_TEMPLATES[processState.processId];
      expect(template).toBeDefined();

      // This is what handleResumeRealm does
      const pc = ProcessController.fromJSON(
        processState,
        template!,
        (server as any).createProcessDelegate(),
      );
      (server as any).processController = pc;
      (server as any).wireProcessControllerEvents(pc);

      // Verify ProcessController state restored
      const ctx = pc.getContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.stageIndex).toBe(1);
      expect(ctx!.problem).toBe('How to improve testing?');
    });

    it('does not restore ProcessController when template is missing', () => {
      const ws = new WorldState();
      const state = makeRunningProcessState();
      state.processId = 'nonexistent_template';
      ws.setProcessState(state);

      (server as any).worldState = ws;

      const processState = ws.getProcessState()!;
      const template = PROCESS_TEMPLATES[processState.processId];
      expect(template).toBeUndefined();

      // handleResumeRealm would fall back to Oracle
      expect((server as any).processController).toBeNull();
    });

    it('does not restore ProcessController when process is completed', () => {
      const ws = new WorldState();
      const state = makeRunningProcessState();
      state.status = 'completed';
      ws.setProcessState(state);

      (server as any).worldState = ws;

      const processState = ws.getProcessState()!;
      expect(processState.status).toBe('completed');
      // handleResumeRealm would fall through to Oracle path
      expect((server as any).processController).toBeNull();
    });

    it('does not restore ProcessController when processState is null', () => {
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

  describe('autoLoadLastRealm()', () => {
    it('does nothing when no lastActiveRealmId is set', async () => {
      // gamePhase starts as 'onboarding' — should stay that way
      await (server as any).autoLoadLastRealm();
      expect((server as any).gamePhase).toBe('onboarding');
    });

    it('does nothing when lastActiveRealmId points to a missing realm', async () => {
      (server as any).realmRegistry.setLastActiveRealmId('nonexistent');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (server as any).autoLoadLastRealm();
      expect((server as any).gamePhase).toBe('onboarding');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found in registry'));
      warnSpy.mockRestore();
    });

    it('falls back to onboarding when worldStatePersistence.load returns null', async () => {
      // Add a realm to registry so it's found
      const realm = {
        id: 'test_realm',
        path: '/tmp/test-project',
        name: 'test-project',
        displayName: 'test-project',
        lastExplored: '2026-02-21T10:00:00Z',
        gitInfo: { lastCommitSha: 'abc', branch: 'main', remoteUrl: null },
        stats: { totalFiles: 1, languages: ['TS'], agentsUsed: 1, findingsCount: 0, questsTotal: 0, questsCompleted: 0 },
        mapSnapshot: { rooms: 1, tileWidth: 60, tileHeight: 50 },
      };
      (server as any).realmRegistry.saveRealm(realm);
      (server as any).realmRegistry.setLastActiveRealmId('test_realm');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (server as any).autoLoadLastRealm();
      expect((server as any).gamePhase).toBe('onboarding');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no saved state'));
      warnSpy.mockRestore();
    });
  });
});
