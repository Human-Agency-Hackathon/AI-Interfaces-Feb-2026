# Data & Persistence

How the system stores and retrieves data across sessions.

## Storage Overview

```mermaid
graph TD
    subgraph Runtime ["Runtime (In-Memory)"]
        WS["WorldState<br/>Agents, map, objects,<br/>quests, process state"]
        Sessions["AgentSessionManager<br/>Active SDK sessions"]
    end

    subgraph Redis ["Redis (Session Lifetime)"]
        FB["FindingsBoard<br/>session:&lt;path&gt;:findings<br/>(RPUSH/LRANGE)"]
    end

    subgraph Disk ["Disk (Permanent)"]
        KV["KnowledgeVault<br/>.agent-rpg/knowledge/{agentId}.json"]
        Logs["TranscriptLogger<br/>.agent-rpg/logs/{agentId}/{date}.jsonl"]
        Realm["RealmRegistry<br/>~/.agent-rpg-global/.agent-rpg/realms.json"]
        WSP["WorldStatePersistence<br/>.agent-rpg/world-state.json"]
    end

    WS -->|"snapshot broadcast"| Clients["All Clients"]
    Sessions -->|"SDK messages"| WS

    FB -->|"injected into prompts"| Sessions
    KV -->|"loaded at spawn"| Sessions
    KV -->|"saved on dismiss"| Disk

    Realm -->|"realm:list to clients"| Clients
    WSP -->|"resume realm"| WS
```

---

## Knowledge Vault (Per-Agent Memory)

Each agent has a persistent knowledge file that survives across sessions.

```mermaid
graph TD
    subgraph Write ["Write Path"]
        Agent["Agent calls UpdateKnowledge tool"]
        Agent --> CTH["CustomToolHandler"]
        CTH --> KV["KnowledgeVault.addInsight()<br/>or .incrementExpertise()"]
        KV --> JSON["Save to disk:<br/>.agent-rpg/knowledge/{agentId}.json"]
    end

    subgraph Read ["Read Path (at spawn)"]
        Spawn["AgentSessionManager.spawnAgent()"]
        Spawn --> Load["KnowledgeVault.load()"]
        Load --> Disk2[".agent-rpg/knowledge/{agentId}.json"]
        Disk2 --> SPB["SystemPromptBuilder"]
        SPB --> Prompt["Injected into system prompt:<br/>expertise areas, insights,<br/>files analyzed, task history"]
    end
```

### Knowledge Data Model

```mermaid
graph TD
    subgraph KnowledgeJSON ["AgentKnowledge JSON"]
        ID["agent_id: string"]
        Name["agent_name: string"]
        Role["role: string"]
        Realm["realm: string"]
        Expertise["expertise: Record&lt;string, number&gt;<br/>e.g. { TypeScript: 85, Testing: 72 }"]
        RealmKnowledge["realm_knowledge: Record&lt;string, number&gt;<br/>e.g. { 'server/src': 40, 'client/src': 20 }"]
        Insights["insights: string[]<br/>e.g. ['Server uses event-driven architecture']"]
        TaskHistory["task_history: Array&lt;{task, outcome, timestamp}&gt;"]
        FilesAnalyzed["files_analyzed: string[]"]
    end
```

### Knowledge Accumulation Flow

```mermaid
sequenceDiagram
    participant Agent
    participant CTH as CustomToolHandler
    participant KV as KnowledgeVault
    participant Disk as .agent-rpg/knowledge/

    Note over Agent: Agent reads a file
    Agent->>CTH: UpdateKnowledge(insight: "Uses JWT auth", area: "security")
    CTH->>KV: incrementExpertise("security", 5)
    CTH->>KV: addInsight("Uses JWT auth")
    KV->>Disk: Save oracle.json

    Note over Agent: Agent completes a quest
    Agent->>CTH: CompleteQuest(quest_id, outcome: "Fixed the bug")
    CTH->>KV: addTaskHistory("Fix auth bug", "Fixed")
    CTH->>KV: incrementExpertise("authentication", 10)
    KV->>Disk: Save oracle.json

    Note over Agent: Session ends, agent dismissed
    KV->>Disk: Final save (all accumulated knowledge)

    Note over Disk: Next session...
    Disk-->>KV: Load oracle.json
    Note over KV: Agent remembers everything from<br/>previous sessions
```

---

## Findings Board (Redis + JSON Fallback)

The shared board where agents post discoveries. Checks Redis availability at load time via `isRedisAvailable()`. Falls back to JSON file automatically, so the server works without Redis (including in CI).

```mermaid
graph TD
    subgraph RedisMode ["Redis Mode (if available)"]
        Key["Key: session:&lt;sanitized-path&gt;:findings"]
        Write1["addFinding() → RPUSH (JSON string)"]
        Read1["getAll() → LRANGE 0 -1"]
        Recent1["getRecent(15) → LRANGE -15 -1"]
        Save1["save() → no-op (writes are immediate)"]
    end

    subgraph JSONMode ["JSON Fallback (default, no Redis needed)"]
        File["File: .agent-rpg/findings/board.json"]
        Write2["addFinding() → array.push + writeFile"]
        Read2["getAll() → return array copy"]
        Recent2["getRecent(15) → array.slice(-15)"]
        Save2["save() → writeFile to disk"]
    end

    Check{"isRedisAvailable()<br/>at load() time"} -->|"Yes"| RedisMode
    Check -->|"No"| JSONMode
```

