# MCP Tools Reference

Custom Model Context Protocol (MCP) tools available to agents in the Agent Dungeon system.

---

## Overview

Agents running via Claude Agent SDK have access to **6 custom MCP tools** in addition to standard SDK tools (Read, Edit, Write, Bash, Grep, Glob).

These tools enable:
- **Agent collaboration** (summoning specialists, requesting help)
- **Knowledge sharing** (posting findings, updating expertise)
- **Task management** (claiming and completing quests)

**Tool Namespace:** All custom tools are prefixed with `mcp__rpg__` when called by agents.

**Implementation:** `server/src/RpgMcpServer.ts` registers tools, `server/src/CustomToolHandler.ts` executes them.

---

## Tool Catalog

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `SummonAgent` | Request a new specialist agent | Work exceeds your capacity or expertise |
| `RequestHelp` | Ask another agent a question | Need specific knowledge from a teammate |
| `PostFindings` | Share discovery with team | Found important insight others should know |
| `UpdateKnowledge` | Save insight to personal vault | Learned something worth remembering |
| `ClaimQuest` | Self-assign a GitHub issue | Ready to work on a quest |
| `CompleteQuest` | Mark quest done | Finished work on a quest |

---

## 1. SummonAgent

Request a new specialist agent when the work exceeds your capacity.

### Parameters

```typescript
{
  name: string;        // Agent name (e.g., "Test Guardian")
  role: string;        // Agent role (e.g., "Testing & Quality Assurance Specialist")
  realm: string;       // Directory scope (e.g., "/client/src/")
  mission: string;     // Specific task description
  priority: 'low' | 'medium' | 'high';  // Urgency level
}
```

### Example Usage

```typescript
// Agent discovers client tests are minimal
await mcp__rpg__SummonAgent({
  name: "Test Guardian",
  role: "Testing & Quality Assurance Specialist",
  realm: "/ha-agent-rpg/client",
  mission: "Review client-side test coverage and write tests for GameScene, AgentSprite, and MapRenderer. Target 80% coverage.",
  priority: "high"
});
```

### Behavior

1. **Validation** - Server checks if max_agents limit reached
2. **Agent Session Created** - New Claude SDK session spawned with mission prompt
3. **Broadcast** - `spawn:request` message sent to all clients
4. **Visual Effect** - New agent appears in game at spawn position
5. **Knowledge Vault** - New agent gets empty vault initialized

### Best Practices

✅ **Do:**
- Be specific about the mission (what exactly should the agent do?)
- Choose realm carefully (narrow scope = focused work)
- Use descriptive role names (helps identify agent purpose later)
- Set priority based on actual urgency

❌ **Don't:**
- Summon agents for trivial tasks you can do yourself
- Use overly broad realms (e.g., "/" for a specific file fix)
- Summon duplicate specialists (check existing team first)
- Leave mission vague ("fix stuff" is not helpful)

### Common Patterns

**Pattern 1: Specialized Analysis**
```typescript
// Oracle identifies complex subsystem needing deep analysis
SummonAgent({
  name: "API Architect",
  role: "Backend API Specialist",
  realm: "/server/src/api/",
  mission: "Analyze REST API design, identify inconsistencies, suggest improvements based on OpenAPI best practices.",
  priority: "medium"
});
```

**Pattern 2: Parallel Work**
```typescript
// Split large codebase into zones
SummonAgent({ realm: "/client/", mission: "Analyze client architecture" });
SummonAgent({ realm: "/server/", mission: "Analyze server architecture" });
SummonAgent({ realm: "/shared/", mission: "Analyze protocol design" });
```

**Pattern 3: Skill-Based Delegation**
```typescript
// Oracle finds security issues
SummonAgent({
  name: "Security Sentinel",
  role: "Security & Vulnerability Specialist",
  realm: "/",
  mission: "Audit codebase for security vulnerabilities: SQL injection, XSS, auth bypass, secret leaks.",
  priority: "high"
});
```

---

## 2. RequestHelp

Ask another agent for help or information.

### Parameters

```typescript
{
  target_agent: string;  // Agent name or ID
  question: string;      // Your question
}
```

### Example Usage

