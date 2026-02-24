# Agent Lifecycle

How agents are spawned, run, communicate, and shut down.

## Agent Types

There are two kinds of agents in the system:

```mermaid
graph TD
    subgraph External ["External Agents (Python/JS)"]
        EA["Connect via WebSocket<br/>Send agent:register<br/>Receive turn:start<br/>Send agent:action"]
    end

    subgraph Internal ["SDK Agents (Server-Spawned)"]
        IA["Spawned by AgentSessionManager<br/>Run via Claude Agent SDK query()<br/>Use MCP tools<br/>Events translated by EventTranslator"]
    end

    BS["BridgeServer"] --> EA
    BS --> IA

    EA -->|"WebSocket messages"| BS
    IA -->|"SDK messages → EventTranslator → RPG events"| BS
```

**External agents** (Python scripts, custom clients) connect over raw WebSocket and follow the turn-based protocol manually. **SDK agents** are spawned server-side by AgentSessionManager using the Claude Agent SDK; they use MCP tools and their streaming output is translated into RPG events by EventTranslator.

---

## Agent Session States

```mermaid
stateDiagram-v2
    [*] --> starting: spawnAgent() called
    starting --> running: query() begins streaming
    running --> idle: query() completes (result message)
    idle --> running: sendFollowUp() resumes session
    idle --> stopped: dismissAgent() called
    running --> stopped: dismissAgent() called (AbortController)
    running --> stopped: agent:error (unrecoverable)
    stopped --> [*]

    note right of starting: Vault loaded, prompt built
    note right of running: SDK streaming messages, tools executing
    note right of idle: Ready for follow-up prompt
    note right of stopped: Vault saved, session cleaned up
```

---

## Oracle Agent Lifecycle (Oracle Router)

The Oracle is a special session-leader agent spawned when the player sends `player:submit`. It runs for the full session, analyzing input, selecting heroes, reviewing findings between stages, and compiling the final report.

```mermaid
graph TD
    subgraph Spawn ["Spawn"]
        PS["player:submit received<br/>(problem, repoInput, or both)"]
        OM["OracleManager.spawn()<br/>model: opus"]
        OA["Oracle agent starts<br/>(AgentSessionManager)"]
    end

    subgraph Analysis ["Analysis Phase (1-2 turns)"]
        AI["Oracle reads problem/repo input"]
        SH["Calls SelectHeroes tool<br/>activityType + hero roster"]
        OD["oracle:decision emitted<br/>→ broadcast to clients"]
        SP["ProcessController starts<br/>with selected template"]
    end

    subgraph InterStage ["Between Each Stage"]
        IS["OracleManager.feedInterStageContext()<br/>sends recent findings"]
        OI["Oracle reviews findings"]
        OC{"Adjust party?"}
        Sum["SummonReinforcement<br/>add hero"]
        Dis["DismissHero<br/>remove hero"]
        NS["Next stage begins"]
    end

    subgraph End ["Session End"]
        PR["Oracle calls PresentReport<br/>compiles final deliverable"]
        OD2["oracle:report emitted"]
        OFin["OracleManager.dismiss()<br/>Oracle session cleaned up"]
    end

    PS --> OM
    OM --> OA
    OA --> AI
    AI --> SH
    SH --> OD
    OD --> SP
    SP --> IS
    IS --> OI
    OI --> OC
    OC -->|"yes, add"| Sum
    OC -->|"yes, remove"| Dis
    OC -->|"no change"| NS
    Sum --> NS
    Dis --> NS
    NS -->|"more stages"| IS
    NS -->|"last stage done"| PR
    PR --> OD2
    OD2 --> OFin
```

---

## Spawning: The Oracle (First Agent, legacy)

When a repo is analyzed or a brainstorm process starts via `player:start-process`, the server auto-spawns the first agent.

