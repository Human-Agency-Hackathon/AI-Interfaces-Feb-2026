# Agent History Sidebar Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clicking an agent sprite opens a sidebar panel showing that agent's history: findings, insights, actions (tool calls), and thoughts — pulled from FindingsBoard, KnowledgeVault, and TranscriptLogger.

**Architecture:** Extend the existing `agent:details` protocol message to include categorized transcript data (thoughts + actions). Add a `readTranscript()` method to TranscriptLogger. Create a new AgentDetailsPanel DOM overlay in the client sidebar with 4 collapsible sections. Wire the GameScene click handler through WebSocket to populate the panel.

**Tech Stack:** TypeScript, Vitest, Phaser 3 (DOM overlay), WebSocket, JSONL file I/O

**Design doc:** `docs/plans/2026-02-21-agent-history-panel-design.md`

---

### Task 1: Add `readTranscript()` to TranscriptLogger (TDD)

**Files:**
- Modify: `ha-agent-rpg/server/src/TranscriptLogger.ts`
- Create: `ha-agent-rpg/server/src/__tests__/TranscriptLogger.test.ts`

**Step 1: Write the failing test**

Create `ha-agent-rpg/server/src/__tests__/TranscriptLogger.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranscriptLogger } from '../TranscriptLogger.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('TranscriptLogger', () => {
  let tempDir: string;
  let logger: TranscriptLogger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'transcript-test-'));
    logger = new TranscriptLogger(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readTranscript', () => {
    it('returns empty array when no logs exist', async () => {
      const entries = await logger.readTranscript('nonexistent-agent');
      expect(entries).toEqual([]);
    });

    it('returns logged entries in order', async () => {
      await logger.log('agent-1', { type: 'assistant', text: 'hello' });
      await logger.log('agent-1', { type: 'stream_event', data: 'chunk' });

      const entries = await logger.readTranscript('agent-1');
      expect(entries).toHaveLength(2);
      expect(entries[0].agent_id).toBe('agent-1');
      expect(entries[0].message).toEqual({ type: 'assistant', text: 'hello' });
      expect(entries[1].message).toEqual({ type: 'stream_event', data: 'chunk' });
      expect(entries[0].timestamp).toBeDefined();
    });

    it('only returns entries for the requested agent', async () => {
      await logger.log('agent-1', { type: 'assistant', text: 'from agent 1' });
      await logger.log('agent-2', { type: 'assistant', text: 'from agent 2' });

      const entries = await logger.readTranscript('agent-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toEqual({ type: 'assistant', text: 'from agent 1' });
    });

    it('handles malformed JSONL lines gracefully', async () => {
      // Log one valid entry, then manually corrupt the file
      await logger.log('agent-1', { type: 'assistant', text: 'valid' });

      const { appendFile } = await import('node:fs/promises');
      const dateStr = new Date().toISOString().split('T')[0];
      const filePath = join(tempDir, '.agent-rpg', 'logs', 'agent-1', `${dateStr}.jsonl`);
      await appendFile(filePath, 'not valid json\n', 'utf-8');
      await logger.log('agent-1', { type: 'assistant', text: 'also valid' });

      const entries = await logger.readTranscript('agent-1');
      expect(entries).toHaveLength(2); // skips the bad line
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npx vitest run src/__tests__/TranscriptLogger.test.ts`
Expected: FAIL — `readTranscript is not a function`

**Step 3: Implement `readTranscript()`**

Add to `ha-agent-rpg/server/src/TranscriptLogger.ts` — add `readFile` to the import from `node:fs/promises`, then add the method after `log()`:

```typescript
import { appendFile, mkdir, readFile } from 'node:fs/promises';
```

Add method to the class:

```typescript
  /**
   * Read and parse an agent's transcript log for today.
   * Returns entries in chronological order. Skips malformed lines.
   */
  async readTranscript(agentId: string): Promise<Array<{ timestamp: string; agent_id: string; message: unknown }>> {
    const safeAgentId = sanitizePathComponent(agentId);
    const dir = join(this.repoPath, '.agent-rpg', 'logs', safeAgentId);
    const filePath = join(dir, `${this.dateStr}.jsonl`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const entries: Array<{ timestamp: string; agent_id: string; message: unknown }> = [];

      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }

      return entries;
    } catch {
      // File doesn't exist or can't be read
      return [];
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npx vitest run src/__tests__/TranscriptLogger.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Run all server tests to confirm no regressions**

Run: `cd ha-agent-rpg && npm run test -w server`
Expected: All tests pass

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/TranscriptLogger.ts ha-agent-rpg/server/src/__tests__/TranscriptLogger.test.ts
git commit -m "feat: add readTranscript() to TranscriptLogger with tests"
```

---

### Task 2: Extend `AgentDetailsMessage` protocol type with transcript field

**Files:**
- Modify: `ha-agent-rpg/shared/protocol.ts` (lines 268-284)
- Modify: `ha-agent-rpg/server/src/types.ts` (lines 276-291)
- Modify: `ha-agent-rpg/client/src/types.ts` (lines 257-272)

**Step 1: Update `shared/protocol.ts`**

Find the `AgentDetailsMessage` interface (line 268). Add a `transcript` field after `findings`:

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
}
```

**Step 2: Mirror to `server/src/types.ts`**

Find the `AgentDetailsMessage` interface (line 276). Make identical change — add the `transcript` field.

**Step 3: Mirror to `client/src/types.ts`**

Find the `AgentDetailsMessage` interface (line 257). Make identical change — add the `transcript` field.

**Step 4: Type check server**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: FAIL — `BridgeServer.ts` `handleGetAgentDetails` doesn't include `transcript` in the response yet. This is expected; we fix it in Task 3.

**Step 5: Commit protocol changes**

```bash
git add ha-agent-rpg/shared/protocol.ts ha-agent-rpg/server/src/types.ts ha-agent-rpg/client/src/types.ts
git commit -m "feat: extend AgentDetailsMessage with transcript field"
```

---

### Task 3: Extend BridgeServer handler to include transcript data

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (lines 262-291)
- Modify: `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts` (lines 383-426)

**Step 1: Write/update the failing test**

In `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts`, find the existing `player:get-agent-details` test (line 383). Update the assertion to check for the `transcript` field:

Add after the existing `expect(Array.isArray(details.findings)).toBe(true);` line (around line 410):

```typescript
    expect(details.transcript).toBeDefined();
    expect(Array.isArray(details.transcript.thoughts)).toBe(true);
    expect(Array.isArray(details.transcript.actions)).toBe(true);
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npx vitest run src/__tests__/BridgeServer.e2e.test.ts`
Expected: FAIL — `transcript` is undefined in response

**Step 3: Implement transcript extraction in handleGetAgentDetails**

In `ha-agent-rpg/server/src/BridgeServer.ts`, update the `handleGetAgentDetails` method (line 262). Replace the entire method:

```typescript
  private async handleGetAgentDetails(ws: WebSocket, msg: GetAgentDetailsMessage): Promise<void> {
    const agentId = msg.agent_id;
    const agentInfo = this.worldState.agents.get(agentId);
    if (!agentInfo) {
      return; // agent not found, silently ignore
    }

    const vault = this.sessionManager?.getVault(agentId);
    const knowledge = vault ? vault.getKnowledge() : null;

    const allFindings = await this.findingsBoard?.getAll() ?? [];
    const agentFindings = allFindings.filter((f) => f.agent_id === agentId);

    // Read and categorize transcript entries
    const thoughts: Array<{ text: string; timestamp: string }> = [];
    const actions: Array<{ tool: string; input: string; timestamp: string }> = [];

    if (this.transcriptLogger) {
      const entries = await this.transcriptLogger.readTranscript(agentId);
      for (const entry of entries) {
        const msg = entry.message as any;
        if (!msg || typeof msg !== 'object') continue;

        if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              thoughts.push({ text: block.text.trim(), timestamp: entry.timestamp });
            } else if (block.type === 'tool_use') {
              actions.push({
                tool: block.name ?? 'unknown',
                input: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
                timestamp: entry.timestamp,
              });
            }
          }
        }
      }
    }

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
    });
  }
