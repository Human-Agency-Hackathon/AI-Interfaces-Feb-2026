# Bug Fixes: RPG Tools, MiniMap, Quest Log, Nav Doors

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix 4 identified bugs so the game actually does things: RPG tools (SummonAgent etc.) work, MiniMap HUD wires up, /quest command shows the quest log, and nav door tiles are clickable.

**Architecture:**
- Task 1 (highest impact): Register custom RPG tools as an in-process MCP server so Claude actually calls them.
- Tasks 2–3: Small client-side wiring bugs.
- Task 4: Player-side nav door clicking (two-sided: client click + server handler).

**Tech Stack:** TypeScript (ESM), Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), MCP SDK (`@modelcontextprotocol/sdk`), Zod, Phaser 3, WebSocket (`ws`), Vitest.

---

## Background / Context

### Project Layout

```
ha-agent-rpg/
  server/src/
    BridgeServer.ts        — WebSocket server, message router
    AgentSessionManager.ts — Wraps SDK query() per agent
    CustomToolHandler.ts   — Handlers for SummonAgent, PostFindings, etc.
    SystemPromptBuilder.ts — Builds agent system prompts
    EventTranslator.ts     — SDK → RPG events
    types.ts               — Shared protocol types (server-side)
  client/src/
    main.ts                — App entry, wires everything together
    scenes/GameScene.ts    — Phaser scene, listens to WS events
    systems/MapObjectSprite.ts — Renders map objects (files, quest markers, nav doors)
    panels/PromptBar.ts    — Chat/command panel
    panels/MiniMap.ts      — DOM overlay showing folder hierarchy
    panels/QuestLog.ts     — DOM panel showing quests
    types.ts               — Protocol types (client-side)
  client/index.html        — Single-page HTML with sidebar/viewport structure
```

### Key existing code

**How CustomToolHandler works** (`server/src/CustomToolHandler.ts`):
- `handleToolCall({ tool_name, tool_input, agent_id })` dispatches to handler methods
- Each handler emits an event (e.g. `'summon:request'`) for BridgeServer to react to
- Handlers for: `SummonAgent`, `RequestHelp`, `PostFindings`, `UpdateKnowledge`, `ClaimQuest`, `CompleteQuest`

**How AgentSessionManager works** (`server/src/AgentSessionManager.ts`):
- `spawnAgent(config)` creates a `KnowledgeVault`, builds systemPrompt, calls `query()` from the SDK
- Messages from `query()` are emitted as `'agent:message'` events for BridgeServer
- `query()` options: `allowedTools`, `permissionMode`, `systemPrompt`, `cwd`, `env`, `abortController`

**SDK MCP server support** (from `@anthropic-ai/claude-agent-sdk`):
- `createSdkMcpServer({ name, version, tools })` → `McpSdkServerConfigWithInstance`
- `tool(name, description, zodSchema, handler)` → `SdkMcpToolDefinition`
- These are passed to `query()` via `options.mcpServers: { serverName: mcpServerInstance }`
- MCP tool names inside Claude will be `mcp__<serverName>__<toolName>` but with `bypassPermissions`, all tools are auto-allowed

**Index.html sidebar structure** (at bottom of file):
```html
<div id="game-viewport" class="screen-hidden">
  <div id="game-container"></div>
  <div id="sidebar">
    <div id="dialogue-log"></div>
    <div id="settings-panel" style="display:none; ...">...</div>
    <!-- NO quest-log element yet -->
    <!-- PromptBar is appended here by main.ts -->
  </div>
</div>
```

**MiniMap wiring bug** (`client/src/main.ts` lines 156–166):
```typescript
phaserGame.events.once('ready', () => {
  const gameScene = phaserGame!.scene.getScene('GameScene');
  // BUG: game 'ready' fires before GameScene.create() runs
  // getScene() returns the scene object but its events aren't set up yet
  if (gameScene) {
    gameScene.events.on('realm-tree', ...);  // never fires
    gameScene.events.on('realm-presence', ...);  // never fires
  }
});
```

