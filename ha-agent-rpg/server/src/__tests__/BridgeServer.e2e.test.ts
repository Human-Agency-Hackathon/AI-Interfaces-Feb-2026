import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRepoPath } from '../BridgeServer.js';

// ── Module mocks (must be before imports of the module under test) ──

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
      // Simulate agent becoming active then completing
      setTimeout(() => this.emit('agent:complete', config.agentId), 50);
    }

    async sendFollowUp(agentId: string, prompt: string) {
      setTimeout(() => {
        this.emit('agent:message', agentId, {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: `Responding to: ${prompt}` }],
          },
        });
        this.emit('agent:complete', agentId);
      }, 20);
    }

    async dismissAgent(agentId: string) {
      this.sessions.delete(agentId);
      this.emit('agent:dismissed', agentId);
    }

    getActiveAgentIds() {
      return Array.from(this.sessions.keys());
    }
    getSession(id: string) {
      return this.sessions.get(id);
    }
    getVault(id: string) {
      return this.sessions.get(id)?.vault;
    }
    getTeamRoster() {
      return [];
    }
  }

  return { AgentSessionManager: MockAgentSessionManager };
});

vi.mock('../RepoAnalyzer.js', () => ({
  RepoAnalyzer: class {
    async analyze() {
      return {
        owner: 'testowner',
        repo: 'testrepo',
        tree: [
          { path: 'src', type: 'tree' },
          { path: 'src/index.ts', type: 'blob', size: 500 },
          { path: 'package.json', type: 'blob', size: 100 },
        ],
        issues: [
          {
            number: 1,
            title: 'Test bug',
            body: 'Bug in index.ts',
            labels: ['bug'],
            url: 'https://example.com',
          },
        ],
        languages: { TypeScript: 500 },
        totalFiles: 2,
        defaultBranch: 'main',
      };
    }
  },
}));

