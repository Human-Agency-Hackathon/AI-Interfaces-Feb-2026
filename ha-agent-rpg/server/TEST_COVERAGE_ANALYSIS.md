# Test Coverage Analysis: BridgeServer & RpgMcpServer

**Analyst:** Code Sentinel
**Date:** 2026-02-21
**Mission:** Improve server test coverage in critical low-coverage areas

---

## Executive Summary

### Current Coverage Status

| File | Statement Coverage | Branch Coverage | Function Coverage | Critical Gaps |
|------|-------------------|-----------------|-------------------|---------------|
| **BridgeServer.ts** | 36.61% | 15.75% | 35.59% | Error handling, navigation, realm management, WebSocket edge cases |
| **RpgMcpServer.ts** | 7.14% | 100% | 12.5% | Tool execution paths, error responses, MCP tool integration |

### Risk Assessment

**HIGH RISK**: BridgeServer.ts is the 1092-line central orchestrator with only 36.61% coverage. This means **63.39% of critical server logic is untested**, including error recovery, state management, and concurrent operation scenarios.

**MEDIUM RISK**: RpgMcpServer.ts has 7.14% coverage despite being the bridge between agents and custom tools. Only the config structure is tested; actual tool execution is completely untested.

---

## Part 1: BridgeServer.ts Analysis

### 1.1 Untested Code Paths

Based on line number analysis from coverage report (lines 87-1075 with significant gaps), the following critical paths are **NOT tested**:

#### **A. Error Handling Paths (Lines 332-336, 641-644)**

**Risk Level:** HIGH
**Business Impact:** Server crashes or silent failures when repos fail to analyze

**Untested Scenarios:**
1. **Invalid GitHub URLs** - What happens with malformed URLs?
   - `https://github.com/invalid` (404)
   - `https://github.com/private/repo` (403 Forbidden)
   - Non-GitHub URLs like `https://gitlab.com/...`

2. **Local Path Failures** - File system errors
   - Non-existent local paths: `/tmp/does-not-exist`
   - Permission denied: `/root/restricted`
   - Symbolic link loops
   - Empty directories with no analyzable files

3. **RepoAnalyzer Failures** - API rate limiting, network errors
   - GitHub API rate limit exceeded (HTTP 429)
   - Network timeout during analysis
   - Malformed repository tree structure

4. **Realm Resume Errors** - State corruption scenarios
   - Missing realm ID in registry
   - Corrupted world state JSON
   - Realm path no longer exists (moved/deleted)
   - Git repository state changed (force push, branch deleted)

**Current Code (lines 332-336):**
```typescript
} catch (err) {
  this.gamePhase = 'onboarding';
  const message = err instanceof Error ? err.message : 'Failed to analyze repo';
  this.send(ws, { type: 'error', message });
}
```

**Testing Gaps:**
- ❌ No test verifies `gamePhase` is reset to 'onboarding' on error
- ❌ No test checks that error messages reach the client
- ❌ No test validates cleanup of partial state before error
- ❌ No test ensures subsequent `link-repo` attempts work after an error

---

#### **B. Agent Registration & External Agent Flow (Lines 162-187)**

**Risk Level:** MEDIUM
**Business Impact:** External Python agents cannot connect; WebSocket coordination breaks

**Untested Scenarios:**
1. **External Agent Registration** (`agent:register` message type)
   - Python agent connecting with custom ID and color
   - Multiple external agents registering simultaneously
   - Duplicate agent ID registration attempts
   - Agent registration during different game phases (onboarding vs playing)

2. **External Agent Disconnect Handling**
   - Agent socket closes unexpectedly
   - Multiple rapid connect/disconnect cycles
   - Agent disconnects during active session
   - Memory leaks from unreleased agent state

**Current Code (lines 162-187):**
```typescript
private handleAgentRegister(ws: WebSocket, msg: AgentRegisterMessage): void {
  const { agent_id, name, color } = msg;
  const agentColor = color ?? this.nextColor();
  const agent = this.worldState.addAgent(agent_id, name, agentColor, 'External', '/');

  this.agentSockets.set(agent_id, ws);
  // ... navigation state setup

  ws.on('close', () => {
    this.worldState.removeAgent(agent_id);
    this.agentSockets.delete(agent_id);
    // ... cleanup
  });
}
```