### Finding Data Model

```mermaid
graph TD
    subgraph FindingJSON ["Finding Object"]
        ID2["id: 'finding_{timestamp}_{random}'"]
        AgentId["agent_id: string"]
        AgentName["agent_name: string"]
        RealmF["realm: string"]
        FindingText["finding: string"]
        Severity["severity: 'low' | 'medium' | 'high'"]
        Timestamp["timestamp: ISO 8601 string"]
    end
```

---

## Realm Registry (Global Session Tracking)

Tracks all repos that have been explored, enabling session resumption.

```mermaid
sequenceDiagram
    participant Player
    participant BS as BridgeServer
    participant RR as RealmRegistry
    participant WSP as WorldStatePersistence
    participant Disk as ~/.agent-rpg-global/

    Note over Player: First time exploring a repo
    Player->>BS: link:repo (path or URL)
    BS->>BS: Analyze repo, generate map, start game
    BS->>RR: registerRealm(repoPath, gitInfo)
    RR->>Disk: Save to realms.json
    BS->>WSP: saveState(worldState)
    WSP->>Disk: Save to .agent-rpg/world-state.json

    Note over Player: Later session, wants to resume
    Player->>BS: (on connect) request realm:list
    BS->>RR: listRealms()
    RR->>Disk: Read realms.json
    RR-->>BS: List of known repos with dates, stats
    BS->>Player: realm:list message

    Player->>BS: player:resume-realm(realmId)
    BS->>WSP: loadState(realmId)
    WSP->>Disk: Read world-state.json
    WSP-->>BS: Restored WorldState
    BS->>BS: Restore map, agents, quests
    BS->>Player: repo:ready (restored state)
```

---

## Transcript Logging

Every SDK message is logged per-agent per-day for debugging and replay.

```mermaid
graph TD
    subgraph LogPath ["Log File Path"]
        Base[".agent-rpg/logs/"]
        Agent["{agentId}/"]
        Date["{YYYY-MM-DD}.jsonl"]
        Base --> Agent --> Date
    end

    subgraph Format ["JSONL Format (one JSON per line)"]
        Line1["{ timestamp, type: 'assistant', content: [...] }"]
        Line2["{ timestamp, type: 'tool_use', name: 'Read', input: {...} }"]
        Line3["{ timestamp, type: 'tool_result', content: [...] }"]
    end

    SDK["Claude Agent SDK<br/>streaming messages"] --> Logger["TranscriptLogger"]
    Logger --> LogPath
```

---

## Known Gap: ProcessController State

**ProcessController has no state serialization.** Its runtime state (`context`, `stageTurnCounts`, `agentTurnCounts`) lives in memory only. If the server crashes mid-brainstorm, the process state is lost and cannot be resumed. Only `WorldState` tracks high-level process completion (via `advanceStage()` and `completeProcess()`). A state persistence feature is designed in `docs/features/20260221.02_state_persistence/` but not yet implemented.

---

## Persistence Lifecycle

```mermaid
graph TD
    subgraph SessionStart ["Session Start"]
        S1["RealmRegistry: check for existing realm"]
        S2["WorldStatePersistence: restore or create"]
        S3["FindingsBoard: connect to Redis"]
        S4["KnowledgeVaults: loaded per-agent on spawn"]
    end

    subgraph During ["During Session"]
        D1["WorldState: in-memory, broadcast to clients"]
        D2["FindingsBoard: RPUSH on every PostFindings"]
        D3["KnowledgeVault: updated on tool calls"]
        D4["TranscriptLogger: append every SDK message"]
    end

    subgraph SessionEnd ["Session End / Agent Dismiss"]
        E1["KnowledgeVault: save to disk"]
        E2["WorldStatePersistence: save state"]
        E3["RealmRegistry: update last-explored date"]
    end

    SessionStart --> During --> SessionEnd
```

---

## File System Layout

```
Project Root/
├── .agent-rpg/                          # Per-repo persistence
│   ├── knowledge/
│   │   ├── oracle.json                  # Oracle's accumulated knowledge
│   │   ├── test_guardian.json           # Test Guardian's knowledge
│   │   └── doc_scribe.json             # Doc Scribe's knowledge
│   ├── logs/
│   │   ├── oracle/
│   │   │   ├── 2026-02-19.jsonl        # Daily transcript
│   │   │   └── 2026-02-20.jsonl
│   │   └── test_guardian/
│   │       └── 2026-02-20.jsonl
│   └── world-state.json                 # Full serialized game state
│
└── ~/.agent-rpg-global/                 # Global (cross-repo)
    └── .agent-rpg/
        └── realms.json                  # Registry of all explored repos

Redis (localhost:6379):
    session:<sanitized-path>:findings    # FindingsBoard data
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `REDIS_HOST` | `localhost` | Redis connection host |
| `REDIS_PORT` | `6379` | Redis connection port |
| `REDIS_PASSWORD` | (none) | Redis auth password |
| `ANTHROPIC_API_KEY` | (required) | Claude API key for SDK agents |
