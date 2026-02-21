# Onboarding Tutorial & Hints Design
**Task 35 | Owner: Jeff | Status: Complete**

This document defines what first-time users need to see to understand Agent Dungeon. Every hint has an exact trigger event, an exact UI target, and exact text (20 words or fewer). Implementation complexity is labeled per item.

---

## 1. First-Run Detection

**Recommendation: localStorage flag, with URL param override for demo mode.**

### Primary mechanism: `localStorage`

On splash screen mount, check:

```typescript
const isFirstRun = !localStorage.getItem('agentdungeon_seen');
if (isFirstRun) {
  localStorage.setItem('agentdungeon_seen', '1');
  enableOnboardingHints();
}
```

This is zero-server, zero-cost, pure client-side. Works offline. Persists across refreshes until the user clears their browser.

### Override: `?demo=1` URL parameter

```typescript
const params = new URLSearchParams(window.location.search);
const demoMode = params.get('demo') === '1';
if (demoMode) {
  enableOnboardingHints();
  enableDemoNarrator(); // see section 5
}
```

`?demo=1` forces hints and the narrator overlay on regardless of localStorage. Use this for the hackathon demo URL so the audience always sees the full narration, even on a machine that's run the app before.

### Clearing for demo reset

Add a `/reset-onboarding` command to the prompt bar (or a double-click on the stage progress bar) that clears `localStorage.removeItem('agentdungeon_seen')` and reloads. Lets the demo presenter reset between runs.

**Implementation complexity:** Pure client HTML/CSS + 5 lines of JS. Ida can do it.

---

## 2. Onboarding Moments

Seven specific moments with exact triggers, UI targets, and hint text. Each tooltip is a small `<div class="onboarding-hint">` that appears near the highlighted element, with a dismiss (×) button and an "auto-dismiss after 6 seconds" timer.

### Moment 1: Problem Input

**Trigger:** SetupScreen mounts (first-run only)
**UI element to highlight:** The problem textarea (`setup-textarea`)
**Exact hint text:**
> Type your question or challenge here. AI agents will brainstorm answers for you.

**Notes:** Appears as a callout below the textarea. Dismissed on first keypress or after 6 seconds.

### Moment 2: Brainstorm Starts

**Trigger:** WebSocket message `process:started` received
**UI element to highlight:** The stage progress bar (`.stage-progress-bar` at top of sidebar)
**Exact hint text:**
> AI agents are now working. Watch their progress through 6 stages here.

**Notes:** Appears as a floating tooltip above the progress bar, arrow pointing down. Auto-dismisses after 6 seconds.

### Moment 3: First Agent Speaks

**Trigger:** First `findings:posted` event received (data: `agent_name`, `finding`)
**UI element to highlight:** The dialogue log (`.dialogue-log`, specifically the first finding bubble `.chat-bubble-finding`)
**Exact hint text:**
> Gold border = a key finding. These are the agents' best ideas, posted to the shared board.

**Notes:** Appears as a tooltip to the left of the first finding bubble. Dismissed on click or after 8 seconds.

### Moment 4: Stage Advances

**Trigger:** First `stage:advanced` message received (`fromStageName` → `toStageName`)
**UI element to highlight:** The stage progress bar fill (`.stage-progress-fill`)
**Exact hint text:**
> Stage complete. New agents are entering for the next phase of the brainstorm.

**Notes:** Appears as a tooltip below the bar for 5 seconds. No dismiss button — auto-only.

### Moment 5: Prompt Bar Appears

**Trigger:** `process:started` received AND promptBar is mounted (fires ~500ms after `startGame()`)
**UI element to highlight:** The prompt textarea (`.prompt-textarea`)
**Exact hint text:**
> You can intervene here. Type `/approve`, `/inject [idea]`, or `/help` for all commands.

**Notes:** Appears as a callout above the prompt bar. Dismissed on first click into the textarea.

### Moment 6: Human Approval Gate

**Trigger:** Server sends a message with `type: 'human:approval-required'` (the `EscalateToHuman` gate, currently fires after Prioritization stage)
**UI element to highlight:** The prompt bar border (add a pulsing amber border class `hint-pulse-amber`)
**Exact hint text:**
> Agents need your approval to continue. Review the ranked ideas and type `/approve`.