**Testing Gaps:**
- ❌ No test for `agent:register` message handling
- ❌ No test for external agent disconnect cleanup
- ❌ No test verifying `agent:joined` and `agent:left` broadcasts
- ❌ No test for color auto-assignment vs provided color
- ❌ No test for navigation state initialization

---

#### **C. Navigation System (Lines 798-1021)**

**Risk Level:** HIGH
**Business Impact:** Agents get stuck in folders, state corruption, client-server desync

**Untested Scenarios:**
1. **Agent Navigation** (`handleNavigateEnter`, `handleNavigateBack`)
   - Agent enters subfolder via `nav_door` object
   - Agent navigates back to parent folder
   - Navigation stack overflow (deep nesting)
   - Navigation while another agent is navigating
   - Invalid target paths
   - Missing map nodes

2. **Player Navigation** (`handlePlayerNavigateEnter`, `handlePlayerNavigateBack`)
   - Player manual navigation through folder tree
   - Player and agent in different folders simultaneously
   - Late-joining clients with active navigation state

3. **Edge Cases**
   - Agent disconnects mid-navigation (orphaned nav stack)
   - Map generation failure during navigation
   - Multiple agents navigating to same folder concurrently
   - Navigation before `repo:ready` (wrong game phase)

**Current Code (lines 885-928):**
```typescript
private handleNavigateEnter(agentId: string, targetPath: string): void {
  const ws = this.agentSockets.get(agentId);
  if (!ws || !agent) {
    console.warn(`[BridgeServer] nav:enter suppressed — agent ${agentId} has no registered socket`);
    return;  // SILENT FAILURE - not tested!
  }

  const node = this.worldState.getMapNode(targetPath);
  if (!node) return;  // ANOTHER SILENT FAILURE

  // Push onto nav stack
  const stack = this.agentNavStacks.get(agentId) ?? [];
  stack.push({ path: currentPath, returnPosition: { x: agent.x, y: agent.y } });
  // ... lazy map generation
}
```

**Testing Gaps:**
- ❌ No test for navigation triggering via `move_to_file` on nav objects
- ❌ No test for `map:change` message sent only to navigating client
- ❌ No test for nav stack push/pop correctness
- ❌ No test for lazy map generation on first folder entry
- ❌ No test for `broadcastPresence()` after navigation
- ❌ No test for invalid target paths or missing nodes
- ❌ No test for agent without registered socket (orphaned state)

---

#### **D. Realm Management (Lines 527-653)**

**Risk Level:** MEDIUM
**Business Impact:** Cannot resume previous sessions; registry corruption

**Untested Scenarios:**
1. **List Realms** (`player:list-realms`)
   - Empty realm registry (first-time user)
   - Git commit counting failures
   - Realms pointing to deleted directories
   - Concurrent realm list requests

2. **Resume Realm** (`player:resume-realm`)
   - Resume non-existent realm ID
   - Resume realm with missing world state
   - Resume realm whose git repo has diverged
   - Resume while another realm is active

3. **Remove Realm** (`player:remove-realm`)
   - Remove non-existent realm
   - Remove currently active realm
   - Persistence cleanup validation

**Current Code (lines 551-646):**
```typescript
private async handleResumeRealm(ws: WebSocket, msg: ResumeRealmMessage): Promise<void> {
  const realm = this.realmRegistry.getRealm(msg.realm_id);
  if (!realm) {
    this.send(ws, { type: 'error', message: `Realm "${msg.realm_id}" not found` });
    return;
  }

  const savedState = await this.worldStatePersistence.load(msg.realm_id);
  if (!savedState) {
    this.send(ws, { type: 'error', message: 'No saved state for this realm. Try re-scanning.' });
    this.gamePhase = 'onboarding';  // Is this cleanup tested?
    return;
  }
  // ... state restoration
}
```

**Testing Gaps:**
- ❌ No test for `player:list-realms` message
- ❌ No test for `player:resume-realm` with valid realm
- ❌ No test for resume with missing realm ID
- ❌ No test for resume with corrupted state
- ❌ No test for `player:remove-realm`
- ❌ No test for realm registry persistence
- ❌ No test for `realm:tree` broadcast after resume

