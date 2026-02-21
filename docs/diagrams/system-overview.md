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
        MG["MapGenerator<br/>Repo → Tile Maps"]
    end

    subgraph Client ["Phaser Client (port 5173)"]
        GS["GameScene<br/>Map + Sprites"]
        UI["UIScene<br/>Dialogue Overlay"]
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
```

## Message Protocol Summary

All messages are JSON with a `type` field for routing.

```mermaid
graph TD
    subgraph AgentToServer ["Agent → Server"]
        AR["agent:register<br/>Join game"]
        AA["agent:action<br/>Submit turn action"]
    end

    subgraph PlayerToServer ["Player → Server"]
        PC2["player:command<br/>Chat command"]
        SC["spectator:command<br/>Spectator chat"]
        SP["player:start-process<br/>Begin brainstorm"]
        LR["link:repo<br/>Analyze repo"]
        PN["player:navigate-enter/back<br/>Folder navigation"]
    end

    subgraph ServerToAll ["Server → All Clients"]
        WST["world:state<br/>Full snapshot"]
        ARS["action:result<br/>Action outcome"]
        TS["turn:start<br/>Next agent's turn"]
        AJ["agent:joined / left<br/>Lifecycle events"]
        MC["map:change<br/>Room transition"]
        FP["findings:posted<br/>New discovery"]
        AT["agent:thought / activity<br/>Status updates"]
        PS["process:started<br/>stage:advanced<br/>stage:completed"]
    end
```

## Module Responsibility Map

```mermaid
graph TD
    subgraph Orchestration ["Orchestration"]
        BS2["BridgeServer<br/>Routes messages<br/>Manages game phases<br/>Coordinates subsystems"]
        PC3["ProcessController<br/>Stage lifecycle<br/>Turn counting<br/>Completion criteria"]
    end

    subgraph AgentManagement ["Agent Management"]
        ASM2["AgentSessionManager<br/>SDK query() sessions<br/>Follow-up prompts<br/>Session resumption"]
        SPB2["SystemPromptBuilder<br/>Codebase mode prompts<br/>Brainstorm mode prompts<br/>Knowledge injection"]
        ET2["EventTranslator<br/>SDK streams → RPG events<br/>Tool use → animations"]
    end

    subgraph Tools ["MCP Tools"]
        RMS["RpgMcpServer<br/>Tool schemas (Zod)<br/>Codebase: 7 tools<br/>Brainstorm: 4 tools"]
        CTH2["CustomToolHandler<br/>Tool execution<br/>Event emission"]
    end

    subgraph WorldModel ["World Model"]
        WS2["WorldState<br/>Agents, map, objects<br/>Quests, process state"]
        MG2["MapGenerator<br/>Repo → tile maps<br/>Lazy folder generation"]
        QM["QuestManager<br/>GitHub issues → quests"]
    end

    subgraph Persistence ["Persistence"]
        FB["FindingsBoard<br/>Redis-backed<br/>Shared discoveries"]
        KV["KnowledgeVault<br/>JSON files<br/>Per-agent memory"]
        RR["RealmRegistry<br/>Global repo list<br/>Session resumption"]
    end

    BS2 --> ASM2
    BS2 --> PC3
    BS2 --> WS2
    BS2 --> MG2
    ASM2 --> SPB2
    ASM2 --> ET2
    ASM2 --> RMS
    RMS --> CTH2
    CTH2 --> FB
    CTH2 --> KV
    CTH2 --> QM
```

## Port Map

| Service | Port | Protocol |
|---------|------|----------|
| Bridge Server | 3001 | WebSocket |
| Phaser Client (Vite) | 5173 | HTTP |
| Redis (optional) | 6379 | Redis protocol |
