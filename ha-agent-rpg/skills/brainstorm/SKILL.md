# Brainstorm Skill

**Version:** 1.0
**Use case:** Rapid divergent-then-convergent ideation on any topic
**Demo target:** Complete full cycle in ~3 minutes

---

## What this skill does

Takes a topic, splits it into 4 parallel provocations, runs independent ideation in separate rooms, synthesizes results into categories, evaluates down to 3 finalists, votes on 1 winner, and produces a detailed articulation of the winning idea.

---

## How to invoke

Spawn the orchestrator agent with `SummonAgent` or via the player command:

```
/summon Brainstorm Conductor  role="Brainstorm Orchestrator"  realm="/brainstorm"  mission=<ORCHESTRATOR_MISSION below, with TOPIC filled in>
```

Replace `{{TOPIC}}` with the actual brainstorm topic before passing the mission.

---

## ORCHESTRATOR MISSION (copy-paste template)

```
You are the Brainstorm Conductor. Your job is to run a fast, structured brainstorm on this topic:

TOPIC: {{TOPIC}}

You will execute the following 5 phases in sequence. Move quickly — the entire session should complete in under 3 minutes. Be decisive and keep responses short.

---

PHASE 1 — SPLIT (do this yourself, ~15 seconds)

Generate exactly 4 provocations: distinct but overlapping lenses on the topic. A provocation is a reframing that unlocks a different angle (e.g. "What if we removed the constraint of X?", "What would this look like from the perspective of Y?", "What if this was 10x harder / easier?").

PostFindings with: "PROVOCATIONS: 1) [P1] 2) [P2] 3) [P3] 4) [P4]"

---

PHASE 2 — IDEATE (spawn 4 agents in parallel, ~60 seconds)

Immediately call SummonAgent 4 times, one for each provocation:

  Agent 1: name="Provocateur Alpha", role="Ideator", realm="/brainstorm/room-1"
  Agent 2: name="Provocateur Beta",  role="Ideator", realm="/brainstorm/room-2"
  Agent 3: name="Provocateur Gamma", role="Ideator", realm="/brainstorm/room-3"
  Agent 4: name="Provocateur Delta", role="Ideator", realm="/brainstorm/room-4"

Each agent's mission should be exactly this template (fill in their provocation):
  "You are in an ideation room. Your provocation is: [PROVOCATION]. Generate exactly 10 short idea titles (3-8 words each) that respond to this provocation in the context of: {{TOPIC}}. Number them 1-10. No descriptions — titles only. When done, PostFindings with: 'IDEAS from [your name]: 1) ... 2) ... 3) ... 4) ... 5) ... 6) ... 7) ... 8) ... 9) ... 10) ...'"

Then wait. Monitor the shared findings board. When all 4 agents have posted their ideas (you will see 4 IDEAS findings), proceed to Phase 3.

---

PHASE 3 — CLUSTER (do this yourself, ~30 seconds)

Read all 40 ideas from the findings board. Organize them into a maximum of 10 named clusters/categories. Each cluster should have a punchy 2-4 word name and list the idea numbers that belong to it. Collapse near-duplicates — keep the stronger version.

PostFindings with: "CLUSTERS: [Cluster Name]: ideas X, Y, Z | [Cluster Name]: ideas A, B, C | ..."

---

PHASE 4 — EVALUATE (do this yourself, ~30 seconds)

Review the clusters. Pick the 3 most promising ones using these criteria:
- NOVELTY: Is this genuinely new or a fresh spin?
- FEASIBILITY: Could this actually be built/done?
- IMPACT: Would it matter if it succeeded?

Score each finalist 1-10 on each criterion. Then vote: pick 1 winner.

PostFindings with: "FINALISTS: 1) [name] (N:X F:Y I:Z) | 2) [name] (N:X F:Y I:Z) | 3) [name] (N:X F:Y I:Z) | WINNER: [name]"

---

PHASE 5 — ARTICULATE (do this yourself, ~30 seconds)

Write a compelling, concrete description of the winning idea. Include:
- The core concept (1 sentence)
- Why it's interesting (2 sentences)
- How it could work (3-5 bullet points)
- The single biggest risk (1 sentence)

PostFindings with the full articulation.

Then announce to the team: "Brainstorm complete. The winning idea is: [name]"

---

IMPORTANT RULES:
- Never ask for permission to proceed — just move to the next phase.
- PostFindings after every phase so the team and player can follow along.
- If an ideation agent hasn't posted within 60 seconds, proceed with whatever ideas are available.
- Keep all output SHORT. Long responses kill demo momentum.
```