---

#### **E. Multi-Agent Spawning (Lines 383-458)**

**Risk Level:** HIGH
**Business Impact:** Oracle cannot summon specialists; max agent limit not enforced

**Untested Scenarios:**
1. **Agent Spawn Requests** (from `SummonAgent` tool)
   - Oracle requests specialist spawn
   - Spawn request when at max agent limit
   - Spawn request with duplicate agent name
   - Concurrent spawn requests
   - Spawn request with invalid realm path

2. **Map Rebuilding** (`rebuildAgentMap`)
   - Map regeneration when new agent joins
   - Agent position assignment in multi-room layout
   - Oracle always in first room

**Current Code (lines 383-458):**
```typescript
private async spawnRequestedAgent(request: {
  requestingAgent: string;
  name: string;
  // ...
}): Promise<void> {
  if (!this.repoPath) return;  // Silent failure - NOT TESTED

  const activeCount = this.sessionManager.getActiveAgentIds().length;
  if (activeCount >= this.settings.max_agents) {
    console.log(`[Bridge] Spawn denied: max agents (${this.settings.max_agents}) reached`);
    this.broadcast({
      type: 'agent:activity',
      agent_id: request.requestingAgent,
      activity: `Spawn request denied: max agents reached`,
    });
    return;  // Max limit enforcement - NOT TESTED
  }

  // ... agent ID generation, duplicate check
}
```

**Testing Gaps:**
- ❌ No test for `spawnRequestedAgent` triggered by tool handler
- ❌ No test for max agent limit enforcement
- ❌ No test for spawn request denial notification
- ❌ No test for duplicate agent ID rejection
- ❌ No test for `agent:spawn-request` broadcast
- ❌ No test for map rebuild when agent joins
- ❌ No test for agent room position assignment

---

#### **F. Session Manager Event Wiring (Lines 690-784)**

**Risk Level:** MEDIUM
**Business Impact:** Missing agent status updates, findings not broadcast

**Untested Scenarios:**
1. **Agent Lifecycle Events**
   - `agent:complete` - agent finishes task
   - `agent:idle` - agent waiting for work
   - `agent:dismissed` - agent shut down
   - `agent:error` - agent encounters error

2. **Tool Handler Events**
   - `summon:request` → spawn new agent
   - `findings:posted` → broadcast to all clients
   - `knowledge:updated` → send level-up notification
   - `quest:claimed` / `quest:completed` → update broadcasts

**Current Code (lines 736-754):**
```typescript
private wireToolHandlerEvents(): void {
  this.toolHandler.on('summon:request', (request: any) => {
    this.spawnRequestedAgent(request).catch((err) => {
      console.error('[Bridge] Failed to spawn requested agent:', err);
    });
  });

  this.toolHandler.on('findings:posted', (data: any) => {
    this.broadcast({
      type: 'findings:posted',
      agent_id: data.agentId,
      // ...
    });
  });
  // ... other event handlers
}
```

**Testing Gaps:**
- ❌ No test for session manager event wire-up
- ❌ No test for tool handler event wire-up
- ❌ No test for `findings:posted` broadcast
- ❌ No test for `agent:level-up` broadcast
- ❌ No test for quest update broadcasts
- ❌ No test for agent error propagation

---

#### **G. Server Shutdown (Lines 1058-1076)**

**Risk Level:** LOW
**Business Impact:** Port not released; orphaned agent sessions

**Untested Scenarios:**
1. **Graceful Shutdown** (`close()` method)
   - Dismiss all active agents
   - Close all WebSocket connections
   - Release server port
   - Shutdown during active operations

**Current Code (lines 1058-1076):**
```typescript
async close(): Promise<void> {
  console.log('[Bridge] Shutting down...');

  if (this.sessionManager) {
    const ids = this.sessionManager.getActiveAgentIds();
    await Promise.allSettled(ids.map((id) => this.sessionManager.dismissAgent(id)));
  }

  for (const ws of this.allSockets) {
    ws.terminate();
  }
  this.allSockets.clear();

  await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  console.log('[Bridge] Server closed.');
}
```

