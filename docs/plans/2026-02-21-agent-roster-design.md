# Agent Roster Panel — Design

**Date:** 2026-02-21
**Author:** Behrang
**Status:** Approved

## Summary

A compact floating panel in the top-left corner of the game canvas that lists all active agents. Clicking an agent name centers the camera on that agent and opens their existing details panel (history, findings, insights, actions).

## Architecture

One new file: `client/src/panels/AgentRoster.ts`. Follows the same DOM-overlay panel pattern as `QuestLog.ts` and `AgentDetailsPanel.ts`.

- Instantiated in `UIScene.ts` alongside other panels
- No changes to `GameScene`, server, or protocol types
- No new WebSocket message types

## DOM Structure & Visual Style

```
position: fixed; top: 8px; left: 8px; z-index: 100
width: ~160px (mirrors minimap width)
background: semi-transparent dark (matches minimap aesthetic)
max-height: uncapped, overflow-y: auto (scrollable)
```

Each agent entry:
- 12px colored circle (agent's hex color)
- Agent name in monospace white text
- Hover: semi-transparent white background
- Pointer cursor

## Data Flow & State

`AgentRoster` holds a `Map<string, AgentInfo>` updated by UIScene from existing message handlers:

| Event | Action |
|-------|--------|
| `world:state` (initial) | `addAgent` for each agent in `agents[]` |
| `agent:joined` | `addAgent` |
| `agent:left` | `removeAgent` |
| `world:state` (updates) | `updateAgent` — refreshes stored `x`/`y` |

Only the affected entry re-renders on updates (not full list).

## Click Behavior

Clicking an agent name fires two actions (same as clicking a sprite):

1. **Camera pan** — fires event with `agent_id`; UIScene/GameScene calls `CameraController.panTo(agent.x, agent.y)`
2. **Show details** — fires existing `show-agent-details` Phaser event with `AgentInfo`, triggering the server fetch + `AgentDetailsPanel` population flow already in place

No changes to `AgentDetailsPanel` or camera internals.

## Files Affected

| File | Change |
|------|--------|
| `client/src/panels/AgentRoster.ts` | **New** — panel class |
| `client/src/scenes/UIScene.ts` | Instantiate roster; wire `addAgent`/`removeAgent`/`updateAgent` from existing handlers |
| `client/index.html` | No change needed (panel creates its own DOM element) |
