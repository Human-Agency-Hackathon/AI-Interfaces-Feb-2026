# LLM Agent Orchestration Design

**Date:** 2026-02-16
**Status:** Approved

## Overview

Transform the Agent RPG from a scripted simulation into a real multi-agent orchestration system. The RPG interface becomes a visual control panel for real Claude Code sessions working on a real codebase. Agents don't know they're in a game — they just code. The RPG layer is pure visualization.

## Architecture

```
+---------------------------------------------+
|  RPG Client (Phaser + HTML)                 |
|  - Visualizes agent tool calls as movement  |
|  - Activity feed / dialogue log             |
|  - Budget & permission controls             |
|  - Quest board (from issues or findings)    |
+------------------+--------------------------+
                   | WebSocket
+------------------v--------------------------+
|  Bridge Server (Node.js)                    |
|  - Spawns & observes agent sessions         |
|  - Translates SDK events -> RPG events      |
|  - Manages shared findings board            |
|  - Handles custom tool execution            |
|  - Clones repos / reads local repos         |
+------------------+--------------------------+
                   | spawns & streams
+------------------v--------------------------+
|  Agent Sessions (Claude Agent SDK query())  |
|  - Each agent = one query() call            |
|  - Full Claude Code tool use                |
|  - Custom tools: SummonAgent, RequestHelp,  |
|    PostFindings, UpdateKnowledge, etc.       |
|  - System prompt with role + knowledge      |
+---------------------------------------------+
```

## Onboarding Flow

Simplified to three steps:

1. **Title screen** — "Agent RPG"
2. **Repo screen** — Enter a local path (`/Users/me/project`) OR a GitHub URL. Local paths are used directly. GitHub URLs are cloned to a temp directory. Either way, the result is a local working directory.
3. **Watch** — An oracle agent spawns automatically, explores the repo, and self-organizes a team by summoning specialists as needed.

The old "recruit agents" screen is removed. Agents emerge organically.

### Repo Input

| Input type | Behavior |
|---|---|
| Local path (`/path/to/repo`) | Validate it's a git repo (or just a directory). Use directly as `cwd`. Read file tree from disk. |
| GitHub URL (`github.com/owner/repo`) | Clone to temp directory. Use clone as `cwd`. |

For repos with a GitHub remote: issues become quests. For local-only repos: quests are skipped (or derived from TODO comments in a future iteration).

## Agent Lifecycle

### Self-Organization Model

The player does not pick agents from a library. Instead:

1. One **oracle agent** spawns when the player points at a repo.
2. The oracle explores the codebase, builds an initial understanding.
3. When work exceeds the oracle's capacity, it calls `SummonAgent` to request a specialist — e.g., "Guardian of API Quality" scoped to `src/api/`.
4. The bridge server checks the budget, spawns a new `query()` session if allowed.
5. The new agent appears in the RPG world, walks into its realm, and starts working.
6. Specialists can summon sub-specialists if their realm is too large.
7. This continues until the work is done or the budget is exhausted.

### Spawn Control

Configurable autonomy with a hard budget ceiling:

- **Max agents**: hard cap on concurrent sessions (default: 5)
- **Token budget**: total spend limit across all agents (e.g., $2.00)
- **Permission level**: read-only / write-with-approval / full read-write (applies to all agents)
- **Autonomy mode**: manual (player approves every spawn) / supervised (auto-spawn, player can veto) / autonomous (full self-organization within budget)

### Agent Dismissal

Player can click any agent in the sidebar and dismiss them. The bridge server gracefully ends that `query()` session. The agent's knowledge vault is saved before termination.

## Agent Sessions