**Notes:** This hint does NOT auto-dismiss. It stays visible until the user types `/approve` or another command. This is the one moment where a user must act — the hint should be impossible to miss.

### Moment 7: Final Findings Posted

**Trigger:** `stage:advanced` received where `toStageName` is `null` (session complete) OR where `fromStageName` is `"Presentation"`
**UI element to highlight:** The dialogue log scroll anchor (bottom of `.dialogue-log`)
**Exact hint text:**
> Brainstorm complete. Scroll up to read the full recommendation, or type `/export`.

**Notes:** Appears as a banner at the bottom of the dialogue log. Stays visible until the user scrolls up or types `/export`.

---

## 3. Persistent UI Hints

Always-visible orientation elements that help any user at a glance, regardless of first-run status.

### 3a. Stage Description Overlay

**Element:** A text label immediately below the stage progress bar, always visible during gameplay.

```html
<div id="stage-description" class="stage-description-label">
  <!-- Updated by JS on every stage:advanced event -->
  Problem Framing — agents are mapping the problem space
</div>
```

**CSS:** Italic, muted color (`#8888aa`), 0.65rem, sits between the progress bar and the dialogue log. Updates on every `stage:advanced` event.

**Stage descriptions (the exact label shown for each stage):**

| Stage name received | Label text |
|---------------------|------------|
| `Problem Framing` | Problem Framing — agents are mapping the problem space |
| `Divergent Thinking` | Divergent Thinking — agents are generating raw ideas |
| `Precedent Research` | Precedent Research — agents are finding real-world examples |
| `Convergent Thinking` | Convergent Thinking — agents are clustering the best ideas |
| `Fact Checking` | Fact Checking — agents are stress-testing each idea |
| `Pushback / Red Team` | Red Team — agents are trying to kill weak ideas |
| `Prioritization` | Prioritization — agents are scoring and ranking survivors |
| `Review / Synthesis` | Synthesis — one agent is writing the full proposal |
| `Presentation` | Presentation — final recommendation is being formatted |

**Implementation complexity:** Pure HTML/CSS + update on `stage-announcement` CustomEvent (already fired by `main.ts`). Ida can do it.

### 3b. "What is this?" Button

**Element:** A small `?` icon button fixed to the top-right corner of the game viewport (not the sidebar), always visible during gameplay.

```html
<button id="whats-this-btn" class="whats-this-btn" title="What is Agent Dungeon?">?</button>
```

**Clicking it opens a modal with three paragraphs:**

> **Agent Dungeon** is a multi-agent AI brainstorming system visualized as a dungeon.
>
> **What you're watching:** Multiple AI agents with distinct roles (Wild Ideator, Skeptic, Strategist, etc.) work through a structured brainstorm in stages. Each agent thinks independently, then their best ideas are synthesized into a final recommendation.
>
> **How to interact:** Type in the bar at the bottom of the sidebar. Use `/help` to see all commands. At the Prioritization stage, agents will wait for your approval before continuing.

Modal has a single "Got it" close button. The `?` button itself stays visible even after the modal is closed.

**Implementation complexity:** Pure HTML/CSS. Ida can do it.

### 3c. Mode Indicator Badge (already exists — needs label)

The `.prompt-mode-badge` element already exists in the sidebar (`supervised`, `manual`, `autonomous` with a color dot). Add a permanent micro-label above it:

```html
<div class="mode-hint-label">Autonomy level</div>
```

And add a `title` attribute: `"supervised = agents pause for your approval | autonomous = agents run end-to-end"`.

This orients users who wonder why agents sometimes pause and wait.

**Implementation complexity:** 3 lines of HTML. Ida can do it.

---

## 4. The `/help` Command

Typing `/help` in the prompt bar opens a modal overlay (or inline expansion in the command menu). The command menu already shows command suggestions on `/` — `/help` should display a formatted reference card.

**Exact output of `/help`:**

