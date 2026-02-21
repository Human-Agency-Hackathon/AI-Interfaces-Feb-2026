# Post-Process Review Screen Design

**Task 56 | Owner: Jeff | Status: Complete**

Defines the UX, data model, protocol, and implementation breakdown for the full-featured review screen that appears when a brainstorm session completes.

---

## 1. What the Screen Shows

After the Presentation stage completes (`process:completed` fires), the player sees a dedicated review panel in place of — or navigated into from — the simple three-button completion overlay. The review screen is a structured, scrollable panel layered over the game viewport. It is not a new page; it lives in the same DOM hierarchy as the existing `#session-complete-overlay`.

### Layout Mockup (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│  BRAINSTORM COMPLETE                                     [x] Dismiss │
│  "Generate ideas for a new web agent"          9 min · 7 stages     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  THE RECOMMENDATION                                                   │
│  ──────────────────────────────────────────────────────────────────  │
│  Build an Ambient Context Agent — a persistent browser extension     │
│  that passively observes your work patterns and surfaces proactive   │
│  suggestions exactly when they're relevant.                          │
│                                                                       │
│  Why This Works                         How to Start                 │
│  · Users carry context across tabs      1. Build extension MVP       │
│  · Browser extension = zero infra       2. Add background embeddings │
│  · Ant stigmergy proven at scale        3. Wire proactive nudge      │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE TIMELINE                                         [collapse ▲] │
│  ──────────────────────────────────────────────────────────────────  │
│  ▶ Problem Framing     [complete]  Scope: browser-based, single-user │
│  ▶ Divergent Thinking  [complete]  28 ideas generated across 2 agents│
│  ▶ Convergent Thinking [complete]  8 candidates: 5 clustered, 3 combo│
│  ▶ Critique            [complete]  2 FATAL, 3 WEAKENED, 3 STRONG     │
│  ▶ Prioritization      [complete]  Ranked; top 3 approved by human   │
│  ▶ Synthesis           [complete]  Coherent proposal by The Architect │
│  ▶ Presentation        [complete]  Final deliverable by The Narrator  │
│                                                                       │
│  (click any ▶ row to expand full artifact text)                      │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  AGENT ROSTER                                           [collapse ▲] │
│  ──────────────────────────────────────────────────────────────────  │
│  The Cartographer      Problem Framing          1 artifact           │
│  The Questioner        Problem Framing          1 artifact           │
│  The Wild Ideator      Divergent Thinking       16 ideas             │
│  The Cross-Pollinator  Divergent Thinking       12 ideas             │
│  The Synthesizer       Convergent Thinking      5 clusters           │
│  The Connector         Convergent Thinking      3 hybrids            │
│  The Skeptic           Critique                 6 verdicts           │
│  The Devil's Advocate  Critique                 6 attacks            │
│  The Strategist        Prioritization           1 ranked list        │
│  The Architect         Synthesis                1 proposal           │
│  The Narrator          Presentation             1 final output       │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  NEXT STEPS                                                           │
│  ──────────────────────────────────────────────────────────────────  │
│  [ Go Deeper ]  [ Challenge This ]  [ Branch From Stage... ]  [ Export ]│
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Sizing:** The panel is `max-width: 700px`, centered, `max-height: 85vh`, scrollable. It overlays the game viewport with the same semi-opaque backdrop as the existing `#session-complete-overlay`.

**Visual language:** Inherits the existing `.session-complete-card` styling — dark background (`#0d0d22`), gold border (`#3a3a6a` → `#8a6a28` for the new panel), monospace for labels. The three collapsible sections (Recommendation, Stage Timeline, Agent Roster) use the same collapse toggle pattern already implemented in `#agent-details-panel`.

---

## 2. Continuation Options

Four buttons appear at the bottom of the review panel under "NEXT STEPS". All four are visible immediately; disabled states are not used — if an option is not applicable the button is hidden, not greyed out.

### "Go Deeper"

