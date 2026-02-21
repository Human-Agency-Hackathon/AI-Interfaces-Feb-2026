# S5: Process-Aware Resume in handleResumeRealm

**Date:** 2026-02-21
**Owner:** Behrang
**Status:** Approved
**Depends on:** S1 (ProcessState fields), S2 (ProcessController.fromJSON)
**Partially depends on:** S3 (NavigationState in WorldState — coded against expected shape, activates when S3 lands)
**Unblocks:** S6 (graceful shutdown), S7 (auto-load), full resume workflow

## Problem

When a realm is resumed, `handleResumeRealm` always spawns Oracle regardless of whether a brainstorm process was running. ProcessController state, stage agents, and navigation stacks are lost.

## Design

### 1. Extract `createProcessController` helper

Extract delegate creation and event listener wiring from `handleStartProcess` into a reusable private method. Both `handleStartProcess` and `handleResumeRealm` call this helper. DRY.

### 2. Process-aware branch in `handleResumeRealm`

After loading WorldState, check `processState.status`:
- **`'running'`**: Look up template via `PROCESS_TEMPLATES[processState.processId]`. If found, call `ProcessController.fromJSON()` with extracted helper's delegate, spawn stage agents with resume context. If template not found, log warning, fall back to Oracle.
- **Otherwise** (completed, paused, or null): Spawn Oracle as today.

### 3. Resume context in `spawnProcessAgents`

Add optional `{ resumed?: boolean }` parameter. When true, include a note in `processContext`: "You are resuming a paused brainstorm session. Prior stage artifacts are available in your system prompt." Flows through `SystemPromptBuilder`.

### 4. Navigation state restoration

After loading WorldState, restore `agentNavStacks` and `agentCurrentPath` from `worldState.navigationState` (S3's expected shape). No-op until S3 populates this field during saves.

### 5. Template miss fallback

If `PROCESS_TEMPLATES[processState.processId]` returns undefined, log a warning and fall back to Oracle. Don't crash or error to client.

## Files Changed

1. **`server/src/BridgeServer.ts`** — Extract `createProcessController`, modify `handleResumeRealm`, modify `handleStartProcess` to use helper, modify `spawnProcessAgents` for resume context
2. **`server/src/__tests__/BridgeServer.test.ts`** — 5 new tests for resume scenarios

## Testing

1. Resume with running process → fromJSON called, stage agents spawn
2. Resume with missing template → fallback to Oracle, warning logged
3. Resume with completed/no process → Oracle spawns (existing behavior)
4. Navigation state restoration → Maps populated from worldState.navigationState
5. Refactor regression → handleStartProcess still works after extraction

## Out of Scope

- S3 (WorldState NavigationState serialization — Jeff's work)
- S4 (debounced save triggers — Jeff's work)
- S6 (graceful shutdown)
- S7 (auto-load last realm)
