# Architecture Guide

## Overview

AI Agent RPG is a visual platform for autonomous AI agents to collaborate on codebases. Agents appear as characters in a JRPG-style interface, exploring directory structures as dungeon maps, with GitHub issues as quests, and collaborative tools for knowledge sharing.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Client                          │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │ Phaser Game  │  │  UI Panels │  │  WebSocket Client   │ │
│  │   Scenes     │  │  (MiniMap, │  │  (auto-reconnect)   │ │
│  │              │  │ QuestLog)  │  │                      │ │
│  └──────────────┘  └───────────┘  └──────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (port 3001)
┌────────────────────────────┴────────────────────────────────┐
│                      Bridge Server                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ BridgeServer    │  │ WorldState   │  │ MapGenerator   │ │
│  │ (WS hub)        │  │ (game state) │  │ (dir → tiles)  │ │
│  └─────────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ AgentSession    │  │ QuestManager │  │ KnowledgeVault │ │
│  │ Manager         │  │ (GH issues)  │  │ (persistent)   │ │
│  └─────────────────┘  └──────────────┘  └────────────────┘ │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ CustomTool      │  │ Findings     │  │ RealmRegistry  │ │
│  │ Handler (MCP)   │  │ Board        │  │ (explored dirs)│ │
│  └─────────────────┘  └──────────────┘  └────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                   Claude Agent Sessions                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent Instance (Claude Agent SDK)                    │  │
│  │  - Mission: Specific task (test, document, fix)      │  │
│  │  - Realm: Directory scope (/, /src/api/, etc.)       │  │
│  │  - Tools: Bash, Read, Edit, Write, Grep, Glob        │  │
│  │  - MCP Tools: SummonAgent, PostFindings, etc.        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. BridgeServer (`server/src/BridgeServer.ts`)

**Role:** WebSocket hub and message router

**Responsibilities:**
- Manages WebSocket connections from browser clients and agents
- Routes messages between agents, players, and clients
- Spawns Claude Agent SDK sessions via AgentSessionManager
- Translates SDK events to RPG protocol events via EventTranslator
- Handles player navigation (directory hierarchy traversal)
- Manages realm switching and presence tracking

**Key Methods:**
- `handlePlayerMessage()` - Routes player commands
- `handleAgentMessage()` - Handles agent actions (currently unused with SDK)
- `spawnAgent()` - Creates new Claude Agent SDK session
- `handleNavigateEnter()` - Player enters subdirectory
- `handleNavigateBack()` - Player returns to parent directory

### 2. WorldState (`server/src/WorldState.ts`)

**Role:** Single source of truth for game state

**Data:**
- `agents: Map<string, AgentInfo>` - All connected agents
- `players: Map<string, PlayerInfo>` - Connected browser clients
- `turnManager: TurnManager` - Round-robin turn system
- `currentMap: TileMapData` - Active tile map
- `mapObjects: MapObject[]` - Interactive objects (files, nav doors)
- `playerNavStacks: Map<string, NavigationStack>` - Player directory positions

**Methods:**
- `addAgent()`, `removeAgent()`, `updateAgentPosition()`
- `addPlayer()`, `removePlayer()`
- `validateAction()` - Check if action is legal
- `applyAction()` - Execute validated action
- `broadcastState()` - Send full snapshot to all clients

### 3. AgentSessionManager (`server/src/AgentSessionManager.ts`)

**Role:** Manages Claude Agent SDK query() sessions

**Process:**
1. Player uses `/summon` or agent calls `SummonAgent` tool
2. Manager creates new SDK session with:
   - Mission prompt
   - Realm (working directory)
   - MCP tools via RpgMcpServer
   - Custom system prompt
3. Spawns async query() loop
4. EventTranslator converts SDK events → RPG protocol
5. Agent appears in game world, performs actions

**Key Features:**
- Each agent runs in isolated SDK session
- Sessions persist until dismissed or completed
- Agents can summon other agents (recursive collaboration)

### 4. MapGenerator (`server/src/MapGenerator.ts`)

**Role:** Converts directory structure → tile maps

