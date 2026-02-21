# Brainstorm Process

The brainstorm skill is a 9-stage divergent-then-convergent ideation process using 17 specialized agent personas. Managed by `ProcessController` on the server, driven by `brainstorm-process.json`.

**Additional process templates** are available beyond the standard brainstorm: **SIX_THINKING_HATS** (Edward de Bono's parallel thinking: 6-hat round + blue hat synthesis), **SCAMPER** (structured ideation: 7 SCAMPER lenses in parallel + synthesis), and **RAPID_FIRE** (fast 3-stage: spark + pick + go). Select via `processId` on `player:start-process`.

## Stage Flow Overview

```mermaid
graph TD
    S0["Stage 0: Problem Framing<br/>Cartographer + Questioner<br/><i>Map the problem space</i>"]
    S1["Stage 1: Divergent Thinking<br/>4 Ideators (ISOLATED)<br/><i>Generate 20-40 raw ideas</i>"]
    S2["Stage 2: Precedent Research<br/>Historian + Analogist<br/><i>Find real-world examples</i>"]
    S3["Stage 3: Convergent Thinking<br/>Synthesizer → Connector<br/><i>Cluster into 5-8 candidates</i>"]
    S4["Stage 4: Fact Checking<br/>Skeptic + Feasibility Analyst<br/><i>Verify claims and viability</i>"]
    S5["Stage 5: Pushback / Red Team<br/>Devil's Advocate + Pragmatist<br/><i>Attack weaknesses</i>"]
    S6["Stage 6: Prioritization<br/>Strategist<br/><i>Score and rank candidates</i>"]
    S7["Stage 7: Review<br/>Architect<br/><i>Build coherent proposal</i>"]
    S8["Stage 8: Presentation<br/>Narrator<br/><i>Format final deliverable</i>"]

    S0 --> S1
    S0 --> S2
    S1 --> S3
    S2 --> S3
    S3 --> S4
    S3 --> S5
    S4 --> S6
    S5 --> S6
    S6 -->|"HUMAN APPROVAL GATE"| S7
    S7 --> S8

    style S0 fill:#4a9eff,color:#fff
    style S1 fill:#ff6b6b,color:#fff
    style S2 fill:#ff6b6b,color:#fff
    style S3 fill:#ffa94d,color:#fff
    style S4 fill:#845ef7,color:#fff
    style S5 fill:#845ef7,color:#fff
    style S6 fill:#20c997,color:#fff
    style S7 fill:#339af0,color:#fff
    style S8 fill:#339af0,color:#fff
```

**Color key:** Blue = framing/synthesis, Red = divergent, Orange = convergent, Purple = challenge, Green = evaluation

---

## Parallel and Sequential Stages

```mermaid
gantt
    title Brainstorm Timeline (Full Mode)
    dateFormat X
    axisFormat %s

    section Framing
    Problem Framing          :s0, 0, 60

    section Divergent
    Divergent Thinking       :s1, 60, 300
    Precedent Research       :s2, 60, 240

    section Convergent
    Convergent Thinking      :s3, 300, 120

    section Challenge
    Fact Checking            :s4, 420, 120
    Pushback / Red Team      :s5, 420, 120

    section Evaluate
    Prioritization           :s6, 540, 60
    Human Approval Gate      :milestone, m1, 600, 0

    section Deliver
    Review / Synthesis       :s7, 600, 60
    Presentation             :s8, 660, 60
```

Stages 1+2 run in parallel (divergent + research). Stages 4+5 run in parallel (fact check + pushback). All other stages are sequential.

---

## Stage Details

### Stage 0: Problem Framing

```mermaid
sequenceDiagram
    participant PC as ProcessController
    participant Cart as The Cartographer
    participant Quest as The Questioner
    participant FB as FindingsBoard

    PC->>Cart: Spawn with problem statement
    PC->>Quest: Spawn with problem statement

    Note over Cart: Maps boundaries, scope, constraints
    Cart->>FB: PostFindings(scope_in, scope_out, constraints)

    Note over Quest: Challenges assumptions, asks why
    Quest->>FB: PostFindings(key_questions, reframing)

    Note over Cart,Quest: Sequential turn structure:<br/>Cartographer first, then Questioner

    Cart->>PC: CompleteStage(framing_document)
    PC->>PC: Stage complete → advance to Divergent + Research
```

**Output schema:**
- Scope in/out boundaries
- Constraints and assumptions
- Success criteria
- Key questions to explore
- Optional problem reframing

### Stage 1: Divergent Thinking

```mermaid
sequenceDiagram
    participant PC as ProcessController
    participant WI as Wild Ideator
    participant CP as Cross-Pollinator
    participant FP as First-Principles
    participant CO as Contrarian
    participant FB as FindingsBoard

    PC->>WI: Spawn (ISOLATED, cannot see peers)
    PC->>CP: Spawn (ISOLATED)
    PC->>FP: Spawn (ISOLATED)
    PC->>CO: Spawn (ISOLATED)

    par All agents work simultaneously
        WI->>FB: PostFindings(idea 1)
        WI->>FB: PostFindings(idea 2)
        WI->>FB: PostFindings(...)
        Note over WI: Quantity over quality<br/>Ignores feasibility
    and
        CP->>FB: PostFindings(idea from other domain)
        CP->>FB: PostFindings(...)
        Note over CP: Borrows from unrelated fields
    and
        FP->>FB: PostFindings(first-principles idea)
        FP->>FB: PostFindings(...)
        Note over FP: Breaks down to fundamentals
    and
        CO->>FB: PostFindings(contrarian idea)
        CO->>FB: PostFindings(...)
        Note over CO: Inverts the obvious approach
    end

    Note over PC: Exit criteria: 20+ ideas OR 5 min
    PC->>PC: Stage complete
    Note over FB: All ideas now visible<br/>to subsequent stages
```

**Groupthink prevention:** Each ideator's system prompt contains ONLY the framing document and their own history. They cannot see each other's PostFindings outputs. Ideas are released to the board simultaneously when the stage ends.

### Stage 3: Convergent Thinking

```mermaid
sequenceDiagram
    participant PC as ProcessController
    participant Synth as The Synthesizer
    participant Conn as The Connector
    participant FB as FindingsBoard

    Note over Synth,Conn: Receive ALL divergent ideas + precedents

    PC->>Synth: Spawn first (sequential)
    Synth->>Synth: Cluster 40 ideas into themes
    Synth->>Synth: Eliminate redundancy
    Synth->>FB: PostFindings(5-8 candidate clusters)
    Synth->>PC: CompleteStage(candidates)

    PC->>Conn: Follow-up turn
    Conn->>Conn: Find powerful combinations across clusters
    Conn->>FB: PostFindings(merged candidates)
    Conn->>PC: CompleteStage(final candidates)

    Note over PC: Human gate (optional):<br/>Approve candidates, /kill weak ones, /inject new ideas
```

### Stages 4+5: Fact Checking + Pushback (Parallel)

```mermaid
graph TD
    subgraph FC ["Stage 4: Fact Checking"]
        Skeptic["The Skeptic<br/>Flags assumptions"]
        Feasibility["Feasibility Analyst<br/>Technical/economic/regulatory"]

        Skeptic -->|"Per candidate"| Ratings1["VERIFIED / PLAUSIBLE /<br/>QUESTIONABLE / FALSE"]
        Feasibility -->|"Per candidate"| Ratings2["CLEAR / CONCERN / BLOCKER"]

        Ratings1 --> Verdict1["PASS / FLAG / FATAL"]
        Ratings2 --> Verdict1
    end

    subgraph PB ["Stage 5: Pushback"]
        Devil["Devil's Advocate<br/>Strongest counterargument"]
        Pragmatist["The Pragmatist<br/>Execution risk"]

        Devil -->|"Per candidate"| Vote1["STRONG / WEAKENED / KILLED"]
        Pragmatist -->|"Per candidate"| Vote2["STRONG / WEAKENED / KILLED"]

        Note1["Both must vote KILLED<br/>to eliminate a candidate"]
    end

    FC -->|"ratings"| S6["Stage 6: Prioritization"]
    PB -->|"verdicts"| S6
```

### Conditional Branches

```mermaid
graph TD
    FC_Check{"After Fact Checking:<br/>Any FATAL flags?"}
    FC_Check -->|"Yes, removes candidates"| FC_Count{"Remaining<br/>candidates < 3?"}
    FC_Check -->|"No"| Continue1["Continue to Prioritization"]
    FC_Count -->|"Yes"| BackConv["Loop back to<br/>Convergent Thinking"]
    FC_Count -->|"No"| Continue1

    PB_Check{"After Pushback:<br/>All candidates KILLED?"}
    PB_Check -->|"Yes"| BackDiv["Loop back to<br/>Divergent Thinking"]
    PB_Check -->|"No"| Continue2["Continue to Prioritization"]

    style BackConv fill:#ffa94d,color:#fff
    style BackDiv fill:#ff6b6b,color:#fff
```

### Stage 6: Prioritization

```mermaid
graph TD
    subgraph Scoring ["Scoring Rubric"]
        Impact["Impact (30%)"]
        Feasibility2["Feasibility (25%)"]
        Novelty["Novelty (20%)"]
        Speed["Speed to Results (15%)"]
        Risk["Risk Inverse (10%)"]
    end

    Scoring --> Strategist["The Strategist<br/>Scores each candidate 1-10<br/>on each dimension"]
    Strategist --> Ranked["Ranked list with<br/>weighted scores"]
    Ranked --> Gate{"HUMAN APPROVAL GATE<br/>(required)"}
    Gate -->|"/approve"| Review["Stage 7: Review"]
    Gate -->|"/kill [id]"| Remove["Remove candidate,<br/>re-rank"]
    Gate -->|"/deepen [id]"| Deepen["Additional fact-check<br/>on specific candidate"]
    Gate -->|"/redirect"| Redirect["Restart with<br/>modified instructions"]
```

---

## ProcessController Turn Management

The ProcessController tracks turns per-agent and per-stage, driving sequential and parallel agents differently.

```mermaid
sequenceDiagram
    participant ASM as AgentSessionManager
    participant BS as BridgeServer
    participant PC as ProcessController

    Note over PC: Stage with parallel agents (e.g. Divergent)

    ASM-->>BS: agent:idle (Agent A finished turn)
    BS->>PC: onAgentTurnComplete(agentA_id)
    PC->>PC: Increment agentA turn count
    PC->>PC: Increment aggregate turn count

    alt Agent still has turns remaining
        PC->>ASM: sendFollowUp(agentA, "Continue. You have N turns remaining.")
    else Agent reached turn limit
        PC->>PC: Mark agent as complete for this stage
    end

    PC->>PC: isStageComplete()?
    alt All agents complete OR idea count met OR time expired
        PC->>PC: advanceStage()
        PC->>BS: dismissStageAgents(currentStage)
        PC->>BS: spawnStageAgents(nextStage)
    else Stage continues
        Note over PC: Wait for more agents to idle
    end
```

```mermaid
sequenceDiagram
    participant ASM as AgentSessionManager
    participant BS as BridgeServer
    participant PC as ProcessController

    Note over PC: Stage with sequential agents (e.g. Convergent)

    ASM-->>BS: agent:idle (Agent A finished turn)
    BS->>PC: onAgentTurnComplete(agentA_id)
    PC->>PC: Increment agentA turn count

    alt Agent A has more turns
        PC->>ASM: sendFollowUp(agentA, "Continue your analysis.")
    else Agent A done, Agent B hasn't gone yet
        PC->>ASM: sendFollowUp(agentB, "Your turn. Build on Agent A's work.")
        Note over PC: driveNextSequentialAgent()
    else All agents complete
        PC->>PC: advanceStage()
    end
```

---

## Human Intervention Commands

```mermaid
graph TD
    subgraph Commands ["Available Commands"]
        C1["/approve<br/>Trigger stage transition"]
        C2["/inject [idea]<br/>Add idea to pool"]
        C3["/skip [stage]<br/>Skip optional stage"]
        C4["/kill [candidate_id]<br/>Remove candidate"]
        C5["/deepen [candidate_id]<br/>Extra fact-check"]
        C6["/redirect [instruction]<br/>Change direction"]
        C7["/restart<br/>Back to divergent"]
        C8["/export<br/>Export final markdown"]
    end

    subgraph When ["When Available"]
        W1["At any human gate"]
        W2["During any stage"]
        W3["Before optional stages"]
        W4["After convergent or prioritization"]
        W5["After prioritization"]
        W6["During any stage"]
        W7["After presentation"]
        W8["After presentation"]
    end

    C1 --- W1
    C2 --- W2
    C3 --- W3
    C4 --- W4
    C5 --- W5
    C6 --- W6
    C7 --- W7
    C8 --- W8
```

---

## Fast Demo Mode

Skips 3 stages, reduces agents, and tightens time limits for a ~2.5 minute run.

```mermaid
graph TD
    subgraph Full ["Full Mode (9 stages, ~8-10 min)"]
        F0["Framing"] --> F1["Divergent (4 agents)"]
        F0 --> F2["Precedent Research"]
        F1 --> F3["Convergent"]
        F2 --> F3
        F3 --> F4["Fact Checking"]
        F3 --> F5["Pushback"]
        F4 --> F6["Prioritization"]
        F5 --> F6
        F6 --> F7["Review"]
        F7 --> F8["Presentation"]
    end

    subgraph Fast ["Fast Demo (6 stages, ~2.5 min)"]
        D0["Framing"] --> D1["Divergent (2 agents, 5 ideas each)"]
        D1 --> D3["Convergent"]
        D3 --> D6["Prioritization"]
        D6 --> D7["Review"]
        D7 --> D8["Presentation"]
    end

    style F2 fill:#999,color:#fff
    style F4 fill:#999,color:#fff
    style F5 fill:#999,color:#fff
```

Gray = skipped in fast demo mode.

---

## 17 Agent Personas

| # | Stage | Persona | Thinking Style | Optimizes For |
|---|-------|---------|---------------|---------------|
| 1 | Framing | The Cartographer | Boundary-mapping | Clarity of scope |
| 2 | Framing | The Questioner | Socratic questioning | Assumption-busting |
| 3 | Divergent | Wild Ideator | Associative leaps | Quantity of ideas |
| 4 | Divergent | Cross-Pollinator | Cross-domain transfer | Unexpected connections |
| 5 | Divergent | First-Principles Thinker | Deductive reasoning | Fundamental truths |
| 6 | Divergent | Contrarian | Inversion | Overlooked possibilities |
| 7 | Research | The Historian | Evidence-based | Real-world precedent |
| 8 | Research | The Analogist | Structural analogy | Pattern recognition |
| 9 | Convergent | The Synthesizer | Clustering, pattern-matching | Thematic coherence |
| 10 | Convergent | The Connector | Combinatorial thinking | Powerful mergers |
| 11 | Fact Check | The Skeptic | Adversarial questioning | Assumption exposure |
| 12 | Fact Check | Feasibility Analyst | Multi-dimensional analysis | Viability assessment |
| 13 | Pushback | Devil's Advocate | Strongest counterargument | Weakness discovery |
| 14 | Pushback | The Pragmatist | Execution-focused | Implementation risk |
| 15 | Prioritization | The Strategist | Multi-criteria scoring | Optimal ranking |
| 16 | Review | The Architect | Systems thinking | Coherent integration |
| 17 | Presentation | The Narrator | Audience-aware framing | Clarity and persuasion |
