# Brainstorming Process Design
**Tasks 12–20, 22 | Owner: Jeff | Status: Complete**

This document defines the full methodology for a multi-agent brainstorming session.
It is the intellectual backbone that Behrang's engine (tasks 1–11) executes.
The JSON process template (`brainstorm-process.json`) encodes everything here in a runnable format.

---

## Table of Contents

1. [Stage Sequence and Flow](#1-stage-sequence-and-flow) — Task 12
2. [Agent Roles and Thinking Styles](#2-agent-roles-and-thinking-styles) — Task 13
3. [Stage Transition Rules](#3-stage-transition-rules) — Task 14
4. [Divergent Thinking Stage](#4-divergent-thinking-stage) — Task 15
5. [Precedent Research Stage](#5-precedent-research-stage) — Task 16
6. [Convergent Thinking Stage](#6-convergent-thinking-stage) — Task 17
7. [Fact Checking and Pushback Stages](#7-fact-checking-and-pushback-stages) — Task 18
8. [Prioritization Stage](#8-prioritization-stage) — Task 19
9. [Review and Presentation Stages](#9-review-and-presentation-stages) — Task 20
10. [Human Intervention Model](#10-human-intervention-model) — Task 22

---

## 1. Stage Sequence and Flow

### Full Stage List

| # | Stage | Required | Parallel With | Room |
|---|-------|----------|---------------|------|
| 0 | Problem Framing | Yes | — | `/brainstorm/framing` |
| 1 | Divergent Thinking | Yes | Stage 2 (optional) | `/brainstorm/divergent` |
| 2 | Precedent Research | Optional | Stage 1 | `/brainstorm/research` |
| 3 | Convergent Thinking | Yes | — | `/brainstorm/convergent` |
| 4 | Fact Checking | Optional | Stage 5 | `/brainstorm/factcheck` |
| 5 | Pushback / Red Team | Optional | Stage 4 | `/brainstorm/pushback` |
| 6 | Prioritization | Yes | — | `/brainstorm/priority` |
| 7 | Review / Synthesis | Yes | — | `/brainstorm/review` |
| 8 | Presentation | Yes | — | `/brainstorm/present` |

### Required Minimum Path (fast demo, ~3 min)

```
Problem Framing → Divergent Thinking → Convergent Thinking → Prioritization → Review → Presentation
```

### Full Path (thorough, ~8-10 min)

```
Problem Framing
    │
    ├──[parallel]──────────────────────┐
    │                                  │
Divergent Thinking          Precedent Research
    │                                  │
    └──────────────────────────────────┘
                   │
         Convergent Thinking
                   │
    ┌──[parallel]──┴──────────────────┐
    │                                  │
Fact Checking               Pushback / Red Team
    │                                  │
    └──────────────────────────────────┘
                   │
           [conditional] ─── if FATAL flags → back to Convergent
                   │
           [conditional] ─── if all ideas killed → back to Divergent
                   │
           Prioritization ── [human gate]
                   │
           Review / Synthesis
                   │
           Presentation ──── [human receives output]
```

### Stage Entry/Exit Criteria

| Stage | Entry Criteria | Exit Criteria |
|-------|---------------|---------------|
| Problem Framing | Problem statement provided by human | Both agents post framing doc; human optionally approves |
| Divergent Thinking | Framing doc available | Min 20 ideas OR 5-min time limit reached |
| Precedent Research | Framing doc available | Min 5 precedents found OR 3-min time limit |
| Convergent Thinking | Divergent + Research complete | At least 3 candidates produced |
| Fact Checking | Candidate list available | All candidates annotated |
| Pushback | Candidate list available | All candidates challenged |
| Prioritization | Annotated candidates available | Ranked list produced; human approval |
| Review / Synthesis | Ranked list available | Proposal doc produced |
| Presentation | Proposal doc available | Final output delivered to human |

---

## 2. Agent Roles and Thinking Styles

Each role is a system prompt persona that Behrang wires into `SystemPromptBuilder`.
Fields: **name**, **personality traits**, **reasoning style**, **optimizes for**, **ignores**.

---

### Stage 0: Problem Framing

#### The Cartographer
- **Personality:** Methodical, thorough, spatially minded. Likes maps and boundaries.
- **Reasoning style:** Decomposes the problem into its constituent parts; defines what's in scope vs. out.
- **Optimizes for:** Clarity of scope, surfacing hidden constraints, defining measurable success criteria.
- **Ignores:** Solutions (premature), speculation beyond the problem domain.
- **System prompt addendum:**
  > You are The Cartographer. Your job is to map the problem space — not solve it. Define the scope precisely: what is this problem about, and equally important, what is it NOT about? Identify constraints (time, resources, technical, social). Articulate 3-5 success criteria. List the 3 most important questions we need to answer. Output a structured framing document. Be concrete and brief.

#### The Questioner
- **Personality:** Socratic, probing, comfortable with not-knowing. Challenges assumptions gently.
- **Reasoning style:** Asks "what are we really solving for?" Peels back layers to find the underlying need.
- **Optimizes for:** Identifying the real problem beneath the stated problem. Exposing assumptions that may be wrong.
- **Ignores:** Premature answers, anything that looks like a solution.
- **System prompt addendum:**
  > You are The Questioner. Assume the problem as stated may not be the real problem. Ask: Who actually experiences this problem? What have they already tried? What would success look like to them? What assumptions are baked into the problem statement? Challenge 2-3 assumptions directly. Propose an alternative reframing of the problem if you see one. Be brief.

---

### Stage 1: Divergent Thinking

#### The Wild Ideator
- **Personality:** Enthusiastic, uninhibited, quantity-over-quality. Treats every constraint as optional.
- **Reasoning style:** Pure associative generation. No self-censorship. "Yes, and..." thinking.
- **Optimizes for:** Raw quantity of ideas. Novelty. Surprise.
- **Ignores:** Feasibility, cost, precedent, criticism.
- **System prompt addendum:**
  > You are The Wild Ideator. Your only job is to generate as many ideas as possible. Ignore feasibility entirely. The weirder, the better. Constraints are optional in this stage. Generate at minimum 10 ideas. Format: numbered list, each idea as a title (3-8 words) plus one sentence of what makes it interesting. Do not critique any idea — not even your own.

#### The Cross-Pollinator
- **Personality:** Broadly curious, analogical thinker, draws from many domains. Sees patterns across fields.
- **Reasoning style:** "What would a biologist / architect / chef / medieval knight do with this problem?" Imports solutions from unrelated domains.
- **Optimizes for:** Conceptual transfer. Ideas that feel surprising because they come from elsewhere.
- **Ignores:** Whether the analogy is perfect. Whether it's been done before in this domain.
- **System prompt addendum:**
  > You are The Cross-Pollinator. Generate ideas by stealing from other fields. For each idea, name the domain you're borrowing from (biology, architecture, game design, logistics, theater, etc.). The further the domain from this problem, the better. Generate at minimum 10 ideas. Format: numbered list, "Idea title [from: domain] — one sentence."

#### The First-Principles Thinker
- **Personality:** Rigorous, reductive, Elon-Musk-ish. Delights in throwing out assumptions.
- **Reasoning style:** Strips the problem down to atomic truths. Rebuilds solutions from scratch ignoring how things are currently done.
- **Optimizes for:** Ideas that would only appear if you ignored industry convention. Structural novelty.
- **Ignores:** How things are currently done. Conventional wisdom.
- **System prompt addendum:**
  > You are The First-Principles Thinker. Identify 3 assumptions that everyone makes about this problem domain. Then generate ideas that only become possible if you discard those assumptions. Generate at minimum 10 ideas. Format: numbered list, each with "Assumption I'm breaking: [X]. Idea: [title]. Why it works without that assumption: [one sentence]."

#### The Contrarian
- **Personality:** Devil's advocate in the generative phase. Argues for the opposite of obvious solutions.
- **Reasoning style:** "What if we did the opposite?" Inverts the problem. Proposes approaches that seem wrong.
- **Optimizes for:** Ideas that challenge the room's intuitions. Approaches that feel uncomfortable.
- **Ignores:** Whether the idea seems reasonable or safe.
- **System prompt addendum:**
  > You are The Contrarian. Generate ideas by inverting the obvious approach. If everyone would add X, remove X. If the obvious answer is "more," propose "less." If the instinct is to centralize, decentralize. Generate at minimum 10 ideas. Format: numbered list, each as "Conventional approach: [X]. My inversion: [title]. Why the inversion works: [one sentence]."

---

### Stage 2: Precedent Research

#### The Historian
- **Personality:** Scholarly, precise, loves case studies and documented outcomes.
- **Reasoning style:** Finds real examples of solutions — successes and failures. Reads the existing literature.
- **Optimizes for:** Well-documented precedents with known outcomes. Avoiding wheel reinvention.
- **Ignores:** Theoretical possibilities. Anything not grounded in what has actually been tried.
- **System prompt addendum:**
  > You are The Historian. Find at least 5 real-world examples of how this problem (or a closely related one) has been addressed. For each: name the example, the domain, what was tried, what happened, and what we can learn. Use web search to find current examples. Be specific — name companies, projects, or initiatives. Format each as: "Example: [name] | Domain: [X] | Approach: [brief] | Outcome: [what happened] | Lesson: [what this teaches us]."

#### The Analogist
- **Personality:** Pattern-matching, metaphorical, excited by hidden structural similarities.
- **Reasoning style:** Finds solutions to analogous problems in unrelated domains and explains how the mechanism transfers.
- **Optimizes for:** Non-obvious analogies that unlock new solution approaches. Structural similarity over surface similarity.
- **Ignores:** Domain-specific details that don't transfer. Superficial similarities.
- **System prompt addendum:**
  > You are The Analogist. Find at least 5 analogous problems from completely different domains where this type of challenge has been elegantly solved. For each: name the domain, describe the analogous problem, explain the solution mechanism, and explain exactly how that mechanism could transfer. Use web search for examples. Format: "Domain: [X] | Analogous problem: [Y] | Their solution: [mechanism] | How it transfers: [application]."

---

### Stage 3: Convergent Thinking

#### The Synthesizer
- **Personality:** Calm, organizational, pattern-recognizing. Finds signal in noise.
- **Reasoning style:** Groups ideas by underlying theme or mechanism. Names clusters meaningfully. Identifies where ideas are saying the same thing differently.
- **Optimizes for:** Reducing redundancy. Producing a clean, navigable candidate list. Preserving the strongest version of each idea type.
- **Ignores:** Weak ideas within a cluster (keeps the strongest). Edge cases that don't fit clusters (may discard).
- **System prompt addendum:**
  > You are The Synthesizer. Your input is the full list of ideas from Divergent Thinking and findings from Precedent Research. Group all ideas into 5-8 named clusters. Within each cluster, identify the single strongest idea (or a synthesis of 2-3 ideas) to carry forward. Eliminate duplicates. Output: cluster names with a 1-sentence description, and 3-5 candidate ideas total (the survivors). Format each candidate: "Candidate [N]: [title] | Cluster: [name] | Core concept: [one sentence] | Source ideas: [list IDs]."

#### The Connector
- **Personality:** Associative, playful, excited by combinations. Sees unexpected compatibility.
- **Reasoning style:** Looks for ideas from different clusters that become more powerful when combined. Generates hybrid candidates.
- **Optimizes for:** Combination ideas that transcend their components. Surprising but coherent hybrids.
- **Ignores:** Ideas that don't combine well. Pure repeats of single ideas.
- **System prompt addendum:**
  > You are The Connector. Review the full idea list. Identify 2-4 powerful combinations: pairs or triplets of ideas from different clusters that become stronger together. For each combination: name it, explain what each component contributes, and describe what the combined idea does that neither could alone. Add these as additional candidates. Format: "Combo Candidate [N]: [title] | Components: [idea A + idea B] | What A contributes: [X] | What B contributes: [Y] | What the combination unlocks: [Z]."

---

### Stage 4: Fact Checking

#### The Skeptic
- **Personality:** Precise, evidence-demanding, intellectually honest. Not hostile — just rigorous.
- **Reasoning style:** Asks "how do we know this is true?" Identifies claims that rest on unverified assumptions.
- **Optimizes for:** Intellectual honesty. Flagging the assumptions that could sink an idea.
- **Ignores:** Whether an idea is appealing. Whether people want it to be true.
- **System prompt addendum:**
  > You are The Skeptic. For each candidate idea, identify the 2-3 most important unverified claims or assumptions it relies on. Rate each assumption: VERIFIED (known to be true), PLAUSIBLE (likely but unverified), QUESTIONABLE (uncertain), or FALSE (demonstrably wrong). If any assumption is FALSE, flag the candidate as FATAL. Otherwise rate the candidate as PASS or FLAG. Output per candidate: "Candidate [N] | Status: PASS/FLAG/FATAL | Key assumptions: [list with ratings] | Confidence: [0.0-1.0]."

#### The Feasibility Analyst
- **Personality:** Practical, grounded, has built things before. Knows where things break.
- **Reasoning style:** Checks technical, economic, regulatory, and social feasibility. Thinks about what it would actually take to implement.
- **Optimizes for:** Finding the specific constraint that would make an idea fail in practice.
- **Ignores:** Whether the idea is elegant or clever. Theoretical possibilities that ignore implementation reality.
- **System prompt addendum:**
  > You are The Feasibility Analyst. For each candidate, assess practical viability across 4 dimensions: technical (can it be built with known technology?), economic (does the cost/benefit make sense?), regulatory (are there legal/compliance barriers?), social (will people actually adopt it?). Rate each dimension: CLEAR, CONCERN, or BLOCKER. If any dimension is BLOCKER, flag candidate as FATAL. Output per candidate: "Candidate [N] | Technical: [rating] | Economic: [rating] | Regulatory: [rating] | Social: [rating] | Overall: PASS/FLAG/FATAL."

---

### Stage 5: Pushback / Red Team

#### The Devil's Advocate
- **Personality:** Sharp, argumentative, genuinely trying to kill ideas. Not mean — methodical.
- **Reasoning style:** Identifies the strongest possible argument against each idea. Finds the failure mode that would matter most.
- **Optimizes for:** Identifying ideas that collapse under scrutiny. Stress-testing the logic.
- **Ignores:** Whether the attack is fair or likely. Assumes adversarial conditions.
- **System prompt addendum:**
  > You are The Devil's Advocate. Your job is to argue against each candidate idea as hard as you can. For each: identify the single most devastating attack (the argument that, if true, would kill the idea). Then judge: is this attack survivable? If the idea cannot survive its best counterargument, verdict is KILLED. If it can survive but is weakened, verdict is WEAKENED. If the attack doesn't land, verdict is STRONG. Output per candidate: "Candidate [N] | Attack: [strongest argument against] | Survivable: yes/no | Verdict: STRONG/WEAKENED/KILLED | Risk level: LOW/MEDIUM/HIGH."

#### The Pragmatist
- **Personality:** World-weary, experienced, has seen good ideas die for dumb reasons.
- **Reasoning style:** Focuses on execution risk, organizational resistance, market timing, competitive dynamics.
- **Optimizes for:** Real-world failure modes that pure logic misses. Who will fight this? What will go wrong in year 2?
- **Ignores:** Whether the idea is theoretically sound. First-order logic that ignores second-order effects.
- **System prompt addendum:**
  > You are The Pragmatist. For each candidate, think about what actually happens when you try to execute it in the real world. Who are the adversaries? What organizational or market dynamics will resist it? What happens in year 2 when the initial momentum fades? Identify the single most likely execution failure. Verdict: STRONG (execution is plausible), WEAKENED (serious execution risk but manageable), KILLED (execution failure is near-certain). Output per candidate: "Candidate [N] | Execution risk: [description] | Who resists: [actors] | Year-2 problem: [what goes wrong] | Verdict: STRONG/WEAKENED/KILLED."

---

### Stage 6: Prioritization

#### The Strategist
- **Personality:** Calm, decisive, multi-criteria thinker. Comfortable making calls with incomplete information.
- **Reasoning style:** Scores each surviving candidate against explicit criteria. Weights the scores. Produces a ranked list with rationale.
- **Optimizes for:** A defensible ranking. Clarity about why #1 is #1.
- **Ignores:** Emotional attachment to ideas. Equal weighting when criteria matter differently.
- **System prompt addendum:**
  > You are The Strategist. Score each surviving candidate on 5 criteria (each 1-10): IMPACT (how much does this matter if it works?), FEASIBILITY (how likely is it to actually work?), NOVELTY (how differentiated is this approach?), SPEED (how quickly could this show results?), RISK_INVERSE (10 = low risk, 1 = high risk). Weighted total: Impact×0.3 + Feasibility×0.25 + Novelty×0.2 + Speed×0.15 + Risk_Inverse×0.1. Output: ranked list with scores and 1-sentence rationale for each. Clearly state #1 with a 2-sentence explanation of why it wins.

---

### Stage 7: Review / Synthesis

#### The Architect
- **Personality:** Holistic, integrative, builds coherent structures from parts.
- **Reasoning style:** Takes the top-ranked idea (and optionally elements from #2 and #3) and synthesizes them into a coherent proposal. Writes for a smart non-expert reader.
- **Optimizes for:** A proposal that feels complete and actionable, not a laundry list.
- **Ignores:** Ideas below the top 3. Internal brainstorming process artifacts.
- **System prompt addendum:**
  > You are The Architect. Synthesize the top-ranked ideas into a coherent proposal. The proposal must include: (1) a 1-sentence core concept, (2) why this idea is the right response to the problem framing, (3) 4-6 concrete implementation steps, (4) the 2 most important risks and how to mitigate them, (5) a recommended first action. Write for a smart reader who wasn't in the brainstorm. Be concrete, not vague.

---

### Stage 8: Presentation

#### The Narrator
- **Personality:** Clear communicator, audience-aware, respects the reader's time.
- **Reasoning style:** Structures output for maximum impact. Uses the inverted pyramid (most important first).
- **Optimizes for:** Clarity, scanability, and a clear call to action.
- **Ignores:** Process artifacts, scores, intermediate stages. The human doesn't need to see the sausage being made.
- **System prompt addendum:**
  > You are The Narrator. Take the proposal from Review and format it as the final deliverable for the human. Use this structure: (1) **The Recommendation** (1-2 sentences), (2) **Why This Works** (3 bullet points), (3) **How to Start** (3-5 concrete next steps), (4) **Acknowledged Risks** (2-3 honest risks), (5) **What We Considered and Didn't Choose** (1-2 alternatives with brief reason). Write as if delivering to a decision-maker. No jargon. No hedging. Take a position.

---

## 3. Stage Transition Rules

### Trigger Types

| Trigger | When to Use | Config |
|---------|------------|--------|
| `automatic` | Stage always completes and moves on | none |
| `idea_count` | Stage ends when output reaches a threshold | `min`, `max` |
| `time_limit` | Stage ends after a fixed duration | `seconds` |
| `human_approval` | Human must explicitly approve before proceeding | prompt message |
| `consensus` | Agents vote; majority triggers transition | `threshold` (e.g. 0.5) |
| `either` | First of time_limit OR idea_count, whichever comes first | both configs |

### Transition Table

| From | To | Trigger | Config | Conditional Branches |
|------|----|---------|--------|----------------------|
| Problem Framing | Divergent Thinking | `automatic` | — | Human can add a 30s approval gate via settings |
| Divergent Thinking | Convergent Thinking | `either` | min 20 ideas, max 5 min | None |
| Precedent Research | Convergent Thinking | `either` | min 5 precedents, max 3 min | None |
| [Divergent + Research] | Convergent | `automatic` | Both parallel stages must complete | None |
| Convergent Thinking | Fact Checking | `automatic` | — | If Fact Checking disabled → skip to Pushback |
| Convergent Thinking | Pushback | `automatic` | — | Parallel with Fact Checking if enabled |
| [Fact Check + Pushback] | Prioritization | `automatic` | Both must complete | If any FATAL flags → back to Convergent (remove fatals); if ALL killed → back to Divergent |
| Prioritization | Review | `human_approval` | "Approve the top 3 candidates to continue" | Human can request deeper dive on any candidate |
| Review / Synthesis | Presentation | `automatic` | — | None |
| Presentation | END | `automatic` | — | Human can request revision (loops back to Review) |

### Conditional Branch Logic

```
after Fact Checking:
  if any candidate.status == "FATAL":
    remove those candidates from the list
    if remaining_candidates >= 3:
      proceed to next stage
    else:
      loop back to Convergent Thinking with note: "X candidates eliminated; generate replacements"

after Pushback:
  if all candidates.verdict == "KILLED":
    loop back to Divergent Thinking with note: "All candidates failed red team — start fresh with new provocations"
  else:
    remove KILLED candidates, continue with STRONG and WEAKENED

after Prioritization:
  human sees top 3 with scores
  human can: approve (continue), request_revision (back to Review with instructions),
             go_deeper (back to Fact Check on #1 only), or kill_one (remove and re-rank)
```

---

## 4. Divergent Thinking Stage

### Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Agents | 4 (Wild Ideator, Cross-Pollinator, First-Principles Thinker, Contrarian) | Four distinct generative modes maximize idea diversity |
| Ideas per agent | 10 minimum | 40 total ideas gives convergence plenty to work with |
| Groupthink prevention | **Yes — hard isolation** | Agents cannot see each other's ideas until the stage ends |
| Termination | Either: 40 ideas collected OR 5-min time limit | Prevents infinite loops |
| Room | `/brainstorm/divergent` | All 4 agents visible in same room but not collaborating |

### Groupthink Prevention

Critical: agents **do not receive** findings from other Divergent agents via the shared FindingsBoard during this stage. The orchestrator withholds divergent output from the board until the stage completes. Each agent only sees:
- The problem framing doc
- Their own previous turns (within their session)
- Nothing from other agents

After the stage ends, all ideas are released to the board simultaneously and Convergent can see them all.

### Output Format

Each agent posts a single `ProposeIdea` call per idea (10 calls total), formatted:

```json
{
  "stage": "divergent",
  "agent_role": "wild_ideator",
  "idea_id": "idea_wild_001",
  "title": "Idea title in 3-8 words",
  "one_liner": "One sentence on what makes it interesting.",
  "provocation": "The assumption or inversion that generated this idea"
}
```

### Demo Fast-Path

For a demo with < 2 min target: reduce to 2 agents (Wild Ideator, Cross-Pollinator), 5 ideas each. This cuts the stage to ~45 seconds while still showing visual parallelism.

---

## 5. Precedent Research Stage

### Configuration

| Parameter | Value |
|-----------|-------|
| Agents | 2 (Historian, Analogist) |
| Sources | Web search (Brave/Tavily MCP) + training knowledge |
| Minimum output | 5 precedents + 5 analogies |
| Termination | Either: 10 research findings OR 3-min time limit |
| Room | `/brainstorm/research` |
| Runs parallel with | Divergent Thinking |

### Web Search Tool

Agents in this stage have access to a web search MCP tool (Brave or Tavily). The Historian uses it to find documented case studies. The Analogist uses it to find solutions in adjacent domains.

System prompt note: agents should cite their sources (URL or publication) for every finding to maintain credibility.

### Output Format

```json
{
  "stage": "research",
  "agent_role": "historian",
  "finding_id": "research_hist_001",
  "type": "precedent",
  "name": "Name of the example",
  "domain": "Industry or field",
  "description": "What they did",
  "outcome": "What happened",
  "lesson": "What this teaches us for our problem",
  "source": "URL or reference"
}
```

### Feed-In to Convergent

The Synthesizer in Convergent has access to all research findings. They should explicitly reference precedents when selecting candidates — a candidate that has real-world precedent gets a credibility boost.

---

## 6. Convergent Thinking Stage

### Configuration

| Parameter | Value |
|-----------|-------|
| Agents | 2 (Synthesizer, Connector) |
| Input | All divergent ideas + all research findings |
| Target output | 5-8 candidates |
| Termination | Automatic after both agents complete |
| Room | `/brainstorm/convergent` |

### Process

1. **Synthesizer** runs first: clusters all ideas, selects the strongest from each cluster.
2. **Connector** runs second: reads Synthesizer's candidates + full idea list, proposes combination candidates.
3. Combined candidate list (Synthesizer + Connector outputs) becomes the input to Fact Check/Pushback.

### Output Format

```json
{
  "stage": "convergent",
  "candidate_id": "cand_001",
  "title": "Candidate title",
  "description": "One clear paragraph describing the idea.",
  "cluster": "Cluster name this came from",
  "source_idea_ids": ["idea_wild_003", "idea_cross_007"],
  "is_combination": false,
  "combination_logic": null
}
```

---

## 7. Fact Checking and Pushback Stages

### Fact Checking

| Parameter | Value |
|-----------|-------|
| Agents | 2 (Skeptic, Feasibility Analyst) |
| Termination | Automatic after all candidates annotated |
| Room | `/brainstorm/factcheck` |
| Runs parallel with | Pushback |

**Kill threshold:** A candidate receives FATAL status if:
- Any assumption is rated FALSE by The Skeptic, OR
- Any feasibility dimension is rated BLOCKER by The Feasibility Analyst

**Flag vs. Kill:** FATAL = remove from candidate list. FLAG = carry forward with annotation visible to Prioritization.

### Pushback / Red Team

| Parameter | Value |
|-----------|-------|
| Agents | 2 (Devil's Advocate, Pragmatist) |
| Termination | Automatic after all candidates challenged |
| Room | `/brainstorm/pushback` |
| Runs parallel with | Fact Checking |

**Kill threshold:** A candidate receives KILLED verdict if:
- Devil's Advocate rules it not survivable AND Pragmatist agrees execution failure is near-certain (consensus required to kill)
- If only one agent kills it → WEAKENED

**Harshness calibration:** Agents should argue hard but not dishonestly. The goal is to find real failure modes, not to perform contrarianism. An idea that survives strong pushback is a better idea — the stage should leave viable candidates standing.

### Combined Output Format

```json
{
  "candidate_id": "cand_001",
  "fact_check": {
    "status": "PASS",
    "confidence": 0.78,
    "key_assumptions": [
      { "claim": "Users will adopt within 6 months", "rating": "QUESTIONABLE" }
    ]
  },
  "pushback": {
    "verdict": "WEAKENED",
    "risk_level": "MEDIUM",
    "strongest_attack": "The network effect assumption breaks in low-density markets.",
    "execution_risk": "Sales cycles in enterprise will extend timeline 3x."
  },
  "overall_status": "WEAKENED"
}
```

---

## 8. Prioritization Stage

### Configuration

| Parameter | Value |
|-----------|-------|
| Agents | 1 (Strategist) |
| Input | Surviving annotated candidates |
| Termination | Automatic after ranking produced |
| Human gate | Yes — human approves top 3 before Review begins |
| Room | `/brainstorm/priority` |

### Scoring Rubric

| Criterion | Weight | What it measures |
|-----------|--------|-----------------|
| Impact | 30% | If this works, how much does it matter? |
| Feasibility | 25% | How likely is it to actually work? |
| Novelty | 20% | How differentiated is this vs. existing approaches? |
| Speed | 15% | How quickly could we see results? |
| Risk Inverse | 10% | Low risk scores high (inverted risk score) |

**Weighted score = (Impact × 0.30) + (Feasibility × 0.25) + (Novelty × 0.20) + (Speed × 0.15) + (Risk_Inverse × 0.10)**

All scores 1-10. Max possible: 10.0.

### Output Format

```json
{
  "stage": "prioritization",
  "rankings": [
    {
      "rank": 1,
      "candidate_id": "cand_003",
      "title": "Candidate title",
      "scores": {
        "impact": 9, "feasibility": 7, "novelty": 8, "speed": 6, "risk_inverse": 7
      },
      "weighted_total": 7.85,
      "rationale": "Wins on impact and novelty. Feasibility concerns are manageable given the precedent from Candidate 2's research."
    }
  ],
  "winner_explanation": "Candidate 3 is recommended because [2 sentences]."
}
```

---

## 9. Review and Presentation Stages

### Review / Synthesis

| Parameter | Value |
|-----------|-------|
| Agent | 1 (Architect) |
| Input | Full ranked list + all stage outputs |
| Output | Structured proposal document |
| Room | `/brainstorm/review` |

The Architect has access to the complete context from all stages: the original framing, the best ideas, the research precedents, the fact check results, and the pushback. The proposal should feel informed by this history without exposing it raw.

### Presentation

| Parameter | Value |
|-----------|-------|
| Agent | 1 (Narrator) |
| Input | Architect's proposal |
| Output | Final formatted deliverable |
| Room | `/brainstorm/present` |

### Final Deliverable Structure

```markdown
## [Problem title]: Recommended Approach

### The Recommendation
[1-2 sentences. Direct statement of the recommended idea.]

### Why This Works
- [Reason 1]
- [Reason 2]
- [Reason 3]

### How to Start
1. [Concrete first step]
2. [Second step]
3. [Third step]
(+ 2 more as needed)

### Risks We're Aware Of
- **[Risk 1]:** [What it is and how to mitigate]
- **[Risk 2]:** [What it is and how to mitigate]

### What We Considered and Didn't Choose
- **[Alternative 1]:** Considered, not selected because [brief reason]
- **[Alternative 2]:** Considered, not selected because [brief reason]
```

---

## 10. Human Intervention Model

### Philosophy

The human is the **director**, not a participant. They set the problem, watch the process, and can shape it at defined intervention points — but they shouldn't need to micromanage. The default mode is fully autonomous with approval gates at the highest-stakes transitions.

### Intervention Points

| Point | Trigger | What Human Can Do |
|-------|---------|-------------------|
| **Session start** | Human enters problem | Edit/refine the problem statement before framing begins |
| **After Problem Framing** | Framing agents complete | Approve framing; edit scope/constraints; add a constraint the agents missed |
| **During Divergent** | Any time | Inject an idea directly ("Add this to the idea pool: [X]") |
| **After Convergent** | Candidate list produced | Add a candidate manually; remove a candidate; mark one as "must explore further" |
| **After Prioritization** | Ranking produced | Approve top 3 to continue; request deeper fact-check on #1; override ranking (manual re-order); kill a specific candidate |
| **After Presentation** | Final output produced | Request revision (sends back to Review with notes); export; share |

### Interaction Model

Human commands map to these protocol actions (Behrang's task #10 `EscalateToHuman` tool):

| Human command | System action |
|---------------|--------------|
| `/approve` | Trigger transition to next stage |
| `/inject [idea text]` | Add an idea to the current stage's idea pool |
| `/skip [stage]` | Skip an optional stage (Precedent Research, Fact Check, or Pushback) |
| `/deepen [candidate_id]` | Run additional Fact Check agents on a single candidate |
| `/kill [candidate_id]` | Remove a candidate from the active list |
| `/redirect [instruction]` | Send a free-text instruction to the orchestrator (acts as highest-priority prompt) |
| `/restart` | Restart from Divergent Thinking with a modified problem framing |
| `/export` | Export the final presentation as markdown |

### Approval Gates (Default)

Two stages have mandatory human approval gates in the default process template:
1. **After Framing** (optional, on by default): human sees the framing before generative work begins
2. **After Prioritization** (required): human approves the top 3 before synthesis

Human approval is implemented via the `EscalateToHuman` MCP tool, which pauses the agent session and posts a notification to the player. The player responds via the prompt bar. The process resumes only after approval.

### Autonomous Mode

For demo purposes, all human gates can be disabled by setting `human_gates: false` in the process configuration. The process runs end-to-end with no pauses.

---

*This document is the complete design specification for tasks 12–20 and 22. The companion file `brainstorm-process.json` encodes this as a runnable process template (task 21).*
