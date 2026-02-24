# Oracle Router Design

## Summary

The Oracle becomes a real LLM agent — the first one spawned in every session. It examines the user's input, decides which activity type to run, and selects a hero party from the appropriate roster. For brainstorming tasks, it summons the existing brainstorm personas. For codebase tasks, it summons fantasy-themed software specialists. The Oracle stays present throughout the process, monitoring findings and dynamically adjusting the party.

## Input Routing

Three paths based on input shape:

| Input | Activity | Process Template | Heroes |
|-------|----------|-----------------|--------|
| Repo URL/path only | **Code Review** | `CODE_REVIEW` (new) | Software hero roster |
| Problem statement only | **Brainstorm** | Existing templates (STANDARD, DEEP, etc.) | Existing brainstorm personas |
| Both repo + problem | **Code Brainstorm** | Existing brainstorm templates with repo context | Brainstorm personas with codebase access |

Unified entry point: `player:submit { problem?: string, repoInput?: string }`. The Oracle analyzes the input and routes accordingly. Existing `player:start-process` and `player:link-repo` remain as direct bypasses.

## The Oracle Agent

**Identity:**
- Name: "The Oracle"
- Color: Blue (`0x6a8aff`) — already reserved at `AGENT_COLORS[0]`
- Position: Map center (60, 60) — already established in fog-of-war logic
- Presence: Always on the map throughout the session

**Oracle MCP Tools:**
- `AnalyzeInput` — examines the user's submission; returns structured assessment
- `SelectHeroes` — declares which heroes to summon, with mission briefs for each
- `SummonReinforcement` — mid-process tool to add a hero based on findings
- `DismissHero` — remove a hero from the active party
- `PresentReport` — compile final findings at process end

**System Prompt:** A new "oracle" mode in `SystemPromptBuilder`. Receives:
- User's raw input (repo URL, problem, or both)
- Hero roster (available personas with descriptions)
- Available process templates
- Ongoing: stage completion events and hero findings

**Lifecycle:**
1. Spawned when user submits input via `player:submit`
2. Runs analysis (1-2 turns)
3. Calls `SelectHeroes` to declare initial party and process template
4. Stays alive throughout, receiving findings
5. Between stages, gets a follow-up prompt to review and adjust the party
6. At process end, compiles and presents the final report

## Software Hero Roster (Code Review)

10 fantasy-themed software specialists. Oracle picks 4-6 per session based on repo characteristics.

| Hero | Fantasy Title | Specialty | What They Examine |
|------|--------------|-----------|-------------------|
| **The Architect** | Master Builder | System structure | Module boundaries, dependency graph, architectural patterns, separation of concerns |
| **The Sentinel** | Shield Guardian | Security | Auth flows, input validation, secrets handling, OWASP vulnerabilities, dependency CVEs |
| **The Archaeologist** | Lore Keeper | Legacy & tech debt | Dead code, outdated patterns, migration opportunities, deprecated dependencies |
| **The Cartographer** | Wayfinder | Code navigation | File organization, naming conventions, discoverability, documentation quality |
| **The Alchemist** | Transmuter | Performance | Hot paths, N+1 queries, memory leaks, caching opportunities, bundle size |
| **The Healer** | Restoration Sage | Error handling | Error paths, recovery logic, logging quality, graceful degradation |
| **The Sage** | Knowledge Weaver | Test coverage | Test quality, coverage gaps, test architecture, assertion strength |
| **The Warden** | Gatekeeper | API & contracts | API design, type safety, interface contracts, backwards compatibility |
| **The Scout** | Pathfinder | Dependencies | Third-party risk, dependency freshness, license compliance, alternative options |
| **The Bard** | Chronicle Keeper | Documentation | README quality, inline comments, API docs, onboarding experience |

Each hero gets:
- A persona description (thinking style, concerns)
- MCP tools: `Read`, `Glob`, `Grep` (codebase access), `PostFindings`, `UpdateKnowledge`, `CompleteStage`
- A system prompt addendum specific to their specialty

## Code Review Process Template

6-stage process driven by ProcessController:

