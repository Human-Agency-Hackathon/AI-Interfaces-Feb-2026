# Agent Communication

How agents talk to each other, share knowledge, and coordinate work.

## Key Principle: Agents Never Talk Directly

Agents have **no direct channel** to each other. All communication goes through the Bridge Server and shared data structures. There are four communication mechanisms:

```mermaid
graph TD
    subgraph Mechanisms ["Communication Mechanisms"]
        M1["1. Findings Board<br/>(shared discovery board)"]
        M2["2. System Prompt Injection<br/>(knowledge at spawn time)"]
        M3["3. Player-Routed Commands<br/>(human relays message)"]
        M4["4. RequestHelp Tool<br/>(async help request)"]
    end

    subgraph Flow ["Data Flow"]
        A1["Agent A"] -->|"PostFindings tool"| FB["FindingsBoard<br/>(Redis)"]
        FB -->|"Injected into prompt"| A2["Agent B"]

        A1 -->|"UpdateKnowledge tool"| KV["KnowledgeVault<br/>(JSON)"]
        KV -->|"Loaded at spawn"| A2

        Player -->|"player:command<br/>@agent_b message"| BS["BridgeServer"]
        BS -->|"sendFollowUp()"| A2

        A1 -->|"RequestHelp tool"| BS2["BridgeServer"]
        BS2 -->|"sendFollowUp()"| A2
    end
```

---

## 1. Findings Board (Primary Communication Channel)

The Findings Board is the main way agents share discoveries. It's a Redis-backed append-only list that all agents can read and write.

```mermaid
sequenceDiagram
    participant A1 as Agent A<br/>(e.g. Divergent Thinker)
    participant SDK1 as SDK Session A
    participant MCP as RpgMcpServer
    participant CTH as CustomToolHandler
    participant FB as FindingsBoard<br/>(Redis)
    participant BS as BridgeServer
    participant Clients as All Clients
    participant SPB as SystemPromptBuilder
    participant A2 as Agent B<br/>(e.g. Convergent Thinker)

    Note over A1,A2: Agent A discovers something worth sharing
    A1->>SDK1: Call PostFindings(finding, severity)
    SDK1->>MCP: Execute PostFindings tool
    MCP->>CTH: handleToolCall("PostFindings", input, agentA_id)
    CTH->>FB: addFinding({ agent_id, finding, severity })
    FB->>FB: Redis RPUSH or JSON append
    FB-->>CTH: Finding with ID + timestamp
    CTH-->>CTH: Emit "findings:posted" event

    BS->>Clients: findings:posted broadcast
    Note over Clients: DialogueLog shows finding,<br/>agents see it on shared board

    Note over A2,SPB: Later, when Agent B spawns or gets context...
    SPB->>FB: getRecent(15)
    FB-->>SPB: Last 15 findings
    SPB->>SPB: Inject findings into system prompt
    SPB-->>A2: "Shared findings board:<br/>1. [Agent A] discovered X<br/>2. [Agent A] found Y"
```

### What Gets Posted as Findings

| Agent Context | Finding Type | Example |
|--------------|-------------|---------|
| Codebase exploration | File analysis result | "The auth module uses JWT with 24h expiry" |
| Codebase exploration | Bug discovery | "Race condition in WebSocket reconnect logic" |
| Brainstorm divergent | Raw idea | "What if we used federated learning for privacy?" |
| Brainstorm convergent | Synthesized cluster | "Cluster 1: Privacy-preserving approaches (3 ideas)" |
| Brainstorm fact check | Verification result | "VERIFIED: Federated learning is production-ready (Google, Apple)" |

---

## 2. System Prompt Injection (Context at Spawn)

When an agent spawns, its system prompt includes knowledge from the entire team. This is how agents "know" what others have done.

