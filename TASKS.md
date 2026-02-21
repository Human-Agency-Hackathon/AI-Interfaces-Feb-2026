# Agent Dungeon: Task Board

## Team

| Name | Area(s) | Notes |
|------|---------|-------|
| Ida | Visual Design / Presentation | Skinning, splash page, public-facing styles, presentation strategy |
| Jeff | | |
| Pratham | Agent Memory / Persistence | Working on Redis agent memory |
| Behrang | Core Engine / Agent Orchestration | Getting core working, rooms represent agents, agent orchestration |
| Ken | Project Management / Process Design | PM, workflows, process definitions for orchestrator and agents |

---

## Status Key

- **Done**: Merged and working
- **In Progress**: Actively being worked on
- **TODO**: Not started, ready to pick up
- **Blocked**: Waiting on something else

---

## What's Built (Done)

These are working and merged on `main`:

### Bridge Server
- [x] WebSocket hub and message routing (`BridgeServer.ts`)
- [x] World state management (`WorldState.ts`)
- [x] Turn management with round-robin and 5s timeout
- [x] Action validation
- [x] GitHub repo analysis via Octokit (`RepoAnalyzer.ts`)
- [x] Local filesystem repo analysis (`LocalTreeReader.ts`)
- [x] Hierarchical map generation from repo structure (`MapGenerator.ts`)
- [x] Quest management mapped from GitHub issues (`QuestManager.ts`)
- [x] Findings board for shared agent discoveries (`FindingsBoard.ts`)
- [x] Per-agent knowledge vaults with persistence (`KnowledgeVault.ts`)
- [x] Realm registry for session resumption (`RealmRegistry.ts`)
- [x] World state persistence/serialization (`WorldStatePersistence.ts`)
- [x] Agent session management via Claude Agent SDK (`AgentSessionManager.ts`)
- [x] Custom MCP server with 6 RPG tools (`RpgMcpServer.ts`)
- [x] Dynamic system prompt builder (`SystemPromptBuilder.ts`)
- [x] Event translator for SDK streaming -> RPG events (`EventTranslator.ts`)
- [x] Transcript logging (`TranscriptLogger.ts`)
- [x] Server tests (vitest): FindingsBoard, EventTranslator, WorldStatePersistence, MapGenerator, CustomToolHandler, KnowledgeVault, QuestManager, RealmRegistry

### Phaser Client
- [x] Tile map rendering (`MapRenderer.ts`)
- [x] Programmatic texture generation (no asset files)
- [x] Agent sprites with walk/idle animations (`AgentSprite.ts`)
- [x] Map object sprites for files (`MapObjectSprite.ts`)
- [x] JRPG dialogue system with typewriter effect (`DialogueSystem.ts`)
- [x] Thought bubbles (`ThoughtBubble.ts`)
- [x] Emote bubbles (!, ?, heart, sweat, music)
- [x] Skill effect animations (`EffectSystem.ts`)
- [x] Camera controller with snap/pan (`CameraController.ts`)
- [x] Prompt bar with slash-command autocomplete (`PromptBar.ts`)
- [x] Quest log panel (`QuestLog.ts`)
- [x] Minimap with folder tree (`MiniMap.ts`)
- [x] Dialogue log (`DialogueLog.ts`)
- [x] Title screen (`TitleScreen.ts`)
- [x] Repo selection screen (`RepoScreen.ts`)
- [x] WebSocket client with auto-reconnect (`WebSocketClient.ts`)

### Python Agents
- [x] Scripted demo agent (`agent.py` + `behaviors.py`)
- [x] LLM-powered agent via Claude API (`llm_agent.py` + `llm_behavior.py`)
- [x] Protocol dataclass helpers (`protocol.py`)

### Infrastructure
- [x] GitHub Actions CI (type checking, server tests, codecov)
- [x] `start-all.sh` launch script
- [x] Shared protocol types (`shared/protocol.ts`)
- [x] Project brief and architecture docs

---

## What Needs to Be Done

### High Priority: Pivot to Process-Driven Brainstorming (Behrang)