---

## Subagent missions (reference)

The orchestrator generates these dynamically, but here's the template for clarity:

```
You are in an ideation room. Your provocation is: [PROVOCATION].
Generate exactly 10 short idea titles (3-8 words each) that respond to this provocation
in the context of: [TOPIC].
Number them 1-10. No descriptions — titles only.
When done, PostFindings with: "IDEAS from [your name]: 1) ... 2) ... (etc)"
```

Subagent config:
- `permissionLevel`: `read-only` (no tools needed, just PostFindings)
- `realm`: `/brainstorm/room-1` through `/brainstorm/room-4`
- They should complete in ~30-45 seconds each

---

## Phase flow diagram

```
Player types topic
       │
       ▼
Orchestrator spawns (realm: /brainstorm)
       │
  PHASE 1: Split
  4 provocations generated
       │
  PHASE 2: Ideate (parallel)
  ┌────┬────┬────┬────┐
Room1 Room2 Room3 Room4   ← 4 agents, 10 ideas each
  └────┴────┴────┴────┘
       │ 40 ideas total
  PHASE 3: Cluster
  ≤10 named categories
       │
  PHASE 4: Evaluate
  3 finalists → 1 winner
       │
  PHASE 5: Articulate
  Full writeup of winning idea
       │
  PostFindings: DONE
```

---

## Visual behavior in the game

When wired up to the Phaser client, the expected visual sequence is:

1. Orchestrator spawns in `/brainstorm` room — speaks provocation generation
2. 4 agents appear in 4 separate rooms — each shows a speech bubble with ideas appearing
3. Orchestrator moves between rooms or stays central — clustering dialogue visible
4. Evaluation phase — orchestrator shows thought bubbles with scores
5. Winner announced — emote or visual celebration

The `realm` field on each agent determines which room they appear in. The game already supports agents in different realms simultaneously.

---

## Timing budget

| Phase | Who | Target time |
|-------|-----|-------------|
| Split | Orchestrator | 10-15s |
| Ideate (spawn) | Orchestrator | 5s |
| Ideate (agents running) | 4x Provocateurs | 30-45s |
| Cluster | Orchestrator | 20-30s |
| Evaluate | Orchestrator | 15-20s |
| Articulate | Orchestrator | 20-30s |
| **Total** | | **~2.5-3 min** |

---

## Tuning for speed

If the demo is running slow:
- Reduce ideas from 10 → 5 per agent
- Skip clustering (go straight from 40 ideas to top 3)
- Have orchestrator evaluate based on idea titles alone (no criteria scoring)

If you want more depth:
- Add a `Critic` agent in Phase 4 that challenges each finalist
- Add a `Devil's Advocate` room that generates counterarguments in Phase 2
- Ask the evaluator to RequestHelp from the original provocateurs during evaluation

---

## Example provocations for common topics

**"Future of work"**
1. What if every job had a 2-hour work week?
2. What if AI was your coworker, not your tool?
3. What if compensation was based on impact, not hours?
4. What if offices existed only for play?

**"Healthcare"**
1. What if patients owned all their data and sold access?
2. What if prevention was the only reimbursable service?
3. What if a hospital had to pay you when it failed to heal you?
4. What if healthcare was a subscription, not a transaction?

---

## Files

```
skills/
└── brainstorm/
    └── SKILL.md     ← this file (the full playbook)
```

No code changes required to run this skill. It works entirely through the orchestrator's mission and the existing `SummonAgent` / `PostFindings` MCP tools.
