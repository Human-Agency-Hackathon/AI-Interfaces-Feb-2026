# Agent Collaboration Design
**Task 48 | Owner: Jeff | Status: Complete**

This document defines how agents in a brainstorming session should reference, build on, challenge, and synthesize each other's ideas. It is a companion to `DESIGN.md` and directly informs changes to `SystemPromptBuilder.ts`.

---

## 1. Interaction Patterns

Six named patterns. Each has a canonical opening phrase that agents must use when invoking the pattern. Behrang: these phrases are what make collaboration visible in the UI and parseable if you later want to filter by interaction type.

---

### Pattern 1: Build-On

**When to use:** An agent sees a peer's posted idea and wants to extend, deepen, or remix it — adding a dimension the original didn't cover.

**Opening phrase:** `"Building on [Agent Name]'s idea about [topic]..."`

**What the agent does:** References the source idea by agent name and topic. Adds genuinely new content — not a restatement. The extension should be substantively different from the original.

**Example:**
> "Building on the Cross-Pollinator's idea about applying ant-colony pheromone trails to user navigation... we could extend this to decay rates: older content leaves weaker signals, so the interface naturally surfaces freshly-traversed paths. The original was about routing; this adds a temporal freshness layer."

**Constraint:** The "Building on" must actually add something. Restating the original idea with minor variation is not a build-on.

---

### Pattern 2: Challenge

**When to use:** An agent spots a specific flaw, incorrect assumption, or weak point in a named peer's idea. The challenge is targeted and constructive — not blanket skepticism.

**Opening phrase:** `"Challenging [Agent Name]'s claim that [specific claim]..."`

**What the agent does:** Quotes or closely paraphrases the specific claim being challenged. States the counterargument concisely. (Optional) proposes what would need to be true for the original idea to survive.

**Example:**
> "Challenging the First-Principles Thinker's claim that removing intermediaries always reduces friction... in high-trust contexts, intermediaries provide accountability that both parties actually want. This works for commodity transactions, but breaks in healthcare and legal services where the 'inefficiency' is deliberate."

**Constraint:** Must name the agent and quote the specific claim. General disagreement without a named target is not a challenge — it's just skepticism.

---

### Pattern 3: Synthesize-From

**When to use:** A convergent-phase agent (Synthesizer, Connector) explicitly combines two or more peers' ideas into a new candidate that neither original captured alone.

**Opening phrase:** `"Synthesizing [Agent A]'s [idea] with [Agent B]'s [idea]..."`

**What the agent does:** Names both sources. Explains what each contributes. Articulates what the combination unlocks that neither original had.

**Example:**
> "Synthesizing the Wild Ideator's 'Reverse Mentorship Network' with the Historian's precedent from 21st Century Fox's reverse-mentoring program... The Ideator gave us the structure; the Historian gives us proof it survived a year-2 engagement cliff. Combined candidate: Structured Reverse Mentorship with 90-day cohort rotations and mandatory knowledge-artifact deliverables."

**Constraint:** Both sources must be named. The synthesis must produce a candidate that is meaningfully different from either source — not just a concatenation.

---

### Pattern 4: Endorse

**When to use:** An agent wants to signal that a peer's idea is strong enough to carry forward — especially useful in Pushback and Prioritization stages where ideas are under attack.

**Opening phrase:** `"Endorsing [Agent Name]'s [idea title] — [one-sentence reason]"`

**What the agent does:** Names the agent and idea. Gives a single concrete reason why it survives scrutiny. Does not repeat the original idea at length.

**Example:**
> "Endorsing the Cross-Pollinator's 'Metabolic Rate Pricing' idea — it survived the Devil's Advocate's attack on customer confusion because the mechanism is already familiar from mobile data plans."

**Constraint:** An endorsement without a reason is noise. Require one concrete reason every time.

---

### Pattern 5: Request-Clarification

**When to use:** An agent needs a specific piece of information from a named peer before it can proceed — not a general question to the room.

**Opening phrase:** `"[Agent Name], clarify: [specific question]"`

**What the agent does:** Directs the question at a named agent. The question is specific enough that there is a factual answer, not an opinion. The requesting agent states why it needs the answer.

**Example:**
> "First-Principles Thinker, clarify: does your 'Constraint Auction' idea assume the auctioneer is centralized or distributed? The Connector needs to know before deciding if it can merge with the Wild Ideator's 'Peer Governance' idea."

**Implementation note:** In the current architecture, agents can't literally receive replies mid-turn. This pattern is a signal for the next iteration of the board — the clarification request is posted as a finding and the named agent should address it in their next turn. No new tool is needed now; this is social protocol.

---

### Pattern 6: Redirect