Each agent is a `query()` call to `@anthropic-ai/claude-agent-sdk`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: agentMission,
  options: {
    systemPrompt: assembledSystemPrompt,
    cwd: repoPath,
    allowedTools: toolsForPermissionLevel,
    permissionMode: permissionMode,
    // maxTurns left unset — runs until task complete or dismissed
  }
})) {
  bridgeServer.handleAgentMessage(agentId, message);
}
```

### Authentication

Support both:
- **API key**: `ANTHROPIC_API_KEY` environment variable (standard)
- **Claude login**: OAuth-based authentication for Max/Pro subscribers (uses subscription instead of per-token billing)

Configurable — default to whichever credential is available.

## System Prompts

Assembled from five layers:

### Layer 1 — Identity
```
You are "{agent_name}", a specialist agent working on the codebase
at {repo_path}. Your realm is {realm_directory}.
Your mission: {mission_text}.
```

### Layer 2 — Knowledge Vault
```
From your previous sessions, you know:
- Realm map: {directories explored, key files, architecture notes}
- Key insights: {important findings from past work}
- Your expertise: {stats, e.g., "testing: 91, api/: 87"}
```

### Layer 3 — Team Roster
```
Your team:
- The Oracle (realm: entire repo, expertise: architecture 78, planning 92)
- The Engineer (realm: src/core/, expertise: implementation 85)
You can request help from teammates via the RequestHelp tool.
You can summon new specialists via the SummonAgent tool.
```

### Layer 4 — Shared Findings Board
```
Recent team findings:
- [Oracle] Repo uses Express.js + PostgreSQL. 47 endpoints, 12 untested.
- [Engineer] Refactored auth middleware to JWT. See src/middleware/auth.ts.
```

### Layer 5 — Current Task
```
Your current task: "Investigate failing test in src/api/users.test.ts"
Source: GitHub Issue #42
```

## Agent Stats

Stats are skill-based numeric measures derived from actual work, not RPG abstractions:

| Stat | What it measures | How it grows |
|---|---|---|
| **Realm Knowledge** | Per-directory expertise (e.g., `api/: 87`, `auth/: 42`) | Agent reads/edits files in that directory |
| **Pattern Mastery** | Skill with specific patterns (e.g., `testing: 91`, `refactoring: 65`) | Agent completes tasks of that type |
| **Codebase Fluency** | Overall repo familiarity | Aggregate of all realm knowledge |
| **Collaboration Score** | How often peers consult this agent | Gets called via RequestHelp |

Visible on the agent's card in the sidebar. Stats are derived from the knowledge vault, not stored separately.

## Knowledge Persistence

Git-tracked in `.agent-rpg/` at the repo root:

```
.agent-rpg/
  knowledge/
    oracle.json            # Oracle's accumulated knowledge
    guardian_api.json       # Guardian of API Quality's knowledge
    ...
  findings/
    board.json             # Shared findings board
  logs/
    {agent_id}/
      {timestamp}.jsonl    # Full SDK message transcript
  config.json              # Session config (budget, permissions, etc.)