```typescript
// Doc Scribe needs to know test coverage details
await mcp__rpg__RequestHelp({
  target_agent: "Test Guardian",
  question: "What is the current test coverage for GameScene.ts? Any critical gaps I should document?"
});
```

### Behavior

1. **Routing** - Server finds target agent's session
2. **Message Delivery** - Question appears in target agent's context
3. **Response** - Target agent responds via speak action or PostFindings
4. **Visual Effect** - Speech bubble appears over target agent

### Best Practices

✅ **Do:**
- Ask specific, answerable questions
- Target the right expert (check agent roles)
- Provide context if needed ("I'm working on X and need to know Y")

❌ **Don't:**
- Ask vague questions ("What do you think?")
- Spam multiple agents with same question
- Ask questions you can answer yourself with available tools

### Common Patterns

**Pattern 1: Expertise Query**
```typescript
// New agent needs domain knowledge
RequestHelp({
  target_agent: "The Oracle",
  question: "What are the 3 most critical files in the /server/ directory I should analyze first?"
});
```

**Pattern 2: Coordination**
```typescript
// Avoid duplicate work
RequestHelp({
  target_agent: "Code Sentinel",
  question: "Are you already analyzing BridgeServer.ts? I was planning to review it for documentation gaps."
});
```

**Pattern 3: Verification**
```typescript
// Sanity check findings
RequestHelp({
  target_agent: "API Architect",
  question: "I found that WebSocket messages lack schema validation. Is this intentional or a bug?"
});
```

---

## 3. PostFindings

Share an important discovery with the entire team.

### Parameters

```typescript
{
  realm: string;       // Directory or scope (e.g., "/client/src/scenes/")
  finding: string;     // Your discovery (detailed explanation)
  severity: 'low' | 'medium' | 'high';  // Impact level
}
```

### Example Usage

```typescript
// Doc Scribe identifies documentation gap
await mcp__rpg__PostFindings({
  realm: "/ha-agent-rpg",
  finding: "BRIEF.md is missing from docs/. This is a high-priority gap as it should contain project vision, goals, and design philosophy. Recommended to create 2-3 page overview covering motivation, use cases, and success criteria.",
  severity: "high"
});
```

### Behavior

1. **Storage** - Finding saved to `.agent-rpg/findings.json`
2. **Broadcast** - `findings:posted` message sent to all agents and clients
3. **Visual Effect** - Notification appears in findings panel UI
4. **Persistence** - Findings available to future agents in this repo

### Severity Guidelines

- **High** - Critical issues, blockers, security vulnerabilities, major architecture problems
- **Medium** - Bugs, code smells, missing features, moderate tech debt
- **Low** - Style issues, minor improvements, suggestions, observations

### Best Practices

✅ **Do:**
- Be specific and actionable (what exactly is the issue/discovery?)
- Include location information (file paths, line numbers)
- Suggest solutions when possible
- Use appropriate severity

❌ **Don't:**
- Post trivial observations as high severity
- Duplicate findings (check board first)
- Use findings for chat (use speak action instead)
- Post without context ("There's a bug" - where? what bug?)

### Common Patterns

**Pattern 1: Architecture Discovery**
```typescript
PostFindings({
  realm: "/",
  finding: "Server uses in-process MCP server pattern (RpgMcpServer.ts) instead of stdio/SSE. This is excellent for low latency but limits agent language options to TypeScript/JavaScript only.",
  severity: "medium"
});
```

**Pattern 2: Bug Report**
```typescript
PostFindings({
  realm: "/server/src/",
  finding: "BridgeServer.ts line 742: Race condition in agent spawn handling. If two agents summon simultaneously, agentColorIndex can overflow AGENT_COLORS array. Fix: use modulo operator.",
  severity: "high"
});
```

**Pattern 3: Test Coverage Gap**
```typescript
PostFindings({
  realm: "/client/src/",
  finding: "Client test coverage is minimal (only WebSocketClient.test.ts exists). GameScene.ts, AgentSprite.ts, MapRenderer.ts have 0% coverage. High priority for Test Guardian.",
  severity: "high"
});
```

**Pattern 4: Documentation Gap**
```typescript
PostFindings({
  realm: "/docs/",
  finding: "MCP tools lack usage documentation. Agents need examples of SummonAgent, PostFindings, UpdateKnowledge. Creating docs/MCP_TOOLS.md recommended.",
  severity: "medium"
});
```

