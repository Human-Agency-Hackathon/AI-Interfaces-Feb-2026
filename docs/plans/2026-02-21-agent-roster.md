# Agent Roster Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact floating panel in the top-left corner of the game canvas that lists all active agents; clicking a name centers the camera on that agent and opens their details panel.

**Architecture:** A new `AgentRoster` DOM overlay class instantiated in `main.ts` alongside existing panels (StageProgressBar, PromptBar). It receives agent data via `ws` event callbacks in `main.ts`. Clicks fire a window `CustomEvent` caught by `GameScene`, which reuses the same camera-pan + detail-fetch flow as sprite clicks.

**Tech Stack:** TypeScript, DOM APIs, Phaser 3 window events, Vitest

---

## Key Files to Read Before Starting

- `ha-agent-rpg/client/src/panels/AgentDetailsPanel.ts` — DOM panel pattern to follow
- `ha-agent-rpg/client/src/main.ts` (lines 112–135, 325–410) — where panels are created and ws events are wired
- `ha-agent-rpg/client/src/scenes/GameScene.ts` (lines 467–488) — existing sprite click flow to mirror
- `ha-agent-rpg/client/src/types.ts` (lines 19–30) — `AgentInfo` shape

---

### Task 1: Write the failing AgentRoster unit tests

**Files:**
- Create: `ha-agent-rpg/client/src/__tests__/panels/AgentRoster.test.ts`

**Step 1: Create the test file**

```typescript
// ha-agent-rpg/client/src/__tests__/panels/AgentRoster.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRoster } from '../../panels/AgentRoster';
import type { AgentInfo } from '../../types';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    agent_id: 'test_agent',
    name: 'Test Agent',
    color: 0xff0000,
    x: 5,
    y: 5,
    role: 'Tester',
    realm: 'src/',
    stats: {
      realm_knowledge: {},
      expertise: {},
      codebase_fluency: 0,
      collaboration_score: 0,
    },
    status: 'running',
    ...overrides,
  };
}

describe('AgentRoster', () => {
  let onAgentClick: ReturnType<typeof vi.fn>;
  let roster: AgentRoster;

  beforeEach(() => {
    onAgentClick = vi.fn();
    roster = new AgentRoster(onAgentClick);
  });

  afterEach(() => {
    roster.destroy();
  });

  it('creates a container fixed at top-left with z-index 100', () => {
    const el = document.getElementById('agent-roster');
    expect(el).toBeTruthy();
    expect(el!.style.position).toBe('fixed');
    expect(el!.style.top).toBe('8px');
    expect(el!.style.left).toBe('8px');
    expect(el!.style.zIndex).toBe('100');
  });

  it('addAgent renders an entry with agent name', () => {
    roster.addAgent(makeAgent());
    const entry = document.querySelector('[data-agent-id="test_agent"]');
    expect(entry).toBeTruthy();
    expect(entry!.textContent).toContain('Test Agent');
  });

  it('addAgent does not create a duplicate entry if called twice', () => {
    roster.addAgent(makeAgent());
    roster.addAgent(makeAgent());
    const entries = document.querySelectorAll('[data-agent-id="test_agent"]');
    expect(entries.length).toBe(1);
  });

  it('removeAgent removes the entry from the DOM', () => {
    roster.addAgent(makeAgent());
    roster.removeAgent('test_agent');
    expect(document.querySelector('[data-agent-id="test_agent"]')).toBeNull();
  });

  it('removeAgent is a no-op for unknown agent ids', () => {
    expect(() => roster.removeAgent('nonexistent')).not.toThrow();
  });

  it('clicking an entry calls onAgentClick with the current AgentInfo', () => {
    const agent = makeAgent();
    roster.addAgent(agent);
    const entry = document.querySelector<HTMLElement>('[data-agent-id="test_agent"]')!;
    entry.click();
    expect(onAgentClick).toHaveBeenCalledTimes(1);
    expect(onAgentClick).toHaveBeenCalledWith(agent);
  });

  it('syncAgents adds new agents not yet in the roster', () => {
    const a2 = makeAgent({ agent_id: 'a2', name: 'Agent Two' });
    roster.syncAgents([a2]);
    expect(document.querySelector('[data-agent-id="a2"]')).toBeTruthy();
  });

  it('syncAgents removes agents that are no longer in the list', () => {
    roster.addAgent(makeAgent({ agent_id: 'a1', name: 'A1' }));
    roster.addAgent(makeAgent({ agent_id: 'a2', name: 'A2' }));
    roster.syncAgents([makeAgent({ agent_id: 'a2', name: 'A2' })]);
    expect(document.querySelector('[data-agent-id="a1"]')).toBeNull();
    expect(document.querySelector('[data-agent-id="a2"]')).toBeTruthy();
  });

  it('syncAgents updates x/y so click callback uses fresh coords', () => {
    roster.addAgent(makeAgent({ x: 1, y: 1 }));
    roster.syncAgents([makeAgent({ x: 10, y: 20 })]);
    document.querySelector<HTMLElement>('[data-agent-id="test_agent"]')!.click();
    expect(onAgentClick).toHaveBeenCalledWith(expect.objectContaining({ x: 10, y: 20 }));
  });

  it('destroy removes the container from the DOM', () => {
    roster.destroy();
    expect(document.getElementById('agent-roster')).toBeNull();
    // Prevent afterEach double-destroy
    roster = new AgentRoster(onAgentClick);
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd ha-agent-rpg && npm run test -w client -- --reporter=verbose 2>&1 | grep -A5 "AgentRoster"
```