**Testing Gaps:**
- ❌ No test for `close()` method
- ❌ No test for agent session cleanup during shutdown
- ❌ No test for WebSocket termination
- ❌ No test for port release verification

---

### 1.2 WebSocket Message Ordering Issues

**Risk Level:** HIGH
**Business Impact:** Race conditions, state desync, message loss

**Untested Scenarios:**

1. **Concurrent Operations**
   - Client sends `player:link-repo` while previous analysis is running
   - Multiple clients send `player:command` simultaneously
   - Agent spawns while repo is being linked
   - Navigation triggered during agent spawn

2. **Message Burst Scenarios**
   - Rapid `player:command` messages before agent responds
   - Multiple `agent:register` messages in quick succession
   - Broadcast storm when many agents move simultaneously

3. **Async Operation Ordering**
   - `spawnOracle()` completes before `repo:ready` broadcast?
   - Session manager spawn vs. map generation timing
   - Persistence saves racing with state updates

**Testing Gaps:**
- ❌ No test for concurrent message handling
- ❌ No test for message order preservation
- ❌ No test for async operation sequencing
- ❌ No test for broadcast ordering

---

### 1.3 Recommended Test Cases for BridgeServer

#### **Priority 1: Critical Error Paths**

```typescript
describe('BridgeServer error handling', () => {
  it('handles GitHub URL 404 gracefully', async () => {
    // Mock RepoAnalyzer to throw 404 error
    // Verify error message sent to client
    // Verify gamePhase reset to 'onboarding'
    // Verify partial state cleaned up
  });

  it('handles local path permission denied', async () => {
    // Mock fs.readdir to throw EACCES
    // Verify error message
    // Verify server still functional after error
  });

  it('handles realm resume with missing state', async () => {
    // Registry has realm but no saved world state
    // Verify error message suggests re-scanning
    // Verify gamePhase reset
  });

  it('handles navigation to invalid path', async () => {
    // Agent moves to nav_door with bad targetPath
    // Verify silent failure doesn't crash server
    // Verify agent state remains consistent
  });
});
```

#### **Priority 2: External Agent Integration**

```typescript
describe('external agent registration', () => {
  it('registers Python agent via agent:register', async () => {
    // Send agent:register message
    // Verify agent added to world state
    // Verify agent:joined broadcast
    // Verify color assignment
  });

  it('cleans up on external agent disconnect', async () => {
    // Register agent, then close WebSocket
    // Verify agent removed from world state
    // Verify agent:left broadcast
    // Verify navigation state cleaned up
  });

  it('handles duplicate agent ID registration', async () => {
    // Register agent "test-agent"
    // Attempt to register another "test-agent"
    // Verify second registration handled gracefully
  });
});
```

#### **Priority 3: Navigation System**

```typescript
describe('agent navigation', () => {
  it('agent enters subfolder via nav_door', async () => {
    // Setup: agent at position with nav_door object
    // Trigger move to nav_door position
    // Verify nav stack pushed
    // Verify map:change sent to agent socket only
    // Verify broadcastPresence() called
  });

  it('agent navigates back to parent folder', async () => {
    // Setup: agent in subfolder (nav stack has entry)
    // Trigger move to nav_back object
    // Verify nav stack popped
    // Verify map:change with correct return position
  });

  it('generates folder map lazily on first entry', async () => {
    // Navigate to folder without cached map
    // Verify generateFolderMap() called
    // Verify map cached on node
    // Second navigation doesn't regenerate
  });

  it('handles navigation with no registered socket', async () => {
    // Remove agent socket from agentSockets map
    // Trigger navigation
    // Verify silent failure (warning logged)
    // Verify no crash or exception
  });
});
```

#### **Priority 4: Multi-Agent Coordination**

```typescript
describe('multi-agent spawning', () => {
  it('enforces max agent limit', async () => {
    // Set max_agents to 2
    // Spawn oracle, spawn specialist #1
    // Attempt spawn specialist #2 (should be denied)
    // Verify denial notification broadcast
  });

  it('spawns specialist from SummonAgent tool', async () => {
    // Setup: oracle active
    // Emit 'summon:request' from tool handler
    // Verify new agent added to world state
    // Verify agent:spawn-request broadcast
    // Verify session spawned
  });

  it('rebuilds agent map when new agent joins', async () => {
    // Spawn oracle, then specialist
    // Verify map regenerated with 2 rooms
    // Verify agent positions assigned correctly
    // Verify oracle always in first room
  });
});
```