```
AGENT DUNGEON — COMMAND REFERENCE

/approve              Approve the current stage and let agents continue.
/inject [idea]        Add your own idea to the active brainstorm pool.
/skip [stage]         Skip an optional stage (research, fact-check, pushback).
/kill [id]            Remove a specific candidate idea from consideration.
/deepen [id]          Run a deeper fact-check on one candidate idea.
/redirect [text]      Send a free-text instruction to the orchestrator agent.
/export               Export the final recommendation as markdown to your clipboard.
/restart              Restart from scratch with a modified problem statement.

Type your problem directly (no slash) to send a message to the active agent.
Questions? The agents can hear you.
```

**Display:** Rendered in the dialogue log as a `chat-bubble-system` bubble (already styled for system messages), or as the command menu expanded to full height with all 8 items. The command menu approach requires no new DOM elements.

**Implementation notes:** The command menu (`prompt-command-menu` + `prompt-command-item`) already renders on `/` input. `/help` should populate the menu with all 8 entries and keep it open until Escape or a click outside. No new WebSocket message needed.

**Implementation complexity:** Pure client JS in `PromptBar.ts`. No server changes. Ida or any JS-comfortable contributor can do it.

---

## 5. Demo Narration Mode

**Recommendation: Yes, build it.** For the hackathon demo, a narrator overlay that announces each phase transition in plain English to a watching audience is essential. Audience members watching a projector screen cannot read small chat bubbles. The narrator makes the AI's structure legible without interrupting the flow.

### Trigger

Enabled when `?demo=1` is in the URL. The narrator fires on every `stage:advanced` WebSocket event.

### Visual Design

A centered banner that slides in from the top of the game viewport (the Phaser canvas area, NOT the sidebar) and auto-dismisses after 6 seconds:

```html
<div id="demo-narrator" class="demo-narrator demo-narrator-hidden">
  <div class="demo-narrator-eyebrow">STAGE TRANSITION</div>
  <div class="demo-narrator-text"><!-- filled by JS --></div>
</div>
```

**CSS:** Dark translucent background (`rgba(10, 8, 16, 0.92)`), gold border, Cinzel font, large text (1.4rem), centered, width 80% of game canvas, z-index above Phaser but below modals. Slide-in animation: 0.4s ease, 6s dwell, 0.4s slide-out.

### The 7 Stage Transition Announcements

Fired on `stage:advanced` events, keyed on `toStageName`:

| `toStageName` received | Eyebrow | Narrator text |
|------------------------|---------|---------------|
| `Divergent Thinking` | STAGE 1 | "Four agents are now generating ideas independently — no collaboration allowed yet." |
| `Precedent Research` | STAGE 2 | "Two agents are searching the web for real-world examples of this problem being solved." |
| `Convergent Thinking` | STAGE 3 | "The Synthesizer is clustering 40+ ideas into the 5 strongest candidates." |
| `Fact Checking` | STAGE 4 | "The Skeptic and Feasibility Analyst are stress-testing every candidate for hidden flaws." |
| `Pushback / Red Team` | STAGE 5 | "The Devil's Advocate is now trying to kill each idea. Survivors earn their place." |
| `Prioritization` | STAGE 6 | "The Strategist is scoring survivors on impact, feasibility, novelty, speed, and risk." |
| `Review / Synthesis` | STAGE 7 | "The Architect is synthesizing the top ideas into a single coherent proposal." |
| `Presentation` | FINAL STAGE | "The Narrator agent is formatting the final recommendation for delivery." |
| `null` (session complete) | COMPLETE | "Brainstorm complete. The recommendation is ready." |

The eyebrow text appears in small caps above the main line. The main text appears in Cinzel at 1.4rem.

**For the Problem Framing stage** (fires on `process:started`, not `stage:advanced`): show a special entry narrator card:

> "Agents have received the problem. The Cartographer and Questioner are mapping the problem space."

This fires on the `process:started` WebSocket event instead.

### Implementation

**New server broadcast needed (one):** The narrator needs to know the human-readable stage name when the stage advances. Currently `stage:advanced` already sends `fromStageName` and `toStageName` as strings — the narrator can read these directly. No new server message required.