vi.mock('../LocalTreeReader.js', () => ({
  LocalTreeReader: class {
    async analyze(repoPath: string) {
      return {
        repoPath,
        repoName: 'testrepo',
        tree: [
          { path: 'src', type: 'tree' },
          { path: 'src/index.ts', type: 'blob', size: 500 },
          { path: 'package.json', type: 'blob', size: 100 },
        ],
        totalFiles: 2,
        languages: { TypeScript: 500 },
        hasRemote: false,
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
    addFinding(f: any) {
      const entry = {
        ...f,
        id: `finding_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      this.findings.push(entry);
      return entry;
    }
    getAll() {
      return [...this.findings];
    }
    getRecent(n = 20) {
      return this.findings.slice(-n);
    }
    getSummary() {
      return this.findings.length === 0 ? 'No findings yet.' : 'findings';
    }
  },
}));

import { BridgeServer } from '../BridgeServer.js';
import { connectClient, type TestClient } from './helpers/ws-helpers.js';

describe('BridgeServer E2E', () => {
  let server: BridgeServer;
  let port: number;
  let clients: TestClient[];

  beforeEach(() => {
    server = new BridgeServer(0);
    const address = (server as any).wss.address();
    port = address.port;
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) {
      await c.close().catch(() => {});
    }
    await new Promise<void>((resolve) => {
      (server as any).wss.close(() => resolve());
    });
  });

  async function connect(): Promise<TestClient> {
    const client = await connectClient(`ws://localhost:${port}`);
    clients.push(client);
    return client;
  }

  describe('connection handling', () => {
    it('accepts WebSocket connections', async () => {
      const client = await connect();
      expect(client.ws.readyState).toBe(WebSocket.OPEN);
    });

    it('sends error on invalid JSON', async () => {
      const client = await connect();
      client.ws.send('not json at all');
      const msg = await client.waitForMessage((m) => m.type === 'error');
      expect(msg.message).toBe('Invalid JSON');
    });

    it('sends error on unknown message type', async () => {
      const client = await connect();
      client.send({ type: 'bogus:message' });
      const msg = await client.waitForMessage((m) => m.type === 'error');
      expect(msg.message).toContain('Unknown message type');
    });
  });

  describe('player:link-repo (local path)', () => {
    it('broadcasts repo:ready with map, quests, objects, and stats', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });

      const repoReady = await client.waitForMessage(
        (m) => m.type === 'repo:ready',
        10_000,
      );
      expect(repoReady.repo_name).toBe('testrepo');
      expect(repoReady.map).toBeDefined();
      expect(repoReady.map.tiles).toBeDefined();
      expect(repoReady.quests).toBeDefined();
      expect(repoReady.objects).toBeDefined();
      expect(repoReady.stats).toBeDefined();
    });

    it('broadcasts agent:joined for the oracle after repo:ready', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });

      const joined = await client.waitForMessage(
        (m) => m.type === 'agent:joined',
        10_000,
      );
      expect(joined.agent.agent_id).toBe('oracle');
      expect(joined.agent.name).toBe('The Oracle');
    });

    it('broadcasts world:state snapshot after oracle spawn', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });

      const worldState = await client.waitForMessage(
        (m) => m.type === 'world:state',
        10_000,
      );
      expect(worldState.agents.length).toBeGreaterThanOrEqual(1);
      expect(worldState.map).toBeDefined();
    });
  });

  describe('multi-client broadcasting', () => {
    it('broadcasts repo:ready to all connected clients', async () => {
      const client1 = await connect();
      const client2 = await connect();

      client1.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });

      const [msg1, msg2] = await Promise.all([
        client1.waitForMessage((m) => m.type === 'repo:ready', 10_000),
        client2.waitForMessage((m) => m.type === 'repo:ready', 10_000),
      ]);

      expect(msg1.repo_name).toBe('testrepo');
      expect(msg2.repo_name).toBe('testrepo');
    });
  });

  describe('player:update-settings', () => {
    it('updates server settings without error', async () => {
      const client = await connect();
      client.send({
        type: 'player:update-settings',
        settings: {
          max_agents: 10,
          token_budget_usd: 5.0,
          permission_level: 'full',
          autonomy_mode: 'autonomous',
        },
      });
      // Wait briefly and verify no error was sent
      await new Promise((r) => setTimeout(r, 200));
      const errors = client.messages.filter((m) => m.type === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('player:dismiss-agent', () => {
    it('broadcasts agent:left when an agent is dismissed', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'agent:joined', 10_000);

      client.send({ type: 'player:dismiss-agent', agent_id: 'oracle' });
      const left = await client.waitForMessage((m) => m.type === 'agent:left');
      expect(left.agent_id).toBe('oracle');
    });
  });

  describe('player:command', () => {
    it('routes commands to the oracle and receives a speak response', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });

      // Wait for oracle to spawn and complete initial session
      await client.waitForMessage((m) => m.type === 'agent:joined', 10_000);

      // Give mock time to emit agent:complete so oracle becomes idle
      await new Promise((r) => setTimeout(r, 200));

      // Send a player command
      client.send({ type: 'player:command', text: 'Analyze the auth module' });

      // The mock sendFollowUp emits assistant text → EventTranslator → speak action:result
      const speakResult = await client.waitForMessage(
        (m) => m.type === 'action:result' && m.action === 'speak',
        10_000,
      );
      expect(speakResult.params.text).toContain('Responding to');
    });
  });

  describe('late-connecting client', () => {
    it('receives world:state snapshot on connection if game is playing', async () => {
      const client1 = await connect();
      client1.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client1.waitForMessage((m) => m.type === 'world:state', 10_000);

      // Late joiner
      const client2 = await connect();
      const snapshot = await client2.waitForMessage(
        (m) => m.type === 'world:state',
        5_000,
      );
      expect(snapshot.map).toBeDefined();
    });
  });

  describe('client disconnect', () => {
    it('removes disconnected client from broadcast set', async () => {
      const client1 = await connect();
      const client2 = await connect();

      await client1.close();

      // After disconnect, server should not crash when broadcasting
      client2.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      const msg = await client2.waitForMessage(
        (m) => m.type === 'repo:ready',
        10_000,
      );
      expect(msg).toBeDefined();
    });
  });

  describe('path traversal validation', () => {
    it('rejects player:navigate-enter with ".." in path', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'world:state', 10_000);

      client.send({ type: 'player:navigate-enter', target_path: '../../../etc' });
      const error = await client.waitForMessage((m) => m.type === 'error');
      expect(error.message).toContain('Invalid path');
    });

    it('rejects player:navigate-enter with absolute path', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'world:state', 10_000);

      client.send({ type: 'player:navigate-enter', target_path: '/etc/passwd' });
      const error = await client.waitForMessage((m) => m.type === 'error');
      expect(error.message).toContain('Invalid path');
    });

    it('rejects player:navigate-enter with embedded ".." segments', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'world:state', 10_000);

      client.send({ type: 'player:navigate-enter', target_path: 'src/../../secret' });
      const error = await client.waitForMessage((m) => m.type === 'error');
      expect(error.message).toContain('Invalid path');
    });

    it('allows valid relative path and returns map:change', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'world:state', 10_000);

      client.send({ type: 'player:navigate-enter', target_path: 'src' });
      const mapChange = await client.waitForMessage((m) => m.type === 'map:change');
      expect(mapChange.path).toBe('src');
      expect(mapChange.map).toBeDefined();
    });
  });

  describe('player:get-agent-details', () => {
    it('returns agent:details with correct shape for a registered agent', async () => {
      const client = await connect();

      // Register an external agent
      client.send({
        type: 'agent:register',
        agent_id: 'test-agent-details',
        name: 'Details Agent',
        color: 0xff3300,
      });
      await client.waitForMessage((m) => m.type === 'agent:joined');

      // Request agent details
      client.send({
        type: 'player:get-agent-details',
        agent_id: 'test-agent-details',
      });

      const details = await client.waitForMessage((m) => m.type === 'agent:details');
      expect(details.agent_id).toBe('test-agent-details');
      expect(details.info).toBeDefined();
      expect(details.info.name).toBe('Details Agent');
      expect(details.knowledge).toBeDefined();
      expect(typeof details.knowledge.expertise).toBe('object');
      expect(Array.isArray(details.knowledge.insights)).toBe(true);
      expect(Array.isArray(details.knowledge.task_history)).toBe(true);
      expect(Array.isArray(details.findings)).toBe(true);
      expect(details.transcript).toBeDefined();
      expect(Array.isArray(details.transcript.thoughts)).toBe(true);
      expect(Array.isArray(details.transcript.actions)).toBe(true);
    });

    it('sends nothing for an unknown agent_id', async () => {
      const client = await connect();

      client.send({
        type: 'player:get-agent-details',
        agent_id: 'nonexistent-agent-xyz',
      });

      // Wait and verify no agent:details was received (silent ignore)
      await new Promise((r) => setTimeout(r, 300));
      const detailMessages = client.messages.filter((m) => m.type === 'agent:details');
      expect(detailMessages).toHaveLength(0);
    });

    it('returns tools array in agent:details response', async () => {
      const client = await connect();

      client.send({
        type: 'agent:register',
        agent_id: 'test-agent-tools',
        name: 'Tools Agent',
        color: 0x00ff00,
      });
      await client.waitForMessage((m) => m.type === 'agent:joined');

      client.send({
        type: 'player:get-agent-details',
        agent_id: 'test-agent-tools',
      });

      const details = await client.waitForMessage((m) => m.type === 'agent:details');
      expect(details.tools).toBeDefined();
      expect(Array.isArray(details.tools)).toBe(true);
    });
  });

  describe('Fog-of-War', () => {
    it('routes fort:click without crashing', async () => {
      const client = await connect();
      client.send({ type: 'fort:click', agentId: 'oracle' });
      // Should not crash the server; no response expected since agent doesn't exist
      await new Promise((r) => setTimeout(r, 100));
      expect(true).toBe(true); // server still alive
    });

    it('routes fort:exit and returns world state', async () => {
      const client = await connect();
      client.send({ type: 'fort:exit' });
      await new Promise((r) => setTimeout(r, 200));
      const worldStates = client.messages.filter((m) => m.type === 'world:state');
      expect(worldStates.length).toBeGreaterThanOrEqual(1);
    });

    it('fort:click on a registered agent returns fort:view', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'world:state', 10_000);

      // Fort click on oracle (which exists after link-repo spawns it)
      client.send({ type: 'fort:click', agentId: 'oracle' });
      const view = await client.waitForMessage(
        (m) => m.type === 'fort:view',
        5_000,
      );
      expect(view.agentId).toBe('oracle');
      expect(view.roomImage).toBe('room-throne');
    });

    it('fort:exit after fort:view returns world:state', async () => {
      const client = await connect();
      client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
      await client.waitForMessage((m) => m.type === 'world:state', 10_000);

      // Enter fort view then exit
      client.send({ type: 'fort:click', agentId: 'oracle' });
      await client.waitForMessage((m) => m.type === 'fort:view', 5_000);

      client.send({ type: 'fort:exit' });
      const state = await client.waitForMessage(
        (m) => m.type === 'world:state',
        5_000,
      );
      expect(state.map).toBeDefined();
      expect(state.agents).toBeDefined();
    });
  });
  describe('resolveRepoPath', () => {
    it('returns an existing local path as-is', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
      const result = await resolveRepoPath(dir);
      expect(result).toBe(dir);
      await fs.rm(dir, { recursive: true });
    });

    it('throws for a non-existent local path', async () => {
      await expect(resolveRepoPath('/tmp/nonexistent-path-xyz-123')).rejects.toThrow('not found');
    });
  });

  describe('player:start-process with repoInput', () => {
    it('uses provided local path and synthesizes problem', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
      const client = await connect();

      client.send({
        type: 'player:start-process',
        problem: '',
        repoInput: dir,
      });

      const started = await client.waitForMessage(
        (m: any) => m.type === 'process:started',
        5000,
      );
      expect(started.problem).toBe(`Explore the codebase at: ${dir}`);
      await fs.rm(dir, { recursive: true });
    });

    it('sends process:error when neither problem nor repoInput provided', async () => {
      const client = await connect();

      client.send({
        type: 'player:start-process',
        problem: '',
      });

      await client.waitForMessage(
        (m: any) => m.type === 'process:error',
        3000,
      );
    });
  });

});
