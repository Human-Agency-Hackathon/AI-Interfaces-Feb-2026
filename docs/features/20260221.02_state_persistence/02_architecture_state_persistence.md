# Architecture: State Persistence Across Refresh and Restart

## Current State vs. Target State

```mermaid
graph TD
    subgraph Current ["Current Persistence"]
        WS1["WorldState"] -->|"save on realm link only"| DISK1["worlds/{realmId}/state.json"]
        RR1["RealmRegistry"] -->|"save on update"| DISK2["realms.json"]
        KV1["KnowledgeVault"] -->|"save on dismiss"| DISK3["knowledge/{agentId}.json"]
        FB1["FindingsBoard"] -->|"save on post"| REDIS1["Redis / JSON fallback"]
        PC1["ProcessController"] -->|"NOT SAVED"| VOID1["Lost on restart"]
        NAV1["Navigation State"] -->|"NOT SAVED"| VOID2["Lost on restart"]
        CLI1["Client Identity"] -->|"NOT SAVED"| VOID3["Lost on refresh"]
    end
```

```mermaid
graph TD
    subgraph Target ["Target Persistence"]
        WS2["WorldState<br/>(expanded)"] -->|"save on every significant event"| DISK4["worlds/{realmId}/state.json"]
        WS2 ---|"includes"| PC2["ProcessController state"]
        WS2 ---|"includes"| NAV2["Navigation state"]
        WS2 ---|"includes"| SET2["Settings"]
        RR2["RealmRegistry"] -->|"save on update"| DISK5["realms.json"]
        KV2["KnowledgeVault"] -->|"save on dismiss + periodic"| DISK6["knowledge/{agentId}.json"]
        FB2["FindingsBoard"] -->|"save on post"| REDIS2["Redis / JSON fallback"]
        CLI2["Client Identity"] -->|"localStorage"| LS2["Browser localStorage"]
        SIG2["SIGINT/SIGTERM"] -->|"triggers"| WS2
    end
```

## Component Changes

### 1. WorldState Expansion

WorldState.toJSON() currently serializes: agents, map, objects, quests, tick, mapTree, processState. We expand `processState` and add new fields.

```mermaid
graph TD
    subgraph WorldState ["WorldState.toJSON()"]
        direction LR
        EXISTING["agents<br/>map<br/>objects<br/>quests<br/>tick<br/>mapTree"] --- NEW["processState (EXPANDED)<br/>navigationState (NEW)<br/>settings (NEW)"]
    end

    subgraph ProcessState ["processState (expanded)"]
        PS_EXISTING["status<br/>currentStageIndex<br/>collectedArtifacts"] --- PS_NEW["stageTurnCounts (NEW)<br/>agentTurnCounts (NEW)<br/>problemStatement (NEW)<br/>templateId (NEW)<br/>stageStartedAt (NEW)"]
    end

    WorldState --> ProcessState
```

**Expanded ProcessState type** (in `shared/protocol.ts` or `shared/process.ts`):

```typescript
interface ProcessState {
  // Existing fields
  status: 'idle' | 'running' | 'paused' | 'completed';
  currentStageIndex: number;
  collectedArtifacts: Record<string, unknown>;

  // New fields for persistence
  problemStatement: string;
  templateId: string;               // Which process template (e.g. 'STANDARD_BRAINSTORM')
  stageTurnCounts: Record<string, number>;       // stageId -> total turns taken
  agentTurnCounts: Record<string, number>;       // "stageId:agentId" -> turns taken
  stageStartedAt: string | null;    // ISO 8601 timestamp of current stage start
}
```

**New NavigationState type:**

```typescript
interface NavigationState {
  agentNavStacks: Record<string, string[]>;  // agentId -> stack of folder paths
  agentCurrentPath: Record<string, string>;  // agentId -> current folder path
}
```

### 2. ProcessController Serialization

ProcessController gains `toJSON()` and `static fromJSON()` methods:

```mermaid
sequenceDiagram
    participant PC as ProcessController
    participant WS as WorldState
    participant WSP as WorldStatePersistence
    participant DISK as Disk

    Note over PC,DISK: Save flow (after stage advance)
    PC->>WS: setProcessState(pc.toJSON())
    WS->>WSP: save(realmId, worldState)
    WSP->>DISK: Write state.json

    Note over PC,DISK: Resume flow (server restart)
    DISK->>WSP: Read state.json
    WSP->>WS: WorldState.fromJSON()
    WS->>PC: ProcessController.fromJSON(processState, template, delegate)
```

`ProcessController.toJSON()` returns the expanded ProcessState object. `ProcessController.fromJSON()` reconstructs the controller from saved state + the original process template + delegate callbacks.

### 3. BridgeServer Save Triggers

Current: save only on `link:repo`.
Target: save on every significant event.

```mermaid
graph TD
    subgraph Triggers ["Save Triggers"]
        T1["Stage advance<br/>(process:stage_advanced)"]
        T2["Agent spawn/dismiss<br/>(agent:joined / agent:left)"]
        T3["Findings posted<br/>(findings:posted)"]
        T4["Process completed<br/>(process:completed)"]
        T5["Graceful shutdown<br/>(SIGINT/SIGTERM)"]
        T6["Realm linked<br/>(existing)"]
    end

    T1 & T2 & T3 & T4 & T5 & T6 -->|"debounced, 1s"| SAVE["worldStatePersistence.save()"]
```

