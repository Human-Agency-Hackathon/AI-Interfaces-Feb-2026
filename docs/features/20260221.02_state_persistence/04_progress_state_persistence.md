# Progress: State Persistence Across Refresh and Restart

## Task Tracker

### Tier 1: Server-Side Persistence (@Behrang)

| Task | Description | Status | Notes |
|------|------------|--------|-------|
| S1 | Expand ProcessState type in shared/protocol.ts | TODO | Add problemStatement, templateId, stageTurnCounts, agentTurnCounts, stageStartedAt. Add NavigationState. Expand server:info. |
| S2 | ProcessController.toJSON / fromJSON | TODO | Blocked by S1 |
| S3 | WorldState expanded serialization | TODO | Blocked by S1 |
| S4 | Debounced save triggers in BridgeServer | TODO | Blocked by S3 |
| S5 | Process-aware resume in handleResumeRealm | TODO | Blocked by S2 + S3 |
| S6 | Graceful shutdown in index.ts | TODO | Blocked by S4 |
| S7 | Auto-load last realm on startup | TODO | Blocked by S5 |

### Tier 2: Client-Side Persistence (@Behrang — reassigned from Ken)

| Task | Description | Status | Notes |
|------|------------|--------|-------|
| C1 | localStorage identity + realm | TODO | Independent. Reassigned to Behrang (Ken moved to map work). |
| C2 | Expand server:info with gamePhase | TODO | Server side: Behrang (part of S1). Client side: also Behrang now. |
| C3 | Auto-resume on refresh in main.ts | TODO | Blocked by C1 + C2 |

### Tier 3: Robustness (@Pratham)

| Task | Description | Status | Notes |
|------|------------|--------|-------|
| R1 | Periodic KnowledgeVault saves | TODO | Independent |
| R2 | Settings persistence | TODO | Independent |

## Notes

- Feature brief: `01_brief_state_persistence.md`
- Architecture: `02_architecture_state_persistence.md`
- Plan: `03_plan_state_persistence.md`
