# S1: Expand ProcessState for Persistence

**Date:** 2026-02-21
**Owner:** Behrang
**Status:** Approved
**Unblocks:** S2 (ProcessController.toJSON/fromJSON), S3 (WorldState serialization), S4-S7

## Problem

ProcessController tracks turn counts and stage timing in memory (`Map<string, number>` fields). These are lost on server restart. The `ProcessState` interface in `shared/process.ts` doesn't include these fields, so WorldState serialization can't capture them.

## Design

Add 4 optional fields to the existing `ProcessState` interface. Optional so existing code that creates ProcessState objects doesn't break.

### New Fields

| Field | Type | Purpose |
|-------|------|---------|
| `problemStatement` | `string?` | Original problem text, preserved verbatim for resume |
| `stageTurnCounts` | `Record<string, number>?` | Total turns completed per stage ID |
| `agentTurnCounts` | `Record<string, number>?` | Turns completed per `"stageId:agentId"` key |
| `stageStartedAt` | `string?` | ISO 8601 timestamp for current stage start |

### Why `Record` not `Map`

Protocol types are JSON-serializable. ProcessController uses Maps internally and converts to/from Records in its toJSON/fromJSON (S2).

### Why `processId` suffices as template ID

`processId` is already set to the template key (e.g., `'STANDARD_BRAINSTORM'`) in `handleStartProcess`. No separate `templateId` field needed.

## Files Changed

1. **`shared/process.ts`** — Add 4 optional fields to `ProcessState` interface
2. **`server/src/types.ts`** — Mirror the same 4 fields

No client-side changes. Client doesn't use ProcessState directly.

## Testing

- Round-trip test: ProcessState with new fields survives `JSON.stringify`/`JSON.parse`
- Backward compat test: ProcessState without new fields parses without errors
- WorldState round-trip: `toJSON`/`fromJSON` preserves expanded ProcessState

## Out of Scope

- ProcessController serialization (S2)
- NavigationState type (S3)
- BridgeServer save triggers (S4)
- server:info expansion (Tier 2, Ken)