```mermaid
sequenceDiagram
    participant ASM as AgentSessionManager
    participant KV_A as KnowledgeVault<br/>(Agent A)
    participant KV_B as KnowledgeVault<br/>(Agent B, spawning)
    participant FB as FindingsBoard
    participant SPB as SystemPromptBuilder
    participant SDK as Claude Agent SDK

    Note over ASM: Spawning Agent B
    ASM->>KV_B: load() from disk
    KV_B-->>ASM: Previous expertise, insights, files analyzed

    ASM->>ASM: getTeamRoster(excludeAgentB)
    Note over ASM: Builds list of active agents with their<br/>names, roles, expertise summaries

    ASM->>FB: getRecent(15)
    FB-->>ASM: Last 15 findings from all agents

    ASM->>SPB: buildSystemPrompt({<br/>  knowledge: agentB_vault,<br/>  team: [agentA_info, ...],<br/>  findings: recent_findings<br/>})

    Note over SPB: Prompt includes:<br/>- "Your knowledge: [vault contents]"<br/>- "Your teammates: Agent A (Oracle, expertise in X)"<br/>- "Shared findings: [last 15 discoveries]"

    SPB-->>ASM: Complete system prompt
    ASM->>SDK: query(prompt, systemPrompt)
    Note over SDK: Agent B starts with full awareness<br/>of team state and prior work
```

### What's Injected (Codebase Mode)

```
## Your Knowledge
- Expertise: TypeScript (85), Testing (72), WebSocket (60)
- Insights: "The server uses an event-driven architecture..."
- Files analyzed: 23 files in server/src/

## Your Team
- Oracle (Lead): Expertise in architecture, codebase overview
- Test Guardian: Expertise in testing, vitest, coverage

## Shared Findings Board (last 15)
1. [Oracle] High: Main entry point is server/src/index.ts
2. [Oracle] Medium: Uses ws library for WebSocket
3. [Test Guardian] High: 12 test files, 89% coverage
```

### What's Injected (Brainstorm Mode)

```
## Problem
How might we reduce onboarding time for new engineers?

## Process: Multi-Agent Brainstorm (Stage 3 of 9: Convergent Thinking)
Stage goal: Synthesize the divergent ideas into 5-8 candidates

## Your Persona: The Synthesizer
You find hidden structure in chaos...

## Prior Stage Artifacts
### Stage 0: Problem Framing
[Framing document from Cartographer + Questioner]

### Stage 1: Divergent Thinking
[40 raw ideas from 4 ideators]

## Co-Participants
- The Connector (finding combinations between ideas)

## Ideas So Far (last 15)
[Recent PostFindings from this and prior stages]
```

---

## 3. Player-Routed Commands

The human player can relay messages between agents by typing commands.

```mermaid
sequenceDiagram
    participant Player
    participant PB as PromptBar
    participant BS as BridgeServer
    participant ASM as AgentSessionManager
    participant Agent as Target Agent

    Player->>PB: Types "@oracle check the auth module"
    PB->>BS: spectator:command { text: "@oracle check the auth module" }

    BS->>BS: Parse target agent from @mention
    BS->>BS: Find focused agent or auto-detect target

    alt Agent is idle
        BS->>ASM: sendFollowUp(agentId, "Player says: check the auth module")
        ASM->>Agent: Resume SDK session with new prompt
    else Agent is running
        BS->>ASM: sendFollowUp(agentId, message)
        ASM->>ASM: Queue prompt (delivered when idle)
        Note over ASM: Pending prompt queue,<br/>drained automatically when session idles
    end
```

### Focus System

The PromptBar has a "focus" feature that routes all commands to a specific agent:

```mermaid
graph TD
    PB["PromptBar"]

    PB -->|"/focus oracle"| F1["All commands go to Oracle"]
    PB -->|"/focus test_guardian"| F2["All commands go to Test Guardian"]
    PB -->|"/focus" (no arg)| F3["Auto-detect: routes to<br/>most recently active agent"]

    F1 --> Send["spectator:command<br/>{ text, target_agent }"]
    F2 --> Send
    F3 --> Send
```