```

Each agent's knowledge file contains:
- **Realm map**: directories/files analyzed, what was found
- **Task history**: summaries of completed work
- **Expertise scores**: the numeric stats
- **Key insights**: important findings to remember across sessions

On session start, the knowledge vault is loaded and injected into the system prompt. On session end (or periodically), the vault is updated and committed.

## Custom Tools

Added to every agent session alongside standard Claude Code tools:

### SummonAgent
Request a new specialist agent.
```
Input:  { name: string, role: string, realm: string, mission: string, priority: "low"|"medium"|"high" }
Output: { approved: boolean, agent_id?: string, reason?: string }
```
Bridge server checks budget/max-agents, spawns if allowed.

### RequestHelp
Ask another agent for assistance.
```
Input:  { target_agent: string, question: string }
Output: { response: string }
```
Bridge server pauses requester, injects question into target agent's session, collects response, returns it. RPG shows the two characters meeting and dialoguing.

### PostFindings
Share a discovery with the whole team.
```
Input:  { realm: string, finding: string, severity: "low"|"medium"|"high" }
Output: { acknowledged: boolean }
```
Writes to shared findings board, broadcasts to all agents on their next interaction, shows in client activity log.

### UpdateKnowledge
Save an insight to the agent's vault.
```
Input:  { realm: string, insight: string, expertise_area: string }
Output: { saved: boolean }
```
Updates the agent's knowledge JSON, increments relevant expertise stats. RPG shows a "level up" effect if a stat threshold is crossed.

### ClaimQuest / CompleteQuest
Self-assign and resolve work items.
```
ClaimQuest:    { quest_id: string } -> { assigned: boolean }
CompleteQuest: { quest_id: string, summary: string } -> { closed: boolean }
```
Integrates with GitHub issues if repo has a remote. Otherwise updates local quest state only.

## Observation & Translation

The bridge server streams every SDK message from each agent and translates tool activity into RPG events:

| SDK Event | Bridge Server Logic | RPG Event |
|---|---|---|
| `content_block_start`, tool=`Read` | Parse file path, find MapObject | Move agent to file tile, play interact animation |
| `content_block_start`, tool=`Edit`/`Write` | Parse file path, find MapObject | Move agent to file tile, play skill effect |
| `content_block_start`, tool=`Bash` | Note command | Emote + speak "Running: {command}" |
| `content_block_start`, tool=`Grep`/`Glob` | Note search pattern | Think bubble "Searching for {pattern}" |
| `content_block_delta`, type=`text_delta` | Accumulate text | Speak (batched, not per-token) |
| `content_block_stop` (tool complete) | Log to transcript, update findings if relevant | Activity feed entry |
| `SummonAgent` tool call | Check budget, spawn new session | New character appears in RPG world |
| `RequestHelp` tool call | Route to target agent | Two characters meet, dialogue exchange |
| `PostFindings` tool call | Write to board.json | Notification in activity log |
| `result` message | Agent finished task | Agent goes idle |

### Pacing

Real Claude Code sessions don't run on a fixed timer. They think, act, pause at their own pace. The RPG visualization must:

- **Queue** RPG events and play them with readable timing
- **Batch** rapid tool calls into smooth sequences (e.g., agent reads 5 files quickly — show them walking through the room, not teleporting)
- **Hold** on dialogue — when an agent speaks, give the text time to be read before the next event plays

## Logging

Three levels:

| Level | Content | Location | Purpose |
|---|---|---|---|
| **Full transcript** | Every SDK message per agent (text, tool calls, tool results, thinking) | `.agent-rpg/logs/{agent_id}/{timestamp}.jsonl` | Complete audit trail, cost analysis, replay |
| **Findings board** | Curated insights from PostFindings | `.agent-rpg/findings/board.json` | Shared team knowledge, human-readable |
| **Activity feed** | Condensed event stream | Broadcast to client in real-time | What the player sees in the RPG UI sidebar |

Full transcripts are git-tracked, enabling:
- Token spend analysis per agent
- Audit of agent actions before approving writes
- Efficiency analysis (which agents are productive vs. spinning)
- Meta-analysis by feeding transcripts to another LLM

## What Changes From Current Codebase

### Removed / Replaced
- `AgentBrain.ts` — replaced by real Claude Agent SDK sessions
- `AgentLibrary.ts` — agents are summoned dynamically, not picked from a static library
- `TurnManager.ts` — no turn system; agents work at their own pace
- `RecruitScreen.ts` — removed; agents self-organize
- Template dialogue/thoughts — replaced by real LLM output
- `agent/` Python sample — no longer needed

### Modified
- `BridgeServer.ts` — major rewrite: spawns query() sessions, observes SDK streams, executes custom tools, manages findings board
- `RepoAnalyzer.ts` — add local-path support (read tree from disk via `fs`/`git`, not just Octokit)
- `MapGenerator.ts` — must work with local file tree data (not just GitHub API format)
- `WorldState.ts` — dynamic agent list (agents join/leave during gameplay), no fixed roster
- `GameScene.ts` — handle dynamic agent spawning/despawning, event queue for pacing
- `protocol.ts` — new message types for spawn requests, findings, knowledge updates
- `client/index.html` — replace recruit screen with settings panel (budget, permissions, autonomy)
- Onboarding flow — simplified: repo input -> oracle spawns -> watch

### Added
- `@anthropic-ai/claude-agent-sdk` dependency
- `AgentSessionManager.ts` — manages query() lifecycle per agent
- `EventTranslator.ts` — maps SDK messages to RPG events
- `FindingsBoard.ts` — shared state management
- `KnowledgeVault.ts` — per-agent knowledge persistence
- `CustomToolHandler.ts` — executes SummonAgent, RequestHelp, PostFindings, etc.
- `RepoCloner.ts` — git clone for GitHub URLs
- `LocalTreeReader.ts` — read file tree from local disk
- `.agent-rpg/` directory structure in target repos
- Settings panel UI (budget, permissions, autonomy controls)
- Event queue system for RPG pacing
