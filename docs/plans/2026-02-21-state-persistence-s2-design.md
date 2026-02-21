# S2: ProcessController.toJSON / fromJSON

**Date:** 2026-02-21
**Owner:** Behrang
**Status:** Approved
**Depends on:** S1 (ProcessState persistence fields)
**Unblocks:** S4 (debounced saves need toJSON), S5 (resume needs fromJSON)

## Problem

ProcessController tracks turn counts and stage timing in memory Maps. When the server restarts, this state is lost. ProcessController needs serialization methods so BridgeServer can snapshot its state into WorldState (which gets saved to disk).

## Design

### Runtime addition: `stageStartedAt`

Add `private stageStartedAt: string | null = null` to ProcessController. Set to `new Date().toISOString()` in `start()` (stage 0) and `advanceStage()` (each new stage). Clear in `stop()`.

### `toJSON(existingState: ProcessState): ProcessState`

Instance method. Takes the existing ProcessState from WorldState as input (for fields ProcessController doesn't own: `collectedArtifacts`, `startedAt`, `completedAt`, `status`). Returns a full ProcessState with PC's data overlaid:

- `processId` from `context.template.id`
- `problem` from `context.problem`
- `currentStageIndex` from `context.stageIndex`
- `problemStatement` from `context.problem`
- `stageTurnCounts` from Map → Record
- `agentTurnCounts` from Map → Record
- `stageStartedAt` from the new private field

Falls back to `existingState` values when context is null (shouldn't happen in practice, but defensive).

### `static fromJSON(state, template, delegate): ProcessController`

Static factory. Reconstructs ProcessController from a saved ProcessState + template lookup + delegate. Restores:
- `context` with problem, template, stageIndex
- `stageTurnCounts` from Record → Map
- `agentTurnCounts` from Record → Map
- `stageStartedAt`

Does NOT emit any events. Does NOT auto-advance. BridgeServer is responsible for spawning agents for the current stage after calling fromJSON.

### Why `toJSON` takes `existingState`

ProcessController doesn't own `collectedArtifacts`, `startedAt`, `completedAt`, or `status`. These live in WorldState's ProcessState. Rather than duplicating them, toJSON merges PC's data into the existing state object. This keeps a clean separation: WorldState owns the process lifecycle fields, ProcessController owns the turn-tracking fields.

## Files Changed

1. **`server/src/ProcessController.ts`** — Add `stageStartedAt` field, `toJSON()`, `fromJSON()`, update `start()`, `advanceStage()`, `stop()`
2. **`server/src/__tests__/ProcessController.test.ts`** — New test file with 4 tests

## Testing

1. Round-trip: start → advance turns → toJSON → fromJSON → verify match
2. fromJSON restores silently (no events emitted)
3. fromJSON with missing S1 fields (backward compat defaults)
4. stageStartedAt set on start() and updated on advanceStage()

## Out of Scope

- BridgeServer integration (S4 calls toJSON, S5 calls fromJSON)
- NavigationState serialization (S3)
- Debounced saves (S4)