```

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npx vitest run src/__tests__/BridgeServer.e2e.test.ts`
Expected: PASS

**Step 5: Type check server**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: PASS (no type errors)

**Step 6: Run all server tests**

Run: `cd ha-agent-rpg && npm run test -w server`
Expected: All tests pass

**Step 7: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts
git commit -m "feat: include transcript data in agent:details response"
```

---

### Task 4: Add AgentDetailsPanel HTML container and CSS

**Files:**
- Modify: `ha-agent-rpg/client/index.html` (sidebar area, around line 1026)

**Step 1: Add the panel container div**

In `ha-agent-rpg/client/index.html`, find the sidebar div (line 1030: `<div id="sidebar">`). Add the agent details panel div **before** `<div id="dialogue-log">`:

```html
    <div id="agent-details-panel" class="agent-details-hidden"></div>
    <div id="dialogue-log"></div>
```

**Step 2: Add CSS for the agent details panel**

Find the `#sidebar` CSS block (around line 393). Add this CSS block after the sidebar styles:

```css
/* ── Agent Details Panel ── */
#agent-details-panel {
  overflow-y: auto;
  border-bottom: 2px solid #2a2a5a;
  background: #0d0d20;
  transition: max-height 0.3s ease;
  max-height: 60%;
  flex-shrink: 0;
}
#agent-details-panel.agent-details-hidden {
  display: none;
}
.agent-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #151530;
  border-bottom: 1px solid #2a2a5a;
  position: sticky;
  top: 0;
  z-index: 1;
}
.agent-details-name {
  font-family: monospace;
  font-size: 0.85rem;
  font-weight: bold;
}
.agent-details-role {
  font-family: monospace;
  font-size: 0.7rem;
  color: #8888aa;
}
.agent-details-close {
  cursor: pointer;
  color: #888;
  font-size: 1rem;
  background: none;
  border: none;
  padding: 0.2rem 0.4rem;
}
.agent-details-close:hover {
  color: #ff6644;
}
.agent-details-section {
  border-bottom: 1px solid #1a1a3a;
}
.agent-details-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-family: monospace;
  font-size: 0.75rem;
  color: #aaaacc;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  user-select: none;
}
.agent-details-section-header:hover {
  background: #1a1a35;
}
.agent-details-section-toggle {
  font-size: 0.6rem;
  transition: transform 0.2s;
}
.agent-details-section.collapsed .agent-details-section-toggle {
  transform: rotate(-90deg);
}
.agent-details-section-body {
  max-height: 200px;
  overflow-y: auto;
  padding: 0 0.75rem 0.4rem;
}
.agent-details-section.collapsed .agent-details-section-body {
  display: none;
}
.agent-details-item {
  font-family: monospace;
  font-size: 0.7rem;
  color: #ccccdd;
  padding: 0.2rem 0;
  border-bottom: 1px solid #12122a;
  line-height: 1.4;
  word-wrap: break-word;
}
.agent-details-item-time {
  font-size: 0.6rem;
  color: #666688;
  margin-left: 0.3rem;
}
.agent-details-loading {
  padding: 1rem;
  text-align: center;
  font-family: monospace;
  font-size: 0.75rem;
  color: #666688;
}
```

**Step 3: Commit**

```bash
git add ha-agent-rpg/client/index.html
git commit -m "feat: add agent details panel container and CSS in sidebar"
```

---

### Task 5: Create AgentDetailsPanel TypeScript component

**Files:**
- Create: `ha-agent-rpg/client/src/panels/AgentDetailsPanel.ts`

**Step 1: Create the panel**

Create `ha-agent-rpg/client/src/panels/AgentDetailsPanel.ts`. Uses safe DOM methods only (no innerHTML):

