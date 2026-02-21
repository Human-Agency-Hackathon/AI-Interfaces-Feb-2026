# Hierarchical Dungeon Maps — Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

Replace the current single flat 20×15 tile map with a hierarchical dungeon where the codebase filesystem structure drives the world layout. Each folder is a room, files are interactable objects, and subfolders are doorways leading deeper. Players navigate the dungeon by walking through doors, with a breadcrumb trail marking the way back. Multiple players (human or AI) can explore different parts of the hierarchy simultaneously.

---

## Section 1 — Data Model

### MapTree

A new tree structure lives inside `WorldState`, representing the full filesystem hierarchy of the realm. Each node:

```ts
interface MapNode {
  path: string           // e.g. "src/components"
  name: string           // e.g. "components"
  type: "folder" | "file"
  children: MapNode[]
  map?: GeneratedMap     // null until first visited (lazy generation)
  entryPoints: Map<string, { x: number; y: number }>  // childPath → door tile position
}
```

Maps are generated once on first entry and cached. The tree is fully serializable via `WorldStatePersistence` so realm resume works across sessions.

### Per-Player Navigation Stack

Stored in `AgentSessionManager` per session:

```ts
interface NavigationStack {
  stack: { path: string; returnPosition: { x: number; y: number } }[]
  currentPath: string
  currentPosition: { x: number; y: number }
}
```

Each player has an independent stack — Alice can be in `src/components` while Bob is in `server/src`, both in the same realm, without coupling their state.

---

## Section 2 — Map Generation

Maps are generated lazily on first entry and cached for all subsequent visits.

### Room Sizing

Room dimensions scale with folder contents:

```
N = count of files + subfolders in this folder
width  = clamp(8 + N * 2, 10, 40)
height = clamp(6 + N * 2, 8, 30)
```

A folder with 3 items gets a small chamber; one with 20 items gets a large hall.

### Tile Layout

- **Perimeter:** wall tiles on all edges
- **Floor:** walkable floor tiles fill the interior
- **Entry passage:** one passage tile on the north wall (or the wall facing the parent folder) — this is the breadcrumb exit back to the parent
- **Subfolder doors:** one door tile per subfolder, placed evenly along the remaining walls — walking into a door triggers navigation into that child
- **File objects:** one interactable object (chest, bookshelf, altar) per file, placed on interior floor tiles with clear walking paths

### Aesthetic by Depth

Visual flavor only — no structural difference:

| Depth | Aesthetic |
|-------|-----------|
| 0 (top-level folders) | Stone floor, torchlit — throne room |
| 1 | Wooden planks, dimmer — inner chambers |
| 2+ | Rough cave tiles, dark — deep dungeon |

### Seeded Layout

Each folder's layout uses its path as an RNG seed. The room looks identical every time it is entered — consistent world, not random on re-visit.

### Breadcrumb Tile

The entry passage tile uses a distinct floor variant (glowing rune, worn footprints). A faint dotted line on the floor connects it to the room's center as a visual guide. Walking onto this tile triggers `navigate:back`.

---

## Section 3 — Navigation Protocol & Multiplayer

### New Agent Actions

```ts
{ action: "navigate:enter", params: { door_id: string } }  // enter a subfolder
{ action: "navigate:back" }                                  // return to parent via breadcrumb
```

### New Server → Client Messages

```ts
// Sent to the navigating player after map:change
{
  type: "map:change",
  path: string,           // folder just entered
  map: GeneratedMap,      // tile data, objects, doors
  position: { x, y },    // player spawn position
  breadcrumb: { x, y }   // location of exit tile back to parent
}

// Broadcast to all clients on any player folder change
{
  type: "realm:presence",
  players: [{ id: string, name: string, path: string, depth: number }]
}
```

### Multiplayer Map Sharing

A folder's `GeneratedMap` is shared state — if two players enter the same folder they share the same room and can see each other. The `MapNode.map` is generated once and reused across all sessions. Player positions within a room are tracked independently per session.

### Turn Management

`TurnManager` operates **per room**: only players currently in the same folder participate in the same turn cycle. Players in different folders run independent, concurrent turn cycles. This prevents a global lock across the dungeon and makes the system safe for future human+agent co-play.

### Mini-Map Visibility

Players in different rooms cannot see each other in the main Phaser view. A HUD mini-map (fed by `realm:presence`) shows all players' locations in the hierarchy. No ghost or cross-room visibility in the main viewport.

### Future-Proofing

The design is deliberately minimal to avoid over-engineering:

- `realm:presence` carries `path` and `depth` — sufficient for future proximity chat, shared quest markers per folder, or team-awareness features
- Navigation stacks are per-session — human players and AI agents can coexist in the same room without coupling
- `MapNode.entryPoints` records where each child's door is — sufficient for future "door opens from the other side" animations or two-way portal rendering

---

## Section 4 — Client-Side & Mini-Map

### Map Transition Flow

1. Player walks onto a door tile or breadcrumb tile
2. Client sends `navigate:enter` or `navigate:back`
3. Server responds with `map:change`
4. Client fades screen to black
5. `MapRenderer.loadMap(generatedMap)` tears down the current tilemap and builds the new one
6. Player sprite spawns at `position`; breadcrumb tile rendered at `breadcrumb`
7. Screen fades back in

All existing rendering systems (dialogue, effects, animations, turn UI) operate on "the current map" and require no changes.

### Changes to Existing Files

| File | Change |
|------|--------|
| `server/src/WorldState.ts` | Add `mapTree: MapNode` root; add `getOrGenerateMap(path)` |
| `server/src/MapGenerator.ts` | Add `generateFolderMap(node: MapNode): GeneratedMap` replacing the single flat map |
| `server/src/BridgeServer.ts` | Handle `navigate:enter` and `navigate:back` actions; broadcast `map:change` and `realm:presence` |
| `server/src/AgentSessionManager.ts` | Add `NavigationStack` per session |
| `server/src/TurnManager.ts` | Scope turn cycles to a folder path |
| `client/src/systems/MapRenderer.ts` | Add `loadMap(map: GeneratedMap)` to support dynamic map size and hot-swap |
| `client/src/screens/GameScreen.ts` | Listen for `map:change`, trigger fade transition, call `MapRenderer.loadMap()` |
| `client/src/network/` | Handle `map:change` and `realm:presence` message types |

### New Files

| File | Purpose |
|------|---------|
| `client/src/panels/MiniMap.ts` | DOM overlay panel showing hierarchy tree with player presence dots |

### MiniMap Panel

- DOM overlay (not a Phaser object), consistent with existing `PromptBar` approach
- Renders folder hierarchy as a simple tree of folder name nodes connected by lines
- Each node shows a colored dot per player currently inside it, labeled on hover
- Updates live on every `realm:presence` broadcast
- Collapsible to avoid cluttering the main view

---

## Out of Scope (Not Built Now)

- Two-way door animations (door opens from child side)
- Proximity-based chat between players in adjacent rooms
- Shared quest markers per folder
- File content preview on object interaction (deferred to a future feature)
