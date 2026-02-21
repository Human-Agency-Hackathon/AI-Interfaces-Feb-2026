# Agent Skills Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Skills" section to the AgentDetailsPanel showing expertise progress bars and MCP tool list.

**Architecture:** Extend `AgentDetailsMessage` with a `tools: string[]` field. Server derives tool list from agent session's `processContext`. Client renders a new collapsible section with two sub-sections: expertise bars (from existing `knowledge.expertise`) and tool names list.

**Tech Stack:** TypeScript, Vitest, Phaser 3 DOM overlays, CSS

---

### Task 1: Add `tools` field to protocol types

**Files:**
- Modify: `ha-agent-rpg/shared/protocol.ts:269-288`
- Modify: `ha-agent-rpg/server/src/types.ts:281-300`
- Modify: `ha-agent-rpg/client/src/types.ts:257-276`

**Step 1: Add `tools: string[]` to `AgentDetailsMessage` in `shared/protocol.ts`**

In `shared/protocol.ts`, find the `AgentDetailsMessage` interface (around line 269). Add `tools: string[]` after the `transcript` field:

```typescript
export interface AgentDetailsMessage {
  type: 'agent:details';
  agent_id: string;
  info: AgentInfo;
  knowledge: {
    expertise: Record<string, number>;
    insights: string[];
    task_history: Array<{ task: string; outcome: string; timestamp: string }>;
  };
  findings: Array<{
    id: string;
    finding: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
  }>;
  transcript: {
    thoughts: Array<{ text: string; timestamp: string }>;
    actions: Array<{ tool: string; input: string; timestamp: string }>;
  };
  tools: string[];
}
```

**Step 2: Mirror the same change in `server/src/types.ts`**

Find the `AgentDetailsMessage` interface (around line 281) and add `tools: string[]` after `transcript`.

**Step 3: Mirror the same change in `client/src/types.ts`**

Find the `AgentDetailsMessage` interface (around line 257) and add `tools: string[]` after `transcript`.

**Step 4: Verify type-checking passes**

Run: `cd ha-agent-rpg && npm run build -w server 2>&1 | tail -5`
Expected: Build will fail because `handleGetAgentDetails` in BridgeServer doesn't include `tools` yet. That's fine — this confirms the type is enforced. You'll see an error like `Property 'tools' is missing`.

**Step 5: Commit the protocol change**

```bash
cd ha-agent-rpg && git add shared/protocol.ts server/src/types.ts client/src/types.ts
git commit -m "feat: add tools field to AgentDetailsMessage protocol type"
```

---