```typescript
import type { AgentDetailsMessage } from '../types';

/**
 * Sidebar panel showing an agent's history: findings, insights, actions, thoughts.
 * Follows the same DOM overlay pattern as DialogueLog.
 */
export class AgentDetailsPanel {
  private container: HTMLElement;
  private currentAgentId: string | null = null;

  constructor(parentId: string) {
    this.container = document.getElementById(parentId)!;
  }

  /** Show panel with loading state for the given agent. */
  show(agentId: string, name: string, color: number): void {
    // Toggle off if clicking same agent
    if (this.currentAgentId === agentId && !this.container.classList.contains('agent-details-hidden')) {
      this.hide();
      return;
    }

    this.currentAgentId = agentId;
    this.container.classList.remove('agent-details-hidden');
    // Clear previous content using safe DOM method
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'agent-details-header';

    const nameDiv = document.createElement('div');
    const nameSpan = document.createElement('div');
    nameSpan.className = 'agent-details-name';
    nameSpan.style.color = '#' + color.toString(16).padStart(6, '0');
    nameSpan.textContent = name;
    nameDiv.appendChild(nameSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'agent-details-close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(nameDiv);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Loading indicator
    const loading = document.createElement('div');
    loading.className = 'agent-details-loading';
    loading.textContent = 'Loading agent history...';
    this.container.appendChild(loading);
  }

  /** Hide panel and clear state. */
  hide(): void {
    this.container.classList.add('agent-details-hidden');
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.currentAgentId = null;
  }

  /** Populate the panel with agent details data. */
  populateData(details: AgentDetailsMessage): void {
    if (details.agent_id !== this.currentAgentId) return;

    // Remove loading indicator
    const loading = this.container.querySelector('.agent-details-loading');
    if (loading) loading.remove();

    // Update header with role info
    const header = this.container.querySelector('.agent-details-header');
    if (header) {
      const roleDiv = document.createElement('div');
      roleDiv.className = 'agent-details-role';
      roleDiv.textContent = details.info.role ?? details.info.agent_id;
      const nameDiv = header.firstElementChild;
      if (nameDiv) nameDiv.appendChild(roleDiv);
    }

    // Findings section
    this.addSection('Findings', details.findings.map(f => ({
      text: f.finding,
      timestamp: f.timestamp,
    })));

    // Insights section
    this.addSection('Insights', details.knowledge.insights.map(i => ({
      text: i,
    })));

    // Actions section (from transcript)
    this.addSection('Actions', details.transcript.actions.map(a => ({
      text: a.tool + ': ' + this.truncate(a.input, 120),
      timestamp: a.timestamp,
    })));

    // Thoughts section (from transcript)
    this.addSection('Thoughts', details.transcript.thoughts.map(t => ({
      text: this.truncate(t.text, 200),
      timestamp: t.timestamp,
    })));
  }

  /** Clear panel contents. */
  clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.currentAgentId = null;
  }

  private addSection(
    title: string,
    items: Array<{ text: string; timestamp?: string }>,
  ): void {
    const section = document.createElement('div');
    section.className = 'agent-details-section';

    // Section header (built with safe DOM methods)
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'agent-details-section-header';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title + ' (' + items.length + ')';
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

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-details-item';
      empty.style.color = '#555566';
      empty.textContent = 'None yet';
      body.appendChild(empty);
    } else {
      for (const item of items) {
        const div = document.createElement('div');
        div.className = 'agent-details-item';
        div.textContent = item.text;
        if (item.timestamp) {
          const time = document.createElement('span');
          time.className = 'agent-details-item-time';
          time.textContent = this.formatTime(item.timestamp);
          div.appendChild(time);
        }
        body.appendChild(div);
      }
    }

    section.appendChild(body);
    this.container.appendChild(section);
  }

  private formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  private truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
  }
}
```

**Step 2: Commit**

```bash
git add ha-agent-rpg/client/src/panels/AgentDetailsPanel.ts
git commit -m "feat: create AgentDetailsPanel component with collapsible sections"
```

---

