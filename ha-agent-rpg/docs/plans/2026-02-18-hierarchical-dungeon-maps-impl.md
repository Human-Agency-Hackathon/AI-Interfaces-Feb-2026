# Hierarchical Dungeon Maps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat codebase map with a hierarchy of rooms — each folder is its own dungeon room, files are interactable objects, and subfolder doors lead deeper, with a breadcrumb tile to return to the parent.

**Architecture:** A `MapTree` stored in `WorldState` holds all folder nodes lazily. The server detects when an agent moves onto a navigation object and automatically generates the child/parent map, sending `map:change` only to that agent's socket. All clients receive `realm:presence` showing where every agent is in the hierarchy, feeding the MiniMap HUD.

**Tech Stack:** TypeScript, Phaser 3, WebSocket (`ws`), Vitest, DOM (for MiniMap overlay)

**Design doc:** `docs/plans/2026-02-18-hierarchical-dungeon-maps-design.md`

---

## Task 1: Protocol Types

**Files:**
- Modify: `shared/protocol.ts`
- Modify: `server/src/types.ts` (mirror of shared/protocol.ts — keep in sync)

**Step 1: Write the failing test**

Create `server/src/__tests__/protocol-types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { MapNode, MapChangeMessage, RealmPresenceMessage } from '../types.js';

describe('Hierarchical map protocol types', () => {
  it('MapNode has required shape', () => {
    const node: MapNode = {
      path: 'src',
      name: 'src',
      type: 'folder',
      children: [],
      doorPositions: {},
    };
    expectTypeOf(node).toMatchTypeOf<MapNode>();
  });

  it('MapChangeMessage has required shape', () => {
    const msg: MapChangeMessage = {
      type: 'map:change',
      path: 'src',
      map: { width: 10, height: 8, tile_size: 32, tiles: [] },
      objects: [],
      position: { x: 5, y: 5 },
      breadcrumb: { x: 5, y: 1 },
    };
    expectTypeOf(msg).toMatchTypeOf<MapChangeMessage>();
  });

  it('RealmPresenceMessage has required shape', () => {
    const msg: RealmPresenceMessage = {
      type: 'realm:presence',
      players: [{ id: 'a1', name: 'Oracle', path: 'src', depth: 1 }],
    };
    expectTypeOf(msg).toMatchTypeOf<RealmPresenceMessage>();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /path/to/repo && npx vitest run server/src/__tests__/protocol-types.test.ts
```

Expected: FAIL — `MapNode`, `MapChangeMessage`, `RealmPresenceMessage` not found.

**Step 3: Add types to `shared/protocol.ts`**

After the `MapObject` interface (around line 56), add:

```typescript
// ── Hierarchical map types ──

export interface MapNode {
  path: string                                    // e.g. "src/components"
  name: string                                    // e.g. "components"
  type: 'folder' | 'file'
  children: MapNode[]
  map?: TileMapData                               // undefined until first visited
  objects?: MapObject[]                           // objects for this folder's map
  doorPositions: Record<string, { x: number; y: number }>  // childPath → door tile
  entryPosition?: { x: number; y: number }       // breadcrumb tile position
}

export interface NavigationFrame {
  path: string
  returnPosition: { x: number; y: number }
}
```

After `RealmRemovedMessage`, add:

```typescript
// ── Messages: Server → Client (Navigation) ──

export interface MapChangeMessage {
  type: 'map:change'
  path: string
  map: TileMapData
  objects: MapObject[]
  position: { x: number; y: number }
  breadcrumb: { x: number; y: number }
}

export interface RealmPresenceMessage {
  type: 'realm:presence'
  players: Array<{ id: string; name: string; path: string; depth: number }>
}

export interface RealmTreeMessage {
  type: 'realm:tree'
  root: Omit<MapNode, 'map' | 'objects'>         // structure only, no tile data
}
```

Update the `ServerMessage` union type:

```typescript
export type ServerMessage =
  | WorldStateMessage
  | ActionResultMessage
  | AgentJoinedMessage
  | AgentLeftMessage
  | RepoReadyMessage
  | QuestUpdateMessage
  | AgentThoughtMessage
  | AgentActivityMessage
  | SpawnRequestMessage
  | FindingsPostedMessage
  | KnowledgeLevelUpMessage
  | RealmListMessage
  | RealmRemovedMessage
  | MapChangeMessage          // new
  | RealmPresenceMessage      // new
  | RealmTreeMessage          // new
  | ErrorMessage;
```

