# System Overview

## Three-Process Architecture

The system has three processes that communicate over WebSocket. The Bridge Server is the single source of truth; agents and the client never talk directly to each other.

```mermaid
graph TD
    subgraph Agents ["Agents (Python/JS/SDK)"]
        A1["Python Agent<br/>(scripted or LLM)"]
        A2["Claude SDK Agent<br/>(spawned by server)"]
    end

    subgraph Bridge ["Bridge Server (port 3001)"]
        BS["BridgeServer<br/>Message Router"]
        WS["WorldState<br/>Game State"]
        ASM["AgentSessionManager<br/>SDK Sessions"]
        PC["ProcessController<br/>Stage Lifecycle"]
        CTH["CustomToolHandler<br/>MCP Tool Execution"]
        ET["EventTranslator<br/>SDK → RPG Events"]
        SPB["SystemPromptBuilder<br/>Dynamic Prompts"]
        MG["MapGenerator<br/>Repo/Process → Tile Maps"]
        BG["BiomeGenerator<br/>Voronoi Biome Zones"]
    end

    subgraph Client ["Phaser Client (port 5173)"]
        GS["GameScene<br/>Map + Sprites + Forts"]
        UI["UIScene<br/>Dialogue + Details Panel"]
        PB["PromptBar<br/>Commands"]
        DL["DialogueLog<br/>Message History"]
    end

    A1 <-->|"WebSocket<br/>register, action"| BS
    A2 <-.->|"Claude Agent SDK<br/>query(), messages"| ASM
    BS <-->|"WebSocket<br/>state, results, events"| GS

    BS --> WS
    BS --> ASM
    BS --> PC
    ASM --> CTH
    ASM --> ET
    ASM --> SPB
    BS --> MG
    MG --> BG
```

## Message Protocol Summary

All messages are JSON with a `type` field for routing.

```mermaid
graph TD
    subgraph AgentToServer ["Agent → Server"]
        AR["agent:register<br/>Join game"]
        AA["agent:action<br/>Submit turn action"]
    end

    subgraph SpectatorToServer ["Spectator → Server"]
        SR["spectator:register<br/>Join as viewer"]
        SC["spectator:command<br/>Chat message"]
    end

    subgraph PlayerToServer ["Player → Server"]
        PSub["player:submit<br/>Submit problem/repo (unified entry)"]
        SP["player:start-process<br/>Begin brainstorm (legacy)"]
        PCmd["player:command<br/>Chat command"]
        PD["player:dismiss-agent<br/>Remove agent"]
        PUS["player:update-settings<br/>Change settings"]
        GAD["player:get-agent-details<br/>Request agent info"]
        LR["player:link-repo<br/>Analyze repo (legacy)"]
        PLR["player:list-realms<br/>Get realm list"]
        PRR["player:resume-realm<br/>Resume session"]
        PRM["player:remove-realm<br/>Delete realm"]
        PN["player:navigate-enter/back<br/>Folder navigation"]
        FC["fort:click<br/>Click agent fort"]
        FE["fort:exit<br/>Exit fort view"]
    end

    subgraph ServerBroadcasts ["Server → All Clients"]
        WST["world:state<br/>Full snapshot"]
        ARS["action:result<br/>Action outcome"]
        TS["turn:start<br/>Next agent's turn"]
        AJ["agent:joined / left<br/>Lifecycle events"]
        AT["agent:thought / activity<br/>Status updates"]
        ASR["agent:spawn-request<br/>Spawn notification"]
        ALU["agent:level-up<br/>Expertise increase"]
        AD["agent:details<br/>Full agent info response"]
        FP["findings:posted<br/>New discovery"]
        MC["map:change<br/>Room transition"]
        PS["process:started<br/>stage:advanced<br/>stage:completed<br/>process:completed"]
        OD["oracle:decision<br/>Oracle selected heroes + template"]
        IP["idea:proposed / idea:voted<br/>Brainstorm idea events"]
        SW["spectator:welcome<br/>spectator:joined<br/>spectator:left<br/>spectator:command"]
        SI["server:info<br/>LAN address for spectators"]
        ER["error<br/>Error message"]
        RL["realm:list<br/>realm:removed<br/>realm:presence<br/>realm:tree"]
        FR["fog:reveal<br/>Fog-of-war tile reveal"]
        FU["fort:update<br/>Fort stage change"]
        FV["fort:view<br/>Fort interior data"]
        RR["repo:ready<br/>Repo analysis complete (legacy)"]
        QU["quest:update<br/>Quest status change"]
    end
```

## Module Responsibility Map