Expected: FAIL — `Cannot find module '../../panels/AgentRoster'`

**Step 3: Commit the failing tests**

```bash
git add ha-agent-rpg/client/src/__tests__/panels/AgentRoster.test.ts
git commit -m "test(client): add failing AgentRoster unit tests"
```

---

### Task 2: Implement AgentRoster panel class

**Files:**
- Create: `ha-agent-rpg/client/src/panels/AgentRoster.ts`

**Step 1: Create the implementation**

```typescript
// ha-agent-rpg/client/src/panels/AgentRoster.ts
import type { AgentInfo } from '../types';

/**
 * Floating panel (top-left, over game canvas) listing all active agents.
 * Clicking an entry fires onAgentClick(agent) with fresh coordinates.
 * Follows the same DOM overlay pattern as AgentDetailsPanel and QuestLog.
 */
export class AgentRoster {
  private container: HTMLDivElement;
  private agents = new Map<string, AgentInfo>();
  private onAgentClick: (agent: AgentInfo) => void;

  constructor(onAgentClick: (agent: AgentInfo) => void) {
    this.onAgentClick = onAgentClick;
    this.container = document.createElement('div');
    this.container.id = 'agent-roster';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '100',
      width: '160px',
      overflowY: 'auto',
      background: 'rgba(0,0,0,0.6)',
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '4px 0',
      pointerEvents: 'auto',
    });
    document.body.appendChild(this.container);
  }

  /** Add an agent to the roster. No-op if already present. */
  addAgent(agent: AgentInfo): void {
    if (this.agents.has(agent.agent_id)) return;
    this.agents.set(agent.agent_id, { ...agent });
    this.renderEntry(agent);
  }

  /** Remove an agent from the roster. No-op if not present. */
  removeAgent(agentId: string): void {
    if (!this.agents.has(agentId)) return;
    this.agents.delete(agentId);
    this.container.querySelector(`[data-agent-id="${agentId}"]`)?.remove();
  }

  /**
   * Sync roster to a full agent list.
   * Adds new agents, removes departed ones, updates x/y of existing ones.
   */
  syncAgents(agents: AgentInfo[]): void {
    const incoming = new Set(agents.map(a => a.agent_id));

    // Update or add
    for (const agent of agents) {
      const stored = this.agents.get(agent.agent_id);
      if (stored) {
        stored.x = agent.x;
        stored.y = agent.y;
      } else {
        this.addAgent(agent);
      }
    }

    // Remove departed
    for (const agentId of [...this.agents.keys()]) {
      if (!incoming.has(agentId)) {
        this.removeAgent(agentId);
      }
    }
  }

  /** Remove the panel from the DOM. */
  destroy(): void {
    this.container.remove();
    this.agents.clear();
  }

  private renderEntry(agent: AgentInfo): void {
    const entry = document.createElement('div');
    entry.dataset.agentId = agent.agent_id;
    Object.assign(entry.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 8px',
      cursor: 'pointer',
      color: '#ffffff',
    });

    entry.addEventListener('mouseover', () => {
      entry.style.background = 'rgba(255,255,255,0.1)';
    });
    entry.addEventListener('mouseout', () => {
      entry.style.background = '';
    });

    const dot = document.createElement('span');
    Object.assign(dot.style, {
      display: 'inline-block',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: '#' + agent.color.toString(16).padStart(6, '0'),
      flexShrink: '0',
    });

    const nameSpan = document.createElement('span');
    nameSpan.textContent = agent.name;
    Object.assign(nameSpan.style, {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    entry.appendChild(dot);
    entry.appendChild(nameSpan);

    entry.addEventListener('click', () => {
      const current = this.agents.get(agent.agent_id);
      if (current) this.onAgentClick(current);
    });

    this.container.appendChild(entry);
  }
}
```