> The system is pivoting from "analyze a codebase" to "run a brainstorming process." These tasks convert the engine from repo exploration to following a defined process with agents, conditionals, and branching paths. Ordered by dependency.

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Define the Process Schema | Behrang | TODO | Create a data structure (JSON/TS types) that describes a brainstorming workflow: stages, agent roles, conditionals, branching paths, and completion criteria. This is the foundation everything else builds on. Lives in `shared/` so server and client can share it. |
| 2 | Replace onboarding flow: problem input instead of repo URL | Behrang | TODO | Swap `link:repo` message and RepoScreen with a "brainstorming problem" input. User enters a problem statement; server loads/creates a process definition. RepoAnalyzer and LocalTreeReader become unused. |
| 3 | Rebuild MapGenerator to create rooms from process stages, not folders | Behrang | TODO | Each room represents a stage or agent workspace in the brainstorming process. Doors connect stages based on the process flow (linear, branching). Objects in rooms represent ideas/artifacts, not files. |
| 4 | Rewrite agent spawning to be process-driven | Behrang | TODO | Instead of an Oracle that summons specialists ad hoc, the process definition dictates which agents spawn and when. Each stage defines its agent roles (e.g. "Devil's Advocate", "Synthesizer", "Domain Expert"). AgentSessionManager spawns them at the right time based on process state. |
| 5 | Build the conditional/branching engine | Behrang | TODO | Process paths can branch: if an agent produces output X, go to path Y. Needs a state machine or flow controller that evaluates conditions after each stage completes and routes to the next stage. Conditions could be based on agent output, vote counts, or time limits. |
| 6 | Update turn system from round-robin to process-driven | Behrang | TODO | Turns shouldn't just cycle through all agents. The current process stage determines who acts: some stages are single-agent, some are parallel discussion, some are sequential. The process definition controls turn order. |
| 7 | Replace MCP tools with brainstorming tools | Behrang | TODO | Current tools (ClaimQuest, PostFindings, etc.) are codebase-oriented. New tools for brainstorming: ProposeIdea, Critique, Vote, Synthesize, BuildOn (extend another agent's idea), EscalateToHuman. Update RpgMcpServer and CustomToolHandler. |
| 8 | Update SystemPromptBuilder for process roles | Behrang | TODO | Instead of "you are an Oracle exploring a codebase", prompts become "you are a [role] in stage [N] of a brainstorming session about [problem]. Your job is [stage task]." Include context from previous stages, other agents' outputs, and the process definition. |
| 9 | Update WorldState to track process state instead of repo state | Behrang | TODO | Remove repo-specific fields (file tree, GitHub issues). Add: current stage, completed stages, branch history, collected ideas/artifacts per stage, agent outputs, vote tallies. Snapshot serialization still works for persistence. |
| 10 | Update shared protocol types for process events | Behrang | TODO | New message types: `process:start`, `stage:advance`, `stage:complete`, `condition:evaluated`, `branch:taken`, `idea:proposed`, `idea:voted`. Deprecate or remove repo-specific messages (`link:repo`, `repo:ready`, `realm:*`). Update `shared/protocol.ts` first, then server and client types. |
| 11 | End-to-end integration: problem input -> process loads -> agents spawn -> brainstorm runs -> output | Behrang | TODO | The full happy path for the new flow. Enter a problem, watch agents appear in their rooms, brainstorm through stages, follow conditionals, produce a final synthesis. |

### High Priority: Polish & Stability

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 12 | Client-side tests | | TODO | At minimum: scene lifecycle, WebSocket message handling, panel rendering |
| 13 | Error handling for process loading and agent failures | | TODO | User-facing error messages in the client |
| 14 | Graceful handling when agent SDK session disconnects or errors | | TODO | Reconnection, error state in UI |
| 15 | Loading states during process initialization | | TODO | Progress indicator or spinner in client |

### Medium Priority: Visual & UX

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 16 | Skin the game: replace colored rectangles with real pixel art characters | Ida | In Progress | Agent roles need distinct sprites that match brainstorming personas |
| 17 | Splash page and public-facing presentation styles | Ida | In Progress | How we present Agent Dungeon externally; landing page, branding |
| 18 | Improve tile map aesthetics (dungeon tileset) | Ida | TODO | Current map is functional but basic |
| 19 | Sound effects and ambient audio | | TODO | Movement, dialogue open/close, skill effects, background music |
| 20 | Onboarding tutorial or hints for first-time users | | TODO | Explain what they're looking at, how to interact |
| 21 | Responsive layout or at minimum handle window resize gracefully | | TODO | Currently 640x480 fixed |

### Medium Priority: Redis Agent Memory (Pratham)

> The persistence layer currently uses JSON files on disk via `fs/promises`. Every module follows the same pattern: load JSON into memory on startup, mutate in-memory, save back to disk. This needs to move to Redis for speed, cross-session persistence, and multi-agent scale. Ordered by dependency.

**Current persistence modules and their consumers:**

| Module | What it stores | Consumers |
|--------|---------------|-----------|
| `KnowledgeVault` | Per-agent memory: expertise levels, insights, task history | AgentSessionManager (creates per spawn), CustomToolHandler (UpdateKnowledge tool), SystemPromptBuilder (reads for prompts) |
| `FindingsBoard` | Shared discovery/ideas board | BridgeServer (creates per session), CustomToolHandler (PostFindings tool), SystemPromptBuilder (reads for prompts) |
| `WorldStatePersistence` | Full serialized game/process state | BridgeServer (save/load on session start/end) |
| `RealmRegistry` | Global registry of sessions (currently repos, will become brainstorming sessions) | BridgeServer (session management, resumption) |
| `TranscriptLogger` | Append-only JSONL event logs per agent | BridgeServer, AgentSessionManager (logs every SDK message) |

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 22 | Define a storage adapter interface | Pratham | TODO | Create a `StorageAdapter` interface (or set of interfaces) with `load()`, `save()`, `get()`, `set()`, `append()` methods that both JSON-file and Redis implementations can satisfy. All five modules above should code against this interface, not directly against `fs` or `redis`. This lets the rest of the codebase stay unchanged while the backend swaps out. |
| 23 | Set up Redis client and connection management | Pratham | TODO | Add `ioredis` (or `redis`) package. Create a singleton Redis client with connection config (host, port, auth), error handling, reconnection logic, and graceful shutdown. Needs to work in dev (local Redis or Docker) and potentially prod. Add a `docker-compose.yml` or document the local Redis setup. |
| 24 | Migrate KnowledgeVault to Redis | Pratham | TODO | Key design: `agent:{agentId}:knowledge` as a Redis hash (expertise, role, realm) + `agent:{agentId}:insights` as a list + `agent:{agentId}:task_history` as a list of JSON strings. Must keep the same public API (`getKnowledge()`, `addInsight()`, `incrementExpertise()`, etc.) so AgentSessionManager and CustomToolHandler don't change. With brainstorming pivot: `files_analyzed` and `realm_knowledge` may become `ideas_contributed` and `topic_knowledge`. Coordinate with Behrang on schema. |
| 25 | Migrate FindingsBoard to Redis | Pratham | TODO | Key design: `session:{sessionId}:findings` as a Redis sorted set (score = timestamp) or list. Findings are small JSON objects. `addFinding()` -> `RPUSH` or `ZADD`, `getRecent()` -> `LRANGE` or `ZREVRANGE`. With brainstorming pivot: findings become "ideas" or "proposals"; the data shape may change. Keep the interface stable. |
| 26 | Migrate WorldStatePersistence to Redis | Pratham | TODO | Key design: `session:{sessionId}:state` as a single JSON blob (`SET`/`GET`). Could also break into sub-keys if the state gets large. With the process-driven pivot, this stores process state (current stage, branch history, agent outputs) rather than repo state. Coordinate with Behrang on what WorldState looks like after the pivot. |
| 27 | Migrate RealmRegistry to Redis | Pratham | TODO | Key design: `sessions` as a Redis hash where each field is a session ID and the value is a JSON entry. `listRealms()` -> `HVALS`, `getRealm()` -> `HGET`, `saveRealm()` -> `HSET`. With the pivot, "realms" become brainstorming sessions. The registry shape stays similar; the content changes. |
| 28 | Migrate TranscriptLogger to Redis Streams (or keep on disk) | Pratham | TODO | Decision needed: transcript logs are append-only and can get large. Redis Streams (`XADD`) are a natural fit and enable real-time replay, but storage cost is higher than JSONL files. Alternative: keep transcripts on disk, only move hot state to Redis. If using Streams: `transcript:{agentId}` stream with JSON message payloads. |
| 29 | Update tests to work with Redis | Pratham | TODO | Existing tests (KnowledgeVault, FindingsBoard, WorldStatePersistence, RealmRegistry, CustomToolHandler) use temp directories and JSON files. Need either: (a) mock the storage adapter in unit tests, or (b) use a test Redis instance (testcontainers, or `redis-memory-server`). Integration tests should hit real Redis. |
| 30 | Wire up Redis adapter in BridgeServer and AgentSessionManager | Pratham | TODO | BridgeServer currently instantiates all persistence modules with file paths. Swap to Redis-backed implementations. AgentSessionManager creates KnowledgeVaults on agent spawn; needs to use the Redis version. This is the integration point where everything comes together. |
| 31 | Redis pub/sub for real-time agent events (stretch) | Pratham | TODO | Stretch goal: use Redis pub/sub channels for agent-to-agent communication or for broadcasting findings/ideas to all connected clients. Could replace or augment the WebSocket broadcast for certain event types. Evaluate whether this adds value over the existing WebSocket hub. |

### Medium Priority: Agent Intelligence

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 32 | Design brainstorming agent role prompts (Devil's Advocate, Synthesizer, etc.) | | TODO | Each role needs a distinct personality, reasoning style, and behavioral pattern |
| 33 | Agent conversation/collaboration: agents that respond to and build on each other's ideas | | TODO | Agents need to reference, critique, and extend other agents' outputs |
| 34 | Token budget management to control API costs | | TODO | Server tracks settings but enforcement may need work |

### Lower Priority: Features & Extensions

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 35 | Manual mode: player injects ideas directly into the brainstorm | | TODO | Mode selector exists, but manual input flow needs reworking for brainstorming |
| 36 | Supervised mode: agents propose ideas, player approves/redirects | | TODO | Approval UI needed |
| 37 | Process template library: prebuilt brainstorming workflows users can pick from | | TODO | e.g. "Six Thinking Hats", "SCAMPER", "Design Sprint", custom |
| 38 | Export session: save brainstorming output as a structured report | | TODO | Transcript logs exist but need a synthesis/export format |
| 39 | Dashboard view: summary of ideas generated, votes, stages completed | | TODO | Aggregate view beyond the in-game panels |

---

## Open Tasks (Unscoped)

Ideas and features that need further scoping before they become numbered tasks.

- **Agent interrupt / stop**: Ability to halt a running agent mid-task. Needs a cancel mechanism through the bridge (kill the SDK session, broadcast `agent:left`, clean up world state). UI needs a stop button per agent or a global halt.
- **Agent character sheets and stats**: Each agent gets a visible character sheet with RPG stats (e.g. Insight, Speed, Focus, Expertise). Stats could be derived from knowledge vault data (files analyzed, findings posted, quests completed) and influence behavior or visual presentation.
- **Task difficulty representation**: Quests/tasks should have a visible difficulty rating (e.g. star rating, CR-style level, or color coding). Could be derived from issue labels, file complexity, lines of code, or manual tagging. Affects which agents are suited to claim them and how the UI presents them.

---

## How to Claim a Task

1. Put your name in the **Owner** column
2. Update **Status** to `In Progress`
3. Create a branch: `feature/<short-description>` or `fix/<short-description>`
4. When done, open a PR against `main`
5. Update **Status** to `Done` after merge

---

## Open Questions

- What brainstorming problem should we use for the demo?
- Are we targeting a live demo or a recorded walkthrough?
- What's the deadline?
- Should we prioritize visual polish or agent intelligence for the demo?
- How much of the old codebase-analysis code do we keep vs. remove? (Some modules like RepoAnalyzer, LocalTreeReader, QuestManager may be fully replaced)
- What's the first process template to build? (e.g. simple linear 3-stage brainstorm, or something with branching)