The narrator is pure client JS that listens to the existing `stage-announcement` CustomEvent (already dispatched by `main.ts`) and maps stage names to the strings above. One lookup table, one DOM manipulation.

**Implementation complexity:** Pure HTML/CSS + ~40 lines of client JS. No server changes. Ida can do it with the lookup table provided in this doc.

---

## 6. Implementation Sketch

### Pure HTML/CSS (Ida can do these independently)

| Feature | Where | Estimated time |
|---------|-------|----------------|
| Onboarding hint tooltips (moments 1-5, 7) | New `<div class="onboarding-hint">` elements injected by JS on CustomEvent | 45 min |
| Moment 6: approval gate pulse | CSS class `hint-pulse-amber` on `.prompt-bar` | 5 min |
| Stage description label (3a) | New `<div id="stage-description">` between progress bar and dialogue log | 15 min |
| "What is this?" button + modal (3b) | New `<button>` + `<div class="whats-this-modal">` | 20 min |
| Mode indicator label (3c) | 3 lines of HTML + `title` attribute | 5 min |
| Demo narrator overlay (section 5) | New `<div id="demo-narrator">` with CSS animation | 30 min |
| `/help` command UI in command menu | Extend existing `prompt-command-item` list in `PromptBar.ts` | 20 min |
| `localStorage` first-run detection | 5 lines in `main.ts` or `SplashScreen.ts` | 10 min |
| `?demo=1` URL param detection | 3 lines in `main.ts` | 5 min |

**Total: ~2.5 hours for all client features, or ~1.5 hours for the critical subset (tooltips + narration + /help).**

### Needs a new WebSocket message from server (Behrang)

| Feature | What's needed |
|---------|---------------|
| Moment 6: Human approval gate hint | A new message type `human:approval-required` broadcast by the server when `EscalateToHuman` fires. Currently no client-side signal for this. The hint cannot trigger without it. |

**Proposed message shape:**

```typescript
{
  type: 'human:approval-required',
  stageName: string,           // "Prioritization"
  prompt: string,              // "Approve the top 3 candidates to continue"
  candidates?: CandidateSummary[]  // optional: top 3 for display
}
```

Client listens: `ws.on('human:approval-required', ...)` and triggers Moment 6 hint.

**This is the only server change in this entire doc.**

### Needs no new server code

Everything else in this document works with the existing WebSocket messages:
- `process:started` — already carries `currentStageName` and `totalStages`
- `stage:advanced` — already carries `fromStageName`, `toStageName`, `stageIndex`, `totalStages`
- `findings:posted` — already carries `agent_name` and `finding`
- The `stage-announcement` CustomEvent is already dispatched by `main.ts` on both `process:started` and `stage:advanced`

The narrator, stage description label, onboarding tooltips, and `/help` command all read from these existing events.

---

## Trigger Event Summary (quick reference for implementation)

| Moment | Event | Source |
|--------|-------|--------|
| 1. Problem input hint | SetupScreen mounts | Client (localStorage flag) |
| 2. Brainstorm starts hint | `process:started` (WebSocket) | Server → already in `main.ts` |
| 3. First finding hint | `findings-posted` (CustomEvent) | Already dispatched by `main.ts` |
| 4. Stage advance hint | `stage-announcement` (CustomEvent) | Already dispatched by `main.ts` |
| 5. Prompt bar hint | `process:started` + ~500ms delay | Client-side timeout after startGame() |
| 6. Approval gate hint | `human:approval-required` (WebSocket) | **New server broadcast needed** |
| 7. Session complete hint | `stage-announcement` where text includes "complete" | Already dispatched by `main.ts` |
| Narrator: framing | `process:started` (WebSocket) | Server → already in `main.ts` |
| Narrator: stage N | `stage-announcement` (CustomEvent) | Already dispatched by `main.ts` |
| Stage description label | `stage-announcement` (CustomEvent) | Already dispatched by `main.ts` |

---

*Companion to `skills/brainstorm/DESIGN.md` and `docs/BRAINSTORM-E2E.md`. Implementation owner: Ida (client) + Behrang (one server message).*