| # | Stage | Turn Structure | Agents | Goal |
|---|-------|---------------|--------|------|
| 0 | **Reconnaissance** | Parallel | All selected heroes | Broad survey from each hero's lens. Identify areas of interest. |
| 1 | **Deep Analysis** | Parallel | All selected heroes | Deep dive into identified areas. Produce detailed findings. |
| 2 | **Cross-Reference** | Sequential | All selected heroes | Review each other's findings. Confirm, challenge, or build on them. |
| 3 | **Oracle Review** | Single (Oracle) | Oracle only | Review all findings, identify gaps, optionally summon reinforcements. |
| 4 | **Synthesis** | Single | Designated Synthesizer | Compile findings into structured report: critical issues, recommendations, praise. |
| 5 | **Presentation** | Single (Oracle) | Oracle | Present final report to user in clear, prioritized format. |

**Completion criteria:**
- Stages 0-1: Turn count (2-3 turns per hero)
- Stage 2: Turn count (1 turn per hero, sequential)
- Stage 3: Explicit signal (Oracle calls `CompleteStage`)
- Stages 4-5: Explicit signal

**Key differences from brainstorm:**
- Heroes have file-access tools (Read, Glob, Grep)
- No groupthink isolation — cross-referencing is the point
- Oracle intervenes at stage 3 to adjust party
- Output is structured report, not ideation artifacts

## Integration Architecture

### New Components

- **`OracleManager`** — Manages Oracle agent lifecycle. Spawns Oracle, feeds it input, handles its tool calls (`SelectHeroes`, `SummonReinforcement`, `DismissHero`), feeds inter-stage findings.
- **`CODE_REVIEW` template** — New entry in `ProcessTemplates.ts` and `shared/process.ts`. 6 stages with software hero roles.
- **Software hero role definitions** — Persona descriptions and thinking styles in the process template.
- **Oracle system prompt mode** — Third mode in `SystemPromptBuilder`.

### Modified Components

- **`BridgeServer`** — Add `player:submit` handler. Spawn OracleManager before ProcessController. Wire Oracle's `SelectHeroes` result to `handleStartProcess()`.
- **`ProcessControllerDelegate`** — Add `onStageTransition(completedStage, nextStage)` callback for Oracle to inject roster changes between stages.
- **`SystemPromptBuilder`** — Add oracle mode and code-review hero mode.
- **`shared/protocol.ts`** — Add `player:submit`, `oracle:decision`, `hero:summoned`, `hero:dismissed` message types.

### Unchanged Components

- **`ProcessController`** — Core logic unchanged. Drives stages, counts turns, checks completion.
- **`AgentSessionManager`** — Spawns agents the same way. Oracle is just another session.
- **`KnowledgeVault`, `FindingsBoard`** — Used as-is.
- **Existing brainstorm templates** — Untouched.
- **Fog-of-war, map, client rendering** — Minimal changes. Oracle already has map position.

### Data Flow

```
User -> player:submit {repo?, problem?}
  -> BridgeServer -> OracleManager.spawn(input)
    -> Oracle agent analyzes input
    -> Oracle calls SelectHeroes tool
  -> OracleManager emits oracle:decision {activityType, processId, heroes[]}
  -> BridgeServer starts ProcessController with selected template + heroes
    -> ProcessController drives stages normally
    -> Between stages: OracleManager gets callback, feeds findings to Oracle
    -> Oracle optionally calls SummonReinforcement / DismissHero
  -> Final stage: Oracle compiles and presents report
```

## Design Decisions

1. **Oracle outside ProcessController** (Approach A) — The Oracle is a meta-agent that decides what game to play, not a player in the game. Keeping it separate respects that distinction and is the most extensible path.
2. **Deterministic routing by input shape** — Repo only = code review, problem only = brainstorm, both = code brainstorm. Simple, predictable, no ambiguity.
3. **Fixed roster with dynamic selection** — 10 curated heroes ensure quality personas. Oracle picks a subset and can summon reinforcements. Best of curation + flexibility.
4. **Staged code review** — Reuses ProcessController infrastructure. Structured and predictable, matching the brainstorm precedent.
5. **Oracle always present on map** — Visual anchor for the session. Heroes report back to it. Summoning and dismissal are visible events.