```mermaid
sequenceDiagram
    participant Player
    participant BS as BridgeServer
    participant RA as RepoAnalyzer /<br/>LocalTreeReader
    participant MG as MapGenerator
    participant WS as WorldState
    participant ASM as AgentSessionManager
    participant KV as KnowledgeVault
    participant SPB as SystemPromptBuilder
    participant SDK as Claude Agent SDK
    participant Clients as All Clients

    Player->>BS: link:repo (URL or path)
    BS->>RA: Analyze repo tree + issues
    RA-->>BS: RepoData (tree, issues, languages)
    BS->>MG: generate() from RepoData
    MG-->>BS: Hierarchical map tree
    BS->>WS: setMapTree(), setQuests()
    BS->>BS: Initialize FindingsBoard, TranscriptLogger
    BS->>BS: Initialize AgentSessionManager

    Note over BS: Auto-spawn Oracle
    BS->>WS: addAgent("oracle", spawn position)
    BS->>MG: generateAgentMap(1 agent)
    MG-->>BS: Single-room tile map
    BS->>WS: setMap(), setObjects()
    BS->>ASM: spawnAgent(oracle config)
    ASM->>KV: load() existing vault (if any)
    ASM->>SPB: buildSystemPrompt(context)
    SPB-->>ASM: System prompt string
    ASM->>SDK: query(prompt, tools, systemPrompt)
    BS->>Clients: agent:joined
    BS->>Clients: world:state (full snapshot)
    SDK-->>ASM: Streaming messages begin
```

---

## Spawning: SummonAgent (Agent Requests New Agent)

An active agent can request a specialist by calling the SummonAgent MCP tool.

```mermaid
sequenceDiagram
    participant Agent as Active Agent<br/>(SDK Session)
    participant SDK as Claude Agent SDK
    participant MCP as RpgMcpServer
    participant CTH as CustomToolHandler
    participant BS as BridgeServer
    participant WS as WorldState
    participant MG as MapGenerator
    participant ASM as AgentSessionManager
    participant KV as KnowledgeVault
    participant SPB as SystemPromptBuilder
    participant Clients as All Clients

    Agent->>SDK: Call SummonAgent tool
    SDK->>MCP: Execute SummonAgent(name, role, realm, mission)
    MCP->>CTH: handleToolCall("SummonAgent", input, agentId)
    CTH-->>CTH: Emit "summon:request" event

    Note over BS: BridgeServer listener fires
    BS->>BS: Validate: under max_agents? no duplicate name?
    BS->>WS: addAgent(newAgentId, spawn position)
    BS->>MG: generateAgentMap(agentCount)
    Note over MG: Rebuild map: each agent gets own room
    MG-->>BS: Multi-room tile map with corridors
    BS->>WS: setMap(), setObjects()
    BS->>ASM: spawnAgent(new agent config)
    ASM->>KV: load() vault (returning agents keep knowledge)
    ASM->>SPB: buildSystemPrompt(context)
    ASM->>SDK: query(prompt, tools, systemPrompt)
    BS->>Clients: agent:joined (new agent info)
    BS->>Clients: world:state (updated snapshot)
    BS->>Clients: spawn:request (UI notification)

    Note over CTH,Agent: Tool result returned to requesting agent
    CTH-->>MCP: { success: true, agent_id: "..." }
    MCP-->>SDK: Tool result
    SDK-->>Agent: Continue with confirmation
```

---

## Spawning: Process Stage Agents (Brainstorm)

When a brainstorm stage starts, all agents for that stage are spawned at once.

```mermaid
sequenceDiagram
    participant PC as ProcessController
    participant BS as BridgeServer<br/>(via delegates)
    participant MG as MapGenerator
    participant WS as WorldState
    participant ASM as AgentSessionManager
    participant SPB as SystemPromptBuilder
    participant Clients as All Clients

    PC->>BS: spawnStageAgents(template, stageIndex, problem)

    Note over BS: For each agent role in stage definition
    loop Each agent persona in stage
        BS->>WS: addAgent(agentId, spawn position)
        BS->>ASM: spawnAgent(config with processContext)
        ASM->>SPB: buildSystemPrompt(processContext)
        Note over SPB: Includes: problem statement,<br/>stage goal, persona addendum,<br/>prior stage artifacts,<br/>co-participant roster
        SPB-->>ASM: Process-aware system prompt
    end

    BS->>MG: generateProcessStageMap(agents)
    MG-->>BS: Stage-specific tile map
    BS->>WS: setMap(), setObjects()
    BS->>Clients: world:state (new map + agents)
    BS->>Clients: stage:advanced (stage info)
    PC->>PC: Emit "stage:started"
```

---

## Agent Shutdown: Dismissal

Agents can be dismissed by the player, by stage transitions, or programmatically.

