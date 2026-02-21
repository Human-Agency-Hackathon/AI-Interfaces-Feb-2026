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
| 12 | Define the brainstorming stage sequence and flow | Jeff | TODO | Document the ordered stages a brainstorming session moves through as a Mermaid diagram (`graph TD`). Which stages are required vs optional? Which can run in parallel? Where are the decision points that branch the flow? Output: a Mermaid flowchart in `docs/` with entry/exit criteria for each stage. |
| 13 | Define agent roles and their thinking styles | Jeff | TODO | Each stage spawns agents with specific personas. e.g. Divergent stage gets a "Wild Ideator" and a "Cross-Pollinator"; Pushback stage gets a "Devil's Advocate" and a "Pragmatist." For each role: name, personality traits, reasoning style, what they optimize for, what they ignore. These become the system prompt personas Behrang wires into SystemPromptBuilder. |
| 14 | Define stage transition rules and conditionals | Jeff | TODO | What triggers moving from one stage to the next? Options: time limit, idea count threshold, agent consensus, human approval, or automatic after N turns. Some transitions are conditional: e.g. if fact-checking finds major flaws, loop back to divergent thinking. Define the rules for each transition. |
| 15 | Design the Divergent Thinking stage | Jeff | TODO | The generative phase. How many agents? What are their prompts? How do they avoid groupthink (e.g. agents don't see each other's ideas until the stage ends)? What's the output format (list of ideas with brief rationale)? When does it end (time, count, saturation)? |
| 16 | Design the Precedent Research stage | Jeff | TODO | Agents search for existing solutions, analogies from other domains, and prior art. What sources can they draw from (web search, provided context, their own training data)? How do they report findings? How does this feed into the next stage? |
| 17 | Design the Convergent Thinking stage | Jeff | TODO | Takes the raw ideas from divergent + research and clusters/combines them. Agent role: "Synthesizer" who groups related ideas, "Connector" who finds combinations. Output: a shorter list of refined candidate ideas. Needs a defined format so prioritization can consume it. |
| 18 | Design the Fact Checking and Pushback stages | Jeff | TODO | Two related but distinct stages. Fact Checking: verify claims, check feasibility, flag assumptions. Pushback/Red Team: actively argue against each candidate, find failure modes, identify risks. Define how harshly agents push back, what counts as a "kill" vs a "flag." Output: annotated candidates with risk/confidence scores. |
| 19 | Design the Prioritization stage | Jeff | TODO | Takes annotated candidates and ranks them. What criteria? (impact, feasibility, novelty, effort, risk). Single agent with a scoring rubric, or multiple agents that vote? Define the ranking mechanism and output format (ordered list with scores and rationale). |
| 20 | Design the Review and Presentation stages | Jeff | TODO | Review: a final synthesis agent combines the top-ranked ideas into a coherent proposal. Presentation: format the output for the human; clear structure, key recommendations, supporting evidence, acknowledged risks. Define what the final deliverable looks like. |
| 21 | Write the first complete process template as a Mermaid diagram | Jeff | TODO | Define the brainstorming flow as a Mermaid diagram (use `graph TD` for vertical orientation per project conventions). The diagram is the canonical representation of the process: stages as nodes, transitions as edges, conditionals as diamond decision nodes, agent roles annotated on each stage. This is what gets translated into the runtime schema Behrang defines (task #1). Needs: stage list, agent roles per stage, transition rules, conditional branches, output formats. Lives in `docs/` as a `.md` file viewable in Obsidian. |
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

#### Abstracted Interfaces (Design Against These)

The existing JSON-file modules each follow the same lifecycle: construct → `load()` from disk → mutate in memory → `save()` back to disk. Below are the exact public interfaces Pratham should replicate in Redis. The goal: every consumer (`BridgeServer`, `AgentSessionManager`, `CustomToolHandler`, `SystemPromptBuilder`) keeps calling the same methods; only the storage backend changes.

##### IKnowledgeVault

Source: `server/src/KnowledgeVault.ts`. One instance per agent (created on spawn, disposed on idle/completion).

```typescript
// Data shape stored per agent
interface AgentKnowledge {
  agent_id: string;
  agent_name: string;
  role: string;
  realm: string;
  expertise: Record<string, number>;       // skill area → level
  realm_knowledge: Record<string, number>; // directory → familiarity
  insights: string[];
  task_history: Array<{ task: string; outcome: string; timestamp: string }>;
  files_analyzed: string[];
}

interface IKnowledgeVault {
  load(): Promise<void>;                          // Hydrate from storage (no-op if nothing saved yet)
  save(): Promise<void>;                          // Flush current state to storage
  getKnowledge(): AgentKnowledge;                 // Return shallow copy of current state
  addInsight(insight: string): void;              // Append to insights (in-memory, flushed on save)
  recordFileAnalyzed(filePath: string): void;     // Track file + bump realm_knowledge (in-memory)
  incrementExpertise(area: string, amount?: number): void;  // Bump expertise score (default +1)
  addTaskHistory(task: string, outcome: string): void;      // Append to task_history with auto-timestamp
  getExpertiseSummary(): string;                  // Human-readable top-5 expertise
  getRealmSummary(): string;                      // Human-readable top-5 realm knowledge
}
```

**Key pattern:** Mutations (`addInsight`, `incrementExpertise`, etc.) are synchronous/in-memory. `save()` is the async flush. Consumers call mutations frequently and `save()` once when the agent idles or completes. A Redis impl could either batch writes on `save()` or write-through on each mutation; the interface supports both.

**Redis key suggestion:** `agent:{agentId}:knowledge` (hash for scalar fields) + `agent:{agentId}:insights` (list) + `agent:{agentId}:task_history` (list of JSON strings) + `agent:{agentId}:files_analyzed` (set).

##### IFindingsBoard

Source: `server/src/FindingsBoard.ts`. One instance per session (shared across all agents).

```typescript
interface Finding {
  id: string;               // Auto-generated: `finding_{timestamp}_{randomHex}`
  agent_id: string;
  agent_name: string;
  realm: string;
  finding: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;        // ISO 8601
}

interface IFindingsBoard {
  load(): Promise<void>;                                          // Hydrate from storage
  save(): Promise<void>;                                          // Flush to storage
  addFinding(entry: Omit<Finding, 'id' | 'timestamp'>): Finding; // Append, auto-generate id + timestamp, return entry
  getAll(): Finding[];                                            // All findings (defensive copy)
  getRecent(limit?: number): Finding[];                           // Last N findings (default 20)
  getSummary(): string;                                           // Markdown bullet list of last 10
}
```

**Key pattern:** Append-only. `addFinding()` is immediately followed by `save()` in the current code (CustomToolHandler calls both). No update or delete operations exist.

**Redis key suggestion:** `session:{sessionId}:findings` as a list (`RPUSH` to append, `LRANGE -N -1` for recent).

##### IWorldStatePersistence

Source: `server/src/WorldStatePersistence.ts`. One instance globally; keyed by realm/session ID.

```typescript
interface IWorldStatePersistence {
  save(realmId: string, worldState: WorldState): Promise<void>;         // Serialize and store
  load(realmId: string): Promise<WorldState | null>;                    // Deserialize or return null
  exists(realmId: string): Promise<boolean>;                            // Check if saved state exists
  remove(realmId: string): Promise<void>;                               // Delete saved state
}
```

**Key pattern:** Simple key-value; the WorldState object is serialized as one JSON blob via `worldState.toJSON()` / `WorldState.fromJSON()`. No partial updates.

**Redis key suggestion:** `world:{realmId}:state` as a single string (`SET`/`GET` of JSON).

##### IRealmRegistry

Source: `server/src/RealmRegistry.ts`. One instance globally; lives in `~/.agent-rpg-global/`.

```typescript
interface RealmEntry {
  id: string;                // SHA256(repoPath), first 12 chars
  path: string;
  name: string;
  displayName: string;
  lastExplored: string;      // ISO 8601
  gitInfo: { lastCommitSha: string; branch: string; remoteUrl: string | null };
  stats: { totalFiles: number; languages: string[]; agentsUsed: number; findingsCount: number; questsTotal: number; questsCompleted: number };
  mapSnapshot: { rooms: number; tileWidth: number; tileHeight: number };
}

interface IRealmRegistry {
  load(): Promise<void>;                       // Hydrate from storage
  save(): Promise<void>;                       // Flush to storage
  listRealms(): RealmEntry[];                  // All realms, sorted by lastExplored desc
  getRealm(id: string): RealmEntry | undefined;
  saveRealm(entry: RealmEntry): void;          // Upsert (in-memory, flushed on save)
  removeRealm(id: string): void;               // Delete (in-memory, flushed on save)
  generateRealmId(repoPath: string): string;   // Pure function: SHA256 hash
}
```

**Key pattern:** Small registry (typically <100 entries). `saveRealm()`/`removeRealm()` mutate in-memory; caller must call `save()` to persist.

**Redis key suggestion:** `realms` as a hash (`HSET`/`HGET`/`HDEL`/`HVALS`). Each field is a realm ID, value is JSON-serialized `RealmEntry`.

##### ITranscriptLogger

Source: `server/src/TranscriptLogger.ts`. One instance per session; append-only, high frequency.

```typescript
interface ITranscriptLogger {
  log(agentId: string, message: unknown): Promise<void>;  // Append one entry (fire-and-forget)
}
```

**Key pattern:** Append-only, never reads. Uses `fs.appendFile()` so each call is one disk write. Errors are swallowed (non-fatal). High frequency: called for every SDK message. Current format is JSONL (one JSON object per line) at `.agent-rpg/logs/{agentId}/{YYYY-MM-DD}.jsonl`.

**Redis key suggestion:** `transcript:{agentId}:{date}` as a Redis Stream (`XADD`). Or keep on disk if storage cost is a concern; this is the one module where Redis may not be worth it.

#### Pratham's Tasks

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 33 | Read the existing persistence code and understand the patterns | Pratham | TODO | Before writing any code, read these five files end-to-end: `KnowledgeVault.ts`, `FindingsBoard.ts`, `WorldStatePersistence.ts`, `RealmRegistry.ts`, `TranscriptLogger.ts`. Understand how `BridgeServer.ts` and `AgentSessionManager.ts` instantiate and use them. The interfaces above are extracted from these files; trace the code to make sure the interfaces match your understanding. |
| 34 | Create the TypeScript interface files | Pratham | TODO | Turn the interfaces above into actual `.ts` files in `server/src/interfaces/` (e.g. `IKnowledgeVault.ts`, `IFindingsBoard.ts`, etc.). Make the existing JSON-file classes implement these interfaces. This is a refactor with zero behavior change; all existing tests should still pass. This is the critical step: once the interfaces exist, you can build Redis implementations against them independently. |
| 35 | Set up Redis client and connection management | Pratham | TODO | Add `ioredis` (or `redis`) package. Create a singleton Redis client with connection config (host, port, auth), error handling, reconnection logic, and graceful shutdown. Needs to work in dev (local Redis or Docker) and potentially prod. Add a `docker-compose.yml` or document the local Redis setup. |
| 36 | Implement RedisKnowledgeVault | Pratham | TODO | Implement `IKnowledgeVault` backed by Redis. See the key design suggestions in the interface section above. Decision: write-through on each mutation (simpler, more durable) vs. batch on `save()` (matches current pattern, fewer round-trips). Start with write-through; optimize later if needed. Must pass the same test cases as the JSON version. |
| 37 | Implement RedisFindingsBoard | Pratham | TODO | Implement `IFindingsBoard` backed by Redis. Append-only pattern maps cleanly to `RPUSH`/`LRANGE`. `getRecent(n)` maps to `LRANGE -n -1`. `getAll()` maps to `LRANGE 0 -1`. ID generation stays the same (timestamp + random hex). |
| 38 | Implement RedisWorldStatePersistence | Pratham | TODO | Implement `IWorldStatePersistence` backed by Redis. Simplest migration: `SET`/`GET` of JSON blobs. `exists()` maps to Redis `EXISTS`. `remove()` maps to `DEL`. Serialization/deserialization stays the same (`WorldState.toJSON()`/`fromJSON()`). |
| 39 | Implement RedisRealmRegistry | Pratham | TODO | Implement `IRealmRegistry` backed by Redis. Hash-based: `HSET`/`HGET`/`HDEL`/`HVALS` on a `realms` key. `listRealms()` fetches all values and sorts client-side by `lastExplored`. `generateRealmId()` is a pure function (SHA256); stays unchanged. |
| 40 | Decide on TranscriptLogger: Redis Streams vs. keep on disk | Pratham | TODO | Transcript logs are append-only and can get large. Redis Streams (`XADD`) are a natural fit and enable real-time replay, but storage cost is higher than JSONL files. Recommendation: keep transcripts on disk for now, only move hot state (knowledge, findings, world state, registry) to Redis. If real-time replay becomes a requirement, revisit. |
| 41 | Update tests to work with both backends | Pratham | TODO | Existing tests use temp directories and JSON files. Options: (a) write tests against the interface so they run against both JSON and Redis backends, (b) mock the interface in unit tests and add Redis integration tests separately, (c) use `testcontainers` or `redis-memory-server` for a real Redis in CI. Option (a) is ideal; tests validate behavior regardless of backend. |
| 42 | Wire up Redis adapter in BridgeServer and AgentSessionManager | Pratham | TODO | BridgeServer currently instantiates all persistence modules with file paths. Add a config flag (`STORAGE_BACKEND=redis|json`) that selects which implementation to use. AgentSessionManager creates KnowledgeVaults on agent spawn; factory function picks the right impl. Default to JSON so nothing breaks for teammates who don't have Redis running. |
| 43 | Redis pub/sub for real-time agent events (stretch) | Pratham | TODO | Stretch goal: use Redis pub/sub channels for agent-to-agent communication or for broadcasting findings/ideas to all connected clients. Could replace or augment the WebSocket broadcast for certain event types. Evaluate whether this adds value over the existing WebSocket hub. |

### Medium Priority: Agent Intelligence

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 44 | Agent conversation/collaboration: agents that respond to and build on each other's ideas | | TODO | Agents need to reference, critique, and extend other agents' outputs |
| 45 | Token budget management to control API costs | | TODO | Server tracks settings but enforcement may need work |

### Lower Priority: Features & Extensions

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 46 | Manual mode: player injects ideas directly into the brainstorm | | TODO | Mode selector exists, but manual input flow needs reworking for brainstorming |
| 47 | Supervised mode: agents propose ideas, player approves/redirects | | TODO | Approval UI needed |
| 48 | Process template library: prebuilt brainstorming workflows users can pick from | | TODO | e.g. "Six Thinking Hats", "SCAMPER", "Design Sprint", custom |
| 49 | Export session: save brainstorming output as a structured report | | TODO | Transcript logs exist but need a synthesis/export format |
| 50 | Dashboard view: summary of ideas generated, votes, stages completed | | TODO | Aggregate view beyond the in-game panels |

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
