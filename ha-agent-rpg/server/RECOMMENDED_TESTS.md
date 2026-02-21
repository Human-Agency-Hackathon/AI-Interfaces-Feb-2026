# Recommended Test Cases - Priority Order

## Quick Reference

| Priority | Component | Test Count | Coverage Impact | Risk Reduction |
|----------|-----------|------------|----------------|----------------|
| **P0** | BridgeServer Error Paths | 8 tests | +15% | Prevents crashes |
| **P1** | RpgMcpServer Tools | 12 tests | +85% (RpgMcp) | Validates agent-tool integration |
| **P2** | External Agent Flow | 6 tests | +8% | Enables Python agents |
| **P3** | Navigation System | 10 tests | +18% | Prevents state corruption |
| **P4** | Multi-Agent Spawning | 6 tests | +10% | Validates orchestration |

---

## P0: Critical Error Paths (MUST HAVE)

### File: `src/__tests__/BridgeServer.error.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BridgeServer } from '../BridgeServer.js';
import { connectClient, type TestClient } from './helpers/ws-helpers.js';

describe('BridgeServer - Error Handling', () => {
  let server: BridgeServer;
  let port: number;
  let client: TestClient;

  beforeEach(async () => {
    server = new BridgeServer(0);
    port = (server as any).wss.address().port;
    client = await connectClient(`ws://localhost:${port}`);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('handles repo analysis failure gracefully', async () => {
    // Mock RepoAnalyzer to throw error
    vi.spyOn(server['repoAnalyzer'], 'analyze').mockRejectedValue(
      new Error('Repository not found (404)')
    );

    client.send({ type: 'player:link-repo', repo_url: 'https://github.com/invalid/repo' });

    const error = await client.waitForMessage((m) => m.type === 'error', 5_000);
    expect(error.message).toContain('Repository not found');

    // Verify gamePhase reset
    expect(server['gamePhase']).toBe('onboarding');

    // Verify server still functional
    client.send({ type: 'player:update-settings', settings: { max_agents: 10 } });
    await new Promise(r => setTimeout(r, 100));
    const errors = client.messages.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1); // Only the repo error
  });

  it('handles local path permission denied', async () => {
    vi.spyOn(server['localTreeReader'], 'analyze').mockRejectedValue(
      new Error('EACCES: permission denied')
    );

    client.send({ type: 'player:link-repo', repo_url: '/root/restricted' });

    const error = await client.waitForMessage((m) => m.type === 'error');
    expect(error.message).toContain('permission denied');
  });

  it('handles realm resume with missing state', async () => {
    // Setup: realm exists but no world state
    const realm = {
      id: 'test_realm',
      path: '/tmp/test',
      name: 'test',
      displayName: 'Test Repo',
      lastExplored: new Date().toISOString(),
      gitInfo: { lastCommitSha: '', branch: 'main', remoteUrl: null },
      stats: { totalFiles: 0, languages: [], agentsUsed: 0, findingsCount: 0, questsTotal: 0, questsCompleted: 0 },
      mapSnapshot: { rooms: 1, tileWidth: 60, tileHeight: 50 },
    };
    server['realmRegistry'].saveRealm(realm);

    // No world state saved
    vi.spyOn(server['worldStatePersistence'], 'load').mockResolvedValue(null);

    client.send({ type: 'player:resume-realm', realm_id: 'test_realm' });

    const error = await client.waitForMessage((m) => m.type === 'error');
    expect(error.message).toContain('No saved state');
    expect(error.message).toContain('re-scanning');
    expect(server['gamePhase']).toBe('onboarding');
  });

  it('handles resume of non-existent realm', async () => {
    client.send({ type: 'player:resume-realm', realm_id: 'fake_realm' });

    const error = await client.waitForMessage((m) => m.type === 'error');
    expect(error.message).toContain('not found');
  });

  it('handles navigation to invalid path', async () => {
    // Setup: link repo and spawn oracle
    client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
    await client.waitForMessage((m) => m.type === 'agent:joined', 10_000);

    // Simulate agent navigating to invalid path (missing map node)
    const agentId = 'oracle';
    server['agentSockets'].set(agentId, client.ws);

    // This should silently fail (log warning) without crashing
    server['handleNavigateEnter'](agentId, '/nonexistent/path');

    // Give time for any errors
    await new Promise(r => setTimeout(r, 200));

    // No error message sent (silent failure is expected)
    const errors = client.messages.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(0);

    // Server still responsive
    expect(server['wss'].clients.size).toBeGreaterThan(0);
  });

  it('cleans up partial state on analysis error', async () => {
    // First successful link
    client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
    await client.waitForMessage((m) => m.type === 'repo:ready', 10_000);

    const originalAgentCount = server['worldState'].agents.size;
    expect(originalAgentCount).toBeGreaterThan(0);

    // Second link fails
    vi.spyOn(server['repoAnalyzer'], 'analyze').mockRejectedValue(new Error('Network error'));
    client.send({ type: 'player:link-repo', repo_url: 'https://github.com/another/repo' });
    await client.waitForMessage((m) => m.type === 'error');

    // Verify cleanup happened (agents dismissed from first realm)
    expect(server['agentColorIndex']).toBe(0); // Reset
  });

  it('handles concurrent link-repo attempts', async () => {
    // Send two link-repo messages rapidly
    client.send({ type: 'player:link-repo', repo_url: '/tmp/repo1' });
    client.send({ type: 'player:link-repo', repo_url: '/tmp/repo2' });

    // Both should complete without crashing server
    const messages = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      messages.push(...client.messages);
      if (messages.filter(m => m.type === 'repo:ready').length >= 1) break;
    }

    // At least one should succeed (or both if sequential)
    const repoReady = messages.filter(m => m.type === 'repo:ready');
    expect(repoReady.length).toBeGreaterThanOrEqual(1);

    // Server still functional
    expect(server['gamePhase']).toBe('playing');
  });

  it('handles sendFollowUp error gracefully', async () => {
    // Setup: oracle active
    client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
    await client.waitForMessage((m) => m.type === 'agent:joined', 10_000);
    await new Promise(r => setTimeout(r, 200));

    // Mock sendFollowUp to fail
    vi.spyOn(server['sessionManager'], 'sendFollowUp').mockRejectedValue(
      new Error('Session crashed')
    );

    // Command should not crash server
    client.send({ type: 'player:command', text: 'Do something' });

    await new Promise(r => setTimeout(r, 500));

    // Server still responsive
    client.send({ type: 'player:update-settings', settings: { max_agents: 3 } });
    await new Promise(r => setTimeout(r, 100));
    expect(server['settings'].max_agents).toBe(3);
  });
});
```

---

## P1: RpgMcpServer Tool Execution

### File: `src/__tests__/RpgMcpServer.integration.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRpgMcpServer } from '../RpgMcpServer.js';
import { CustomToolHandler } from '../CustomToolHandler.js';
import { FindingsBoard } from '../FindingsBoard.js';
import { QuestManager } from '../QuestManager.js';