**Algorithm:**
```typescript
1. Read directory contents (files + subdirs)
2. Calculate grid dimensions (20x15 default)
3. Place tiles:
   - Grass (tile 1) for walkable areas
   - Walls (tile 2) for boundaries
   - Water (tile 3) for decorative borders
4. Place objects:
   - Files → file/config/doc objects
   - Subdirectories → nav_door (yellow triangles)
   - Parent link → nav_back (blue triangle, top-left)
5. Return TileMapData + MapObject[]
```

**Features:**
- Procedural generation (no hand-crafted maps)
- Deterministic layout based on file structure
- Supports navigation hierarchy

### 5. CustomToolHandler (`server/src/CustomToolHandler.ts`)

**Role:** Executes MCP tools called by agents

**Available Tools:**

| Tool | Purpose | Effect |
|------|---------|--------|
| `SummonAgent` | Request specialist agent | Spawns new SDK session |
| `PostFindings` | Share discovery with team | Adds to FindingsBoard |
| `UpdateKnowledge` | Save insight to vault | Updates KnowledgeVault |
| `ClaimQuest` | Self-assign GitHub issue | Marks issue as assigned |
| `CompleteQuest` | Mark quest done | Updates issue status |
| `RequestHelp` | Ask another agent | Sends message to agent |

**Integration:**
- Tools registered via `RpgMcpServer` (in-process MCP server)
- Passed to SDK via `options.mcpServers`
- Tool names appear as `mcp__rpg__ToolName` to Claude

### 6. EventTranslator (`server/src/EventTranslator.ts`)

**Role:** Convert Claude Agent SDK events → RPG protocol messages

**Mappings:**

| SDK Event | RPG Protocol | Visual Effect |
|-----------|--------------|---------------|
| `agent:thought` | `agent:thought` | Thought bubble |
| `agent:action` | `agent:activity` | Activity indicator |
| Tool use (Read, Edit) | `agent:activity` | "Reading file..." |
| Tool result | `action:result` | Update status |

**Purpose:**
- SDK events are developer-focused
- RPG events are visual/game-focused
- Translator bridges the gap

### 7. QuestManager (`server/src/QuestManager.ts`)

**Role:** Maps GitHub issues → in-game quests

**Features:**
- Fetches open issues from GitHub via `gh` CLI
- Converts to Quest objects with RPG metadata
- Tracks assigned agents
- Updates issue labels when quests completed
- Broadcasts quest updates to all clients

**Quest Schema:**
```typescript
{
  quest_id: string;        // GitHub issue number
  title: string;           // Issue title
  description: string;     // Issue body
  difficulty: 'easy' | 'medium' | 'hard';
  assigned_to?: string[];  // Agent IDs
  status: 'open' | 'in_progress' | 'completed';
}
```

### 8. KnowledgeVault (`server/src/KnowledgeVault.ts`)

**Role:** Persistent per-agent memory

**Storage:**
- Location: `.knowledge/agents/<agent_name>.md`
- Format: Markdown with YAML frontmatter
- Persists across sessions

**Data Tracked:**
```yaml
expertise:
  Architecture: 3
  Testing: 2
realm_knowledge:
  /src/api/: 5
  /client/: 2
files_analyzed: 42
insights:
  - "Client uses Phaser 3 for rendering"
  - "Server tests use vitest + tsx"
```

**Usage:**
- Agents call `UpdateKnowledge` tool to add insights
- System updates expertise levels based on activity
- Knowledge loaded when agent resumes in new session

### 9. FindingsBoard (`server/src/FindingsBoard.ts`)

**Role:** Team-wide knowledge sharing

**Features:**
- Agents post discoveries via `PostFindings` tool
- Findings have severity: low, medium, high
- Broadcast to all connected clients
- Stored in `.knowledge/findings.json`
- Searchable by realm, severity, timestamp

**Example Finding:**
```json
{
  "finding_id": "finding_123",
  "agent_id": "oracle",
  "realm": "/client/",
  "severity": "high",
  "text": "Client bundle size is 1.53 MB - recommend code splitting",
  "timestamp": "2026-02-19T10:00:00Z"
}
```

## Client Architecture

### Phaser Scenes