**When to use:** A later-stage agent (Devil's Advocate, Pragmatist, Strategist) decides a peer's line of thinking is off-track and proposes a course correction.

**Opening phrase:** `"Redirecting [Agent Name]'s focus from [current direction] toward [better direction], because [reason]"`

**What the agent does:** Names the agent. Specifies what to stop doing and what to do instead. Gives a brief reason grounded in the stage goal.

**Example:**
> "Redirecting the Synthesizer's focus from technical elegance toward adoption friction, because the Pragmatist found that the three highest-scoring candidates all have year-2 engagement problems — elegance won't save them if users churn."

**Constraint:** Redirect is a strong move. Reserve it for genuine misalignment with stage goals, not stylistic disagreement.

---

## 2. System Prompt Additions

The following block should be inserted into `buildProcessPrompt()` in `SystemPromptBuilder.ts`, immediately after the section that lists co-participants (the `YOUR CO-PARTICIPANTS` block). It replaces the existing vague instruction `"Engage with their contributions — build on ideas, challenge them, or synthesize across them."` with concrete rules.

**Location in `SystemPromptBuilder.ts`:** lines 67–72 (the `if (ctx.team.length > 0)` block).

**Current text (to replace):**
```
Engage with their contributions — build on ideas, challenge them, or synthesize across them.
```

**Replacement text:**

```
HOW TO INTERACT WITH TEAMMATES:

When you reference another agent's posted idea, use one of these explicit patterns:

- BUILD ON: "Building on [Agent Name]'s idea about [topic]..." — extend or deepen their idea with something new. Do not restate; add a dimension they didn't cover.
- CHALLENGE: "Challenging [Agent Name]'s claim that [specific claim]..." — name the specific claim you dispute. State the counterargument. Do not use this for general skepticism — only for a targeted, named disagreement.
- SYNTHESIZE: "Synthesizing [Agent A]'s [idea] with [Agent B]'s [idea]..." — combine two ideas into a stronger candidate. Name both sources. Articulate what the combination unlocks that neither original captured.
- ENDORSE: "Endorsing [Agent Name]'s [idea title] — [one-sentence reason]" — signal that an idea survives scrutiny. Required: give one concrete reason.
- CLARIFY: "[Agent Name], clarify: [specific question]" — direct a specific question at a named teammate. State why you need the answer. They will address it in their next turn.
- REDIRECT: "Redirecting [Agent Name]'s focus from [X] toward [Y], because [reason]" — course-correct a teammate who is misaligned with the stage goal. Reserve for genuine misalignment, not style disagreement.

IMPORTANT: Always name the specific agent (e.g., "the Cross-Pollinator", "the Wild Ideator") — never say "a teammate" or "someone above". The audience watching the session needs to see who is talking to whom.
```

**Where to put it in the TypeScript source** — replace the closing line of the team section:

```typescript
// In buildProcessPrompt(), replace this:
sections.push(`YOUR CO-PARTICIPANTS:
${ctx.team.map(t => `- ${t.agent_name} (${t.role})`).join('\n')}

Engage with their contributions — build on ideas, challenge them, or synthesize across them.`);

// With this:
sections.push(`YOUR CO-PARTICIPANTS:
${ctx.team.map(t => `- ${t.agent_name} (${t.role})`).join('\n')}

HOW TO INTERACT WITH TEAMMATES:

When you reference another agent's posted idea, use one of these explicit patterns:

- BUILD ON: "Building on [Agent Name]'s idea about [topic]..." — extend or deepen their idea with something new. Do not restate; add a dimension they didn't cover.
- CHALLENGE: "Challenging [Agent Name]'s claim that [specific claim]..." — name the specific claim you dispute. State the counterargument. Do not use this for general skepticism — only for a targeted, named disagreement.
- SYNTHESIZE: "Synthesizing [Agent A]'s [idea] with [Agent B]'s [idea]..." — combine two ideas into a stronger candidate. Name both sources. Articulate what the combination unlocks that neither original captured.
- ENDORSE: "Endorsing [Agent Name]'s [idea title] — [one-sentence reason]" — signal that an idea survives scrutiny. Required: give one concrete reason.
- CLARIFY: "[Agent Name], clarify: [specific question]" — direct a specific question at a named teammate. State why you need the answer. They will address it in their next turn.
- REDIRECT: "Redirecting [Agent Name]'s focus from [X] toward [Y], because [reason]" — course-correct a teammate who is misaligned with the stage goal. Reserve for genuine misalignment, not style disagreement.

Always name the specific agent by role (e.g., "the Cross-Pollinator", "the Wild Ideator") — never say "a teammate" or "someone above".`);
```

---

## 3. Tool Additions: Text Convention vs. New MCP Tool

### The question

Should interactions be encoded in a new `BuildOn(ideaId, content)` MCP tool, or are the text conventions in section 2 sufficient?

### Recommendation: Text conventions now, tool later

**Keep text conventions for the hackathon.** Here is why:

**Arguments for text conventions:**
1. Zero implementation cost. The patterns work the moment the system prompt is updated.
2. The findings board already carries all agent outputs. Every Build-On, Challenge, and Synthesize naturally appears in the board as a `PostFindings` call — there is nothing new to plumb.
3. LLMs follow named-pattern conventions reliably when the prompt is explicit. The conventions in section 2 are specific enough to produce consistent output without schema enforcement.
4. Flexibility: agents can combine patterns in one turn ("Building on X, and Challenging Y's assumption...") in ways a rigid tool interface would not easily allow.
5. Behrang's engine requires no changes to `RpgMcpServer.ts` or `CustomToolHandler.ts`.

**Arguments for a dedicated tool:**
1. A `BuildOn(sourceId, content)` tool would let the server track the interaction graph explicitly — which ideas were built on, challenged, or endorsed. This graph is valuable for the Presentation stage (Narrator could say "Idea X was endorsed 3 times and challenged once").
2. Tool calls are machine-readable without parsing agent prose. A text pattern requires regex or LLM re-parsing downstream.
3. A `Challenge(sourceId, claim, counterargument)` tool enforces the structural discipline that the text convention merely encourages.

**When to add the tool:** After the hackathon, if the interaction graph is needed for UI features (e.g., visualizing which ideas were most discussed, or filtering the board by interaction type). The text conventions will have validated the interaction patterns against real model output. At that point, replacing `PostFindings` with structured interaction tools is straightforward.

**For now:** Implement section 2's prompt changes. Instruct the UI to parse findings that start with "Building on", "Challenging", "Synthesizing", "Endorsing" as colored/labeled messages in the chat feed. No tool change needed.

---

## 4. Stage-Specific Guidance

Not all patterns apply in all stages. Applying the wrong pattern at the wrong stage undermines the methodology.

| Stage | Permitted Patterns | Prohibited Patterns | Rationale |
|-------|-------------------|--------------------|-|
| **0: Problem Framing** | Clarify, Redirect | Build-On, Synthesize | Framing agents should challenge each other's scope definitions and ask clarifying questions, but should not be combining ideas — there are no ideas yet. |
| **1: Divergent Thinking** | NONE | All interaction patterns | Hard isolation. Agents must not see or reference each other's ideas during ideation. Groupthink prevention is the top priority. Even Build-On is prohibited — it anchors other agents' output. |
| **2: Precedent Research** | Clarify | Build-On, Challenge, Synthesize, Endorse, Redirect | Historian and Analogist work in parallel but on different questions. Clarification across roles is acceptable; synthesis is premature. |
| **3: Convergent Thinking** | Synthesize-From (required), Build-On, Endorse | Challenge, Redirect | This is the stage where Synthesize-From is the primary job. Build-On is permitted to extend candidates. Challenging is counterproductive — convergent agents should be selecting and combining, not attacking. |
| **4: Fact Checking** | Challenge (required), Endorse, Clarify | Build-On, Synthesize, Redirect | Skeptic and Feasibility Analyst should challenge specific claims in candidates. Endorse is permitted when a candidate's assumptions hold up. Build-On and Synthesize are off-topic — this is annotation, not generation. |
| **5: Pushback / Red Team** | Challenge (required), Endorse, Redirect | Build-On, Synthesize, Clarify | Devil's Advocate and Pragmatist must challenge named candidates hard. Endorse is permitted when an attack fails. Redirect is permitted when a peer is being insufficiently harsh. |
| **6: Prioritization** | Endorse, Challenge, Synthesize-From | Build-On, Clarify, Redirect | Strategist is single-agent in current design. If expanded, Endorse and Challenge on scoring rationale. Synthesize-From is permitted to merge close-scoring candidates. |
| **7: Review / Synthesis** | Synthesize-From, Build-On | Challenge, Endorse, Clarify, Redirect | Architect is single-agent. If expanded, permitted to synthesize across top candidates. |
| **8: Presentation** | NONE | All | Narrator produces final output. No peer interaction needed. |

### Implementation note for Behrang

The stage-specific permitted/prohibited list above should be encoded in the system prompt alongside the interaction pattern definitions. Add a `CURRENT STAGE INTERACTION RULES` line to `buildProcessPrompt()` that injects only the permitted patterns for the current stage:

```typescript
// Derive allowed patterns from stage config
const stageInteractionRules: Record<string, string[]> = {
  'framing':      ['Clarify', 'Redirect'],
  'divergent':    [],  // NO interactions — hard isolation
  'research':     ['Clarify'],
  'convergent':   ['Synthesize-From', 'Build-On', 'Endorse'],
  'factcheck':    ['Challenge', 'Endorse', 'Clarify'],
  'pushback':     ['Challenge', 'Endorse', 'Redirect'],
  'prioritization': ['Endorse', 'Challenge', 'Synthesize-From'],
  'review':       ['Synthesize-From', 'Build-On'],
  'presentation': [],
};
const allowed = stageInteractionRules[pc.stageId] ?? [];
```

Then in the prompt: `"In this stage, the permitted interaction patterns are: ${allowed.join(', ') || 'NONE — work independently'}."` and `"Do not use any other interaction patterns."` For divergent specifically, add: `"CRITICAL: Do NOT reference any other agent's ideas. Generate entirely independently."`.

---

## 5. Sequence Diagram: Three Agents Across Two Turns

This example shows a Convergent stage with three agents: the Synthesizer, the Connector, and (for illustration) an observer agent tracking the interaction. Agents are sequential in this stage per the DESIGN.md spec.

```mermaid
sequenceDiagram
    participant B as FindingsBoard
    participant S as The Synthesizer
    participant C as The Connector
    participant DA as The Devil's Advocate

    Note over S,DA: Turn 1 — Convergent Stage begins. Synthesizer goes first.

    S->>B: PostFindings("Candidate 1: Metabolic Rate Pricing [from: Wild Ideator idea_wild_003 + Cross-Pollinator idea_cross_007]. Core concept: price dynamically based on user engagement velocity.")
    S->>B: PostFindings("Candidate 2: Reverse Mentorship Network [from: Wild Ideator idea_wild_011]. Core concept: junior users teach senior ones — inverts the help hierarchy.")
    S->>B: PostFindings("Candidate 3: Constraint Auction [from: First-Principles Thinker idea_fp_002]. Core concept: remove all defaults; users bid for feature bundles.")

    Note over S,DA: Connector's turn — reads board, finds synthesis opportunity.

    C->>B: PostFindings("Synthesizing the Synthesizer's Candidate 2 (Reverse Mentorship Network) with the Historian's research_hist_003 (21st Century Fox cohort rotation program)... Neither alone solves the year-2 engagement cliff. Combined Candidate 4: Structured Reverse Mentorship with 90-day cohort rotations and mandatory knowledge-artifact deliverables. What the combination unlocks: the cohort structure gives the network a forcing function that prevents the organic version from going dormant.")
    C->>B: PostFindings("Endorsing the Synthesizer's Candidate 1 (Metabolic Rate Pricing) — it is the only candidate with a direct pricing-model analogy in mobile data that already has consumer acceptance. Low adoption friction.")

    Note over S,DA: Turn 2 — Pushback stage begins. Devil's Advocate challenges by name.

    DA->>B: PostFindings("Challenging the Connector's claim that the cohort rotation structure prevents engagement drop-off in Candidate 4... The Fox program ran in a single company with mandated participation. In an open platform, cohort membership is voluntary. Year-2 problem: attrition in voluntary cohorts historically exceeds 60% (Nielsen 2019 community study). Verdict: WEAKENED. The idea survives if cohort joining has an extrinsic incentive — but that mechanism is not in the current candidate.")
    DA->>B: PostFindings("Challenging the Synthesizer's Candidate 3 (Constraint Auction)... The assumption that users will bid rationally for feature bundles has been tested twice in enterprise SaaS (Salesforce 2017, HubSpot 2020) and failed both times — users anchor to defaults and non-participation craters engagement. Verdict: KILLED.")

    Note over S,DA: Connector responds in turn 2.

    C->>B: PostFindings("Building on the Devil's Advocate's attack on Candidate 4... the extrinsic incentive gap is real. Proposed patch: cohort completion unlocks a visible credential in the user's public profile. This converts the voluntary drop-out problem into a reputational completion incentive — similar mechanism to GitHub contribution graphs. Revised Candidate 4 now includes: 90-day cohort + credential unlock.")
    C->>B: PostFindings("Endorsing the Devil's Advocate's verdict on Candidate 3 (KILLED) — the two SaaS precedents are dispositive. Remove from list.")
```

---

*This document defines the interaction layer on top of the process design in `DESIGN.md`. It does not change stage structure, agent roles, or completion criteria — only how agents speak to each other within stages. Behrang: the minimum viable implementation is the system prompt change in section 2 plus the stage-specific rules in section 4. The sequence diagram is illustrative, not prescriptive.*