### Task 2: Populate `tools` in server handler + add test

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts:272-330`
- Modify: `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts:384-414`

**Step 1: Write the failing test**

In `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts`, find the existing `player:get-agent-details` describe block (around line 384). Add a new test after the existing one that checks the `tools` field:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npx vitest run server/src/__tests__/BridgeServer.e2e.test.ts -t "returns tools array" 2>&1 | tail -20`
Expected: FAIL — `tools` is not in the response yet (TypeScript compilation error since the type requires it but `handleGetAgentDetails` doesn't supply it).

**Step 3: Implement the server change**

In `ha-agent-rpg/server/src/BridgeServer.ts`, find `handleGetAgentDetails` (line 272). Replace the `this.send(ws, {...})` call (lines 311-330) with:

```typescript
    // Derive tool list from agent's MCP server type
    const session = this.sessionManager?.getSession(agentId);
    const hasBrainstormTools = session?.config.processContext != null;
    const tools = session
      ? (hasBrainstormTools
        ? ['PostFindings', 'UpdateKnowledge', 'CompleteStage']
        : ['SummonAgent', 'RequestHelp', 'PostFindings', 'UpdateKnowledge', 'ClaimQuest', 'CompleteQuest'])
      : [];

    this.send(ws, {
      type: 'agent:details',
      agent_id: agentId,
      info: agentInfo,
      knowledge: knowledge ? {
        expertise: knowledge.expertise,
        insights: knowledge.insights,
        task_history: knowledge.task_history,
      } : { expertise: {}, insights: [], task_history: [] },
      findings: agentFindings.map((f) => ({
        id: f.id,
        finding: f.finding,
        severity: f.severity,
        timestamp: f.timestamp,
      })),
      transcript: {
        thoughts: thoughts.slice(-50),
        actions: actions.slice(-50),
      },
      tools,
    });
```

Key logic: if `sessionManager.getSession(agentId)` returns a session, check `config.processContext` to decide brainstorm vs RPG tools. If no session (externally-registered agent), return empty array.

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npx vitest run server/src/__tests__/BridgeServer.e2e.test.ts -t "returns tools array" 2>&1 | tail -10`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd ha-agent-rpg && npm run test -w server 2>&1 | tail -10`
Expected: All tests pass

**Step 6: Commit**

```bash
cd ha-agent-rpg && git add server/src/BridgeServer.ts server/src/__tests__/BridgeServer.e2e.test.ts
git commit -m "feat: populate tools array in agent:details response"
```

---

### Task 3: Add CSS for expertise bars and tool items

**Files:**
- Modify: `ha-agent-rpg/client/index.html:478-484`

**Step 1: Add new CSS classes**

In `ha-agent-rpg/client/index.html`, find the `.agent-details-loading` rule (around line 478). After it (before the `/* ── Chat Bubbles ── */` comment at line 486), add:

```css
    .agent-details-skills-subsection-label {
      font-family: monospace;
      font-size: 0.65rem;
      color: #8888aa;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.3rem 0 0.15rem;
    }
    .agent-details-expertise-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.15rem 0;
      font-family: monospace;
      font-size: 0.7rem;
      color: #ccccdd;
    }
    .agent-details-expertise-label {
      min-width: 80px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .agent-details-bar-container {
      flex: 1;
      height: 8px;
      background: #1a1a2e;
      border-radius: 4px;
      overflow: hidden;
    }
    .agent-details-bar-fill {
      height: 100%;
      background: #c45a20;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .agent-details-expertise-level {
      min-width: 20px;
      text-align: right;
      color: #8888aa;
      font-size: 0.65rem;
    }
    .agent-details-tool-item {
      font-family: monospace;
      font-size: 0.7rem;
      color: #ccccdd;
      padding: 0.1rem 0;
    }
    .agent-details-tool-item::before {
      content: '>';
      color: #b8860b;
      margin-right: 0.4rem;
      font-weight: bold;
    }
    .agent-details-empty {
      font-family: monospace;
      font-size: 0.7rem;
      color: #555566;
      padding: 0.2rem 0;
      font-style: italic;
    }
```

**Step 2: Verify client builds**

Run: `cd ha-agent-rpg && npm run build -w client 2>&1 | tail -5`
Expected: Build succeeds (CSS is just HTML, no TS impact yet).

**Step 3: Commit**

```bash
cd ha-agent-rpg && git add client/index.html
git commit -m "feat: add CSS for agent skills panel expertise bars and tool list"
```

---

### Task 4: Add skills section to AgentDetailsPanel

**Files:**
- Modify: `ha-agent-rpg/client/src/panels/AgentDetailsPanel.ts`

**Step 1: Add the `addSkillsSection` method**

In `ha-agent-rpg/client/src/panels/AgentDetailsPanel.ts`, add a new private method after `addSection()` (around line 167, before `formatTime`):

```typescript
  private addSkillsSection(
    expertise: Record<string, number>,
    tools: string[],
  ): void {
    const section = document.createElement('div');
    section.className = 'agent-details-section';

    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'agent-details-section-header';

    const titleSpan = document.createElement('span');
    const expertiseCount = Object.keys(expertise).length;
    titleSpan.textContent = 'Skills (' + (expertiseCount + tools.length) + ')';
    sectionHeader.appendChild(titleSpan);

    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'agent-details-section-toggle';
    toggleSpan.textContent = '\u25BC';
    sectionHeader.appendChild(toggleSpan);

    sectionHeader.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
    section.appendChild(sectionHeader);

    const body = document.createElement('div');
    body.className = 'agent-details-section-body';

    // Expertise sub-section
    const expertiseLabel = document.createElement('div');
    expertiseLabel.className = 'agent-details-skills-subsection-label';
    expertiseLabel.textContent = 'Expertise';
    body.appendChild(expertiseLabel);

    const entries = Object.entries(expertise).sort(([, a], [, b]) => b - a);
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-details-empty';
      empty.textContent = 'No expertise yet';
      body.appendChild(empty);
    } else {
      const maxLevel = entries[0][1]; // already sorted desc
      for (const [area, level] of entries) {
        const row = document.createElement('div');
        row.className = 'agent-details-expertise-row';

        const label = document.createElement('span');
        label.className = 'agent-details-expertise-label';
        label.textContent = area;
        label.title = area;
        row.appendChild(label);

        const barContainer = document.createElement('div');
        barContainer.className = 'agent-details-bar-container';
        const barFill = document.createElement('div');
        barFill.className = 'agent-details-bar-fill';
        barFill.style.width = Math.round((level / maxLevel) * 100) + '%';
        barContainer.appendChild(barFill);
        row.appendChild(barContainer);

        const levelSpan = document.createElement('span');
        levelSpan.className = 'agent-details-expertise-level';
        levelSpan.textContent = String(level);
        row.appendChild(levelSpan);

        body.appendChild(row);
      }
    }

    // Tools sub-section
    const toolsLabel = document.createElement('div');
    toolsLabel.className = 'agent-details-skills-subsection-label';
    toolsLabel.style.marginTop = '0.4rem';
    toolsLabel.textContent = 'Tools';
    body.appendChild(toolsLabel);

    if (tools.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-details-empty';
      empty.textContent = 'No tools assigned';
      body.appendChild(empty);
    } else {
      for (const toolName of tools) {
        const item = document.createElement('div');
        item.className = 'agent-details-tool-item';
        item.textContent = toolName;
        body.appendChild(item);
      }
    }

    section.appendChild(body);
    this.container.appendChild(section);
  }
```

**Step 2: Update `populateData` to call `addSkillsSection` first**

In the `populateData` method (around line 67), add the skills section call right after the header update and before the Findings section. Find the line `// Findings section` and add before it:

```typescript
    // Skills section (expertise bars + tools list)
    this.addSkillsSection(details.knowledge.expertise, details.tools);
```

**Step 3: Verify client builds**

Run: `cd ha-agent-rpg && npm run build -w client 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
cd ha-agent-rpg && git add client/src/panels/AgentDetailsPanel.ts
git commit -m "feat: add skills section with expertise bars and tools to AgentDetailsPanel"
```

---

### Task 5: Full verification and push

**Step 1: Run server tests**

Run: `cd ha-agent-rpg && npm run test -w server 2>&1 | tail -15`
Expected: All tests pass

**Step 2: Type-check both workspaces**

Run: `cd ha-agent-rpg && npm run build -w server 2>&1 | tail -5 && npm run build -w client 2>&1 | tail -5`
Expected: Both succeed

**Step 3: Push all commits**

```bash
git push origin main
```