**Step 2: Run tests — expect them to pass**

```bash
cd ha-agent-rpg && npm run test -w client -- --reporter=verbose 2>&1 | grep -A20 "AgentRoster"
```

Expected: All 9 AgentRoster tests PASS

**Step 3: Commit**

```bash
git add ha-agent-rpg/client/src/panels/AgentRoster.ts
git commit -m "feat(client): implement AgentRoster panel"
```

---

### Task 3: Wire AgentRoster into main.ts

**Files:**
- Modify: `ha-agent-rpg/client/src/main.ts`

**Context:** `main.ts` creates panels like StageProgressBar inside `startGame()` and wires ws events at module scope. The roster is created in `startGame()` and populated from module-scope `ws.on()` handlers.

**Step 1: Add import at the top of main.ts (after existing imports)**

Find the block of panel imports (around lines 7–10 in main.ts):
```typescript
import { PromptBar } from './panels/PromptBar';
import { MiniMap } from './panels/MiniMap';
import { QuestLog } from './panels/QuestLog';
import { StageProgressBar } from './panels/StageProgressBar';
```

Add after `StageProgressBar`:
```typescript
import { AgentRoster } from './panels/AgentRoster';
```

**Step 2: Add roster variable alongside other panel variables**

Find where `stageProgressBar` is declared (around line 60 area, near `let splashScreen`):
```typescript
let gameStarted = false;
```

After the panel variable declarations, add:
```typescript
let agentRoster: AgentRoster | null = null;
```

**Step 3: Instantiate roster in startGame()**

Find in `startGame()` the block that creates StageProgressBar (around line 345):
```typescript
  if (stageProgressBar) stageProgressBar.destroy();
  stageProgressBar = new StageProgressBar('sidebar');
```

Add after it:
```typescript
  if (agentRoster) agentRoster.destroy();
  agentRoster = new AgentRoster((agent) => {
    window.dispatchEvent(new CustomEvent('agent-roster-click', { detail: agent }));
  });
```

**Step 4: Feed roster from existing agent:joined handler**

Find the existing `ws.on('agent:joined', ...)` block (around line 112):
```typescript
ws.on('agent:joined', (msg) => {
  hideLoadingOverlay();
  const data = msg as unknown as AgentJoinedMessage;
  console.log(`[Agent Joined] ${data.agent.name} (${data.agent.role}) — realm: ${data.agent.realm}`);
  window.dispatchEvent(new CustomEvent('agent-joined', {
    detail: { agentId: data.agent.agent_id, name: data.agent.name, color: data.agent.color },
  }));
});
```

Add `agentRoster?.addAgent(data.agent);` inside the handler, after the console.log:
```typescript
ws.on('agent:joined', (msg) => {
  hideLoadingOverlay();
  const data = msg as unknown as AgentJoinedMessage;
  console.log(`[Agent Joined] ${data.agent.name} (${data.agent.role}) — realm: ${data.agent.realm}`);
  agentRoster?.addAgent(data.agent);
  window.dispatchEvent(new CustomEvent('agent-joined', {
    detail: { agentId: data.agent.agent_id, name: data.agent.name, color: data.agent.color },
  }));
});
```

**Step 5: Add agent:left handler (main.ts does not currently have one)**

Find the `ws.on('agent:activity', ...)` block (around line 123) and add a new handler before it:
```typescript
ws.on('agent:left', (msg) => {
  const data = msg as unknown as AgentLeftMessage;
  agentRoster?.removeAgent(data.agent_id);
});
```

Add `AgentLeftMessage` to the type import block at the top of main.ts. Find:
```typescript
import type {
  RepoReadyMessage,
  ProcessStartedMessage,
  StageAdvancedMessage,
  AgentJoinedMessage,
  AgentActivityMessage,
```

Add `AgentLeftMessage` to that list:
```typescript
  AgentJoinedMessage,
  AgentLeftMessage,
  AgentActivityMessage,
```

**Step 6: Add world:state handler for initial sync**