**Button copy:** `Go Deeper`

**What it does:** Re-runs the Synthesis and Presentation stages (stages 6 and 7 of DEEP_BRAINSTORM) with an enriched prompt. The player's current session context is preserved; a new synthesis pass is requested with the additional context string below.

**Prompt addendum injected for the re-run:**
> "This is a second synthesis pass. The first recommendation was: {recommendation_snippet}. The player has asked to go deeper. Expand the implementation steps to 8-10 concrete actions. Add a second-order effects section: what happens 6-12 months in if this succeeds? Add one more risk that the first pass missed. The Narrator should revise the final deliverable with this richer detail."

**What additional context goes in:** The full `collectedArtifacts["presentation"]["final_output"]` string is included in the re-run prompt so the Architect and Narrator have the first pass to build on. The prioritization ranked list is also re-included so the Architect can draw on scores and rationale.

**UX flow:** Clicking "Go Deeper" dismisses the review panel, shows a brief "Re-running synthesis..." status message in the dialogue log, and streams the re-run output into the sidebar as normal agent messages. When the new presentation stage completes, the review panel can be reopened (same button becomes "Review Results").

---

### "Challenge This"

**Button copy:** `Challenge This`

**What it does:** Spawns a red-team agent (Devil's Advocate persona from DESIGN.md §5, or a new "Red Team" composite persona) in a new session phase. The agent receives the final recommendation as its sole input and produces the strongest possible case against it.

**Prompt given to the red-team agent:**
> "You are a Red Team analyst. You have been given the following recommendation and you must argue against it as forcefully and specifically as possible. Do not hedge. Find the single most dangerous assumption, the most likely failure mode, and the strongest competitive threat. Conclude with a verdict: HOLD (do not proceed), MODIFY (proceed with these changes), or PROCEED (recommendation survives scrutiny). Input: {recommendation_text}"

**UX flow:** Clicking "Challenge This" opens a new sub-panel within the review screen (not a full re-run). The red-team agent's output streams into a compact text area below the recommendation section, headed "Red Team Analysis". After the agent responds, a "Respond to Challenge" text input appears so the player can defend the recommendation and continue the dialogue.

This option does not require re-running the full process engine — it is a single focused agent call.

---

### "Branch From [Stage]..."

**Button copy:** `Branch From Stage...`

**What it does:** Opens a stage-picker sub-menu listing all completed stages. The player selects a stage; the process re-runs from that stage forward. Optional: before re-running, the player can specify a constraint change or agent swap.

**Stage-picker sub-menu copy (inline, replaces the button row):**
```
Branch from which stage?

  [ Problem Framing ]  [ Divergent Thinking ]  [ Convergent Thinking ]
  [ Critique ]         [ Prioritization ]       [ Synthesis ]

Optional: Add a constraint or swap an agent (leave blank to re-run identically)
[ _______________________________________________________ ]

[ Run Branch ]   [ Cancel ]
```

**What changes in the branch:** The selected stage and all subsequent stages are re-run. All artifacts from stages before the branch point are preserved in `collectedArtifacts` and injected as prior context. The optional constraint text is prepended to the system prompt of every agent in the branched stages.

**Example use cases:**
- Branch from Divergent Thinking → re-run with "focus only on ideas that require no new infrastructure"
- Branch from Prioritization → swap The Strategist for a persona that weights Speed higher than Impact
- Branch from Critique → "use a more charitable interpretation of feasibility risks"

**UX flow:** After "Run Branch" is clicked, the review panel closes and the session resumes from the chosen stage. A new entry appears in the stage timeline noting the branch point and constraint.

---

### "Export"

**Button copy:** `Export Report`

**What it does:** Triggers the export flow defined in `docs/export-format.md`. Sends `player:export` WebSocket message to the server; server assembles `ExportReport` via `buildExportReport()` and responds with `session:exported` carrying the rendered markdown. Client triggers a browser file download.

**UX flow:** The button shows a brief `Preparing report...` state (border dims, text changes) for 1-2 seconds while the server assembles. On receipt of `session:exported`, the browser download triggers immediately. The button returns to its normal state. No panel close.

**Filename format:** `brainstorm-{slugified-problem}-{YYYY-MM-DD}.md`

---

## 3. Data Requirements

### Field-to-UI section mapping

| UI Section | Source field(s) | Assembly location |
|---|---|---|
| Recommendation text | `collectedArtifacts["presentation"]["final_output"]` — parsed `### The Recommendation` section | Server-side: `buildReviewData()` parses using same `extractSection()` helpers as `ExportBuilder.ts` |
| "Why This Works" bullets | `collectedArtifacts["presentation"]["final_output"]` — parsed `### Why This Works` section | Server-side |
| "How to Start" steps | `collectedArtifacts["presentation"]["final_output"]` — parsed `### How to Start` section | Server-side |
| Session duration | `processState.startedAt`, `processState.completedAt` | Server-side |
| Stage count | `processDefinition.stages.length` | Server-side |
| Stage timeline rows | `processDefinition.stages[*]` + `collectedArtifacts[stageId]` | Server-side: same as `ExportBuilder.stages` assembly |
| Stage artifact preview | `Object.values(collectedArtifacts[stageId])[0].slice(0, 120)` | Server-side |
| Stage full artifact text (expanded) | Full `collectedArtifacts[stageId][artifactId]` strings | Client-side rendering of strings already in the `session:review-data` payload |
| Agent roster rows | `processDefinition.roles` + `processDefinition.stages[*].roles` | Server-side: derived from definition, no runtime data needed |
| Agent contribution count | `processState.agentTurnCounts["stageId:agentId"]` | Server-side: from `ProcessState.agentTurnCounts` (populated by `ProcessController.toJSON()`) |
| Problem statement | `processState.problem` | Server-side |

### Server-side vs. client-side split

**Server assembles:**
- All parsed/extracted fields from the Narrator's free-text output (recommendation, bullets, steps, risks, alternatives). The client should not re-implement the markdown parsing logic.
- Agent roster (derived from `ProcessDefinition`, which only lives on the server).
- Stage timeline summaries (120-char truncated previews).
- Turn counts per agent from `processState.agentTurnCounts`.

**Client renders directly from raw strings (already in payload):**
- Expanded artifact text for each stage (the client receives the full `collectedArtifacts` structure in the `session:review-data` payload and renders it when the user clicks to expand a stage row).
- The red-team agent's streamed output (standard `agent:message` events, rendered into a sub-panel).

**Not needed on client before request:**
The client does not need to accumulate artifacts from `stage:completed` events to render the review screen. It waits for the explicit `session:review-data` response. This is the same pattern as export: the server is the single source of truth.

---

## 4. New Protocol Messages

### `player:review-request` (Player → Server)

```typescript
/**
 * Player requests a structured review summary of the completed session.
 * Valid only after process:completed has been received (status === 'completed').
 * Server responds with session:review-data (success) or error (not yet complete).
 *
 * No payload needed — the server resolves session from the WebSocket context.
 */
export interface ReviewRequestMessage {
  type: 'player:review-request';
}
```

### `session:review-data` (Server → Client)

```typescript
/**
 * Server responds to player:review-request with a structured summary
 * assembled from WorldState (ProcessState + ProcessDefinition) and FindingsBoard.
 *
 * The client renders this into the review panel. Raw artifact strings are
 * included so the client can expand stage rows without additional round-trips.
 */
export interface SessionReviewDataMessage {
  type: 'session:review-data';

  // ── Header ──────────────────────────────────────────────────────────
  problem: string;
  /** ISO date string */
  date: string;
  templateName: string;
  /** Wall-clock minutes, rounded */
  durationMinutes: number;
  stageCount: number;

  // ── Recommendation (parsed from Narrator output) ─────────────────────
  recommendation: string;
  whyItWorks: string[];
  howToStart: string[];

  // ── Stage timeline ────────────────────────────────────────────────────
  stages: Array<{
    stageId: string;
    stageName: string;
    status: 'complete' | 'skipped';
    /** Short preview for collapsed state (max 120 chars) */
    artifactSummary: string;
    /** Full artifact text per artifact ID, for expanded state */
    artifacts: Record<string, string>;
  }>;

  // ── Agent roster ──────────────────────────────────────────────────────
  agents: Array<{
    roleId: string;
    roleName: string;
    /** Stage name(s) this agent was active in (display string) */
    activeStages: string;
    /** How many turns / artifacts this agent contributed */
    contributionCount: number;
    /** Human-readable label for contributionCount, e.g. "ideas", "verdicts", "artifacts" */
    contributionLabel: string;
  }>;

  // ── Raw collectedArtifacts (for branch/re-run context) ───────────────
  /**
   * Full artifact content keyed by stageId then artifactId.
   * Same structure as ProcessState.collectedArtifacts.
   * Included so the client has the raw material for "Branch From Stage"
   * constraint entry without another round-trip.
   */
  collectedArtifacts: Record<string, Record<string, string>>;
}
```

**Protocol union additions** (add to `shared/protocol.ts`):

```typescript
// Add to ClientMessage union:
| ReviewRequestMessage

// Add to ServerMessage union:
| SessionReviewDataMessage
```

---

## 5. Implementation Breakdown

### Ida: DOM panel + CSS (primary visual work)

**What:** Build the `#review-panel` DOM structure and all associated CSS in `client/index.html`. This is the largest chunk of work on the frontend.

**Specifics:**
- New `<div id="review-panel">` inside `#game-viewport`, positioned absolutely over the game (same pattern as `#session-complete-overlay`).
- Three collapsible sections using the existing `.agent-details-section` / `.agent-details-section-header` / `.agent-details-section-body` pattern already in the sidebar — no new collapse mechanism needed.
- Stage timeline rows: each row is a clickable `<div>` with the stage name, status badge, and artifact preview text. Click toggles an expanded `<div>` showing full artifact content.
- Agent roster: a simple `<table>` or flex-column list with role name, active stage, and contribution count.
- Next-step button row: four buttons using `.session-complete-btn` styling — the "Branch From Stage..." button opens an inline sub-panel within the review panel (not a separate overlay).
- The "Go Deeper" and "Challenge This" buttons need a brief loading state (change border + text) after click; JavaScript in the existing client code handles this.

**Time estimate:** 2.5-3 hours. The DOM structure is the bulk; CSS reuses existing tokens almost entirely.

---

### Behrang: Server handler for `player:review-request`

**What:** One new message handler in `server/src/MessageHandler.ts` (or equivalent dispatcher). Receives `player:review-request`, assembles the `SessionReviewDataMessage` payload from `WorldState` + `ProcessDefinition`, and sends it back on the requesting socket.

**Specifics:**
- Guard: if `processState.status !== 'completed'`, respond with `{ type: 'error', message: 'Review is not available until the session completes.' }`.
- Assembly function `buildReviewData()` in a new `server/src/ReviewBuilder.ts` (can reuse helpers from `ExportBuilder.ts` — `extractSection`, `extractBullets`, `extractNumberedList`).
- Agent contribution count: derive from `processState.agentTurnCounts` if populated; fall back to counting `Object.keys(artifacts).length` per stage per role if `agentTurnCounts` is not yet implemented.
- No new database access needed — all data is in-memory `WorldState`.
- Add `ReviewRequestMessage` and `SessionReviewDataMessage` to `shared/protocol.ts` union types.

**Time estimate:** 1.5-2 hours. The assembly logic is the same pattern as `ExportBuilder.ts` (Task 53) but simpler — no markdown rendering, just structured JSON.

---

### Client WS wiring (anyone — low complexity)

**What:** Wire `player:review-request` send and `session:review-data` receive in the client.

**Specifics:**
- On `session:review-data` received: populate the review panel DOM (call Ida's render functions with the payload data), then show the panel.
- The "Keep Reading" button in `#session-complete-overlay` (ID: `#session-complete-read`) should send `player:review-request` and hide the overlay. The review panel appears when the server responds.
- The four continuation buttons each dispatch their respective actions (detailed below in section 6).
- The "Branch From Stage..." inline sub-menu: when the player clicks "Run Branch", send `player:branch-request` (define in a follow-up task — for now, just log the intent and close the panel).

**Time estimate:** 1 hour. No architectural complexity; it is event wiring on an already-open WebSocket.

---

## 6. Relationship to Completion Overlay

### Current state

The existing `#session-complete-overlay` (shipped) shows three buttons:

```
[ Keep Reading ]  [ Export Report ]  [ New Brainstorm ]
```

with the hint text: "The full session — all ideas, critiques, and the final recommendation — is in the dialogue log on the right."

This is correct as a minimal implementation. "Keep Reading" currently just dismisses the overlay.

### Options considered

**Option A: Replace the overlay entirely with the review screen.**
The overlay is removed; when `process:completed` fires, the review screen opens immediately. The "Export" and "New Brainstorm" actions move into the review screen's button row.

Drawback: The review screen requires a `player:review-request` round-trip. If the server is slow (unlikely but possible), the player sees a blank panel briefly. Also, some players may genuinely just want to close the overlay and read the dialogue log without a structured summary.

**Option B: "Keep Reading" navigates into the review screen.**
The overlay stays as-is. "Keep Reading" is re-labeled "Review Session" (or keeps its current label but navigates into the review panel instead of just dismissing). The overlay's "Export Report" and "New Brainstorm" buttons remain for players who want the quick path.

**Option C: Review screen is a separate mode, opened via a new button or command.**
The overlay stays unchanged. The review screen is accessed via `/review` command or a new button in the sidebar toolbar. Lowest disruption to existing behavior.

### Recommendation: Option B

**"Keep Reading" should navigate into the review screen.** The overlay dismisses, the client sends `player:review-request`, and the review panel opens when the server responds (~200ms).

Rationale:
1. "Keep Reading" as a label implies the player wants more detail — the review screen is exactly that. The behavior matches the promise.
2. The overlay's three-button layout is preserved: "Review Session" (primary), "Export Report" (secondary), "New Brainstorm" (tertiary). No removal of existing functionality.
3. Players who want to just close and scroll the dialogue log can click the `[x]` dismiss on the review panel immediately.
4. The review screen subsumes the "Export" flow — the "Export Report" button in the review panel replaces the overlay's "Export Report" button for players who navigate into review first. Both paths reach the same `player:export` message.

**Label change:** Rename `#session-complete-read` button text from "Keep Reading" to "Review Session" to make the intent clearer. The handler changes from `overlay.hide()` to `send({ type: 'player:review-request' }); overlay.hide(); showReviewLoading()`.

**The overlay does not need to be removed.** It provides a fast escape path for users who do not want the full review. This is good UX — the richer screen is opt-in, not forced.

---

## Summary of New Files / Changes

| File | Action | What |
|------|--------|------|
| `shared/protocol.ts` | Edit | Add `ReviewRequestMessage`, `SessionReviewDataMessage`, extend union types |
| `server/src/ReviewBuilder.ts` | Create | `buildReviewData()` — assembles `SessionReviewDataMessage` from `ProcessState` + `ProcessDefinition` |
| `server/src/MessageHandler.ts` | Edit | Handle `player:review-request` → call `buildReviewData()` → send `session:review-data` |
| `client/index.html` | Edit (Ida) | Add `#review-panel` DOM structure + all associated CSS |
| `client/src/` (GameView or WS handler) | Edit | Wire `player:review-request` send and `session:review-data` receive; update "Keep Reading" handler |

---

*Task 56 complete. Design by Jeff's agent, 2026-02-21.*