---

## 4. UpdateKnowledge

Save an insight to your personal knowledge vault for future sessions.

### Parameters

```typescript
{
  insight: string;       // What you learned
  area: string;          // Knowledge area (e.g., "Architecture", "Testing")
  amount?: number;       // Optional: expertise gained (default: 1)
}
```

### Example Usage

```typescript
// Doc Scribe learns about project architecture
await mcp__rpg__UpdateKnowledge({
  insight: "Agent Dungeon uses three-tier architecture: Bridge Server (WebSocket hub), Phaser Client (pure renderer), Python Agents (autonomous via Claude SDK). All game logic server-side prevents desync.",
  area: "Architecture",
  amount: 3
});
```

### Behavior

1. **Storage** - Insight saved to `.knowledge/agents/<agent_id>.md`
2. **Expertise Update** - `area` expertise level incremented by `amount`
3. **Broadcast** - `agent:level-up` message if expertise threshold crossed
4. **Persistence** - Knowledge available when agent resumes in future session

### Knowledge Areas (Common)

- `Architecture` - System design, component relationships
- `Testing` - Test patterns, coverage, quality assurance
- `Documentation` - Docs quality, style, completeness
- `Security` - Vulnerabilities, auth, permissions
- `Performance` - Optimization, bottlenecks, profiling
- `API Design` - REST, WebSocket, protocol design
- `DevOps` - CI/CD, deployment, monitoring
- `Code Quality` - Style, patterns, best practices

### Best Practices

✅ **Do:**
- Save insights you'll need in future sessions
- Use consistent area names (check existing expertise)
- Be specific (good: "Phaser uses scene system", bad: "client stuff")
- Set amount based on depth of learning (1=basic, 5=mastery)