Update `MapObject['type']` to include nav types:

```typescript
export interface MapObject {
  id: string
  type: 'file' | 'config' | 'doc' | 'quest_marker' | 'sign' | 'nav_door' | 'nav_back'
  x: number
  y: number
  label: string
  metadata: Record<string, unknown>
}
```

Copy all changes to `server/src/types.ts` (identical content to `shared/protocol.ts`).

**Step 4: Run test to verify it passes**

```bash
npx vitest run server/src/__tests__/protocol-types.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add shared/protocol.ts server/src/types.ts server/src/__tests__/protocol-types.test.ts
git commit -m "feat: add hierarchical map protocol types (MapNode, MapChangeMessage, RealmPresenceMessage)"
```

---

## Task 2: MapGenerator — buildMapTree() and generateFolderMap()

**Files:**
- Modify: `server/src/MapGenerator.ts`
- Modify: `server/src/__tests__/MapGenerator.test.ts`

**Step 1: Write the failing tests**

Add to `server/src/__tests__/MapGenerator.test.ts`:

```typescript
import type { MapNode } from '../types.js';

describe('buildMapTree()', () => {
  const generator = new MapGenerator();

  it('returns a root node with path ""', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    expect(tree.path).toBe('');
    expect(tree.name).toBe('');
    expect(tree.type).toBe('folder');
  });

  it('makes top-level folders direct children of root', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const names = tree.children.map(c => c.name);
    expect(names).toContain('src');
    expect(names).toContain('docs');
  });

  it('nests files under their parent folder', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const src = tree.children.find(c => c.name === 'src')!;
    const fileNames = src.children.map(c => c.name);
    expect(fileNames).toContain('index.ts');
    expect(fileNames).toContain('utils.ts');
  });

  it('marks files with type "file"', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const src = tree.children.find(c => c.name === 'src')!;
    const indexTs = src.children.find(c => c.name === 'index.ts')!;
    expect(indexTs.type).toBe('file');
    expect(indexTs.children).toHaveLength(0);
  });

  it('places root-level files as children of root', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const rootFiles = tree.children.filter(c => c.type === 'file');
    const labels = rootFiles.map(c => c.name);
    expect(labels).toContain('package.json');
  });
});

describe('generateFolderMap()', () => {
  const generator = new MapGenerator();

  function makeNode(name: string, children: Partial<MapNode>[] = []): MapNode {
    return {
      path: name,
      name,
      type: 'folder',
      children: children.map(c => ({
        path: `${name}/${c.name}`,
        name: c.name ?? 'child',
        type: c.type ?? 'folder',
        children: [],
        doorPositions: {},
        ...c,
      })),
      doorPositions: {},
    };
  }

  it('returns a map, objects, entryPosition, and doorPositions', () => {
    const node = makeNode('src', [{ name: 'utils', type: 'folder' }]);
    const result = generator.generateFolderMap(node, 1);
    expect(result.map).toBeDefined();
    expect(result.objects).toBeDefined();
    expect(result.entryPosition).toBeDefined();
    expect(result.doorPositions).toBeDefined();
  });

  it('generates a nav_back object at the entry position', () => {
    const node = makeNode('src');
    const { objects, entryPosition } = generator.generateFolderMap(node, 1);
    const back = objects.find(o => o.type === 'nav_back');
    expect(back).toBeDefined();
    expect(back!.x).toBe(entryPosition.x);
    expect(back!.y).toBe(entryPosition.y);
  });

  it('generates a nav_door object per subfolder child', () => {
    const node = makeNode('src', [
      { name: 'components', type: 'folder' },
      { name: 'utils', type: 'folder' },
    ]);
    const { objects } = generator.generateFolderMap(node, 1);
    const doors = objects.filter(o => o.type === 'nav_door');
    expect(doors).toHaveLength(2);
  });

  it('nav_door metadata includes the targetPath', () => {
    const node = makeNode('src', [{ name: 'components', type: 'folder' }]);
    const { objects } = generator.generateFolderMap(node, 1);
    const door = objects.find(o => o.type === 'nav_door')!;
    expect(door.metadata.targetPath).toBe('src/components');
  });

  it('generates a file object per file child', () => {
    const node = makeNode('src', [
      { name: 'index.ts', type: 'file' },
      { name: 'utils.ts', type: 'file' },
    ]);
    const { objects } = generator.generateFolderMap(node, 1);
    const files = objects.filter(o => o.type === 'file');
    expect(files).toHaveLength(2);
  });

  it('scales map size with child count', () => {
    const small = makeNode('a', [{ name: 'b', type: 'folder' }]);
    const large = makeNode('a', Array.from({ length: 12 }, (_, i) => ({
      name: `child${i}`,
      type: 'folder' as const,
    })));
    const smallMap = generator.generateFolderMap(small, 1).map;
    const largeMap = generator.generateFolderMap(large, 1).map;
    expect(largeMap.width).toBeGreaterThan(smallMap.width);
  });

  it('produces consistent output for the same path (seeded)', () => {
    const node = makeNode('src', [{ name: 'utils', type: 'folder' }]);
    const r1 = generator.generateFolderMap(node, 1);
    const r2 = generator.generateFolderMap(node, 1);
    expect(r1.map.tiles).toEqual(r2.map.tiles);
    expect(r1.entryPosition).toEqual(r2.entryPosition);
  });

  it('produces different layouts for different paths', () => {
    const a = makeNode('aaa', [{ name: 'x', type: 'folder' }]);
    const b = makeNode('zzz', [{ name: 'x', type: 'folder' }]);
    const ra = generator.generateFolderMap(a, 1);
    const rb = generator.generateFolderMap(b, 1);
    const samePositions =
      ra.entryPosition.x === rb.entryPosition.x &&
      ra.entryPosition.y === rb.entryPosition.y;
    expect(samePositions).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run server/src/__tests__/MapGenerator.test.ts
```