**Nav doors in world state** (`client/src/scenes/GameScene.ts` lines 68–79):
- Nav_door and nav_back objects ARE included in `state.objects` (sent in `world:state`)
- They DO get `MapObjectSprite` instances
- BUT `MapObjectSprite` doesn't know about these types, falls back to gray rectangle
- NO click handlers are added

---

## Task 1: Register RPG tools via in-process MCP server

**Goal:** Make SummonAgent, PostFindings, UpdateKnowledge, ClaimQuest, CompleteQuest, RequestHelp work as real Claude tool calls.

**Files:**
- Create: `server/src/RpgMcpServer.ts`
- Modify: `server/src/AgentSessionManager.ts` (constructor, runSession, runResumedSession)
- Modify: `server/src/BridgeServer.ts` (pass toolHandler to AgentSessionManager, two call sites)
- Modify: `server/package.json` (add zod dependency)
- Test: `server/src/__tests__/RpgMcpServer.test.ts`

### Step 1: Add zod to server package.json

Edit `server/package.json` — add to `"dependencies"`:
```json
"zod": "^3.25.64"
```

Run: `npm install` from repo root (workspace install)

### Step 2: Write failing tests for RpgMcpServer

Create `server/src/__tests__/RpgMcpServer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomToolHandler } from '../CustomToolHandler.js';

// We test only the shape of the returned config, not the live MCP session
describe('createRpgMcpServer', () => {
  let mockToolHandler: CustomToolHandler;

  beforeEach(() => {
    mockToolHandler = {
      handleToolCall: vi.fn().mockResolvedValue({ result: { acknowledged: true } }),
    } as unknown as CustomToolHandler;
  });

  it('returns an MCP server config with type "sdk"', async () => {
    const { createRpgMcpServer } = await import('../RpgMcpServer.js');
    const config = createRpgMcpServer('oracle', mockToolHandler);
    expect(config.type).toBe('sdk');
    expect(config.name).toBe('rpg');
    expect(config.instance).toBeDefined();
  });

  it('creates unique instances per agent', async () => {
    const { createRpgMcpServer } = await import('../RpgMcpServer.js');
    const config1 = createRpgMcpServer('oracle', mockToolHandler);
    const config2 = createRpgMcpServer('engineer', mockToolHandler);
    expect(config1.instance).not.toBe(config2.instance);
  });
});
```

Run: `npm run test -w server -- --run src/__tests__/RpgMcpServer.test.ts`
Expected: FAIL (module not found)

### Step 3: Create RpgMcpServer.ts

Create `server/src/RpgMcpServer.ts`:

```typescript
/**
 * Creates an in-process MCP server that exposes the 6 custom RPG tools
 * as real Claude tool definitions. Pass the returned config to query()
 * via options.mcpServers.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { CustomToolHandler } from './CustomToolHandler.js';

function makeResult(result: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

export function createRpgMcpServer(agentId: string, toolHandler: CustomToolHandler) {
  return createSdkMcpServer({
    name: 'rpg',
    version: '1.0.0',
    tools: [
      tool(
        'SummonAgent',
        'Request a new specialist agent when this work exceeds your capacity.',
        {
          name: z.string().describe('Display name for the new agent'),
          role: z.string().describe('Role/specialization (e.g. "TypeScript Expert")'),
          realm: z.string().describe('Directory scope (e.g. "src/api/")'),
          mission: z.string().describe('What this agent should accomplish'),
          priority: z.enum(['low', 'medium', 'high']).describe('Spawn priority'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'SummonAgent',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'RequestHelp',
        'Ask another team member for help or information.',
        {
          target_agent: z.string().describe('Agent ID to ask'),
          question: z.string().describe('Your question'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'RequestHelp',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'PostFindings',
        'Share an important discovery with the entire team.',
        {
          realm: z.string().describe('Directory or area this finding relates to'),
          finding: z.string().describe('The discovery or insight'),
          severity: z.enum(['low', 'medium', 'high']).describe('Importance level'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'PostFindings',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'UpdateKnowledge',
        'Save an insight to your personal knowledge vault for future sessions.',
        {
          insight: z.string().describe('The insight to save'),
          area: z.string().describe('Knowledge area (e.g. "typescript", "testing")'),
          amount: z.number().optional().describe('Expertise increment (default 1)'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'UpdateKnowledge',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'ClaimQuest',
        'Self-assign a quest/issue to work on.',
        {
          quest_id: z.string().describe('ID of the quest to claim'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'ClaimQuest',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'CompleteQuest',
        'Mark a quest as done with a summary of what you accomplished.',
        {
          quest_id: z.string().describe('ID of the quest to complete'),
          outcome: z.string().optional().describe('Summary of what was accomplished'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'CompleteQuest',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),
    ],
  });
}
```