#### **Priority 5: Realm Management**

```typescript
describe('realm management', () => {
  it('lists realms with git change counts', async () => {
    // Setup: registry with 2 realms
    // Send player:list-realms
    // Verify realm:list response
    // Verify changesSinceLastScan calculated
  });

  it('resumes realm with saved state', async () => {
    // Setup: saved realm and world state
    // Send player:resume-realm
    // Verify world state restored
    // Verify quests reloaded
    // Verify oracle respawned
    // Verify repo:ready broadcast
  });

  it('removes realm and cleans up persistence', async () => {
    // Setup: realm in registry
    // Send player:remove-realm
    // Verify realm removed from registry
    // Verify world state file deleted
    // Verify realm:removed response
  });
});
```

#### **Priority 6: Message Ordering & Concurrency**

```typescript
describe('concurrent operations', () => {
  it('handles concurrent player:command messages', async () => {
    // Setup: oracle active
    // Send 5 player:command messages rapidly
    // Verify all commands queued and delivered
    // Verify no message loss
    // Verify responses in correct order
  });

  it('handles link-repo during active session', async () => {
    // Link repo #1, wait for oracle spawn
    // Immediately send link-repo #2
    // Verify cleanup of session #1
    // Verify session #2 initializes cleanly
  });

  it('handles late client connection during gameplay', async () => {
    // Link repo, spawn oracle
    // Connect new client
    // Verify world:state snapshot sent immediately
    // Verify client receives subsequent broadcasts
  });
});
```

---

## Part 2: RpgMcpServer.ts Analysis

### 2.1 Current Coverage: 7.14%

**What's Tested:**
- ✅ Server config shape (`type: 'sdk'`, `name: 'rpg'`)
- ✅ Unique instance creation per agent

**What's NOT Tested (93% of the file):**
- ❌ Tool definition schemas (lines 20-124)
- ❌ Tool execution via `handleToolCall` (lines 31-122)
- ❌ Result formatting with `makeResult()` (line 11)
- ❌ Error propagation from CustomToolHandler
- ❌ All 6 tool implementations (SummonAgent, RequestHelp, PostFindings, UpdateKnowledge, ClaimQuest, CompleteQuest)

### 2.2 Untested Code Paths

#### **A. Tool Execution Paths**

**Risk Level:** HIGH
**Business Impact:** Agents cannot use custom tools; tool errors invisible

**Untested Scenarios:**

1. **SummonAgent Tool (lines 30-37)**
   - Agent calls SummonAgent with valid parameters
   - CustomToolHandler returns success
   - Result formatted as MCP response
   - Error from CustomToolHandler propagates

2. **RequestHelp Tool (lines 47-54)**
   - Agent requests help from another agent
   - Handler emits help:request event
   - Result returned to agent

3. **PostFindings Tool (lines 65-72)**
   - Agent posts finding to board
   - Async save operation completes
   - Finding ID returned to agent
   - Save failure handled

4. **UpdateKnowledge Tool (lines 84-89)**
   - Agent updates personal vault
   - Vault not found scenario
   - Async save completes
   - Optional `amount` parameter

5. **ClaimQuest Tool (lines 100-106)**
   - Agent claims open quest
   - Quest not found or already claimed
   - Quest update broadcast

6. **CompleteQuest Tool (lines 116-122)**
   - Agent completes quest
   - Optional outcome parameter
   - Vault task history update
   - Quest state transition validation

**Current Code (lines 30-37 - SummonAgent example):**
```typescript
tool(
  'SummonAgent',
  'Request a new specialist agent when this work exceeds your capacity.',
  { /* zod schema */ },
  async (args) => {
    const result = await toolHandler.handleToolCall({
      tool_name: 'SummonAgent',
      tool_input: args as Record<string, unknown>,
      agent_id: agentId,
    });
    return makeResult(result.result);  // UNTESTED
  },
),
```

#### **B. Error Handling & Edge Cases**

