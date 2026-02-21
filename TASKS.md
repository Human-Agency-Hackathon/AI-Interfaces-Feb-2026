# Agent Dungeon: Task Board

## Team

| Name | Area(s) | Notes |
|------|---------|-------|
| Ida | Visual Design / Presentation | Skinning, splash page, public-facing styles, presentation strategy |
| Jeff | Brainstorming Process Design | Defining the brainstorming methodology: stages, agent roles, orchestration logic |
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
| 1 | Define the Process Schema | Behrang | Done | `shared/process.ts`: ProcessDefinition, StageDefinition, RoleDefinition, TurnStructure, CompletionCriteria, ArtifactDefinition, ProcessState, STANDARD_BRAINSTORM template. Server mirror in `server/src/ProcessTemplates.ts`. |
| 2 | Replace onboarding flow: problem input instead of repo URL | Behrang | Done | `player:start-process` message + `handleStartProcess` in BridgeServer. RepoScreen copy updated to problem input. `process:started` listener in main.ts triggers `startGame()`. |
| 3 | Rebuild MapGenerator to create rooms from process stages, not folders | Behrang | TODO | Each room represents a stage or agent workspace in the brainstorming process. Doors connect stages based on the process flow (linear, branching). Objects in rooms represent ideas/artifacts, not files. |
| 4 | Rewrite agent spawning to be process-driven | Behrang | In Progress | `spawnProcessAgents()` in BridgeServer spawns stage roles with persona-aware mission prompts. Turn system and stage advancement still needed. |
| 5 | Build the conditional/branching engine | Behrang | TODO | Process paths can branch: if an agent produces output X, go to path Y. Needs a state machine or flow controller that evaluates conditions after each stage completes and routes to the next stage. Conditions could be based on agent output, vote counts, or time limits. |
| 6 | Update turn system from round-robin to process-driven | Behrang | TODO | Turns shouldn't just cycle through all agents. The current process stage determines who acts: some stages are single-agent, some are parallel discussion, some are sequential. The process definition controls turn order. |
| 7 | Replace MCP tools with brainstorming tools | Behrang | TODO | Current tools (ClaimQuest, PostFindings, etc.) are codebase-oriented. New tools for brainstorming: ProposeIdea, Critique, Vote, Synthesize, BuildOn (extend another agent's idea), EscalateToHuman. Update RpgMcpServer and CustomToolHandler. |
| 8 | Update SystemPromptBuilder for process roles | Behrang | TODO | Instead of "you are an Oracle exploring a codebase", prompts become "you are a [role] in stage [N] of a brainstorming session about [problem]. Your job is [stage task]." Include context from previous stages, other agents' outputs, and the process definition. |
| 9 | Update WorldState to track process state instead of repo state | Behrang | Done | `ProcessState` added to WorldState with setProcessState/getProcessState/advanceStage/completeProcess/setArtifact. Serialization updated. Repo fields kept for backward compat during transition. |
| 10 | Update shared protocol types for process events | Behrang | Done | `player:start-process`, `process:started`, `stage:advanced`, `stage:completed`, `idea:proposed`, `idea:voted` added to all three type files. |
| 11 | End-to-end integration: problem input -> process loads -> agents spawn -> brainstorm runs -> output | Behrang | TODO | The full happy path for the new flow. Enter a problem, watch agents appear in their rooms, brainstorm through stages, follow conditionals, produce a final synthesis. |

### High Priority: Brainstorming Process Design (Jeff)

> Jeff defines the methodology: what does "brainstorming" actually mean as a structured, multi-agent process? This is the intellectual backbone that Behrang's engine executes. The output is a process definition (stages, roles, transitions, conditionals) that the orchestrator follows. Each stage spawns specific agent roles with distinct thinking styles.

**Brainstorming stages and the thinking modes they require:**

| Stage | Thinking Mode | Purpose |
|-------|--------------|---------|
| Problem Framing | Analytical | Break the problem down, define scope, identify constraints |
| Divergent Thinking | Creative/Generative | Generate as many ideas as possible without judgment |
| Precedent Research | Investigative | Find existing solutions, analogies, prior art |
| Convergent Thinking | Evaluative | Cluster, combine, and narrow ideas into candidates |
| Fact Checking | Critical/Analytical | Verify claims, check feasibility, identify assumptions |
| Pushback / Red Team | Adversarial | Stress-test ideas, find weaknesses, argue the opposite |
| Prioritization | Strategic | Rank candidates by impact, feasibility, effort |
| Review / Synthesis | Integrative | Combine the best elements into a coherent proposal |
| Presentation | Communicative | Package the output for the human audience |

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 12 | Define the brainstorming stage sequence and flow | Jeff | TODO | Document the ordered stages a brainstorming session moves through. Which stages are required vs optional? Which can run in parallel? Where are the decision points that branch the flow? Output: a stage-by-stage flowchart with entry/exit criteria for each. |
| 13 | Define agent roles and their thinking styles | Jeff | TODO | Each stage spawns agents with specific personas. e.g. Divergent stage gets a "Wild Ideator" and a "Cross-Pollinator"; Pushback stage gets a "Devil's Advocate" and a "Pragmatist." For each role: name, personality traits, reasoning style, what they optimize for, what they ignore. These become the system prompt personas Behrang wires into SystemPromptBuilder. |
| 14 | Define stage transition rules and conditionals | Jeff | TODO | What triggers moving from one stage to the next? Options: time limit, idea count threshold, agent consensus, human approval, or automatic after N turns. Some transitions are conditional: e.g. if fact-checking finds major flaws, loop back to divergent thinking. Define the rules for each transition. |
| 15 | Design the Divergent Thinking stage | Jeff | TODO | The generative phase. How many agents? What are their prompts? How do they avoid groupthink (e.g. agents don't see each other's ideas until the stage ends)? What's the output format (list of ideas with brief rationale)? When does it end (time, count, saturation)? |
| 16 | Design the Precedent Research stage | Jeff | TODO | Agents search for existing solutions, analogies from other domains, and prior art. What sources can they draw from (web search, provided context, their own training data)? How do they report findings? How does this feed into the next stage? |
| 17 | Design the Convergent Thinking stage | Jeff | TODO | Takes the raw ideas from divergent + research and clusters/combines them. Agent role: "Synthesizer" who groups related ideas, "Connector" who finds combinations. Output: a shorter list of refined candidate ideas. Needs a defined format so prioritization can consume it. |
| 18 | Design the Fact Checking and Pushback stages | Jeff | TODO | Two related but distinct stages. Fact Checking: verify claims, check feasibility, flag assumptions. Pushback/Red Team: actively argue against each candidate, find failure modes, identify risks. Define how harshly agents push back, what counts as a "kill" vs a "flag." Output: annotated candidates with risk/confidence scores. |
| 19 | Design the Prioritization stage | Jeff | TODO | Takes annotated candidates and ranks them. What criteria? (impact, feasibility, novelty, effort, risk). Single agent with a scoring rubric, or multiple agents that vote? Define the ranking mechanism and output format (ordered list with scores and rationale). |
| 20 | Design the Review and Presentation stages | Jeff | TODO | Review: a final synthesis agent combines the top-ranked ideas into a coherent proposal. Presentation: format the output for the human; clear structure, key recommendations, supporting evidence, acknowledged risks. Define what the final deliverable looks like. |
| 21 | Write the first complete process template (JSON) | Jeff | TODO | Take all the above designs and encode them as a concrete process definition in the schema Behrang defines (task #1). This is the first runnable brainstorming template. Needs: stage list, agent roles per stage, transition rules, conditional branches, output formats. This is what gets loaded when a user starts a session. |
| 22 | Define how human intervention points work | Jeff | TODO | At which stages can/should the human jump in? Options: approve stage transitions, inject their own ideas, redirect the brainstorm, kill a line of thinking, ask for more depth on a topic. Define the interaction model between the watching human and the running process. |

### High Priority: Polish & Stability

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 23 | Client-side tests | | TODO | At minimum: scene lifecycle, WebSocket message handling, panel rendering |
| 24 | Error handling for process loading and agent failures | | TODO | User-facing error messages in the client |
| 25 | Graceful handling when agent SDK session disconnects or errors | | TODO | Reconnection, error state in UI |
| 26 | Loading states during process initialization | | TODO | Progress indicator or spinner in client |

### Medium Priority: Visual & UX

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 27 | Skin the game: replace colored rectangles with real pixel art characters | Ida | In Progress | Agent roles need distinct sprites that match brainstorming personas |
| 28 | Splash page and public-facing presentation styles | Ida | In Progress | How we present Agent Dungeon externally; landing page, branding |
| 29 | Improve tile map aesthetics (dungeon tileset) | Ida | TODO | Current map is functional but basic |
| 30 | Sound effects and ambient audio | | TODO | Movement, dialogue open/close, skill effects, background music |
| 31 | Onboarding tutorial or hints for first-time users | | TODO | Explain what they're looking at, how to interact |
| 32 | Responsive layout or at minimum handle window resize gracefully | | TODO | Currently 640x480 fixed |

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
| 33 | Define a storage adapter interface | Pratham | TODO | Create a `StorageAdapter` interface (or set of interfaces) with `load()`, `save()`, `get()`, `set()`, `append()` methods that both JSON-file and Redis implementations can satisfy. All five modules above should code against this interface, not directly against `fs` or `redis`. This lets the rest of the codebase stay unchanged while the backend swaps out. |
| 34 | Set up Redis client and connection management | Pratham | TODO | Add `ioredis` (or `redis`) package. Create a singleton Redis client with connection config (host, port, auth), error handling, reconnection logic, and graceful shutdown. Needs to work in dev (local Redis or Docker) and potentially prod. Add a `docker-compose.yml` or document the local Redis setup. |
| 35 | Migrate KnowledgeVault to Redis | Pratham | TODO | Key design: `agent:{agentId}:knowledge` as a Redis hash (expertise, role, realm) + `agent:{agentId}:insights` as a list + `agent:{agentId}:task_history` as a list of JSON strings. Must keep the same public API (`getKnowledge()`, `addInsight()`, `incrementExpertise()`, etc.) so AgentSessionManager and CustomToolHandler don't change. With brainstorming pivot: `files_analyzed` and `realm_knowledge` may become `ideas_contributed` and `topic_knowledge`. Coordinate with Behrang on schema. |
| 36 | Migrate FindingsBoard to Redis | Pratham | TODO | Key design: `session:{sessionId}:findings` as a Redis sorted set (score = timestamp) or list. Findings are small JSON objects. `addFinding()` -> `RPUSH` or `ZADD`, `getRecent()` -> `LRANGE` or `ZREVRANGE`. With brainstorming pivot: findings become "ideas" or "proposals"; the data shape may change. Keep the interface stable. |
| 37 | Migrate WorldStatePersistence to Redis | Pratham | TODO | Key design: `session:{sessionId}:state` as a single JSON blob (`SET`/`GET`). Could also break into sub-keys if the state gets large. With the process-driven pivot, this stores process state (current stage, branch history, agent outputs) rather than repo state. Coordinate with Behrang on what WorldState looks like after the pivot. |
| 38 | Migrate RealmRegistry to Redis | Pratham | TODO | Key design: `sessions` as a Redis hash where each field is a session ID and the value is a JSON entry. `listRealms()` -> `HVALS`, `getRealm()` -> `HGET`, `saveRealm()` -> `HSET`. With the pivot, "realms" become brainstorming sessions. The registry shape stays similar; the content changes. |
| 39 | Migrate TranscriptLogger to Redis Streams (or keep on disk) | Pratham | TODO | Decision needed: transcript logs are append-only and can get large. Redis Streams (`XADD`) are a natural fit and enable real-time replay, but storage cost is higher than JSONL files. Alternative: keep transcripts on disk, only move hot state to Redis. If using Streams: `transcript:{agentId}` stream with JSON message payloads. |
| 40 | Update tests to work with Redis | Pratham | TODO | Existing tests (KnowledgeVault, FindingsBoard, WorldStatePersistence, RealmRegistry, CustomToolHandler) use temp directories and JSON files. Need either: (a) mock the storage adapter in unit tests, or (b) use a test Redis instance (testcontainers, or `redis-memory-server`). Integration tests should hit real Redis. |
| 41 | Wire up Redis adapter in BridgeServer and AgentSessionManager | Pratham | TODO | BridgeServer currently instantiates all persistence modules with file paths. Swap to Redis-backed implementations. AgentSessionManager creates KnowledgeVaults on agent spawn; needs to use the Redis version. This is the integration point where everything comes together. |
| 42 | Redis pub/sub for real-time agent events (stretch) | Pratham | TODO | Stretch goal: use Redis pub/sub channels for agent-to-agent communication or for broadcasting findings/ideas to all connected clients. Could replace or augment the WebSocket broadcast for certain event types. Evaluate whether this adds value over the existing WebSocket hub. |

### Medium Priority: Agent Intelligence

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 43 | Agent conversation/collaboration: agents that respond to and build on each other's ideas | | TODO | Agents need to reference, critique, and extend other agents' outputs |
| 44 | Token budget management to control API costs | | TODO | Server tracks settings but enforcement may need work |

### Lower Priority: Features & Extensions

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 45 | Manual mode: player injects ideas directly into the brainstorm | | TODO | Mode selector exists, but manual input flow needs reworking for brainstorming |
| 46 | Supervised mode: agents propose ideas, player approves/redirects | | TODO | Approval UI needed |
| 47 | Process template library: prebuilt brainstorming workflows users can pick from | | TODO | e.g. "Six Thinking Hats", "SCAMPER", "Design Sprint", custom |
| 48 | Export session: save brainstorming output as a structured report | | TODO | Transcript logs exist but need a synthesis/export format |
| 49 | Dashboard view: summary of ideas generated, votes, stages completed | | TODO | Aggregate view beyond the in-game panels |

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