### Step 4: Run tests to verify they pass

Run: `npm run test -w server -- --run src/__tests__/RpgMcpServer.test.ts`
Expected: PASS (2 tests pass)

### Step 5: Modify AgentSessionManager to accept toolHandler and use MCP server

In `server/src/AgentSessionManager.ts`:

**Import additions** at top:
```typescript
import { createRpgMcpServer } from './RpgMcpServer.js';
import type { CustomToolHandler } from './CustomToolHandler.js';
```

**Constructor change** — add `toolHandler` parameter:
```typescript
// Before:
constructor(findingsBoard: FindingsBoard) {
  super();
  this.findingsBoard = findingsBoard;
}

// After:
private toolHandler: CustomToolHandler;

constructor(findingsBoard: FindingsBoard, toolHandler: CustomToolHandler) {
  super();
  this.findingsBoard = findingsBoard;
  this.toolHandler = toolHandler;
}
```

**In `runSession()`** — add `mcpServers` to query options (around line 221):
```typescript
// Before:
const q = query({
  prompt: config.mission,
  options: {
    systemPrompt,
    cwd: config.repoPath,
    env: cleanEnv(),
    allowedTools,
    permissionMode: permissionMode as any,
    allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
    abortController,
    maxTurns: 50,
    stderr: (data: string) => { ... },
  },
});

// After:
const rpgMcpServer = createRpgMcpServer(config.agentId, this.toolHandler);
const q = query({
  prompt: config.mission,
  options: {
    systemPrompt,
    cwd: config.repoPath,
    env: cleanEnv(),
    allowedTools,
    permissionMode: permissionMode as any,
    allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
    abortController,
    maxTurns: 50,
    mcpServers: { rpg: rpgMcpServer },
    stderr: (data: string) => { ... },
  },
});
```

**Same change in `runResumedSession()`** (around line 272). Add `mcpServers` to that query call too.

### Step 6: Modify BridgeServer to pass toolHandler to AgentSessionManager

In `server/src/BridgeServer.ts`, there are two places where `new AgentSessionManager(...)` is called:
1. `handleLinkRepo` (around line 270-280)
2. `handleResumeRealm` (around line 565)

Both currently do:
```typescript
this.sessionManager = new AgentSessionManager(this.findingsBoard);
```

**Both need to change to:**
```typescript
this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
```

**IMPORTANT:** In BridgeServer, `this.toolHandler` is initialized BEFORE `this.sessionManager`. Verify this is the case in both `handleLinkRepo` and `handleResumeRealm`. Looking at the code:
- In `handleResumeRealm` (line 565): sessionManager is created at line 565, toolHandler at line 569. **MUST** swap order — create toolHandler first.