Expected: FAIL — `buildMapTree` and `generateFolderMap` not defined.

**Step 3: Add seeded RNG helpers to `server/src/MapGenerator.ts`**

Add near the top of the file after the existing constants:

```typescript
// Seeded RNG (mulberry32) — same seed always produces same layout
function seededRNG(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pathToSeed(path: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}
```

**Step 4: Add `buildMapTree()` to the `MapGenerator` class**

```typescript
buildMapTree(tree: Array<{ path: string; type: string; size?: number }>): MapNode {
  const root: MapNode = {
    path: '',
    name: '',
    type: 'folder',
    children: [],
    doorPositions: {},
  };

  for (const entry of tree) {
    const parts = entry.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = {
          path: currentPath,
          name: part,
          type: isLast && entry.type === 'blob' ? 'file' : 'folder',
          children: [],
          doorPositions: {},
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  return root;
}
```

**Step 5: Add `generateFolderMap()` to the `MapGenerator` class**

```typescript
generateFolderMap(
  node: MapNode,
  depth: number,
): {
  map: TileMapData;
  objects: MapObject[];
  entryPosition: { x: number; y: number };
  doorPositions: Record<string, { x: number; y: number }>;
} {
  const rng = seededRNG(pathToSeed(node.path || '__root__'));

  const folderChildren = node.children.filter(c => c.type === 'folder');
  const fileChildren = node.children.filter(c => c.type === 'file');
  const N = node.children.length;

  // Room size scales with child count
  const width = Math.min(Math.max(12 + N * 3, 12), 40);
  const height = Math.min(Math.max(10 + N * 2, 10), 30);

  // Build blank grid (all walls)
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL),
  );

  // Carve floor interior
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const objects: MapObject[] = [];
  const doorPositions: Record<string, { x: number; y: number }> = {};

  // Entry/breadcrumb: top wall, horizontally centered
  const entryX = Math.floor(width / 2);
  tiles[0][entryX] = DOOR;
  const entryPosition = { x: entryX, y: 1 };  // player spawns one row inside

  objects.push({
    id: `nav_back_${node.path || 'root'}`,
    type: 'nav_back',
    x: entryPosition.x,
    y: entryPosition.y,
    label: '← Back',
    metadata: {},
  });

  // Subfolder doors: evenly spaced along the bottom wall
  if (folderChildren.length > 0) {
    const spacing = Math.floor((width - 2) / (folderChildren.length + 1));
    folderChildren.forEach((child, i) => {
      const dx = 1 + spacing * (i + 1);
      const dy = height - 1;
      tiles[dy][dx] = DOOR;
      const doorPos = { x: dx, y: dy - 1 };
      doorPositions[child.path] = doorPos;

      objects.push({
        id: `nav_door_${child.path.replace(/\//g, '_')}`,
        type: 'nav_door',
        x: doorPos.x,
        y: doorPos.y,
        label: child.name,
        metadata: { targetPath: child.path },
      });
    });
  }

  // File objects: random interior positions, no overlaps
  const occupied = new Set<string>();
  occupied.add(`${entryPosition.x},${entryPosition.y}`);
  Object.values(doorPositions).forEach(p => occupied.add(`${p.x},${p.y}`));

  fileChildren.forEach((child) => {
    let fx: number, fy: number, key: string;
    let attempts = 0;
    do {
      fx = 1 + Math.floor(rng() * (width - 2));
      fy = 2 + Math.floor(rng() * Math.max(height - 4, 1));
      key = `${fx},${fy}`;
      attempts++;
    } while (occupied.has(key) && attempts < 100);

    if (attempts < 100) {
      occupied.add(key);
      objects.push({
        id: `file_${child.path.replace(/\//g, '_')}`,
        type: this.classifyFile(child.path) as MapObject['type'],
        x: fx,
        y: fy,
        label: child.name,
        metadata: { fullPath: child.path },
      });
    }
  });

  return {
    map: { width, height, tile_size: TILE_SIZE, tiles },
    objects,
    entryPosition,
    doorPositions,
  };
}
```

Note: `WALL`, `FLOOR`, `DOOR`, `TILE_SIZE` are existing constants in the file. Check their exact names and use them.

**Step 6: Run tests to verify they pass**

```bash
npx vitest run server/src/__tests__/MapGenerator.test.ts
```

Expected: All new tests PASS; all original tests still PASS.

**Step 7: Commit**

```bash
git add server/src/MapGenerator.ts server/src/__tests__/MapGenerator.test.ts
git commit -m "feat: add MapGenerator.buildMapTree() and generateFolderMap() for hierarchical dungeon rooms"
```

---

## Task 3: WorldState — MapTree Storage

**Files:**
- Modify: `server/src/WorldState.ts`
- Modify: `server/src/__tests__/WorldState.test.ts`

**Step 1: Write the failing tests**

Add to `server/src/__tests__/WorldState.test.ts`:

```typescript
import type { MapNode } from '../types.js';

