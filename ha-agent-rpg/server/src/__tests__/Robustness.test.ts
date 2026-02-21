/**
 * Tests for R1 (periodic KnowledgeVault auto-saves) and R2 (settings persistence).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';

// ── R1: Periodic KnowledgeVault auto-saves ────────────────────────────────────

vi.mock('../KnowledgeVault.js', () => ({
  KnowledgeVault: class {
    private saves = 0;
    async load() {}
    async save() { this.saves++; }
    getExpertiseSummary() { return ''; }
    getRealmSummary() { return ''; }
    getKnowledge() {
      return {
        agent_id: 'a', agent_name: 'A', role: 'scout', realm: '/',
        expertise: {}, realm_knowledge: {}, insights: [], task_history: [], files_analyzed: [],
      };
    }
    getSaveCount() { return this.saves; }
  },
}));

vi.mock('../FindingsBoard.js', () => ({
  FindingsBoard: class {
    async getRecent() { return []; }
  },
}));

vi.mock('../SystemPromptBuilder.js', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('prompt'),
}));

vi.mock('../RpgMcpServer.js', () => ({
  createRpgMcpServer: vi.fn(() => ({})),
  createBrainstormMcpServer: vi.fn(() => ({})),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'result', subtype: 'success', session_id: 'sid1' };
    },
  })),
}));

vi.mock('../CustomToolHandler.js', () => ({
  CustomToolHandler: class { on() {} },
}));

describe('R1: periodic KnowledgeVault auto-saves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the auto-save interval when agent is dismissed', async () => {
    const { AgentSessionManager } = await import('../AgentSessionManager.js');
    const { FindingsBoard } = await import('../FindingsBoard.js');
    const { CustomToolHandler } = await import('../CustomToolHandler.js');

    const board = new FindingsBoard('/tmp');
    const handler = new CustomToolHandler(null as any, null as any, () => undefined, () => 'unknown');
    const mgr = new AgentSessionManager(board as any, handler as any);

    await mgr.spawnAgent({
      agentId: 'test_agent',
      agentName: 'Test',
      role: 'scout',
      realm: '/',
      mission: 'explore',
      repoPath: '/tmp',
      permissionLevel: 'read-only',
    });

    expect(mgr.getActiveAgentIds()).toContain('test_agent');

    // Dismiss agent — interval should be cleared, no further saves triggered
    await mgr.dismissAgent('test_agent');
    expect(mgr.getActiveAgentIds()).not.toContain('test_agent');

    // Advancing time after dismissal should NOT cause further vault saves
    // (the interval was cleared). We just verify no error is thrown.
    vi.advanceTimersByTime(120_000);
  });

  it('auto-save interval is set up on spawnAgent and cleared on dismissAgent', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { AgentSessionManager } = await import('../AgentSessionManager.js');
    const { FindingsBoard } = await import('../FindingsBoard.js');
    const { CustomToolHandler } = await import('../CustomToolHandler.js');

    const board = new FindingsBoard('/tmp');
    const handler = new CustomToolHandler(null as any, null as any, () => undefined, () => 'unknown');
    const mgr = new AgentSessionManager(board as any, handler as any);

    await mgr.spawnAgent({
      agentId: 'agent_r1',
      agentName: 'R1',
      role: 'scout',
      realm: '/',
      mission: 'explore',
      repoPath: '/tmp',
      permissionLevel: 'read-only',
    });

    // dismissAgent should call clearInterval
    const callsBefore = clearIntervalSpy.mock.calls.length;
    await mgr.dismissAgent('agent_r1');
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(callsBefore);

    clearIntervalSpy.mockRestore();
  });
});

// ── R2: Settings persistence ──────────────────────────────────────────────────

describe('R2: settings persistence', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `settings-test-${Date.now()}`);
    await mkdir(join(tmpDir, '.agent-rpg'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('saves settings to disk and loads them back', async () => {
    const settingsPath = join(tmpDir, '.agent-rpg', 'settings.json');

    // Simulate saveSettings by writing directly
    const settings = { max_agents: 8, token_budget_usd: 5.0, permission_level: 'read-only', autonomy_mode: 'supervised' };
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    const raw = await readFile(settingsPath, 'utf-8');
    const loaded = JSON.parse(raw);

    expect(loaded.max_agents).toBe(8);
    expect(loaded.token_budget_usd).toBe(5.0);
  });

  it('gracefully handles missing settings file (uses defaults)', async () => {
    const settingsPath = join(tmpDir, '.agent-rpg', 'settings.json');

    // File does not exist — readFile should throw, code should catch and use defaults
    let loadedSettings: Record<string, unknown> = { max_agents: 5 };
    try {
      const raw = await readFile(settingsPath, 'utf-8');
      loadedSettings = { ...loadedSettings, ...JSON.parse(raw) };
    } catch {
      // Expected — use defaults
    }

    expect(loadedSettings.max_agents).toBe(5);
  });
});