```mermaid
sequenceDiagram
    participant Trigger as Trigger<br/>(Player / ProcessController / BridgeServer)
    participant BS as BridgeServer
    participant ASM as AgentSessionManager
    participant SDK as Claude Agent SDK
    participant KV as KnowledgeVault
    participant WS as WorldState
    participant Clients as All Clients

    Trigger->>BS: dismissAgent(agentId) or<br/>player:command "/dismiss agent_name"

    BS->>ASM: dismissAgent(agentId)
    ASM->>SDK: AbortController.abort()
    Note over SDK: Running query() is cancelled
    ASM->>KV: save() vault to disk
    Note over KV: Expertise, insights, files analyzed<br/>all persisted for future sessions
    ASM->>ASM: Remove from activeSessions map
    ASM-->>BS: Emit "agent:dismissed"

    BS->>WS: removeAgent(agentId)
    BS->>MG: generateAgentMap(remaining agents)
    Note over MG: Rebuild map without dismissed agent's room
    BS->>WS: setMap(), setObjects()
    BS->>Clients: agent:left { agent_id }
    BS->>Clients: world:state (updated snapshot)
```

---

## Agent Shutdown: Stage Transition (Brainstorm)

When a brainstorm stage completes, all its agents are dismissed before the next stage spawns.

```mermaid
sequenceDiagram
    participant PC as ProcessController
    participant BS as BridgeServer<br/>(via delegates)
    participant ASM as AgentSessionManager
    participant KV as KnowledgeVault
    participant WS as WorldState
    participant Clients as All Clients

    PC->>PC: isStageComplete() returns true
    PC->>PC: advanceStage()

    Note over PC,BS: Phase 1: Dismiss current stage agents
    PC->>BS: dismissStageAgents(currentStage)
    loop Each agent in current stage
        BS->>ASM: dismissAgent(agentId)
        ASM->>KV: save() vault
        ASM->>ASM: Abort session, cleanup
        BS->>WS: removeAgent(agentId)
        BS->>Clients: agent:left
    end

    Note over PC,BS: Phase 2: Record artifacts
    PC->>BS: onStageAdvanced(completedStageId, artifacts)
    BS->>WS: advanceStage(stageId, artifacts)
    BS->>Clients: stage:completed

    Note over PC,BS: Phase 3: Spawn next stage
    PC->>BS: spawnStageAgents(template, nextStageIndex, problem)
    Note over BS: See "Spawning: Process Stage Agents" diagram
    BS->>Clients: stage:advanced
```

---

## Agent Shutdown: Error / Timeout

```mermaid
stateDiagram-v2
    running --> error_recovery: SDK throws error
    running --> timeout: No response within turn timeout

    error_recovery --> stopped: Unrecoverable error
    error_recovery --> idle: Recoverable (logged, continue)

    timeout --> auto_wait: BridgeServer applies wait action
    auto_wait --> next_turn: Turn advances to next agent

    note right of error_recovery: Error logged to TranscriptLogger<br/>agent:error event emitted
    note right of auto_wait: 5s timeout per turn<br/>(configurable)
```

---

## Full Agent Lifecycle Summary

```mermaid
graph TD
    subgraph Spawn ["Spawn Triggers"]
        S1["Auto-spawn Oracle<br/>(repo analysis, legacy)"]
        S0["OracleManager.spawn()<br/>(player:submit → Oracle Router)"]
        S2["SummonAgent MCP tool<br/>(agent requests agent)"]
        S2b["SummonReinforcement MCP tool<br/>(Oracle adds hero between stages)"]
        S3["Process stage start<br/>(brainstorm / code_review)"]
        S4["Player command<br/>(/summon)"]
    end

    subgraph Life ["Active Life"]
        L1["SDK query() running"]
        L2["Receive follow-up prompts"]
        L3["Use MCP tools"]
        L4["Post findings"]
        L5["Update knowledge"]
    end

    subgraph Death ["Shutdown Triggers"]
        D1["Player /dismiss command"]
        D2["Stage transition<br/>(brainstorm)"]
        D3["Process completion"]
        D4["Unrecoverable error"]
        D5["Max agents exceeded<br/>(oldest dismissed)"]
    end

    subgraph Afterlife ["After Shutdown"]
        A1["Vault saved to disk"]
        A2["Knowledge persists<br/>for next spawn"]
        A3["Agent removed from<br/>WorldState + map"]
    end

    S0 --> L1
    S1 --> L1
    S2 --> L1
    S2b --> L1
    S3 --> L1
    S4 --> L1
    L1 --> L2
    L2 --> L3
    L3 --> L4
    L3 --> L5
    L1 --> D1
    L1 --> D2
    L1 --> D3
    L1 --> D4
    L1 --> D5
    D1 --> A1
    D2 --> A1
    D3 --> A1
    D4 --> A1
    D5 --> A1
    A1 --> A2
    A1 --> A3
```
