# Agent Skills Section in Details Panel

**Date:** 2026-02-21
**Owner:** Behrang

## Summary

Add a "Skills" collapsible section to the AgentDetailsPanel, placed immediately after the header (before Findings, Insights, Actions, Thoughts). The section has two sub-sections:

1. **Expertise** — horizontal progress bars showing `expertise: Record<string, number>` from KnowledgeVault
2. **Tools** — list of MCP tools the agent has access to

## Protocol Change

Extend `AgentDetailsMessage` in `shared/protocol.ts`:

```typescript
export interface AgentDetailsMessage {
  type: 'agent:details';
  agent_id: string;
  info: AgentInfo;
  knowledge: {
    expertise: Record<string, number>;
    insights: string[];
    task_history: Array<{ task: string; outcome: string; timestamp: string }>;
  };
  findings: Array<{
    id: string;
    finding: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
  }>;
  transcript: {
    thoughts: Array<{ text: string; timestamp: string }>;
    actions: Array<{ tool: string; input: string; timestamp: string }>;
  };
  tools: string[];  // NEW: MCP tool names available to this agent
}
```

Mirror to `server/src/types.ts` and `client/src/types.ts`.

## Server Change

In `BridgeServer.handleGetAgentDetails()`, determine tool set:

```typescript
// Derive tool list from agent's MCP server type
const session = this.sessionManager?.getSession(agentId);
const hasBrainstormTools = session?.processContext != null;
const tools = hasBrainstormTools
  ? ['PostFindings', 'UpdateKnowledge', 'CompleteStage']
  : ['SummonAgent', 'RequestHelp', 'PostFindings', 'UpdateKnowledge', 'ClaimQuest', 'CompleteQuest'];
```

If session lookup isn't available, fall back to checking `agentInfo.role` or return an empty array.

## Client Rendering

### Section placement

Skills section renders first in `populateData()`, before Findings.

### Expertise sub-section

Uses a custom `addExpertiseSection()` method (not the generic `addSection()`):

```
Skills
─────────────────────────
  Expertise
  API Design    [████████░░]  8
  Testing       [█████░░░░░]  5
  Debugging     [███░░░░░░░]  3

  Tools
  > PostFindings
  > UpdateKnowledge
  > CompleteStage
```

- Each expertise entry: label (left-aligned), progress bar (middle), numeric level (right)
- Bar fill width = `(level / maxLevel) * 100%` where maxLevel is the highest level in the set
- Sorted descending by level
- If no expertise yet: show "No expertise yet" in muted text

### Tools sub-section

- Simple list, each tool name on its own line
- Gold-colored `>` prefix glyph
- If no tools: show "No tools assigned"

## Styling

New CSS classes (added to `index.html` in the existing agent-details styles):

- `.agent-details-expertise-row` — flexbox row: label, bar container, level number
- `.agent-details-bar-container` — `height: 8px; background: #1a1a2e; border-radius: 4px; flex: 1`
- `.agent-details-bar-fill` — `height: 100%; background: #c45a20; border-radius: 4px; transition: width 0.3s`
- `.agent-details-tool-item` — tool list item with gold prefix

Font: `DM Mono` at 11px for bar labels and tool names, consistent with existing panel text.

## Files Changed

1. `shared/protocol.ts` — add `tools: string[]` to `AgentDetailsMessage`
2. `server/src/types.ts` — mirror
3. `client/src/types.ts` — mirror
4. `server/src/BridgeServer.ts` — populate `tools` in `handleGetAgentDetails()`
5. `client/src/panels/AgentDetailsPanel.ts` — add `addSkillsSection()` method, call it first in `populateData()`
6. `client/index.html` — add CSS for expertise bars and tool items
7. Server test for the new `tools` field in the details response