**Debouncing:** Multiple events can fire in quick succession (e.g. dismiss 4 agents + spawn 3 new ones during a stage advance). Use a simple debounce: schedule a save 1 second after the last trigger. If another trigger fires within that second, reset the timer.

### 4. BridgeServer Resume Logic

Current `handleResumeRealm` only spawns the oracle agent. Target: detect process state and resume accordingly.

```mermaid
graph TD
    A["handleResumeRealm()"] --> B{"savedState has<br/>processState?"}
    B -->|No| C["Spawn oracle<br/>(existing behavior)"]
    B -->|Yes| D{"processState.status?"}
    D -->|completed| E["Load artifacts<br/>Show completion state<br/>Don't spawn agents"]
    D -->|running| F["Recreate ProcessController<br/>from saved state"]
    F --> G["Spawn agents for<br/>current stage"]
    G --> H["Resume process<br/>from saved stage index"]
    D -->|paused| I["Load state<br/>Wait for /resume command"]
```

### 5. Client-Side Persistence

```mermaid
sequenceDiagram
    participant LS as localStorage
    participant Main as main.ts
    participant WS as WebSocket
    participant Server as BridgeServer

    Note over LS,Server: On initial setup
    Main->>LS: Save {name, color, realmId}
    Main->>WS: spectator:register + player:start-process

    Note over LS,Server: On refresh
    Main->>LS: Read {name, color, realmId}
    Main->>WS: Connect
    WS->>Server: (connection opens)
    Server->>WS: server:info {gamePhase, realmId}
    Main->>Main: If gamePhase === 'playing' && realmId matches localStorage
    Main->>WS: spectator:register (auto, from localStorage)
    Main->>Main: Skip splash/setup, go straight to game
```

**New server message:** `server:info` is already sent on connection (line 150 in BridgeServer). We expand it to include `gamePhase` and `realmId` so the client knows whether to show setup screens or jump to the game.

**localStorage keys:**
- `agentDungeon.identity` → `{ name: string, color: string }`
- `agentDungeon.realmId` → `string`
- `agentDungeon.gamePhase` → `'onboarding' | 'playing'`

### 6. Graceful Shutdown

```mermaid
sequenceDiagram
    participant OS as OS Signal
    participant Index as index.ts
    participant Bridge as BridgeServer
    participant WSP as WorldStatePersistence
    participant DISK as Disk

    OS->>Index: SIGINT / SIGTERM
    Index->>Bridge: shutdown()
    Bridge->>Bridge: Dismiss all agents (save vaults)
    Bridge->>WSP: save(realmId, worldState)
    WSP->>DISK: Write state.json
    Bridge->>Bridge: Close WebSocket server
    Index->>OS: process.exit(0)
```

### 7. Auto-Save on Startup

On server startup, if a realm was active (check a `lastActiveRealm` field in the realm registry or a separate file), auto-load it. This means after a crash, the server comes back in `playing` phase with the last realm loaded; the client reconnects and sees the game.

```mermaid
graph TD
    A["Server starts"] --> B{"Last active realm<br/>saved?"}
    B -->|No| C["Normal startup<br/>gamePhase = 'onboarding'"]
    B -->|Yes| D["Load WorldState<br/>for last realm"]
    D --> E{"processState.status?"}
    E -->|running| F["Recreate ProcessController<br/>gamePhase = 'playing'"]
    E -->|completed/none| G["Load map only<br/>gamePhase = 'playing'"]
    F --> H["Wait for client connection<br/>Send world:state"]
    G --> H
```

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `shared/protocol.ts` | **Modify** | Expand ProcessState type, add NavigationState type, expand `server:info` payload |
| `server/src/types.ts` | **Modify** | Mirror protocol changes |
| `client/src/types.ts` | **Modify** | Mirror protocol changes |
| `server/src/WorldState.ts` | **Modify** | Add navigationState to toJSON/fromJSON, expand processState serialization |
| `server/src/WorldStatePersistence.ts` | **Modify** | No changes needed (already generic JSON serialization) |
| `server/src/ProcessController.ts` | **Modify** | Add toJSON()/fromJSON(), make internal maps serializable |
| `server/src/BridgeServer.ts` | **Modify** | Add debounced save triggers, expand handleResumeRealm for process resume, add navigationState save/load, expand server:info |
| `server/src/index.ts` | **Modify** | Add SIGINT/SIGTERM handlers for graceful shutdown |
| `server/src/RealmRegistry.ts` | **Modify** | Add lastActiveRealmId field |
| `client/src/main.ts` | **Modify** | Add localStorage read/write, auto-resume logic on reconnect |
| `client/src/network/WebSocketClient.ts` | **Modify** | Minimal; reconnect already works |
| `server/src/__tests__/` | **Add/Modify** | Tests for ProcessController serialization, resume logic, save triggers |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Save I/O slows down event processing | Medium | Debounce saves; write async (don't await in hot path) |
| Corrupted state file prevents startup | High | Validate JSON on load; fall back to clean state if corrupt |
| ProcessController fromJSON misses new fields added later | Low | Default values for missing fields in fromJSON |
| localStorage cleared by user | Low | Graceful fallback to splash screen; not a hard requirement |
| Agent SDK sessions can't be restored | Medium (accepted) | Re-spawn fresh agents with prior artifacts in system prompt |
