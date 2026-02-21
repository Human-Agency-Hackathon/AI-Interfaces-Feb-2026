# Agent Dungeon (AI-Interfaces-Feb-2026)

## Workflow Rules

- **Always commit and push.** After making changes, commit and push to `main` without being asked. The team accesses this repo from multiple devices; unpushed work is invisible work.
- **Test constantly.** Write tests and run tests as part of every change, not as an afterthought. The cycle is: **write code → write/update tests → run tests → fix failures → commit and push**. Every commit should leave tests passing. Run `npm run test -w server` and/or `npm run test -w client` after every meaningful change. If you add a new function, add a test. If you fix a bug, add a regression test. If you refactor, run existing tests to confirm nothing broke. Do NOT accumulate untested code; small tested commits move the team faster than large untested ones.
- **Know your identity.** At the start of every session, read `.agent-owner` in the repo root. It contains a single line: the name of the team member you're working for (e.g. `Ken`, `Behrang`). Use this name when posting to the Bulletin Board. If `.agent-owner` does not exist, **ask the user who they are** immediately, then create the file with their name. The file is `.gitignore`d so each machine has its own identity. The team roster is at the top of `TASKS.md`.
- **Use the Bulletin Board.** `TASKS.md` has a Bulletin Board section near the bottom.
  - **Every pull:** After every `git pull`, re-read the Bulletin Board in `TASKS.md`. Look for **new messages @-mentioning your owner** (e.g. `@Behrang`, `@Ida`). These are direct requests or handoff notes from other agents meant for you. Also scan recent messages from others to understand what's changed. This applies at session start and any time you pull mid-session.
  - **At session end:** Add a row with today's date, **current time** (`HH:MM`, 24-hour local), your owner's name, and a concise message covering: (1) what you accomplished, (2) anything left unfinished or broken, (3) what the next agent needs to know. **Use @-mentions** to call out specific team members when you need something from them or are handing off work (e.g. `@Behrang: the schema is ready for you to integrate`).
  - **Timestamps are required.** Every bulletin board entry must include the date (`YYYY-MM-DD`) and time (`HH:MM`, 24-hour local). This helps the team read messages chronologically and know what's fresh. Use `—` for the time field only if the actual time is unknown (e.g. for legacy entries).
  - **Cross-domain requests:** If your work touches another team member's core domain (see table below), **do not silently modify their code**. Instead, leave a Bulletin Board message @-mentioning them with what you need, why, and any context. Let them make changes in their domain, or at minimum get their awareness before you proceed. This prevents stepping on each other's work and keeps domain experts in the loop.
  - **Archiving completed messages:** When a bulletin board message's action items are **fully resolved** (request completed, question answered, informational note acknowledged by all @-mentioned parties), move it from the active board in `TASKS.md` to [`BULLETIN-ARCHIVE.md`](BULLETIN-ARCHIVE.md). This keeps the active board focused on open items and prevents context bloat. Rules:
    - **What to archive:** Messages where all action items are done; purely informational messages that have been read; status updates that are superseded by later updates.
    - **What to keep:** Messages with any open action item; requests not yet fulfilled; questions not yet answered. Mark open items with `**OPEN:**` at the end of the message.
    - **How to archive:** Cut the row(s) from `TASKS.md` and paste them into the table in `BULLETIN-ARCHIVE.md` under a dated section header (e.g. `## Archived 2026-02-21`). Add a `**RESOLVED:**` note explaining why it was archived. Preserve the full original message text.
    - **When to archive:** At session start (clean up old resolved items) and at session end (archive anything you just resolved).
  - **Team handles:** `@Ida`, `@Jeff`, `@Pratham`, `@Behrang`, `@Ken`

## Core Domains

Each team member owns a domain. Respect these boundaries; use the Bulletin Board for cross-domain requests.

| Name | Core Domain | Owns |
|------|------------|------|
| **Ida** | Visual Design / Presentation | BootScene textures, AgentSprite, UI styling (index.html CSS), TitleScreen, RepoScreen, landing page, design tokens |
| **Jeff** | Brainstorming Process Design | Stage sequences, agent roles/personas, transition rules, process templates in `skills/`, DESIGN.md methodology |
| **Pratham** | Agent Memory / Persistence | Redis integration, storage backends, FindingsBoard/KnowledgeVault/WorldStatePersistence implementations, inter-agent comms |
| **Behrang** | Core Engine / Agent Orchestration | BridgeServer, ProcessController, AgentSessionManager, SystemPromptBuilder, MCP tools, turn system, protocol types |
| **Ken** | Project Management / Process Design | TASKS.md, CLAUDE.md, sprint planning, process definitions, architecture decisions, unblocking |

## Project Overview

This repo is the umbrella for "Agent Dungeon": a visual interface that renders AI sub-agents as characters in a classic JRPG. The main codebase lives in `ha-agent-rpg/`. Project docs live in `docs/`.

See `docs/BRIEF.md` for the full project brief, `docs/ARCHITECTURE.md` for system architecture, and `docs/diagrams/` for visual Mermaid diagrams of all key flows.

## Repo Structure

```
AI-Interfaces-Feb-2026/
├── docs/                    # Project documentation (BRIEF.md, ARCHITECTURE.md)
│   └── diagrams/            # Mermaid flow diagrams (READ AT SESSION START)
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

### System Diagrams (`docs/diagrams/`)

**Read these at session start.** `docs/diagrams/` contains Mermaid diagram documents covering all key flows. Read the ones relevant to your work before making changes:

| Document | Read if you're working on... |
|----------|------------------------------|
| `system-overview.md` | Anything (start here for orientation) |
| `agent-lifecycle.md` | Agent spawning, session management, shutdown, AgentSessionManager |
| `agent-communication.md` | Findings board, inter-agent messaging, system prompts, knowledge vaults |
| `brainstorm-process.md` | ProcessController, stage transitions, brainstorm skill, personas |
| `fog-of-war-map.md` | Overworld map, biomes, agent forts, fog reveal, camera modes, minimap |
| `client-rendering.md` | Phaser scenes, UI panels, WebSocket handlers, screen flow |
| `data-persistence.md` | Redis, knowledge vaults, realm registry, transcript logs |

**Keep diagrams up to date.** Diagrams are living documentation, not a one-time artifact. Follow these rules:

- **When you change a flow**, update the corresponding diagram. If you modify how agents spawn, update `agent-lifecycle.md`. If you add a new message type, update `system-overview.md`. If you change the brainstorm stages, update `brainstorm-process.md`. The diagram should match the code; stale diagrams are worse than no diagrams.
- **When you add a new subsystem or major feature**, add a diagram for it. Either add a section to an existing diagram doc or create a new file in `docs/diagrams/`. Update `docs/diagrams/README.md` to include it.
- **When you notice a diagram is wrong**, fix it immediately. Don't leave it for someone else. If you're reading a diagram and the code doesn't match, the diagram is the one that's wrong; update it to reflect reality.
- **Scope**: You don't need to diagram every helper function. Diagram the flows that cross module boundaries: message routing, event chains, lifecycle transitions, data flow between subsystems. If a new agent session would need to understand it to do their work, it belongs in a diagram.

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