**Risk Level:** MEDIUM
**Business Impact:** Silent failures, confusing error messages to agents

**Untested Scenarios:**

1. **makeResult() Formatting**
   - Correct MCP response structure
   - JSON serialization of complex objects
   - Handling of undefined/null results

2. **Async Error Propagation**
   - CustomToolHandler throws error
   - Async operation timeout
   - Promise rejection handling

3. **Schema Validation**
   - Invalid parameter types (Zod should catch)
   - Missing required parameters
   - Extra unexpected parameters

### 2.3 Recommended Test Cases for RpgMcpServer

#### **Priority 1: Tool Execution Integration**

```typescript
describe('RpgMcpServer tool execution', () => {
  let toolHandler: CustomToolHandler;
  let mcpServer: any;

  beforeEach(() => {
    toolHandler = new CustomToolHandler(/* mocked dependencies */);
    mcpServer = createRpgMcpServer('oracle', toolHandler);
  });

  it('executes SummonAgent tool successfully', async () => {
    const mockResult = { acknowledged: true, message: 'Spawn request submitted.' };
    vi.spyOn(toolHandler, 'handleToolCall').mockResolvedValue({ result: mockResult });

    const tool = mcpServer.instance.tools.find(t => t.name === 'SummonAgent');
    const result = await tool.handler({
      name: 'Test Specialist',
      role: 'Testing Expert',
      realm: '/tests',
      mission: 'Write tests',
      priority: 'high',
    });

    expect(result.content[0].text).toBe(JSON.stringify(mockResult));
    expect(toolHandler.handleToolCall).toHaveBeenCalledWith({
      tool_name: 'SummonAgent',
      tool_input: expect.objectContaining({ name: 'Test Specialist' }),
      agent_id: 'oracle',
    });
  });

  it('executes PostFindings tool with async save', async () => {
    const mockResult = { acknowledged: true, finding_id: 'finding_12345' };
    vi.spyOn(toolHandler, 'handleToolCall').mockResolvedValue({ result: mockResult });

    const tool = mcpServer.instance.tools.find(t => t.name === 'PostFindings');
    const result = await tool.handler({
      realm: '/server',
      finding: 'Found untested code',
      severity: 'high',
    });

    expect(result.content[0].text).toContain('finding_12345');
  });

  it('executes UpdateKnowledge with optional amount', async () => {
    const tool = mcpServer.instance.tools.find(t => t.name === 'UpdateKnowledge');

    // Test with amount
    await tool.handler({
      insight: 'Learned about coverage',
      area: 'testing',
      amount: 5,
    });

    // Test without amount (should default to 1 in CustomToolHandler)
    await tool.handler({
      insight: 'Another insight',
      area: 'typescript',
    });

    expect(toolHandler.handleToolCall).toHaveBeenCalledTimes(2);
  });

  it('executes CompleteQuest with optional outcome', async () => {
    const tool = mcpServer.instance.tools.find(t => t.name === 'CompleteQuest');

    // With outcome
    await tool.handler({
      quest_id: 'quest_1',
      outcome: 'Fixed all bugs',
    });

    // Without outcome
    await tool.handler({
      quest_id: 'quest_2',
    });
  });
});
```

#### **Priority 2: Error Handling**

```typescript
describe('RpgMcpServer error handling', () => {
  it('propagates errors from CustomToolHandler', async () => {
    const toolHandler = new CustomToolHandler(/* mocked */);
    vi.spyOn(toolHandler, 'handleToolCall').mockRejectedValue(
      new Error('Quest not found')
    );

    const mcpServer = createRpgMcpServer('oracle', toolHandler);
    const tool = mcpServer.instance.tools.find(t => t.name === 'ClaimQuest');

    await expect(tool.handler({ quest_id: 'invalid' })).rejects.toThrow('Quest not found');
  });

  it('handles CustomToolHandler returning error in result', async () => {
    const toolHandler = new CustomToolHandler(/* mocked */);
    vi.spyOn(toolHandler, 'handleToolCall').mockResolvedValue({
      result: { error: 'Cannot assign quest — not found or not open.' }
    });

    const mcpServer = createRpgMcpServer('oracle', toolHandler);
    const tool = mcpServer.instance.tools.find(t => t.name === 'ClaimQuest');
    const result = await tool.handler({ quest_id: 'invalid' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Cannot assign quest');
  });
});
```