The correct order in `handleResumeRealm` should be:
```typescript
// Initialize findings board first
this.findingsBoard = new FindingsBoard(realm.path);
await this.findingsBoard.load();

// Initialize transcript logger
this.transcriptLogger = new TranscriptLogger(realm.path);

// Initialize custom tool handler FIRST (before session manager)
this.toolHandler = new CustomToolHandler(
  this.findingsBoard,
  this.questManager,
  (agentId: string) => this.sessionManager.getVault(agentId),
  (agentId: string) => {
    const session = this.sessionManager.getSession(agentId);
    return session?.config.agentName ?? agentId;
  },
);
this.wireToolHandlerEvents();

// Initialize session manager SECOND (needs toolHandler)
this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
this.wireSessionManagerEvents();
```

Similarly check `handleLinkRepo` for the same ordering issue.

### Step 7: Run all server tests

Run: `npm run test -w server -- --run`
Expected: All tests pass (existing 207 + 2 new = 209 total)

### Step 8: Verify TypeScript compiles

Run: `npm run build -w server 2>&1 | tail -5` or `npx tsc -w server --noEmit`
Expected: No errors

### Step 9: Commit

```bash
git add server/src/RpgMcpServer.ts server/src/AgentSessionManager.ts server/src/BridgeServer.ts server/src/__tests__/RpgMcpServer.test.ts server/package.json
git commit -m "feat: register RPG tools as in-process MCP server

Oracle can now actually call SummonAgent, PostFindings, UpdateKnowledge,
ClaimQuest, CompleteQuest, and RequestHelp as proper Claude tool calls.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix MiniMap wiring to GameScene

**Goal:** The MiniMap HUD should receive `realm-tree` and `realm-presence` events from GameScene.

**The bug:** In `main.ts`, `phaserGame.events.once('ready', ...)` fires before `GameScene.create()` runs. `getScene()` returns the scene object, but it hasn't emitted its events yet so subsequent `.on()` calls miss everything.

**The fix:** After getting the scene, check if it's active (already created). If not, wait for its `'create'` lifecycle event before wiring.

**Files:**
- Modify: `client/src/main.ts` (lines 156–166)

### Step 1: Apply fix

In `client/src/main.ts`, replace the minimap wiring block:

```typescript
// Before (lines 156-166):
phaserGame.events.once('ready', () => {
  const gameScene = phaserGame!.scene.getScene('GameScene');
  if (gameScene) {
    gameScene.events.on('realm-tree', (root: MapNodeSummary) => {
      miniMap?.setTree(root);
    });
    gameScene.events.on('realm-presence', (players: PlayerPresence[]) => {
      miniMap?.updatePresence(players);
    });
  }
});

// After:
function wireMinimapToScene(scene: Phaser.Scene): void {
  scene.events.on('realm-tree', (root: MapNodeSummary) => {
    miniMap?.setTree(root);
  });
  scene.events.on('realm-presence', (players: PlayerPresence[]) => {
    miniMap?.updatePresence(players);
  });
}

phaserGame.events.once('ready', () => {
  const gameScene = phaserGame!.scene.getScene('GameScene');
  if (!gameScene) return;
  // GameScene.create() may not have run yet; use lifecycle event if needed
  if (gameScene.sys.isActive()) {
    wireMinimapToScene(gameScene);
  } else {
    gameScene.events.once('create', () => wireMinimapToScene(gameScene!));
  }
});
```

Note: `wireMinimapToScene` is a local function, not a class method — define it inside `startGame()` or at module scope as a named function.

### Step 2: Verify TypeScript compiles cleanly

Run: `cd client && npx tsc --noEmit`
Expected: No errors

### Step 3: Commit

```bash
git add client/src/main.ts
git commit -m "fix: wire MiniMap after GameScene.create() fires

Phaser game:ready fires before the scene's create() runs.
Check scene active state and use 'create' lifecycle event if needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Wire /quest command and quest log panel

**Goal:** `/quest` in the prompt bar should toggle a quest log panel showing current quests.

**Files:**
- Modify: `client/index.html` (add `#quest-log` element)
- Modify: `client/src/main.ts` (instantiate QuestLog, add `onShowQuests`, wire to `world:state`)

