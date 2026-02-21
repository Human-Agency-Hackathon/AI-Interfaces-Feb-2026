# Agent Dungeon (AI-Interfaces-Feb-2026)

## Workflow Rules

- **Always commit and push.** After making changes, commit and push to `main` without being asked. The team accesses this repo from multiple devices; unpushed work is invisible work.

## Project Overview

This repo is the umbrella for "Agent Dungeon": a visual interface that renders AI sub-agents as characters in a classic JRPG. The main codebase lives in `ha-agent-rpg/`. Project docs live in `docs/`.

See `docs/BRIEF.md` for the full project brief and `docs/ARCHITECTURE.md` for system architecture.

## Repo Structure

```
AI-Interfaces-Feb-2026/
├── docs/                    # Project documentation (BRIEF.md, ARCHITECTURE.md)
├── ha-agent-rpg/            # Main codebase
│   ├── shared/protocol.ts   # Canonical message types (source of truth)
│   ├── server/src/          # Bridge server (TypeScript, WebSocket, port 3001)
│   ├── client/src/          # Phaser 3 game client (TypeScript, Vite, port 5173)
│   ├── agent/               # Python sample agents
│   ├── skills/              # Process skill definitions (brainstorm, etc.)
│   └── scripts/             # start-all.sh launcher
└── CLAUDE.md                # This file
```

## Development Commands

All commands run from `ha-agent-rpg/`:

```bash
# Start everything (bridge + client + 2 sample agents)
./scripts/start-all.sh

# Or run individually:
npm run dev:server          # Bridge server on :3001
npm run dev:client          # Phaser client on :5173
cd agent && python3 agent.py agent_1 Hero ff3300  # Sample agent
```

### Testing

```bash
npm run test -w server      # Server unit tests (vitest)
npm run test -w client      # Client tests (vitest)
npm run build -w server     # Type check server
npm run build -w client     # Type check + build client
```

### Python Agent Setup

```bash
cd ha-agent-rpg/agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For LLM-powered agents: `export ANTHROPIC_API_KEY="your-key"` then use `llm_agent.py`.

## Architecture (Quick Reference)

Three processes over WebSocket:

1. **Bridge Server** (`server/src/`) -- Source of truth. Validates actions, manages world state, spawns agent sessions via Claude Agent SDK.
2. **Phaser Client** (`client/src/`) -- Pure renderer. Receives state, draws the JRPG world. Only sends player commands.
3. **Agents** (`agent/`) -- Connect via WebSocket, receive turns, decide actions (scripted or LLM-powered).

The bridge is the hub; agents and the client never talk directly to each other.

## Git Workflow

This is a hackathon. Commit and push early and often. Do not accumulate large changesets; small, frequent commits keep the team aligned and avoid painful integrations. When in doubt, push what you have. Pull `origin main` frequently too; teammates are constantly pushing new code and you need to stay current.

## Documentation

- **Viewing**: All markdown is authored for Obsidian. Obsidian is the document viewer for this project.
- **Diagrams**: Always use Mermaid. Never use ASCII art diagrams. Prefer vertical orientation (`graph TD`, top-down) over horizontal (`graph LR`) as it reads better in Obsidian's narrow panes. Sequence diagrams and state diagrams are naturally vertical and fine as-is.

## Key Conventions

### Protocol Types

`shared/protocol.ts` is the single source of truth for all WebSocket message types. It is mirrored in `server/src/types.ts` and `client/src/types.ts`. When adding or changing message types:

1. Edit `shared/protocol.ts` first
2. Update the server and client `types.ts` re-exports to match
3. Add the new type to the `ClientMessage` or `ServerMessage` union as appropriate

### TypeScript

- Strict mode enabled (`tsconfig.base.json`)
- ES2020 target, ESNext modules, bundler module resolution
- Server uses `tsx` for dev (watch mode), `tsc` for builds
- Client uses Vite for dev and builds

### Server Patterns

- `BridgeServer.ts` is the central orchestrator (~1000 lines). It routes messages, manages game phases, and wires up event listeners between subsystems.
- Agent sessions are managed by `AgentSessionManager.ts` using the Claude Agent SDK `query()` function.
- Custom MCP tools (SummonAgent, RequestHelp, PostFindings, UpdateKnowledge, ClaimQuest, CompleteQuest) are defined in `RpgMcpServer.ts` and executed by `CustomToolHandler.ts`.
- `ProcessController.ts` manages stage lifecycle for structured multi-agent processes (brainstorming). It tracks turn counts, evaluates completion criteria, and advances stages via a delegate pattern (BridgeServer owns spawning/dismissing).
- `SystemPromptBuilder.ts` builds dynamic system prompts per agent. Supports two modes: codebase exploration prompts (original) and process-aware prompts (brainstorming) via a `processContext` field.
- Persistence uses JSON files in `.agent-rpg/` directories (knowledge vaults, findings board, transcript logs).
- Map generation is lazy: `MapGenerator` only creates tile data for a folder when an agent first visits it.

### Skills / Process Templates

Skills are structured multi-agent workflows defined in `skills/`. Each skill is a self-contained directory with:
- `SKILL.md` -- The playbook: how to invoke, phase flow, agent missions, timing budget
- `DESIGN.md` -- Full methodology: stage sequences, agent roles/personas, transition rules, output schemas
- `brainstorm-process.json` -- Machine-readable process template encoding the design

The **brainstorm skill** (`skills/brainstorm/`) is the first process skill. It runs a 9-stage divergent-then-convergent ideation session:

```
Problem Framing → Divergent Thinking (parallel with Precedent Research)
    → Convergent Thinking → Fact Checking (parallel with Pushback)
    → Prioritization [human gate] → Review → Presentation