#### **Priority 3: MCP Protocol Compliance**

```typescript
describe('RpgMcpServer MCP protocol', () => {
  it('returns correct content structure for all tools', async () => {
    const toolHandler = new CustomToolHandler(/* mocked */);
    vi.spyOn(toolHandler, 'handleToolCall').mockResolvedValue({
      result: { test: 'data' }
    });

    const mcpServer = createRpgMcpServer('oracle', toolHandler);

    for (const tool of mcpServer.instance.tools) {
      const result = await tool.handler({/* minimal valid params */});

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      // Verify text is valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    }
  });

  it('includes all 6 required tools', () => {
    const mcpServer = createRpgMcpServer('oracle', new CustomToolHandler(/* mocked */));
    const toolNames = mcpServer.instance.tools.map(t => t.name);

    expect(toolNames).toContain('SummonAgent');
    expect(toolNames).toContain('RequestHelp');
    expect(toolNames).toContain('PostFindings');
    expect(toolNames).toContain('UpdateKnowledge');
    expect(toolNames).toContain('ClaimQuest');
    expect(toolNames).toContain('CompleteQuest');
  });
});
```

---

## Part 3: Critical Edge Cases Summary

### Agent Session Management

**Untested Scenarios:**

1. **Session Lifecycle Edge Cases**
   - Agent spawned but never receives first message
   - Agent session crashes mid-execution
   - Concurrent dismiss + sendFollowUp on same agent
   - Agent completes while new command is queued

2. **Tool Call Timing**
   - Agent calls tool before session fully initialized
   - Multiple tool calls in rapid succession
   - Tool call during agent dismissal
   - Async tool completion after agent dismissed

3. **Transcript Logging**
   - Transcript logger fails to write (disk full)
   - Concurrent log writes for multiple agents
   - Log file rotation/size limits

### WebSocket Connection Management

**Untested Scenarios:**

1. **Connection Lifecycle**
   - Client connects during server shutdown
   - Multiple rapid connect/disconnect cycles
   - WebSocket ping/pong timeout
   - Half-open connections (network partition)

2. **Broadcast Edge Cases**
   - Broadcast while client list is being modified
   - Broadcast to client with readyState !== OPEN
   - Large broadcast payload (>1MB)
   - Broadcast backpressure (slow client)

### State Persistence

**Untested Scenarios:**

1. **File System Errors**
   - Disk full during realm save
   - Permission denied on .agent-rpg directory
   - Concurrent writes to same realm
   - Corrupted JSON recovery

2. **Git Operations**
   - Git repository not initialized
   - Detached HEAD state
   - Merge conflicts in tracked files
   - Submodule handling

---

## Part 4: Implementation Roadmap

### Phase 1: Critical Error Paths (Week 1)
**Goal:** Prevent crashes, ensure graceful degradation

- [ ] Error handling tests for `handleLinkRepo`
- [ ] Error handling tests for `handleResumeRealm`
- [ ] Navigation error path tests
- [ ] Agent spawn failure tests
- [ ] Server shutdown tests

**Success Metric:** BridgeServer branch coverage > 40%

### Phase 2: External Agent Integration (Week 2)
**Goal:** Enable Python agent coordination

- [ ] Agent registration tests
- [ ] Agent disconnect cleanup tests
- [ ] Multi-agent coordination tests
- [ ] Color assignment tests

**Success Metric:** External agent flow fully tested

### Phase 3: Navigation System (Week 2-3)
**Goal:** Validate folder navigation correctness

- [ ] Agent navigation enter/back tests
- [ ] Player navigation tests
- [ ] Lazy map generation tests
- [ ] Nav stack edge case tests
- [ ] Presence broadcast tests

**Success Metric:** Navigation code paths > 80% coverage

### Phase 4: RpgMcpServer Tool Execution (Week 3)
**Goal:** Validate tool integration with Claude SDK

- [ ] All 6 tool execution tests
- [ ] Error propagation tests
- [ ] MCP protocol compliance tests
- [ ] Async operation tests

