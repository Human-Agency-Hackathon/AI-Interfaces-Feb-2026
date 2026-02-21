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

### High Priority: Core Demo Flow
> These tasks are critical for a working end-to-end demo.

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Rearchitect rooms to represent agents instead of folders | Behrang | In Progress | Each agent gets its own room/space on the map rather than rooms mapping 1:1 to repo folders |
| 2 | Get core end-to-end flow working: repo URL -> analysis -> map -> agents spawn and explore | Behrang | In Progress | The full happy path needs to be validated and any broken handoffs fixed |
| 3 | Agent orchestration: multi-agent spawning, turn management, coordination | Behrang | In Progress | Oracle summons specialists, agents take turns, share findings |
| 4 | Verify Claude Agent SDK sessions work with real API keys | | TODO | AgentSessionManager needs live testing with actual Claude sessions |
| 5 | Fix any WebSocket message ordering/timing issues under real load | | TODO | May surface during integration testing |

### High Priority: Polish & Stability

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 6 | Client-side tests (currently "planned" but none written) | | TODO | At minimum: scene lifecycle, WebSocket message handling, panel rendering |
| 7 | Error handling for failed repo analysis (bad URL, private repo, rate limits) | | TODO | User-facing error messages in the client |
| 8 | Graceful handling when agent SDK session disconnects or errors | | TODO | Reconnection, error state in UI |
| 9 | Loading states and feedback during repo analysis (can take time) | | TODO | Progress indicator or spinner in client |

### Medium Priority: Visual & UX

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 10 | Skin the game: replace colored rectangles with real pixel art characters | Ida | In Progress | Oracle, Test Guardian, Doc Scribe, etc. each need distinct sprites |
| 11 | Splash page and public-facing presentation styles | Ida | In Progress | How we present Agent Dungeon externally; landing page, branding |
| 12 | Improve tile map aesthetics (dungeon tileset) | Ida | TODO | Current map is functional but basic |
| 13 | Sound effects and ambient audio | | TODO | Movement, dialogue open/close, skill effects, background music |
| 14 | Onboarding tutorial or hints for first-time users | | TODO | Explain what they're looking at, how to interact |
| 15 | Responsive layout or at minimum handle window resize gracefully | | TODO | Currently 640x480 fixed |

### Medium Priority: Agent Intelligence

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 16 | Replace JSON file persistence with Redis for agent memory | Pratham | In Progress | Migrate KnowledgeVault, FindingsBoard, and potentially RealmRegistry from JSON files to Redis. Enables faster reads, cross-session persistence, and scales for multi-agent workloads |
| 17 | Tune Oracle system prompt for smarter exploration strategies | | TODO | Should prioritize high-value files, not random walk |
| 18 | Improve specialist agent prompts (Test Guardian, Doc Scribe, etc.) | | TODO | Each role needs distinct behavior patterns |
| 19 | Agent conversation/collaboration: agents that talk to each other meaningfully | | TODO | Currently agents can speak but coordinated dialogue needs work |
| 20 | Token budget management to control API costs | | TODO | Server tracks settings but enforcement may need work |

### Lower Priority: Features & Extensions

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 21 | Manual mode: player controls an agent directly from prompt bar | | TODO | Mode selector exists, but manual control flow needs implementation |
| 22 | Supervised mode: agents propose actions, player approves/rejects | | TODO | Approval UI needed |
| 23 | Write-with-approval permission level: agents can suggest code changes | | TODO | Currently read-only exploration |
| 24 | Support for non-GitHub repos (GitLab, Bitbucket, plain local) | | TODO | LocalTreeReader handles local; remote needs expansion |
| 25 | Export session: save a recording/replay of an exploration session | | TODO | Transcript logs exist but no replay mechanism |
| 26 | Dashboard view: summary of findings, quests completed, knowledge gained | | TODO | Aggregate view beyond the in-game panels |

---

## How to Claim a Task

1. Put your name in the **Owner** column
2. Update **Status** to `In Progress`
3. Create a branch: `feature/<short-description>` or `fix/<short-description>`
4. When done, open a PR against `main`
5. Update **Status** to `Done` after merge

---

## Open Questions

- What repo(s) should we use for the demo? (Need a public repo with issues for quest mapping)
- Are we targeting a live demo or a recorded walkthrough?
- What's the deadline?
- Should we prioritize visual polish or agent intelligence for the demo?
