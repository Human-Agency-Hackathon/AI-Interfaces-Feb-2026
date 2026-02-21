# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HA Agent RPG** is a visual theater for autonomous AI agents rendered as a classic JRPG. Claude agents explore codebases while their actions unfold in a real-time 2D game world. The system has three tiers:

- **Bridge Server** (Node.js/TypeScript, port 3001) — source of truth for world state, turn management, WebSocket hub
- **Game Client** (Phaser 3/TypeScript, port 5173) — pure renderer, never sends actions
- **Python Agents** — Claude-powered autonomous agents that connect via WebSocket

## Development Commands

### Root (monorepo)
```bash
npm install           # Install all workspace dependencies
npm run dev:server    # Server in watch mode
npm run dev:client    # Client dev server
./scripts/start-all.sh  # Launch all 3 components at once
```

### Server (`server/`)
```bash
npm run dev           # tsx watch (hot reload)
npm run build         # tsc compile
npm run test          # vitest run (single pass)
npm run test:watch    # vitest watch mode
```

### Client (`client/`)
```bash
npm run dev           # vite dev server
npm run build         # tsc + vite build
npm run test          # vitest run
npm run test:coverage # vitest with coverage (80% thresholds)
```

### Python Agent (`agent/`)
```bash
python agent.py       # Scripted demo agent
python llm_agent.py   # Claude-powered autonomous agent
```

## Architecture

### Shared Protocol (`shared/protocol.ts`)
Canonical message types used by all three components. Every agent action, world state update, and server event is typed here. Always check this file first when adding new message types.

### Turn-Based Action Flow
1. Agent registers → server sends full `world:state` snapshot
2. Server sends `turn:start {agent_id, turn_id, timeout_ms: 5000}`
3. Agent sends `agent:action {action, params, turn_id}`
4. Server validates → broadcasts `action:result` to everyone
5. Next agent's turn begins

**Action types**: `move {x,y}`, `speak {text}`, `skill {skill_id, target_id}`, `interact {object_id}`, `emote {type}`, `wait {duration_ms}`, `think {text}`

### World State (`server/src/WorldState.ts`)
20×15 tile map. Tile values: grass=0, wall=1, water=2. Agents have position, HP, MP, name, color. Quests tracked here.

### Map Generation (`server/src/MapGenerator.ts`)
Procedurally generates JRPG maps from the analyzed repository's directory structure. No external assets — all textures are programmatically generated in `client/src/scenes/BootScene.ts`.

### Agent Tools (6 custom MCP tools via `server/src/RpgMcpServer.ts`)
`SummonAgent`, `RequestHelp`, `PostFindings`, `UpdateKnowledge`, `ClaimQuest`, `CompleteQuest` — implemented in `CustomToolHandler.ts`.

### Realm Persistence
`RealmRegistry.ts` tracks explored repositories globally in `~/.agent-rpg-global`. World state persisted per-repo in `WorldStatePersistence.ts`. Runtime data (findings, knowledge, logs) lives in `.agent-rpg/`.

### Client Architecture
Pure renderer pattern — `main.ts` bootstraps screens and dispatches server events to Phaser scenes. The `UIScene` overlays the `GameScene`. No client-side game logic; all state comes from server.

## Testing

Both server and client use **Vitest** (no Jest). Server has 13 test files in `server/src/__tests__/` including E2E tests for `BridgeServer`. Run a single test file:
```bash
npx vitest run src/__tests__/WorldState.test.ts   # from server/
npx vitest run src/__tests__/network/WebSocketClient.test.ts  # from client/
```

## Key Docs
- `docs/ARCHITECTURE.md` — detailed architecture notes
- `docs/API_REFERENCE.md` — protocol message reference
- `agent/README.md` — agent development guide