describe('RpgMcpServer - Tool Execution', () => {
  let toolHandler: CustomToolHandler;
  let mcpServer: any;
  let findingsBoard: FindingsBoard;
  let questManager: QuestManager;

  beforeEach(async () => {
    findingsBoard = new FindingsBoard('/tmp/test-repo');
    await findingsBoard.load();

    questManager = new QuestManager();
    questManager.loadQuests([
      { id: 'quest_1', title: 'Test Quest', status: 'open', priority: 'medium', related_files: [] },
    ]);

    toolHandler = new CustomToolHandler(
      findingsBoard,
      questManager,
      (_agentId) => ({
        getKnowledge: () => ({ expertise: {} }),
        addInsight: vi.fn(),
        incrementExpertise: vi.fn(),
        addTaskHistory: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
      }) as any,
      (_agentId) => 'Test Agent',
    );

    mcpServer = createRpgMcpServer('oracle', toolHandler);
  });

  it('executes SummonAgent tool', async () => {
    const summonTool = mcpServer.instance.tools.find((t: any) => t.name === 'SummonAgent');

    const result = await summonTool.handler({
      name: 'Test Specialist',
      role: 'Testing Expert',
      realm: '/tests',
      mission: 'Write comprehensive tests',
      priority: 'high',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.acknowledged).toBe(true);
    expect(parsed.message).toContain('Spawn request submitted');
  });

  it('executes RequestHelp tool', async () => {
    const helpTool = mcpServer.instance.tools.find((t: any) => t.name === 'RequestHelp');

    const result = await helpTool.handler({
      target_agent: 'engineer',
      question: 'How do I write tests?',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.acknowledged).toBe(true);
    expect(parsed.message).toContain('Help request sent');
  });

  it('executes PostFindings tool with async save', async () => {
    const findingsTool = mcpServer.instance.tools.find((t: any) => t.name === 'PostFindings');

    const result = await findingsTool.handler({
      realm: '/server',
      finding: 'Found critical coverage gap in BridgeServer',
      severity: 'high',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.acknowledged).toBe(true);
    expect(parsed.finding_id).toBeDefined();

    // Verify finding saved
    const findings = findingsBoard.getAll();
    expect(findings).toHaveLength(1);
    expect(findings[0].finding).toContain('coverage gap');
  });

  it('executes UpdateKnowledge tool', async () => {
    const knowledgeTool = mcpServer.instance.tools.find((t: any) => t.name === 'UpdateKnowledge');

    const result = await knowledgeTool.handler({
      insight: 'Learned about test coverage analysis',
      area: 'testing',
      amount: 5,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.saved).toBe(true);
  });

  it('executes UpdateKnowledge with default amount', async () => {
    const knowledgeTool = mcpServer.instance.tools.find((t: any) => t.name === 'UpdateKnowledge');

    const result = await knowledgeTool.handler({
      insight: 'Another insight',
      area: 'typescript',
      // amount not provided - should default to 1
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.saved).toBe(true);
  });

  it('executes ClaimQuest tool', async () => {
    const claimTool = mcpServer.instance.tools.find((t: any) => t.name === 'ClaimQuest');

    const result = await claimTool.handler({
      quest_id: 'quest_1',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.assigned).toBe(true);
    expect(parsed.quest_id).toBe('quest_1');

    // Verify quest assigned
    const quest = questManager.getAll().find(q => q.id === 'quest_1');
    expect(quest?.assignee).toBe('oracle');
  });

  it('handles ClaimQuest for invalid quest', async () => {
    const claimTool = mcpServer.instance.tools.find((t: any) => t.name === 'ClaimQuest');

    const result = await claimTool.handler({
      quest_id: 'invalid_quest',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain('Cannot assign quest');
  });

  it('executes CompleteQuest tool with outcome', async () => {
    // First claim the quest
    questManager.assignQuest('quest_1', 'oracle');

    const completeTool = mcpServer.instance.tools.find((t: any) => t.name === 'CompleteQuest');

    const result = await completeTool.handler({
      quest_id: 'quest_1',
      outcome: 'All tests passing',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.closed).toBe(true);
    expect(parsed.quest_id).toBe('quest_1');

    // Verify quest completed
    const quest = questManager.getAll().find(q => q.id === 'quest_1');
    expect(quest?.status).toBe('done');
  });

  it('executes CompleteQuest without outcome', async () => {
    questManager.assignQuest('quest_1', 'oracle');

    const completeTool = mcpServer.instance.tools.find((t: any) => t.name === 'CompleteQuest');

    const result = await completeTool.handler({
      quest_id: 'quest_1',
      // outcome not provided
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.closed).toBe(true);
  });

  it('handles CompleteQuest for invalid quest', async () => {
    const completeTool = mcpServer.instance.tools.find((t: any) => t.name === 'CompleteQuest');

    const result = await completeTool.handler({
      quest_id: 'invalid_quest',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain('Cannot complete quest');
  });

  it('verifies all 6 tools are present', () => {
    const toolNames = mcpServer.instance.tools.map((t: any) => t.name);

    expect(toolNames).toContain('SummonAgent');
    expect(toolNames).toContain('RequestHelp');
    expect(toolNames).toContain('PostFindings');
    expect(toolNames).toContain('UpdateKnowledge');
    expect(toolNames).toContain('ClaimQuest');
    expect(toolNames).toContain('CompleteQuest');
    expect(toolNames).toHaveLength(6);
  });

  it('returns proper MCP response structure', async () => {
    const tool = mcpServer.instance.tools[0];
    const result = await tool.handler({/* minimal params */});

    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.any(String),
    });

    // Text should be valid JSON
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
```

---

## P2: External Agent Flow

### File: `src/__tests__/BridgeServer.external-agents.test.ts`

```typescript
describe('BridgeServer - External Agent Registration', () => {
  // Setup similar to main e2e test

  it('registers external Python agent', async () => {
    const client = await connect();

    client.send({
      type: 'agent:register',
      agent_id: 'python_agent_1',
      name: 'Python Explorer',
      color: 0xff0000,
    });

    const joined = await client.waitForMessage((m) => m.type === 'agent:joined');
    expect(joined.agent.agent_id).toBe('python_agent_1');
    expect(joined.agent.name).toBe('Python Explorer');
    expect(joined.agent.color).toBe(0xff0000);
    expect(joined.agent.role).toBe('External');
  });

  it('auto-assigns color if not provided', async () => {
    const client = await connect();

    client.send({
      type: 'agent:register',
      agent_id: 'python_agent_2',
      name: 'Python Helper',
      // No color provided
    });

    const joined = await client.waitForMessage((m) => m.type === 'agent:joined');
    expect(joined.agent.color).toBeDefined();
    expect(typeof joined.agent.color).toBe('number');
  });

  it('cleans up on external agent disconnect', async () => {
    const client = await connect();

    client.send({
      type: 'agent:register',
      agent_id: 'python_temp',
      name: 'Temp Agent',
    });

    await client.waitForMessage((m) => m.type === 'agent:joined');

    // Disconnect
    await client.close();

    // Connect new client to verify broadcast
    const client2 = await connect();
    const left = await client2.waitForMessage((m) => m.type === 'agent:left');
    expect(left.agent_id).toBe('python_temp');

    await client2.close();
  });

  // More tests: duplicate IDs, multiple simultaneous registrations, etc.
});
```

---

## P3: Navigation System

### File: `src/__tests__/BridgeServer.navigation.test.ts`

```typescript
describe('BridgeServer - Navigation', () => {
  it('agent navigates into subfolder via nav_door', async () => {
    // Setup: link repo with hierarchical structure
    client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
    await client.waitForMessage((m) => m.type === 'agent:joined', 10_000);

    // Simulate agent moving to nav_door object
    const agentId = 'oracle';
    const agent = server['worldState'].agents.get(agentId);
    const navDoor = server['worldState'].getObjects().find(o => o.type === 'nav_door');

    // Trigger navigation by moving to nav_door position
    server['worldState'].applyMove(agentId, navDoor.x, navDoor.y);
    server['handleNavigateEnter'](agentId, navDoor.metadata.targetPath);

    const mapChange = await client.waitForMessage((m) => m.type === 'map:change');
    expect(mapChange.path).toBe(navDoor.metadata.targetPath);
    expect(mapChange.position).toBeDefined();

    // Verify nav stack pushed
    const navStack = server['agentNavStacks'].get(agentId);
    expect(navStack).toHaveLength(1);
    expect(navStack[0].path).toBe(''); // Previous path (root)
  });

  it('agent navigates back to parent folder', async () => {
    // Setup: agent in subfolder
    // ... setup code ...

    // Trigger navigate back
    const backObj = server['worldState'].getObjects().find(o => o.type === 'nav_back');
    server['handleNavigateBack'](agentId);

    const mapChange = await client.waitForMessage((m) => m.type === 'map:change');
    expect(mapChange.path).toBe(''); // Back to root

    // Verify nav stack popped
    const navStack = server['agentNavStacks'].get(agentId);
    expect(navStack).toHaveLength(0);
  });

  // More tests: lazy map generation, concurrent navigation, edge cases
});
```

---

## P4: Multi-Agent Spawning

### File: `src/__tests__/BridgeServer.multi-agent.test.ts`

```typescript
describe('BridgeServer - Multi-Agent Spawning', () => {
  it('enforces max agent limit', async () => {
    // Set max to 2
    client.send({ type: 'player:update-settings', settings: { max_agents: 2 } });
    client.send({ type: 'player:link-repo', repo_url: '/tmp/test-repo' });
    await client.waitForMessage((m) => m.type === 'agent:joined', 10_000); // Oracle spawned

    // Manually spawn one more
    const request = {
      requestingAgent: 'oracle',
      name: 'Specialist 1',
      role: 'Engineer',
      realm: '/src',
      mission: 'Test mission',
      priority: 'high',
    };
    await server['spawnRequestedAgent'](request);

    // Now at max (2 agents)
    // Try to spawn third
    const request2 = { ...request, name: 'Specialist 2' };
    await server['spawnRequestedAgent'](request2);

    // Should see denial notification
    const denial = client.messages.find(
      m => m.type === 'agent:activity' && m.activity?.includes('max agents')
    );
    expect(denial).toBeDefined();
  });

  // More tests: spawn request event, map rebuild, agent positioning
});
```

---

## Quick Start Instructions

1. **Copy test files** to `src/__tests__/`
2. **Install dependencies** if needed: `npm install`
3. **Run specific test suite**: `npm test -- BridgeServer.error.test.ts`
4. **Run all new tests**: `npm test -- --grep "Error Handling|Tool Execution|External Agent"`
5. **Check coverage**: `npm test -- --coverage`

## Expected Coverage Improvement

- **After P0**: BridgeServer 50% → 65% (+15%)
- **After P1**: RpgMcpServer 7% → 92% (+85%)
- **After P2**: BridgeServer 65% → 73% (+8%)
- **After P3**: BridgeServer 73% → 91% (+18%)
- **After P4**: BridgeServer 91% → 98% (+7%)

**Total**: BridgeServer 36.61% → ~98%, RpgMcpServer 7.14% → ~92%