```mermaid
graph TD
    subgraph Orchestration ["Orchestration"]
        BS2["BridgeServer<br/>Routes messages<br/>Manages game phases<br/>Coordinates subsystems"]
        PC3["ProcessController<br/>Stage lifecycle<br/>Turn counting<br/>Completion criteria"]
        OM2["OracleManager<br/>Oracle spawn/dismiss<br/>Inter-stage context feed<br/>oracle:decision routing"]
    end

    subgraph AgentManagement ["Agent Management"]
        ASM2["AgentSessionManager<br/>SDK query() sessions<br/>Follow-up prompts<br/>Session resumption"]
        SPB2["SystemPromptBuilder<br/>Codebase mode prompts<br/>Brainstorm mode prompts<br/>Knowledge + artifact injection"]
        ET2["EventTranslator<br/>SDK streams → RPG events<br/>Tool use → animations"]
    end

    subgraph Tools ["MCP Tools"]
        RMS["RpgMcpServer<br/>Tool schemas (Zod)<br/>Codebase: 7 tools<br/>Brainstorm: 4 tools"]
        CTH2["CustomToolHandler<br/>Tool execution<br/>Event emission"]
    end

    subgraph WorldModel ["World Model"]
        WS2["WorldState<br/>Agents, map, objects<br/>Quests, process state<br/>Fog grid, spectators"]
        MG2["MapGenerator<br/>Repo → tile maps<br/>Process stage → maps<br/>Fog-of-war → 120x120 maps"]
        BG2["BiomeGenerator<br/>Voronoi zone seeding<br/>Biome assignment"]
        QM["QuestManager<br/>GitHub issues → quests"]
    end

    subgraph Persistence ["Persistence"]
        FB["FindingsBoard<br/>Redis + JSON fallback<br/>Shared discoveries"]
        KV["KnowledgeVault<br/>JSON files<br/>Per-agent memory"]
        RR2["RealmRegistry<br/>Global realm list<br/>Session resumption"]
        WSP["WorldStatePersistence<br/>JSON files<br/>Full state snapshots"]
        TL["TranscriptLogger<br/>JSONL files<br/>Per-agent daily logs"]
    end

    BS2 --> ASM2
    BS2 --> PC3
    BS2 --> OM2
    BS2 --> WS2
    BS2 --> MG2
    OM2 --> ASM2
    MG2 --> BG2
    ASM2 --> SPB2
    ASM2 --> ET2
    ASM2 --> RMS
    RMS --> CTH2
    CTH2 --> FB
    CTH2 --> KV
    CTH2 --> QM
```

### MCP Tool Details

| Server | Tool | Description |
|--------|------|-------------|
| Codebase | SummonAgent | Spawn a new specialist agent |
| Codebase | RequestHelp | Ask another agent for help |
| Codebase | PostFindings | Share a discovery on the board |
| Codebase | UpdateKnowledge | Update own knowledge vault |
| Codebase | ClaimQuest | Claim a quest from the board |
| Codebase | CompleteQuest | Mark a quest as complete |
| Codebase | SealChamber | Mark a chamber/area as done |
| Brainstorm | PostFindings | Share an idea or result |
| Brainstorm | UpdateKnowledge | Update own knowledge |
| Brainstorm | CompleteStage | Signal stage completion |
| Brainstorm | SealChamber | Mark a chamber as done |
| Oracle | SelectHeroes | Choose activity type + initial hero roster |
| Oracle | SummonReinforcement | Add a hero between stages |
| Oracle | DismissHero | Remove a hero between stages |
| Oracle | PresentReport | Compile and broadcast final report |

## Oracle Routing

The Oracle Router is the unified entry point for all sessions. When the player submits a problem and/or repo, the Oracle agent analyzes the input and decides which process to run.

```mermaid
graph TD
    PS["player:submit<br/>(problem, repoInput, or both)"]
    BS["BridgeServer<br/>handlePlayerSubmit"]
    OM["OracleManager.spawn()"]
    OA["Oracle Agent<br/>(Claude Opus)<br/>analyzes input"]
    SH["SelectHeroes MCP tool<br/>chooses activityType + heroes"]
    OD["oracle:decision event<br/>broadcast to clients"]
    PC["ProcessController<br/>starts with selected template"]

    PS --> BS
    BS --> OM
    OM --> OA
    OA --> SH
    SH --> OD
    OD --> PC
```

### Input Routing Rules

```mermaid
graph TD
    Input["User Input"] --> HasBoth{"Has both<br/>problem + repo?"}
    HasBoth -->|"Yes"| CB["code_brainstorm template"]
    HasBoth -->|"No"| HasRepo{"Repo only?"}
    HasRepo -->|"Yes"| CR["code_review template"]
    HasRepo -->|"No"| BR["brainstorm template"]
```

### Oracle Inter-Stage Intervention

Between process stages the Oracle receives a context update and can adjust the hero party.

```mermaid
graph TD
    SC["Stage N completes"]
    IU["OracleManager.feedInterStageContext()<br/>sends recent findings to Oracle"]
    OR["Oracle reviews findings"]
    Choices{"Oracle decision"}
    SR["SummonReinforcement<br/>add hero for next stage"]
    DH["DismissHero<br/>remove hero no longer needed"]
    NS["Stage N+1 begins"]

    SC --> IU
    IU --> OR
    OR --> Choices
    Choices -->|"needs more help"| SR
    Choices -->|"party is overstaffed"| DH
    Choices -->|"party is fine"| NS
    SR --> NS
    DH --> NS
```

### Model Routing

Hero agent model is selected per stage based on the active template.

```mermaid
graph TD
    CR["code_review template"]
    CR --> S01["Stages 0-1<br/>Reconnaissance + Deep Analysis"]
    CR --> S2["Stage 2<br/>Cross-Reference"]
    CR --> S3["Stages 3+<br/>Oracle Review, Synthesis, Presentation"]
    S01 --> H["haiku<br/>(cheap exploration)"]
    S2 --> SO["sonnet<br/>(needs reasoning)"]
    S3 --> OP["opus<br/>(heavy analysis)"]

    BR["brainstorm templates"]
    BR --> ALL["All stages"]
    ALL --> SO2["sonnet<br/>(balanced)"]

    Oracle["Oracle agent<br/>(always)"] --> OPO["opus"]
```

## Port Map

| Service | Port | Protocol |
|---------|------|----------|
| Bridge Server | 3001 | WebSocket |
| Phaser Client (Vite) | 5173 | HTTP |
| Redis (optional) | 6379 | Redis protocol |