---

## 4. RequestHelp Tool (Agent-to-Agent)

An agent can explicitly ask another agent for help using the RequestHelp MCP tool.

```mermaid
sequenceDiagram
    participant A1 as Agent A
    participant SDK as Claude Agent SDK
    participant MCP as RpgMcpServer
    participant CTH as CustomToolHandler
    participant BS as BridgeServer
    participant ASM as AgentSessionManager
    participant A2 as Agent B (target)

    A1->>SDK: Call RequestHelp(target_agent: "oracle", question: "What's the auth pattern?")
    SDK->>MCP: Execute RequestHelp tool
    MCP->>CTH: handleToolCall("RequestHelp", input, agentA_id)
    CTH-->>CTH: Emit "help:request" event

    BS->>BS: Listener fires
    BS->>ASM: sendFollowUp("oracle", "Agent A asks: What's the auth pattern?")

    alt Oracle is idle
        ASM->>A2: Resume with help request prompt
        A2->>A2: Responds by posting findings or speaking
    else Oracle is running
        ASM->>ASM: Queue prompt
        Note over ASM: Delivered when Oracle's current turn ends
    end

    Note over CTH,A1: Tool returns immediately
    CTH-->>MCP: { success: true, message: "Help request sent" }
    MCP-->>SDK: Tool result
    SDK-->>A1: Continues working (doesn't block)
```

---

## Communication During Brainstorming

### Groupthink Prevention (Divergent Stage)

During divergent thinking, agents are **isolated** from each other's findings. This is the most important communication rule in the brainstorm process.

```mermaid
graph TD
    subgraph Isolated ["Stage 1: Divergent Thinking (ISOLATED)"]
        I1["Wild Ideator"]
        I2["Cross-Pollinator"]
        I3["First-Principles Thinker"]
        I4["Contrarian"]

        FB_Hidden["Findings Board<br/>(writes allowed,<br/>reads BLOCKED<br/>between peers)"]
    end

    subgraph Shared ["What Each Ideator CAN See"]
        S1["Problem framing doc<br/>(from Stage 0)"]
        S2["Their own session history"]
        S3["Their own prior findings"]
    end

    subgraph Blocked ["What Each Ideator CANNOT See"]
        B1["Other ideators' findings"]
        B2["Other ideators' existence"]
        B3["Running tally of ideas"]
    end

    I1 -->|"PostFindings"| FB_Hidden
    I2 -->|"PostFindings"| FB_Hidden
    I3 -->|"PostFindings"| FB_Hidden
    I4 -->|"PostFindings"| FB_Hidden

    S1 -.->|"visible"| I1
    S1 -.->|"visible"| I2
    S1 -.->|"visible"| I3
    S1 -.->|"visible"| I4

    style FB_Hidden fill:#ff9999
    style Blocked fill:#ffcccc
```

After the divergent stage completes, all findings are released to the board simultaneously for the Convergent Thinking stage to process.

### Information Flow Across Stages