**Success Metric:** RpgMcpServer > 90% coverage

### Phase 5: Concurrency & Message Ordering (Week 4)
**Goal:** Ensure system stability under load

- [ ] Concurrent operation tests
- [ ] Message ordering tests
- [ ] Race condition tests
- [ ] Broadcast storm handling

**Success Metric:** Load test suite passing, no race conditions detected

### Phase 6: Realm Management & Persistence (Week 4)
**Goal:** Validate session resume and state management

- [ ] List realms tests
- [ ] Resume realm tests
- [ ] Remove realm tests
- [ ] Persistence error tests
- [ ] Git state divergence tests

**Success Metric:** Realm management > 90% coverage

---

## Part 5: Testing Infrastructure Recommendations

### Test Helpers Needed

1. **MockSessionManager Extension**
   - Add error injection capabilities
   - Add timing control for async operations
   - Add event emission verification helpers

2. **WebSocket Test Client Enhancements**
   - Add message timing/ordering verification
   - Add concurrent connection simulation
   - Add slow client simulation (backpressure)

3. **Fixture Builders**
   - `createMockRealm()` - generate realm registry entries
   - `createMockWorldState()` - generate world state snapshots
   - `createMockMapNode()` - generate map trees
   - `createMockAgent()` - generate agent configs

4. **Test Utilities**
   - `waitForBroadcast(predicate)` - wait for specific broadcast
   - `simulateAgentSpawn()` - full spawn lifecycle
   - `simulateNavigation()` - enter/back sequence
   - `injectError(component, error)` - error injection

### Coverage Targets

| Component | Current | Target (Phase 6) | Critical Path Target |
|-----------|---------|------------------|----------------------|
| BridgeServer.ts | 36.61% | **85%** | **100%** (error paths) |
| RpgMcpServer.ts | 7.14% | **95%** | **100%** (all tools) |
| Overall Server | 68.13% | **88%** | N/A |

### CI/CD Enhancements

1. **Coverage Enforcement**
   - Add coverage ratcheting: never decrease coverage
   - Require 80% coverage on new files
   - Block PR if critical paths uncovered

2. **Test Categories**
   - Unit tests (fast, no I/O)
   - Integration tests (WebSocket, file I/O)
   - E2E tests (full system)
   - Load tests (concurrency, message ordering)

3. **Mutation Testing**
   - Use Stryker to validate test quality
   - Target: 70% mutation score

---

## Part 6: Key Insights for Knowledge Vault

1. **BridgeServer is a state machine** with 3 phases (onboarding, analyzing, playing). Error transitions between phases are completely untested, creating crash risk.

2. **Navigation system has silent failure modes** - agents can get stuck if sockets are orphaned or map nodes missing. Need defensive checks and recovery mechanisms.

3. **WebSocket message ordering** is implicit, not guaranteed. Concurrent operations (e.g., link-repo during active session) may cause state corruption. Need explicit ordering or operation locks.

4. **RpgMcpServer is a thin wrapper** but critical for agent-tool integration. 93% untested means agents may call tools and receive malformed responses without detection.

5. **External agent integration** (Python agents via `agent:register`) is completely untested despite being a key architectural feature. High risk of production issues.

6. **Max agent limit enforcement** exists in code but is never tested. Could fail silently or be bypassed.

7. **Realm persistence** has no error recovery tests. Disk full, permission errors, or corrupted JSON will crash the system or lose state.

8. **Event wiring** (session manager events, tool handler events) is never verified. If event handlers fail to attach, features will silently break.

---

## Conclusion

**Current State:** BridgeServer has extensive untested code paths (63% untested) with silent failure modes that could cause crashes, state corruption, or feature breakage. RpgMcpServer is almost entirely untested (93%), risking agent-tool integration failures.

**Recommended Action:** Prioritize Phase 1 (critical error paths) and Phase 4 (RpgMcpServer tools) to reduce crash risk and validate core agent functionality. Navigation and realm management can follow.

**Estimated Effort:** 4 weeks to reach 85% coverage with robust error handling tests and concurrency validation.

**Risk Mitigation:** Immediate focus on error handling prevents production crashes. Concurrent operation tests prevent data loss from race conditions.