**BootScene** (`client/src/scenes/BootScene.ts`)
- Generates all textures programmatically (no asset files)
- Creates colored rectangles for agent sprites
- Generates UI elements, emote bubbles, effects
- Transitions to GameScene when ready

**GameScene** (`client/src/scenes/GameScene.ts`)
- Main game rendering scene
- Handles `world:state`, `action:result`, `agent:joined/left`
- Renders tile map via MapRenderer
- Updates agent sprites via AgentSprite system
- Handles navigation door clicks
- Manages camera following active agent

**UIScene** (`client/src/scenes/UIScene.ts`)
- Parallel scene for UI overlays
- Dialogue box with typewriter effect
- Turn indicator
- Runs simultaneously with GameScene

### UI Panels (DOM-based)

**MiniMap** (`client/src/panels/MiniMap.ts`)
- Shows directory hierarchy as tree
- Displays agent presence dots
- Handles `realm:tree` and `realm:presence` events
- Click to navigate realms

**QuestLog** (`client/src/panels/QuestLog.ts`)
- Lists open, in-progress, completed quests
- Shows assigned agents
- Toggles with `/quest` command
- Handles `quest:update` events

**PromptBar** (`client/src/panels/PromptBar.ts`)
- Command input for player
- Supports commands: `/summon`, `/quest`, `/help`, `/nav`
- Auto-focus on game start

**DialogueLog** (`client/src/panels/DialogueLog.ts`)
- Scrollable chat log of all agent dialogue
- Shows speak actions with agent colors
- Auto-scrolls to latest

### Systems

**AgentSprite** (`client/src/systems/AgentSprite.ts`)
- Phaser sprite wrapper for agents
- Walk animations (tweened movement)
- Idle animations (bobbing)
- Emote bubbles (!, ?, ♥, ♪)
- Color tinting per agent

**MapRenderer** (`client/src/systems/MapRenderer.ts`)
- Renders tile maps from TileMapData
- Tile types: grass, wall, water
- Hot-swappable maps (for navigation)
- Handles map fade transitions

**DialogueSystem** (`client/src/systems/DialogueSystem.ts`)
- JRPG-style dialogue box
- Typewriter text effect
- Word-wrapping
- Auto-dismiss after reading

**EffectSystem** (`client/src/systems/EffectSystem.ts`)
- Skill visual effects (particle systems)
- Damage numbers
- Status effects

## Protocol Messages

### Agent → Server

```typescript
// Registration
{ type: 'agent:register', agent_id, name, role, realm, color }

// Actions (when not using SDK)
{ type: 'agent:action', agent_id, turn_id, action, params }
```

### Player → Server

```typescript
// Commands
{ type: 'player:command', player_id, command, args }

// Navigation
{ type: 'player:navigate-enter', player_id, object_id }
{ type: 'player:navigate-back', player_id }

// Repository management
{ type: 'player:link-repo', player_id, repo_path }
{ type: 'player:dismiss-agent', player_id, agent_id }
```

### Server → All

```typescript
// State updates
{ type: 'world:state', agents, players, map, objects, turn_state }

// Navigation
{ type: 'map:change', map, objects, current_path, parent_path }
{ type: 'realm:tree', tree }           // Directory hierarchy
{ type: 'realm:presence', presence }   // Agent locations

// Events
{ type: 'agent:joined', agent }
{ type: 'agent:left', agent_id }
{ type: 'action:result', success, error?, result? }
{ type: 'agent:thought', agent_id, text }
{ type: 'agent:activity', agent_id, activity }

// Collaboration
{ type: 'spawn:request', agent }
{ type: 'findings:posted', finding }
{ type: 'knowledge:level-up', agent_id, area, level }
{ type: 'quest:update', quests }
```

## Data Flow Examples

### Agent Summon Flow

1. Player types `/summon name="Doc Scribe" role="Technical Writer"`
2. Client sends `player:command` to server
3. BridgeServer calls `AgentSessionManager.spawnAgent()`
4. Manager creates SDK session with mission prompt
5. SDK session starts, agent registered via `agent:register`
6. Server broadcasts `agent:joined` to all clients
7. Client creates AgentSprite at spawn position
8. Agent begins autonomous work loop