### Task 6: Wire GameScene click handler to request agent details

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts` (lines 323-334)

**Step 1: Extend the `createAgentSprite` pointerdown handler**

In `ha-agent-rpg/client/src/scenes/GameScene.ts`, find the `createAgentSprite` method (line 323). Replace the click handler inside it:

```typescript
    sprite.setInteractive();
    sprite.on('pointerdown', () => {
      if (this.cameraController) {
        this.cameraController.panTo(sprite.getX(), sprite.getY(), agent.agent_id);
      }
      // Request agent details from server
      this.wsClient.send({
        type: 'player:get-agent-details',
        agent_id: agent.agent_id,
      });
      // Tell UIScene to show loading state
      this.scene.get('UIScene').events.emit('show-agent-details', {
        agent_id: agent.agent_id,
        name: agent.name,
        color: agent.color,
      });
    });
```

**Step 2: Add WebSocket listener for `agent:details` response**

In the `create()` method of GameScene (where other `this.wsClient.on(...)` listeners are), add:

```typescript
    this.wsClient.on('agent:details', (msg) => {
      this.scene.get('UIScene').events.emit('agent-details-loaded', msg);
    });
```

**Step 3: Type check client**

Run: `cd ha-agent-rpg && npm run build -w client`
Expected: PASS

**Step 4: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/GameScene.ts
git commit -m "feat: wire GameScene click handler to request and forward agent details"
```

---

### Task 7: Wire UIScene to instantiate and populate AgentDetailsPanel

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/UIScene.ts`

**Step 1: Add import**

At the top of `ha-agent-rpg/client/src/scenes/UIScene.ts`, add:

```typescript
import { AgentDetailsPanel } from '../panels/AgentDetailsPanel';
import type { AgentDetailsMessage } from '../types';
```

**Step 2: Add property**

In the UIScene class, add after the `private agentInfo` property:

```typescript
  private agentDetailsPanel!: AgentDetailsPanel;
```

**Step 3: Instantiate panel and add event listeners in `create()`**

At the end of the `create()` method (after the existing event listeners), add:

```typescript
    // Agent details panel
    this.agentDetailsPanel = new AgentDetailsPanel('agent-details-panel');

    this.events.on('show-agent-details', (data: { agent_id: string; name: string; color: number }) => {
      this.agentDetailsPanel.show(data.agent_id, data.name, data.color);
    });

    this.events.on('agent-details-loaded', (data: AgentDetailsMessage) => {
      this.agentDetailsPanel.populateData(data);
    });
```

**Step 4: Type check client**

Run: `cd ha-agent-rpg && npm run build -w client`
Expected: PASS

**Step 5: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/UIScene.ts
git commit -m "feat: wire UIScene to AgentDetailsPanel with show/populate events"
```

---

### Task 8: Full integration verification

**Step 1: Run all server tests**

Run: `cd ha-agent-rpg && npm run test -w server`
Expected: All tests pass (including new TranscriptLogger tests and updated BridgeServer E2E tests)

**Step 2: Type check both workspaces**

Run: `cd ha-agent-rpg && npm run build -w server && npm run build -w client`
Expected: Both pass with no type errors

**Step 3: Run client tests (if any exist)**

Run: `cd ha-agent-rpg && npm run test -w client`
Expected: Pass (or no tests to run)

**Step 4: Push all commits**

```bash
git push origin main
```

**Step 5: Update bulletin board in TASKS.md**

Add a row to the Bulletin Board:

```
| 2026-02-21 | Behrang | **Agent history panel implemented (Task 55 complete).** Server: extended `agent:details` with transcript data (thoughts + actions from JSONL logs), added `readTranscript()` to TranscriptLogger, updated protocol types. Client: new AgentDetailsPanel with 4 collapsible sections (Findings, Insights, Actions, Thoughts), wired GameScene click → WS → UIScene → panel. **@Ida:** Panel is functional with basic dungeon styling — ready for your visual polish pass. **@Ken:** Task 55 fully done (55a-55e). |
```

**Step 6: Commit TASKS.md update**

```bash
git add TASKS.md
git commit -m "docs: update bulletin board with Task 55 completion"
git push origin main
```