### Step 1: Add quest log element to index.html

In `client/index.html`, find the sidebar div (around line 837). Insert the quest log panel after `#dialogue-log` and before `#settings-panel`:

```html
<!-- Before: -->
<div id="sidebar">
  <div id="dialogue-log"></div>
  <div id="settings-panel" style="display:none; ...">...</div>
</div>

<!-- After: -->
<div id="sidebar">
  <div id="dialogue-log"></div>
  <div id="quest-log" style="display:none; overflow-y:auto; flex:0 0 auto; max-height:40%; border-top:1px solid #2a2a5a; padding:0.5rem;"></div>
  <div id="settings-panel" style="display:none; ...">...</div>
</div>
```

### Step 2: Modify main.ts to add quest log

At the top of `main.ts`, add the QuestLog import:
```typescript
import { QuestLog } from './panels/QuestLog';
```

Add a module-level variable after `miniMap`:
```typescript
let questLog: QuestLog | null = null;
```

In `startGame()`, after miniMap setup, instantiate QuestLog:
```typescript
// Instantiate QuestLog
if (questLog) {
  // QuestLog doesn't have a destroy, it's just hidden/shown
}
questLog = new QuestLog('quest-log');
```

In `startGame()`, wire `onShowQuests` callback when constructing PromptBar:
```typescript
promptBar = new PromptBar('sidebar', ws, {
  onClearLog: () => { ... },
  onToggleSettings: () => { ... },
  onPlayerMessage: (text: string) => { ... },
  onShowQuests: () => {
    const panel = document.getElementById('quest-log')!;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  },
});
```

In `stopGame()`, hide quest log panel:
```typescript
const questPanel = document.getElementById('quest-log');
if (questPanel) questPanel.style.display = 'none';
```

Wire QuestLog to world:state WebSocket messages. The `ws` object is module-level. Add this after the existing WS handlers (around line 87):
```typescript
// Quest updates from world state
ws.on('world:state', (msg) => {
  const state = msg as unknown as WorldStateMessage;
  if (questLog && state.quests) {
    questLog.setQuests(state.quests);
  }
});

ws.on('quest:update', (msg) => {
  const data = msg as unknown as QuestUpdateMessage;
  if (questLog) {
    questLog.updateQuestStatus(data.quest_id, data.status, data.agent_id);
  }
});
```

Add the missing type import — add `WorldStateMessage` and `QuestUpdateMessage` to the types import block in main.ts.

### Step 3: Verify TypeScript compiles

Run: `cd client && npx tsc --noEmit`
Expected: No errors

### Step 4: Commit

```bash
git add client/index.html client/src/main.ts
git commit -m "feat: wire /quest command to quest log panel

Add #quest-log DOM element and connect QuestLog panel to world:state
messages. /quest now toggles the panel.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Player nav door navigation

**Goal:** Clicking on a nav_door or nav_back object in the game canvas navigates the player into/out of that directory (fade + map:change, same as agents).

**Files:**
- Modify: `client/src/systems/MapObjectSprite.ts` (nav door appearance + scene event on click)
- Modify: `client/src/scenes/GameScene.ts` (listen for nav-click, send WS message)
- Modify: `client/src/types.ts` (add player navigate message types)
- Modify: `server/src/types.ts` (add navigate message types)
- Modify: `server/src/BridgeServer.ts` (handle player:navigate-enter/back, track player nav state)

### Step 1: Add message types to client/src/types.ts

Add to the "Messages: Player → Server" section:
```typescript
export interface PlayerNavigateEnterMessage {
  type: 'player:navigate-enter';
  target_path: string;
}

export interface PlayerNavigateBackMessage {
  type: 'player:navigate-back';
}
```

Add to the `ClientMessage` union type:
```typescript
| PlayerNavigateEnterMessage
| PlayerNavigateBackMessage
```

### Step 2: Add message types to server/src/types.ts

Open `server/src/types.ts` and add:
```typescript
export interface PlayerNavigateEnterMessage {
  type: 'player:navigate-enter';
  target_path: string;
}