function makeMapNode(path: string, children: MapNode[] = []): MapNode {
  return { path, name: path.split('/').pop() ?? path, type: 'folder', children, doorPositions: {} };
}

describe('MapTree', () => {
  it('starts with no mapTree', () => {
    const ws = new WorldState();
    expect(ws.mapTree).toBeNull();
  });

  it('setMapTree() stores the root node', () => {
    const ws = new WorldState();
    const root = makeMapNode('');
    ws.setMapTree(root);
    expect(ws.mapTree).toBe(root);
  });

  it('getMapNode() returns the root for empty path', () => {
    const ws = new WorldState();
    ws.setMapTree(makeMapNode('', [makeMapNode('src')]));
    expect(ws.getMapNode('')).toBe(ws.mapTree);
  });

  it('getMapNode() finds a nested node by path', () => {
    const utils = makeMapNode('src/utils');
    const src = makeMapNode('src', [utils]);
    const ws = new WorldState();
    ws.setMapTree(makeMapNode('', [src]));
    expect(ws.getMapNode('src/utils')).toBe(utils);
  });

  it('getMapNode() returns null for unknown path', () => {
    const ws = new WorldState();
    ws.setMapTree(makeMapNode(''));
    expect(ws.getMapNode('nonexistent')).toBeNull();
  });

  it('toJSON()/fromJSON() round-trips the mapTree', () => {
    const ws = new WorldState();
    ws.setMapTree(makeMapNode('', [makeMapNode('src')]));
    const ws2 = WorldState.fromJSON(ws.toJSON());
    expect(ws2.mapTree).not.toBeNull();
    expect(ws2.mapTree!.children[0].name).toBe('src');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run server/src/__tests__/WorldState.test.ts
```

Expected: FAIL — `mapTree`, `setMapTree`, `getMapNode` not defined.

**Step 3: Implement in `server/src/WorldState.ts`**

Add as a class property:

```typescript
mapTree: MapNode | null = null;
```

Add these methods:

```typescript
setMapTree(root: MapNode): void {
  this.mapTree = root;
}

getMapNode(path: string): MapNode | null {
  if (!this.mapTree) return null;
  if (path === '') return this.mapTree;

  const parts = path.split('/');
  let current: MapNode = this.mapTree;
  for (const part of parts) {
    const child = current.children.find(c => c.name === part);
    if (!child) return null;
    current = child;
  }
  return current;
}
```

Update `toJSON()` to include `mapTree`:

```typescript
toJSON() {
  return {
    // ... existing fields ...
    mapTree: this.mapTree ?? null,
  };
}
```

Update `fromJSON()` to restore `mapTree`:

```typescript
static fromJSON(data: ReturnType<WorldState['toJSON']>): WorldState {
  const ws = new WorldState();
  // ... existing restoration ...
  if (data.mapTree) ws.setMapTree(data.mapTree as MapNode);
  return ws;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run server/src/__tests__/WorldState.test.ts
```

Expected: PASS (all tests including existing ones).

**Step 5: Commit**

```bash
git add server/src/WorldState.ts server/src/__tests__/WorldState.test.ts
git commit -m "feat: add MapTree storage to WorldState (setMapTree, getMapNode, serialization)"
```

---

## Task 4: BridgeServer — MapTree Initialization & Agent Socket Tracking

**Files:**
- Modify: `server/src/BridgeServer.ts`

**Step 1: Add tracking properties**

In the class body, add:

```typescript
private agentSockets = new Map<string, WebSocket>();           // agentId → socket
private agentNavStacks = new Map<string, NavigationFrame[]>(); // agentId → nav stack
private agentCurrentPath = new Map<string, string>();          // agentId → current path
```

**Step 2: Track socket in `handleAgentRegister`**

In `handleAgentRegister(ws, msg)`, after `this.worldState.addAgent(...)`:

```typescript
this.agentSockets.set(agentId, ws);
this.agentNavStacks.set(agentId, []);
this.agentCurrentPath.set(agentId, '');
```

In the dismiss/leave handler, add cleanup:

```typescript
this.agentSockets.delete(agentId);
this.agentNavStacks.delete(agentId);
this.agentCurrentPath.delete(agentId);
```

**Step 3: Build and store MapTree in `handleLinkRepo`**

In `handleLinkRepo`, after `MapGenerator.generate()` and before broadcasting `repo:ready`:

```typescript
// Build hierarchical map tree
const mapTree = this.mapGenerator.buildMapTree(repoData.tree);
this.worldState.setMapTree(mapTree);

// Generate the root-level room (top-level folders as doors)
const rootNode = this.worldState.getMapNode('')!;
const hierarchicalRoot = this.mapGenerator.generateFolderMap(rootNode, 0);
this.worldState.setMap(hierarchicalRoot.map);
this.worldState.setObjects(hierarchicalRoot.objects);
```

After broadcasting `repo:ready`, also broadcast the tree structure:

```typescript
this.broadcast({
  type: 'realm:tree',
  root: this.stripMapData(mapTree),
});
```

Add the `stripMapData` private helper:

```typescript
private stripMapData(node: MapNode): Omit<MapNode, 'map' | 'objects'> {
  const { map: _m, objects: _o, ...rest } = node;
  return { ...rest, children: rest.children.map(c => this.stripMapData(c)) };
}
```

Do the same in `handleResumeRealm` — send `realm:tree` after restoring world state.

**Step 4: Add presence broadcast helper**

```typescript
private broadcastPresence(): void {
  const players = Array.from(this.agentCurrentPath.entries()).map(([id, path]) => {
    const agent = this.worldState.agents.get(id);
    return {
      id,
      name: agent?.name ?? id,
      path,
      depth: path === '' ? 0 : path.split('/').length,
    };
  });
  this.broadcast({ type: 'realm:presence', players });
}
```

**Step 5: Run existing tests**

```bash
npx vitest run server/src/__tests__/BridgeServer.e2e.test.ts
```

Expected: All existing tests PASS.

**Step 6: Commit**

```bash
git add server/src/BridgeServer.ts
git commit -m "feat: wire MapTree initialization and agent socket tracking into BridgeServer"
```

---

## Task 5: BridgeServer — Navigation on Move

**Files:**
- Modify: `server/src/BridgeServer.ts`

**Step 1: Add nav object lookup helper**

```typescript
private getNavObjectAt(x: number, y: number): MapObject | undefined {
  return this.worldState.getObjects().find(
    o => o.x === x && o.y === y && (o.type === 'nav_door' || o.type === 'nav_back'),
  );
}
```

**Step 2: Add `handleNavigateEnter`**

```typescript
private handleNavigateEnter(agentId: string, targetPath: string): void {
  const ws = this.agentSockets.get(agentId);
  const agent = this.worldState.agents.get(agentId);
  if (!ws || !agent) return;

  let node = this.worldState.getMapNode(targetPath);
  if (!node) return;

  // Push current location onto stack
  const currentPath = this.agentCurrentPath.get(agentId) ?? '';
  const stack = this.agentNavStacks.get(agentId) ?? [];
  stack.push({ path: currentPath, returnPosition: { x: agent.x, y: agent.y } });
  this.agentNavStacks.set(agentId, stack);

  // Generate map if not yet cached
  if (!node.map) {
    const depth = targetPath.split('/').length;
    const result = this.mapGenerator.generateFolderMap(node, depth);
    node.map = result.map;
    node.objects = result.objects;
    node.entryPosition = result.entryPosition;
    node.doorPositions = result.doorPositions;
  }

  // Update agent tracking
  this.agentCurrentPath.set(agentId, targetPath);
  const spawnPos = node.entryPosition ?? { x: Math.floor(node.map.width / 2), y: 2 };
  this.worldState.applyMove(agentId, spawnPos.x, spawnPos.y);

  // Send map:change to this socket only
  this.send(ws, {
    type: 'map:change',
    path: targetPath,
    map: node.map,
    objects: node.objects ?? [],
    position: spawnPos,
    breadcrumb: spawnPos,
  });

  this.broadcastPresence();
}
```

**Step 3: Add `handleNavigateBack`**

```typescript
private handleNavigateBack(agentId: string): void {
  const ws = this.agentSockets.get(agentId);
  if (!ws) return;

  const stack = this.agentNavStacks.get(agentId) ?? [];
  if (stack.length === 0) return;  // already at root

  const frame = stack.pop()!;
  this.agentNavStacks.set(agentId, stack);
  this.agentCurrentPath.set(agentId, frame.path);

  const node = this.worldState.getMapNode(frame.path);
  if (!node?.map) return;

  this.worldState.applyMove(agentId, frame.returnPosition.x, frame.returnPosition.y);

  this.send(ws, {
    type: 'map:change',
    path: frame.path,
    map: node.map,
    objects: node.objects ?? [],
    position: frame.returnPosition,
    breadcrumb: node.entryPosition ?? { x: Math.floor(node.map.width / 2), y: 1 },
  });

  this.broadcastPresence();
}
```

**Step 4: Hook into `broadcastRPGEvent` move handler**

In the `move_to_file` case, after `this.worldState.applyMove(agentId, obj.x, obj.y)`:

```typescript
// Navigation trigger: check if new position has a nav object
const navObj = this.getNavObjectAt(obj.x, obj.y);
if (navObj) {
  if (navObj.type === 'nav_door') {
    const targetPath = navObj.metadata.targetPath as string;
    this.handleNavigateEnter(agentId, targetPath);
    return;  // map:change replaces the normal action:result broadcast
  } else if (navObj.type === 'nav_back') {
    this.handleNavigateBack(agentId);
    return;
  }
}
```

**Step 5: Run all server tests**

```bash
npx vitest run server/src/__tests__/
```

Expected: All PASS.

**Step 6: Commit**

```bash
git add server/src/BridgeServer.ts
git commit -m "feat: auto-navigate on nav_door/nav_back move — send map:change to agent socket, broadcast realm:presence"
```

---

## Task 6: Client — MapRenderer.loadMap()

**Files:**
- Modify: `client/src/systems/MapRenderer.ts`

**Step 1: Add tile image tracking**

Add a private property to `MapRenderer`:

```typescript
private tileImages: Phaser.GameObjects.Image[] = [];
```

In the existing `render()` method, after `this.scene.add.image(...)`, store each image:

```typescript
const img = this.scene.add.image(px, py, key).setOrigin(0, 0);
this.tileImages.push(img);
// (remove any existing line that uses the returned image without storing it)
```

**Step 2: Add `loadMap()` method**

```typescript
loadMap(mapData: TileMapData): void {
  // Destroy existing tile images
  for (const img of this.tileImages) {
    img.destroy();
  }
  this.tileImages = [];

  // Stop water animation
  for (const w of this.waterTiles) {
    w.destroy();
  }
  this.waterTiles = [];

  // Replace map data and re-render
  this.mapData = mapData;
  this.render();
}
```

**Step 3: Verify existing render() still works**

```bash
npx tsc --noEmit -p client/tsconfig.json
```

Expected: No errors.

**Step 4: Commit**

```bash
git add client/src/systems/MapRenderer.ts
git commit -m "feat: add MapRenderer.loadMap() for dynamic map hot-swap on navigation"
```

---

## Task 7: Client — GameScene Navigation Handlers

**Files:**
- Modify: `client/src/scenes/GameScene.ts`

**Step 1: Import new message types**

Add to the imports at the top of `GameScene.ts`:

```typescript
import type { MapChangeMessage, RealmPresenceMessage, RealmTreeMessage } from '../types.js';
```

(Adjust the import path to wherever client types live.)

**Step 2: Add `map:change` handler in `create()`**

Alongside the existing `wsClient.on(...)` handlers:

```typescript
wsClient.on('map:change', (msg: MapChangeMessage) => {
  this.cameras.main.fadeOut(300, 0, 0, 0);

  this.cameras.main.once('camerafadeoutcomplete', () => {
    // Destroy existing map object sprites
    this.mapObjectSprites.forEach(s => s.destroy());
    this.mapObjectSprites = [];

    // Swap the map
    if (this.mapRenderer) {
      this.mapRenderer.loadMap(msg.map);
    }

    // Create sprites for non-navigation objects
    for (const obj of msg.objects) {
      if (obj.type !== 'nav_door' && obj.type !== 'nav_back') {
        this.mapObjectSprites.push(new MapObjectSprite(this, obj));
      }
    }

    // Fade back in
    this.cameras.main.fadeIn(300, 0, 0, 0);
  });
});
```

**Step 3: Add `realm:presence` and `realm:tree` handlers**

```typescript
wsClient.on('realm:presence', (msg: RealmPresenceMessage) => {
  this.events.emit('realm-presence', msg.players);
});

wsClient.on('realm:tree', (msg: RealmTreeMessage) => {
  this.events.emit('realm-tree', msg.root);
});
```

**Step 4: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p client/tsconfig.json
```

Expected: No errors.

**Step 5: Commit**

```bash
git add client/src/scenes/GameScene.ts
git commit -m "feat: handle map:change (fade transition), realm:presence, realm:tree in GameScene"
```

---

## Task 8: Client — MiniMap DOM Panel

**Files:**
- Create: `client/src/panels/MiniMap.ts`
- Modify: `client/src/screens/GameScreen.ts` (or wherever panels are mounted — check existing panel setup)

**Step 1: Create `client/src/panels/MiniMap.ts`**

```typescript
import type { MapNode } from '../types.js';

export interface PlayerPresence {
  id: string;
  name: string;
  path: string;
  depth: number;
}

export class MiniMap {
  private container: HTMLDivElement;
  private treeRoot: Omit<MapNode, 'map' | 'objects'> | null = null;
  private players: PlayerPresence[] = [];

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: '200px',
      maxHeight: '300px',
      overflowY: 'auto',
      background: 'rgba(0,0,0,0.75)',
      border: '1px solid #444',
      borderRadius: '6px',
      padding: '8px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ccc',
      zIndex: '100',
    });
    parentEl.appendChild(this.container);
  }

  setTree(root: Omit<MapNode, 'map' | 'objects'>): void {
    this.treeRoot = root;
    this.render();
  }

  updatePresence(players: PlayerPresence[]): void {
    this.players = players;
    this.render();
  }

  private render(): void {
    if (!this.treeRoot) return;

    // Clear existing children via DOM (no innerHTML)
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const title = document.createElement('div');
    title.textContent = 'Map';
    Object.assign(title.style, { fontWeight: 'bold', marginBottom: '6px', color: '#fff' });
    this.container.appendChild(title);

    this.renderNode(this.treeRoot, this.container, 0);
  }

  private renderNode(
    node: Omit<MapNode, 'map' | 'objects'>,
    parent: HTMLElement,
    depth: number,
  ): void {
    const playersHere = this.players.filter(p => p.path === node.path);

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '2px 0',
      paddingLeft: `${depth * 12}px`,
    });

    const label = document.createElement('span');
    label.textContent = node.name || '(root)';
    label.style.color = node.type === 'folder' ? '#8ab4f8' : '#aaa';
    row.appendChild(label);

    if (playersHere.length > 0) {
      const dots = document.createElement('span');
      dots.style.marginLeft = '6px';
      dots.style.color = '#f4c542';
      dots.title = playersHere.map(p => p.name).join(', ');
      playersHere.forEach(() => {
        const dot = document.createTextNode('●');
        dots.appendChild(dot);
      });
      row.appendChild(dots);
    }

    parent.appendChild(row);

    // Only show folder children (skip files to keep compact)
    for (const child of node.children.filter(c => c.type === 'folder')) {
      this.renderNode(child, parent, depth + 1);
    }
  }

  destroy(): void {
    this.container.remove();
  }
}
```

**Step 2: Mount MiniMap in GameScreen**

Open `client/src/screens/GameScreen.ts`. Read the file to find where panels are mounted and where the GameScene's event system is accessible.

Add:

```typescript
import { MiniMap } from '../panels/MiniMap.js';

// After mounting the game canvas (in init or create):
const miniMap = new MiniMap(document.body);

// Wire to GameScene events
gameScene.events.on('realm-tree', (root: any) => miniMap.setTree(root));
gameScene.events.on('realm-presence', (players: any[]) => miniMap.updatePresence(players));
```

Add cleanup when the screen is torn down:

```typescript
miniMap.destroy();
```

**Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p client/tsconfig.json
```

Expected: No errors.

**Step 4: Commit**

```bash
git add client/src/panels/MiniMap.ts client/src/screens/GameScreen.ts
git commit -m "feat: add MiniMap DOM panel showing hierarchy tree with player presence dots"
```

---

## Task 9: Run Full Test Suite & Verify

**Step 1: Run all server tests**

```bash
npx vitest run server/src/__tests__/
```

Expected: All tests PASS.

**Step 2: Check TypeScript compilation for both workspaces**

```bash
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p client/tsconfig.json
```

Expected: No errors in either.

**Step 3: Smoke test end-to-end**

1. Start server + client: `npm run dev`
2. Open browser, link a local repo
3. Verify root map renders with top-level folder doors along bottom wall and breadcrumb tile at top
4. Walk an agent to a door tile — verify fade transition and new room renders
5. Walk agent back to the breadcrumb tile (top of room) — verify fade and return to parent map
6. Open two browser windows — verify MiniMap shows both at their correct folder paths
7. Quit and resume a realm via RepoScreen — verify map and tree are restored correctly

**Step 4: Final commit if anything needed**

```bash
git add -A
git commit -m "feat: complete hierarchical dungeon maps — folders as rooms, lazy generation, multiplayer presence"
```

---

## Out of Scope (Deferred)

- Per-room turn cycle scoping in `TurnManager` (agents in different folders share the round-robin for now)
- Scoping `action:result` broadcasts to same-room occupants only
- Door-open animation from child side
- Proximity-based chat between players in adjacent rooms
- File content preview on chest/bookshelf interaction