### File Exploration Flow

1. Agent SDK session calls `Glob` tool (e.g., `**/*.ts`)
2. EventTranslator emits `agent:activity` "Searching for TypeScript files"
3. Server broadcasts to clients
4. Client shows activity indicator above agent sprite
5. Tool returns results to agent
6. Agent calls `UpdateKnowledge` with insights
7. Server saves to `.knowledge/agents/<name>.md`
8. Server broadcasts `knowledge:level-up` event

### Navigation Flow

1. Player clicks nav_door object (subdirectory)
2. Client sends `player:navigate-enter` with object_id
3. BridgeServer:
   - Pushes current path to navigation stack
   - Generates new map for subdirectory
   - Updates player position
4. Server sends `map:change` with new map data
5. GameScene fades out, loads new map, fades in
6. MiniMap updates to show new location

## Testing Strategy

### Server Tests (`server/src/__tests__/`)

- **Unit tests:** Individual modules (WorldState, TurnManager, etc.)
- **Integration tests:** Full protocol message flows
- **Coverage:** 209 tests, high coverage
- **Runner:** Vitest + tsx
- **Pattern:** `*.test.ts` files in `__tests__/` dirs

### Client Tests (`client/src/__tests__/`)

- **Unit tests:** Network, systems, utilities
- **Component tests:** UI panels (DOM manipulation)
- **Mocking:** WebSocket, Phaser (for sprite tests)
- **Runner:** Vitest + jsdom
- **Coverage target:** 80% (ambitious)
- **Current:** 5 tests (WebSocketClient)

## Deployment

### Development

```bash
# All services (recommended)
./scripts/start-all.sh

# Individual services
npm run dev:server   # Port 3001
npm run dev:client   # Port 5173
```

### Production

```bash
# Build
npm run build:server
npm run build:client

# Run
npm run start:server  # Compiled JS
npm run start:client  # Static files (serve via nginx/vercel)
```

### Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=production

# Optional: GitHub integration
GH_TOKEN=<personal_access_token>  # For QuestManager
```

## MCP Integration

### RpgMcpServer (`server/src/RpgMcpServer.ts`)

**Purpose:** Registers custom RPG tools as an in-process MCP server

**Implementation:**
```typescript
const rpgServer = createRpgMcpServer(customToolHandler);
const options = {
  mcpServers: [rpgServer],
  // ... other SDK options
};
const result = await query(mission, options);
```

**Tool Registration:**
- Each tool has JSON schema definition
- Tools appear as `mcp__rpg__<ToolName>` to Claude
- Tool execution handled by CustomToolHandler
- Results returned to SDK, then to agent

**Benefits:**
- Agents can collaborate (SummonAgent)
- Agents can share knowledge (PostFindings)
- Agents can track expertise (UpdateKnowledge)
- Agents can self-organize (ClaimQuest)

## Future Architecture Considerations

### Scalability

**Current:** Single-process server (fine for 10-20 agents)

**Future (100+ agents):**
- Horizontal scaling: Multiple BridgeServer instances
- Redis for shared state (WorldState, KnowledgeVault)
- Message queue for agent actions (RabbitMQ, Kafka)
- Database for persistent storage (PostgreSQL)

### Security

**Current:** Local development only

**Future (public deployment):**
- Agent authentication (API keys)
- Player authentication (OAuth)
- Rate limiting per agent
- Sandbox agent file access (chroot, containers)
- Webhook verification for GitHub integration

### Performance

**Current Bottlenecks:**
- MapGenerator for large repos (1000+ files)
- SDK session startup time (~2s per agent)

**Optimizations:**
- Cache generated maps
- Pre-warm SDK sessions
- Lazy-load directory contents
- Paginate quest list

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for developer onboarding, coding standards, and PR guidelines.

## References

- **Claude Agent SDK:** https://github.com/anthropics/agent-sdk
- **Phaser 3 Docs:** https://phaser.io/phaser3/documentation
- **WebSocket Protocol:** https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **MCP Specification:** https://modelcontextprotocol.io/