❌ **Don't:**
- Save trivial facts ("there's a file called README.md")
- Create too many areas (consolidate: "UI" instead of "ButtonUI", "FormUI", etc.)
- Overestimate amount (don't claim 5 points for reading one file)

### Common Patterns

**Pattern 1: Tool Discovery**
```typescript
UpdateKnowledge({
  insight: "Server uses vitest + tsx for testing. Tests in __tests__/ directories. Run with 'npm test', watch mode with 'npm run test:watch'. Coverage thresholds enforced in CI.",
  area: "Testing",
  amount: 2
});
```

**Pattern 2: Protocol Understanding**
```typescript
UpdateKnowledge({
  insight: "WebSocket protocol defined in shared/protocol.ts. All messages have 'type' field. Server validates actions before broadcasting. Turn-based system with 5s timeout.",
  area: "API Design",
  amount: 3
});
```

**Pattern 3: Codebase Navigation**
```typescript
UpdateKnowledge({
  insight: "Key server files: BridgeServer.ts (1092 lines, WebSocket hub), WorldState.ts (game state), AgentSessionManager.ts (Claude SDK integration), CustomToolHandler.ts (MCP tools). Client entry: main.ts → GameScene.ts.",
  area: "Architecture",
  amount: 2
});
```

---

## 5. ClaimQuest

Self-assign a GitHub issue to work on.

### Parameters

```typescript
{
  quest_id: string;  // GitHub issue number or ID
}
```

### Example Usage

```typescript
// Doc Scribe claims documentation quest
await mcp__rpg__ClaimQuest({
  quest_id: "42"  // GitHub issue #42
});
```

### Behavior

1. **Quest Lookup** - Server finds quest in QuestManager
2. **Assignment** - Quest `assigned_to` field updated with agent ID
3. **Status Change** - Quest status → `in_progress`
4. **Broadcast** - `quest:update` message sent to all clients
5. **Visual Effect** - Quest marker updates in UI

### Best Practices

✅ **Do:**
- Claim quests that match your role and expertise
- Check quest priority and difficulty before claiming
- Review quest description to ensure you understand requirements

❌ **Don't:**
- Claim multiple quests simultaneously (focus on one)
- Claim quests outside your realm without coordination
- Claim high-difficulty quests without relevant expertise

### Common Patterns

**Pattern 1: Specialist Claims Related Quest**
```typescript
// Test Guardian sees quest for adding tests
ClaimQuest({ quest_id: "23" });  // Issue: "Add tests for GameScene"
```

**Pattern 2: Oracle Triages and Delegates**
```typescript
// Oracle identifies quest needs specialist
PostFindings({
  realm: "/",
  finding: "Quest #42 (fix auth bug) requires Security Sentinel. Summoning specialist.",
  severity: "medium"
});
SummonAgent({
  name: "Security Sentinel",
  role: "Security Specialist",
  realm: "/server/src/auth/",
  mission: "Fix authentication bypass bug described in issue #42. Review auth middleware, add tests."
});
// Security Sentinel will claim quest after spawn
```

---

## 6. CompleteQuest

Mark a quest as done with a summary of what you accomplished.

### Parameters

```typescript
{
  quest_id: string;  // GitHub issue number
  outcome: string;   // Summary of work done
}
```

### Example Usage

```typescript
// Doc Scribe finishes documentation quest
await mcp__rpg__CompleteQuest({
  quest_id: "42",
  outcome: "Created comprehensive MCP_TOOLS.md with usage examples for all 6 tools. Added best practices, common patterns, and anti-patterns. Linked from CONTRIBUTING.md."
});
```

### Behavior

1. **Status Update** - Quest status → `completed`
2. **GitHub Integration** - (Future) Adds comment to issue, applies label
3. **Broadcast** - `quest:update` message sent to all clients
4. **Visual Effect** - Quest marker turns green, moves to "Completed" section
5. **Transcript** - Outcome logged in session transcript

### Best Practices

✅ **Do:**
- Provide detailed outcome summary (what was done, how, what changed)
- Include file paths, PR numbers, commit SHAs when relevant
- Mention any blockers or partial completion
- Reference related findings if applicable

❌ **Don't:**
- Complete quest without actually doing the work
- Provide vague outcomes ("fixed it" - what did you fix? how?)
- Complete without verifying (run tests, check builds)

### Common Patterns

**Pattern 1: Code Fix Quest**
```typescript
CompleteQuest({
  quest_id: "23",
  outcome: "Fixed authentication bypass in server/src/auth/middleware.ts line 47. Added null check for req.user. Wrote regression test in __tests__/auth.test.ts. All tests passing. Ready for review."
});
```

**Pattern 2: Feature Quest**
```typescript
CompleteQuest({
  quest_id: "56",
  outcome: "Implemented dark mode toggle in client. Added ThemeManager.ts, updated BootScene to generate dark textures, added toggle button in UIScene. Tested in Chrome/Firefox. Screenshots in PR #89."
});
```

**Pattern 3: Documentation Quest**
```typescript
CompleteQuest({
  quest_id: "42",
  outcome: "Documented all 6 MCP tools in docs/MCP_TOOLS.md (2500 words). Includes parameters, examples, best practices, and common patterns. Added to CONTRIBUTING.md task guide. Reviewed by Oracle."
});
```

---

## Tool Execution Flow

### 1. Agent Calls Tool

Agent's Claude SDK session decides to use a tool:

```typescript
// Agent's reasoning (internal)
"I need to share this critical finding with the team. I'll use PostFindings."

// Tool call generated by SDK
{
  tool_name: "mcp__rpg__PostFindings",
  tool_input: {
    realm: "/docs/",
    finding: "BRIEF.md is missing...",
    severity: "high"
  }
}
```

### 2. Server Receives Tool Call

`AgentSessionManager` receives tool call from SDK session:

```typescript
// EventTranslator picks up tool use event
onToolUse((event) => {
  const call = {
    tool_name: event.tool_name,
    tool_input: event.tool_input,
    agent_id: session.config.agentId
  };

  // Forward to CustomToolHandler
  const result = await customToolHandler.handleToolCall(call);
});
```

### 3. CustomToolHandler Executes

`CustomToolHandler.ts` dispatches to specific handler:

```typescript
switch (tool_name) {
  case 'PostFindings':
    return this.handlePostFindings(agent_id, tool_input);
  // ...
}

handlePostFindings(agentId, input) {
  const finding = {
    finding_id: generateId(),
    agent_id: agentId,
    agent_name: this.getAgentName(agentId),
    realm: input.realm,
    finding: input.finding,
    severity: input.severity,
    timestamp: new Date().toISOString()
  };

  // Save to findings board
  this.findingsBoard.add(finding);

  // Emit event for BridgeServer to broadcast
  this.emit('findings:posted', finding);

  return { result: { success: true, finding_id: finding.finding_id } };
}
```

### 4. Server Broadcasts

`BridgeServer` picks up event and broadcasts:

```typescript
customToolHandler.on('findings:posted', (finding) => {
  this.broadcast({
    type: 'findings:posted',
    ...finding
  });
});
```

### 5. Client Displays

Game client receives broadcast and updates UI:

```typescript
wsClient.on('findings:posted', (msg) => {
  findingsPanel.addFinding(msg);
  // Show notification
  // Play sound effect
  // Update findings count badge
});
```

---

## Debugging Tool Calls

### Enable Debug Logging

```bash
# Server-side
DEBUG=agent-rpg:tools npm run dev:server
```

### Check Tool Execution

Tool results appear in agent session transcripts:

```
.agent-rpg/transcripts/<agent_id>_<timestamp>.json
```

Look for:
```json
{
  "event": "tool_use",
  "tool_name": "mcp__rpg__PostFindings",
  "tool_input": { "realm": "/", "finding": "...", "severity": "high" },
  "timestamp": "2026-02-21T10:30:00Z"
},
{
  "event": "tool_result",
  "tool_use_id": "toolu_123",
  "result": { "success": true, "finding_id": "finding_456" },
  "timestamp": "2026-02-21T10:30:01Z"
}
```

### Common Issues

**Tool Not Found**
- Check tool name spelling (case-sensitive, must be exact)
- Verify tool is registered in `RpgMcpServer.ts`
- Check MCP server is passed to SDK options

**Tool Fails with Error**
- Check input params match schema (see tool definitions)
- Verify required fields are present
- Check server logs for handler errors

**Tool Succeeds but No Visual Effect**
- Check BridgeServer is listening for tool events
- Verify broadcast is happening (check WebSocket messages)
- Check client has handler for message type

---

## Best Practices Summary

### When to Use Which Tool

| Situation | Tool | Why |
|-----------|------|-----|
| Found important bug | `PostFindings` | Team needs to know |
| Task is too large | `SummonAgent` | Need specialist help |
| Need specific info | `RequestHelp` | Faster than exploring yourself |
| Learned something useful | `UpdateKnowledge` | Remember for next time |
| Ready to work on issue | `ClaimQuest` | Signal you're on it |
| Finished issue work | `CompleteQuest` | Close the loop |

### Tool Composition Patterns

**Pattern: Research → Share → Delegate**
```typescript
// 1. Learn something (self)
UpdateKnowledge({ insight: "...", area: "Testing" });

// 2. Share with team
PostFindings({ finding: "Test coverage is 30%", severity: "high" });

// 3. Summon specialist
SummonAgent({
  name: "Test Guardian",
  mission: "Improve test coverage to 80%"
});
```

**Pattern: Coordinate Before Acting**
```typescript
// 1. Check if someone else is working on it
RequestHelp({
  target_agent: "Code Sentinel",
  question: "Are you analyzing BridgeServer.ts?"
});

// 2. If clear, claim quest
ClaimQuest({ quest_id: "42" });

// 3. Do work, then complete
CompleteQuest({ quest_id: "42", outcome: "..." });
```

---

## Tool Schema Reference

Full TypeScript schemas available in `server/src/RpgMcpServer.ts`:

```typescript
const TOOL_DEFINITIONS = [
  {
    name: 'SummonAgent',
    description: 'Request a new specialist agent when work exceeds your capacity',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        role: { type: 'string', description: 'Agent role' },
        realm: { type: 'string', description: 'Directory scope' },
        mission: { type: 'string', description: 'Specific task' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] }
      },
      required: ['name', 'role', 'realm', 'mission', 'priority']
    }
  },
  // ... other tools
];
```

---

## Future Tool Ideas

Planned tools for future releases:

- `ProposeArchitecture` - Suggest architectural changes with diagrams
- `RunBenchmark` - Execute performance tests, post results
- `ReviewPR` - Automated code review of pull requests
- `SuggestRefactor` - Identify code smells, propose improvements
- `ExplainCode` - Generate explanations for complex code sections

---

*Last updated: 2026-02-21 by Doc Scribe*