main.ts does not currently handle `world:state` at module scope (GameScene handles it via shared ws). Add a handler after the `agent:left` handler you just added:
```typescript
ws.on('world:state', (msg) => {
  const data = msg as unknown as WorldStateMessage;
  agentRoster?.syncAgents(data.agents);
});
```

`WorldStateMessage` is already in the import list at the top of main.ts. Verify it's there; if not, add it.

**Step 7: Type-check to catch errors**

```bash
cd ha-agent-rpg && npm run build -w client 2>&1 | tail -20
```

Expected: No TypeScript errors.

**Step 8: Commit**

```bash
git add ha-agent-rpg/client/src/main.ts
git commit -m "feat(client): wire AgentRoster into main.ts ws event handlers"
```

---

### Task 4: Wire roster click to GameScene camera pan + details panel

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts`

**Context:** When a roster entry is clicked, `main.ts` fires `window.CustomEvent('agent-roster-click', { detail: AgentInfo })`. GameScene must listen for this and perform the same two actions as a sprite click:
1. `cameraController.panTo(pixelX, pixelY, agent_id)`
2. `wsClient.send({ type: 'player:get-agent-details', agent_id })`
3. `UIScene.events.emit('show-agent-details', { agent_id, name, color })`

**Step 1: Add the window event listener in GameScene.create()**

In `GameScene.create()`, find the section after the WebSocket handlers are set up (around line 230+, after `this.wsClient.on(...)` calls end). Add:

```typescript
// Roster click: pan camera to agent and show details (mirrors sprite click)
const TILE_SIZE = 32;
this._rosterClickHandler = ((e: CustomEvent<AgentInfo>) => {
  const agent = e.detail;
  if (this.cameraController) {
    this.cameraController.panTo(
      agent.x * TILE_SIZE + TILE_SIZE / 2,
      agent.y * TILE_SIZE + TILE_SIZE / 2,
      agent.agent_id,
    );
  }
  this.wsClient.send({ type: 'player:get-agent-details', agent_id: agent.agent_id });
  this.scene.get('UIScene').events.emit('show-agent-details', {
    agent_id: agent.agent_id,
    name: agent.name,
    color: agent.color,
  });
}) as EventListener;
window.addEventListener('agent-roster-click', this._rosterClickHandler);
```

**Step 2: Add the private field declaration**

In the `GameScene` class body (with the other private fields, around lines 27–43), add:

```typescript
private _rosterClickHandler: EventListener | null = null;
```

**Step 3: Remove the listener on scene shutdown to prevent memory leaks**

At the end of `GameScene.create()`, register a shutdown cleanup:

```typescript
this.events.once('shutdown', () => {
  if (this._rosterClickHandler) {
    window.removeEventListener('agent-roster-click', this._rosterClickHandler);
    this._rosterClickHandler = null;
  }
});
```

**Step 4: Add AgentInfo to GameScene imports**

`AgentInfo` is already imported in GameScene (it's used in `createAgentSprite`). Verify it's in the import list at the top of the file.

**Step 5: Type-check**

```bash
cd ha-agent-rpg && npm run build -w client 2>&1 | tail -20
```

Expected: No TypeScript errors.

**Step 6: Run all client tests**

```bash
cd ha-agent-rpg && npm run test -w client 2>&1 | tail -20
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/GameScene.ts
git commit -m "feat(client): handle agent-roster-click in GameScene for camera pan + details"
```

---

### Task 5: Smoke test end-to-end and push

**Step 1: Pull latest**

```bash
git pull origin main
```

**Step 2: Run full test suite**

```bash
cd ha-agent-rpg && npm run test -w server && npm run test -w client
```

Expected: All tests pass.

**Step 3: Type-check both workspaces**

```bash
cd ha-agent-rpg && npm run build -w server && npm run build -w client 2>&1 | tail -10
```

Expected: No errors.

**Step 4: Manual smoke test (if server is running)**

- Open `http://localhost:5173` in browser
- Start a brainstorm process
- Verify agent names appear in top-left roster as agents spawn
- Click an agent name — verify camera pans to that agent and details panel opens on the right
- When agents leave, verify they are removed from the roster

**Step 5: Push**

```bash
git push origin main
```

---

### Task 6: Update Bulletin Board

In `TASKS.md`, add a row to the Bulletin Board:

```
| 2026-02-21 | HH:MM | Behrang | Implemented agent roster panel (top-left DOM overlay, color dot + name). Click centers camera and opens AgentDetailsPanel. Wired in main.ts + GameScene. All tests pass. |
```

Replace `HH:MM` with the actual current time.