```

Key details:
- 15 agent personas across 9 stages, each with distinct thinking styles and system prompt addendums
- Configurable: fast demo mode (~3 min, 6 stages) or thorough mode (~8-10 min, all 9 stages)
- Human intervention via commands: `/approve`, `/inject`, `/skip`, `/kill`, `/deepen`, `/redirect`, `/restart`, `/export`
- Groupthink prevention: divergent agents are isolated and cannot see each other's output until the stage ends
- `ProcessController` on the server drives stage transitions; `brainstorm-process.json` is the template it executes

### Client Patterns

- Three Phaser scenes: BootScene (texture generation), GameScene (map + sprites), UIScene (dialogue overlay).
- All textures are generated programmatically in BootScene; there are zero image asset files.
- UI panels (PromptBar, QuestLog, MiniMap, DialogueLog) are DOM overlays, not Phaser objects.
- `WebSocketClient.ts` is a simple pub-sub wrapper with auto-reconnect.
- Game canvas is 640x480 with 32px tiles (20x15 grid).

### Python Agent Patterns

- `protocol.py` has dataclass message builders. Use `RegisterMessage` and `ActionMessage`.
- `behaviors.py` has `ScriptedBehavior` for demo. `llm_behavior.py` has `LLMBehavior` (conversation history) and `SimpleReflexBehavior` (single-shot).
- Agents connect to `ws://localhost:3001` and loop on incoming messages.

## Testing

- Server tests are in `server/src/__tests__/` using vitest. Tests exist for: BridgeServer (e2e), CustomToolHandler, EventTranslator, FindingsBoard, GitHelper, KnowledgeVault, MapGenerator, QuestManager, RealmRegistry, RpgMcpServer, WorldState, WorldStatePersistence, protocol-types.
- Client tests use vitest with happy-dom/jsdom. Coverage is still being built out.
- CI runs on GitHub Actions: type check both workspaces, run server tests, upload coverage to Codecov, quality gate requires all jobs to pass.

## Persistence Locations

- `.agent-rpg/knowledge/{agentId}.json` -- Per-agent knowledge vaults
- `.agent-rpg/findings/board.json` -- Shared findings board
- `.agent-rpg/logs/{agentId}/{date}.jsonl` -- Daily transcript logs
- `~/.agent-rpg-global/.agent-rpg/realms.json` -- Global realm registry

## Ports

| Service | Port |
|---------|------|
| Bridge Server | 3001 |
| Phaser Client (Vite) | 5173 |

## Dependencies

### Server (`server/package.json`)
- `@anthropic-ai/claude-agent-sdk` -- Agent session management
- `ws` -- WebSocket server
- `octokit` -- GitHub API for repo analysis
- `zod` -- Schema validation

### Client (`client/package.json`)
- `phaser` -- Game engine (v3.87+)
- `vite` -- Dev server and bundler

### Python (`agent/requirements.txt`)
- `websockets` -- WebSocket client
- `anthropic` -- Claude API for LLM agents