```mermaid
graph TD
    subgraph S0 ["Stage 0: Problem Framing"]
        F1["Cartographer + Questioner"]
        F1_Out["Artifacts: scope doc,<br/>key questions, constraints"]
    end

    subgraph S1 ["Stage 1: Divergent Thinking"]
        D1["4 Ideators (isolated)"]
        D1_Out["Artifacts: 20-40 raw ideas"]
    end

    subgraph S2 ["Stage 2: Precedent Research"]
        R1["Historian + Analogist"]
        R1_Out["Artifacts: 5+ precedents"]
    end

    subgraph S3 ["Stage 3: Convergent Thinking"]
        C1["Synthesizer → Connector"]
        C1_Out["Artifacts: 5-8 candidates"]
    end

    subgraph S4 ["Stage 4: Fact Checking"]
        FC1["Skeptic + Feasibility Analyst"]
        FC1_Out["Artifacts: ratings per candidate"]
    end

    subgraph S5 ["Stage 5: Pushback"]
        PB1["Devil's Advocate + Pragmatist"]
        PB1_Out["Artifacts: verdicts per candidate"]
    end

    subgraph S6 ["Stage 6: Prioritization"]
        P1["Strategist"]
        P1_Out["Artifacts: ranked list with scores"]
    end

    subgraph S7 ["Stage 7: Review"]
        RV1["Architect"]
        RV1_Out["Artifacts: proposal document"]
    end

    subgraph S8 ["Stage 8: Presentation"]
        PR1["Narrator"]
        PR1_Out["Artifacts: final deliverable (markdown)"]
    end

    F1 --> F1_Out
    F1_Out -->|"injected into prompt"| D1
    F1_Out -->|"injected into prompt"| R1
    D1 --> D1_Out
    R1 --> R1_Out
    D1_Out -->|"all ideas released"| C1
    R1_Out -->|"precedents available"| C1
    C1 --> C1_Out
    C1_Out --> FC1
    C1_Out --> PB1
    FC1 --> FC1_Out
    PB1 --> PB1_Out
    FC1_Out --> P1
    PB1_Out --> P1
    P1 --> P1_Out
    P1_Out -->|"human approval gate"| RV1
    RV1 --> RV1_Out
    RV1_Out --> PR1
    PR1 --> PR1_Out
```

---

## Communication Summary Table

| Mechanism | Timing | Visibility | Persistence | Use Case |
|-----------|--------|-----------|-------------|----------|
| **Findings Board** | Real-time | All agents (except isolated) | Redis (session lifetime) | Share discoveries, ideas, results |
| **System Prompt** | At spawn | Spawning agent only | In-memory (prompt string) | Bootstrap new agent with team context |
| **Knowledge Vault** | At spawn + save | Owner agent only | JSON on disk (permanent) | Agent remembers across sessions |
| **Player Command** | On-demand | Target agent | Not persisted | Human relays message |
| **RequestHelp** | On-demand | Target agent | Not persisted | Agent asks teammate directly |
| **Stage Artifacts** | At stage transition | Next stage agents | WorldState (session) | Pass work products forward |

---

## Event Flow: Complete Agent Interaction Cycle

This shows a full cycle where Agent A discovers something, shares it, and Agent B acts on it.

```mermaid
sequenceDiagram
    participant A as Agent A (Oracle)
    participant CTH as CustomToolHandler
    participant FB as FindingsBoard
    participant BS as BridgeServer
    participant Clients as All Clients
    participant SPB as SystemPromptBuilder
    participant B as Agent B (Test Guardian)

    Note over A: Oracle analyzes a file, finds a bug
    A->>CTH: PostFindings("Race condition in reconnect logic", severity: "high")
    CTH->>FB: addFinding(finding)
    FB-->>CTH: Finding with ID
    CTH-->>BS: "findings:posted" event
    BS->>Clients: findings:posted broadcast
    Note over Clients: DialogueLog shows:<br/>"[Oracle] Found: Race condition in reconnect logic"

    Note over A: Oracle wants Test Guardian to investigate
    A->>CTH: RequestHelp(target: "test_guardian", question: "Can you write a test for the reconnect race condition?")
    CTH-->>BS: "help:request" event
    BS->>B: sendFollowUp("Oracle asks: Can you write a test for the reconnect race condition?")

    Note over B: Test Guardian receives the request
    B->>B: Reads findings board (sees Oracle's finding)
    B->>B: Writes test for the race condition
    B->>CTH: PostFindings("Added regression test for reconnect race condition", severity: "medium")
    CTH->>FB: addFinding(finding)
    BS->>Clients: findings:posted broadcast

    B->>CTH: UpdateKnowledge(insight: "WebSocket reconnect has a 2s fixed delay vulnerability", area: "networking")
    Note over CTH: Knowledge saved to Test Guardian's vault<br/>for future sessions
```
