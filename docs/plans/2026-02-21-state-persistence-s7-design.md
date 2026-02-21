# S7: Auto-Load Last Realm on Startup

**Date:** 2026-02-21
**Owner:** Behrang
**Status:** Approved
**Depends on:** S5 (process-aware resume)

## Problem

When the server restarts (crash or manual restart), all session state is lost. The user must manually re-scan or resume the realm. If a brainstorm was in progress, it's gone.

## Design

### 1. Track active realm in RealmRegistry

Add `lastActiveRealmId?: string` to `RealmRegistryData`. Three new methods on `RealmRegistry`:
- `getLastActiveRealmId(): string | undefined`
- `setLastActiveRealmId(id: string): void`
- `clearLastActiveRealmId(): void`

Persisted in `realms.json` alongside existing realm data.

### 2. Set active realm on activation

- `handleLinkRepo`: set after saving realm entry
- `handleResumeRealm`: set after updating `lastExplored`

### 3. Clear on clean shutdown

In `BridgeServer.close()`: clear `lastActiveRealmId` and save registry. This ensures only unclean shutdowns (crash, SIGKILL) trigger auto-load.

### 4. Clear on realm removal

In `handleRemoveRealm`: if the removed realm ID matches `lastActiveRealmId`, clear it.

### 5. Auto-load on startup

New public method `autoLoadLastRealm(): Promise<void>` on BridgeServer. Called from `index.ts` after constructing the server. Logic:

1. Read `lastActiveRealmId` from registry
2. If not set, return (normal onboarding)
3. Look up realm entry — if not found, log warning, clear field, return
4. Load WorldState — if not found, log warning, clear field, return
5. Initialize subsystems (FindingsBoard, TranscriptLogger, CustomToolHandler, AgentSessionManager)
6. Restore navigation state from `worldState.navigationState`
7. Set `gamePhase = 'playing'`
8. Process-aware agent spawn (reuses S5 logic): running process → fromJSON + stage agents; otherwise → Oracle

If any step fails, catch the error, log a warning, and fall back to normal onboarding. Never crash on auto-load failure.

### 6. Client experience

When a client connects while auto-load is active, it receives the `world:state` message immediately (existing behavior in `handleConnection`). No new client-side changes needed for S7.

## Files Changed

1. **`server/src/RealmRegistry.ts`** — `lastActiveRealmId` field, 3 new methods
2. **`server/src/BridgeServer.ts`** — `autoLoadLastRealm()` method, set/clear calls in `handleLinkRepo`, `handleResumeRealm`, `handleRemoveRealm`, `close()`
3. **`server/src/index.ts`** — call `await server.autoLoadLastRealm()` after constructor
4. **`server/src/__tests__/RealmRegistry.test.ts`** — tests for 3 new methods
5. **`server/src/__tests__/BridgeServer.resume.test.ts`** — auto-load scenario tests

## Testing

1. RealmRegistry: set/get/clear `lastActiveRealmId`, persists across save/load
2. Auto-load with valid realm → gamePhase becomes 'playing'
3. Auto-load with missing realm → falls back to onboarding, warning logged
4. Auto-load with no `lastActiveRealmId` → normal onboarding
5. Clean shutdown clears `lastActiveRealmId`
6. Remove active realm clears `lastActiveRealmId`

## Out of Scope

- S6 (graceful shutdown — Jeff/S4 dependency)
- C1-C3 (client localStorage)
- Auto-reconnect of agents after crash (agents are re-spawned from scratch)