export interface PlayerNavigateBackMessage {
  type: 'player:navigate-back';
}
```

Add to the `ClientMessage` union type in server/src/types.ts.

### Step 3: Make nav doors visible and clickable in MapObjectSprite.ts

In `client/src/systems/MapObjectSprite.ts`:

**Update `TEXTURE_MAP`** — no texture exists for nav_door, so we'll use the fallback but with a styled shape. The approach: override `createIcon` for nav types:

```typescript
// Update the TEXTURE_MAP — nav types intentionally absent (handled specially)
const TEXTURE_MAP: Record<string, string> = {
  file: 'obj-file',
  config: 'obj-config',
  doc: 'obj-doc',
  quest_marker: 'obj-quest',
  sign: 'obj-sign',
};
```

**Update `createIcon`** to handle nav types:
```typescript
private createIcon(
  type: string,
  px: number,
  py: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Shape {
  const key = TEXTURE_MAP[type];
  if (key && this.scene.textures.exists(key)) {
    return this.scene.add.image(px, py, key).setDepth(5);
  }

  // Nav doors: yellow triangle pointing right; nav_back: blue triangle pointing left
  if (type === 'nav_door') {
    return this.scene.add.triangle(px, py, 0, 6, 10, 0, 10, 12, 0xf4c542, 1).setDepth(5);
  }
  if (type === 'nav_back') {
    return this.scene.add.triangle(px, py, 10, 6, 0, 0, 0, 12, 0x8ab4f8, 1).setDepth(5);
  }

  // Fallback for unknown types
  return this.scene.add.rectangle(px, py, 8, 8, 0x888888, 0.5).setDepth(5);
}
```

**Make nav sprites interactive** — in the constructor, after creating the container:
```typescript
// Make nav doors and nav_back clickable
if (obj.type === 'nav_door' || obj.type === 'nav_back') {
  this.sprite.setSize(TILE_SIZE, TILE_SIZE); // hit area = full tile
  this.sprite.setInteractive();
  this.sprite.on('pointerdown', () => {
    scene.events.emit('nav-click', obj);
  });
  this.sprite.on('pointerover', () => {
    scene.input.setDefaultCursor('pointer');
  });
  this.sprite.on('pointerout', () => {
    scene.input.setDefaultCursor('default');
  });
}
```

**Note:** Also update the label for nav types to show the folder name more clearly:
```typescript
// In constructor, before creating label:
const labelText = (obj.type === 'nav_door' || obj.type === 'nav_back')
  ? (obj.type === 'nav_back' ? '← back' : `→ ${obj.label}`)
  : obj.label;
const label = scene.add.text(px, py + 14, labelText, { ... });
```

### Step 4: Wire nav-click in GameScene.ts

In `client/src/scenes/GameScene.ts`, in the `create()` method after the existing WS handlers, add:

```typescript
// Player nav door clicks
this.events.on('nav-click', (obj: MapObject) => {
  if (obj.type === 'nav_door') {
    const targetPath = obj.metadata.targetPath as string;
    this.wsClient.send({ type: 'player:navigate-enter', target_path: targetPath });
  } else if (obj.type === 'nav_back') {
    this.wsClient.send({ type: 'player:navigate-back' });
  }
});
```

The import for `MapObject` is already present.

### Step 5: Track player nav state in BridgeServer.ts

**Add player nav state tracking** near the other nav state fields (around line 64):
```typescript
// Existing:
private agentSockets = new Map<string, WebSocket>();
private agentNavStacks = new Map<string, NavigationFrame[]>();
private agentCurrentPath = new Map<string, string>();

// Add:
private playerSocket: WebSocket | null = null;
private playerNavStack: NavigationFrame[] = [];
private playerCurrentPath = '';
```

**Handle player:navigate-enter and player:navigate-back messages** — in `handleMessage()`, add cases:
```typescript
case 'player:navigate-enter':
  this.handlePlayerNavigateEnter(ws, (msg as any).target_path as string);
  break;
case 'player:navigate-back':
  this.handlePlayerNavigateBack(ws);
  break;
```

**Add handlePlayerNavigateEnter** — near the other navigation helper methods:
```typescript
private handlePlayerNavigateEnter(ws: WebSocket, targetPath: string): void {
  if (this.gamePhase !== 'playing') return;

  const node = this.worldState.getMapNode(targetPath);
  if (!node) {
    this.send(ws, { type: 'error', message: `No map node for path: ${targetPath}` });
    return;
  }

  // Push current location onto player nav stack
  this.playerNavStack.push({
    path: this.playerCurrentPath,
    returnPosition: { x: 0, y: 0 },  // player has no world position
  });

  // Generate map if not cached
  if (!node.map) {
    const depth = targetPath.split('/').length;
    const result = this.mapGenerator.generateFolderMap(node, depth);
    node.map = result.map;
    node.objects = result.objects;
    node.entryPosition = result.entryPosition;
    node.doorPositions = result.doorPositions;
  }

  this.playerCurrentPath = targetPath;
  this.playerSocket = ws;

  const spawnPos = node.entryPosition ?? { x: Math.floor(node.map!.width / 2), y: 2 };

  this.send(ws, {
    type: 'map:change',
    path: targetPath,
    map: node.map!,
    objects: node.objects ?? [],
    position: spawnPos,
    breadcrumb: spawnPos,
  });
}
```

**Add handlePlayerNavigateBack**:
```typescript
private handlePlayerNavigateBack(ws: WebSocket): void {
  if (this.playerNavStack.length === 0) return;

  const frame = this.playerNavStack[this.playerNavStack.length - 1];
  const node = this.worldState.getMapNode(frame.path);
  if (!node?.map) return;

  this.playerNavStack.pop();
  this.playerCurrentPath = frame.path;
  this.playerSocket = ws;

  this.send(ws, {
    type: 'map:change',
    path: frame.path,
    map: node.map,
    objects: node.objects ?? [],
    position: frame.returnPosition,
    breadcrumb: node.entryPosition ?? { x: Math.floor(node.map.width / 2), y: 1 },
  });
}
```

**Also add imports** if `NavigationFrame` isn't already imported from types in BridgeServer — check the existing import at the top of BridgeServer.ts.

### Step 6: Verify TypeScript compiles for both workspaces

Run:
```bash
cd /path/to/ha-agent-rpg
npx tsc -p server/tsconfig.json --noEmit
cd client && npx tsc --noEmit
```
Expected: No errors in either workspace

### Step 7: Commit

```bash
git add \
  client/src/systems/MapObjectSprite.ts \
  client/src/scenes/GameScene.ts \
  client/src/types.ts \
  server/src/types.ts \
  server/src/BridgeServer.ts
git commit -m "feat: player can click nav doors to navigate directory hierarchy

Add nav_door/nav_back visual styling (triangles) and click handlers
that send player:navigate-enter/back messages. Server handles these
with player-specific nav stack tracking.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Verification Checklist

After all 4 tasks:

1. **RPG tools**: Start server + client, link a repo. The Oracle should now call `PostFindings` and `UpdateKnowledge` in the dialogue log (you'll see "Sharing findings with the team..." activity). Check server console for `[Bridge] findings:posted` events.

2. **MiniMap**: Once a repo is linked and gameplay starts, the MiniMap (top-right overlay on game canvas) should update when agents navigate between directories.

3. **Quest log**: Type `/quest` in the PromptBar → quest log panel should toggle visible/hidden below the dialogue log.

4. **Nav doors**: In the game canvas, nav_door tiles should appear as yellow triangles with `→ foldername` labels. Click one → screen fades → new room loads. Click nav_back (blue triangle `← back`) → fades back to parent.
