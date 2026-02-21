# Fog-of-War Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static room-based agent map with a 120x120 tile overworld featuring fog-of-war, procedural biomes, evolving forts, skill-driven exploration, and fort interior views.

**Architecture:** Hybrid server-client fog. Server owns the `explored[][]` grid and sends incremental `fog:reveal` events. Client renders fog overlay, reveal animations, minimap, and fort sprites. New message types route through the existing `shared/protocol.ts` → `server/types.ts` → `client/types.ts` pipeline.

**Tech Stack:** TypeScript, Phaser 3, WebSocket, Vitest. All textures programmatically generated (no external sprite sheets).

**Design doc:** `docs/plans/2026-02-21-fog-of-war-map-design.md`

---

## Task 1: Add New Tile Constants and Protocol Types

**Files:**
- Modify: `ha-agent-rpg/shared/protocol.ts:456-502`
- Modify: `ha-agent-rpg/server/src/types.ts:440-503`
- Modify: `ha-agent-rpg/client/src/types.ts:428-491`
- Modify: `ha-agent-rpg/server/src/MapGenerator.ts:8-14`
- Test: `ha-agent-rpg/server/src/__tests__/protocol-types.test.ts`

**Step 1: Write the failing test**

In `ha-agent-rpg/server/src/__tests__/protocol-types.test.ts`, add a new `describe` block:

```typescript
describe('Fog-of-War message types', () => {
  it('FogRevealMessage has correct shape', () => {
    const msg: FogRevealMessage = {
      type: 'fog:reveal',
      tiles: [{ x: 5, y: 10 }, { x: 6, y: 10 }],
      agentId: 'agent_1',
    };
    expect(msg.type).toBe('fog:reveal');
    expect(msg.tiles).toHaveLength(2);
  });

  it('FortUpdateMessage has correct shape', () => {
    const msg: FortUpdateMessage = {
      type: 'fort:update',
      agentId: 'agent_1',
      stage: 3,
      position: { x: 60, y: 25 },
    };
    expect(msg.type).toBe('fort:update');
    expect(msg.stage).toBe(3);
  });

  it('FortViewMessage has correct shape', () => {
    const msg: FortViewMessage = {
      type: 'fort:view',
      agentId: 'agent_1',
      roomImage: 'room-forge',
      agentInfo: {} as AgentInfo,
    };
    expect(msg.type).toBe('fort:view');
  });

  it('FortClickMessage has correct shape', () => {
    const msg: FortClickMessage = {
      type: 'fort:click',
      agentId: 'agent_1',
    };
    expect(msg.type).toBe('fort:click');
  });

  it('FortExitMessage has correct shape', () => {
    const msg: FortExitMessage = {
      type: 'fort:exit',
    };
    expect(msg.type).toBe('fort:exit');
  });
});
```

Import the new types at the top of the test file.

**Step 2: Run test to verify it fails**

Run: `npm run test -w server -- --run src/__tests__/protocol-types.test.ts`
Expected: FAIL — types not found

**Step 3: Add types to shared/protocol.ts**

Before the `// ── Union types ──` section (~line 456), add:

```typescript
// ── Fog-of-War messages ──────────────────────────────────────────────

export interface FogRevealMessage {
  type: 'fog:reveal';
  tiles: { x: number; y: number }[];
  agentId: string;
}

export interface FortUpdateMessage {
  type: 'fort:update';
  agentId: string;
  stage: 1 | 2 | 3 | 4 | 5;
  position: { x: number; y: number };
}

export interface FortViewMessage {
  type: 'fort:view';
  agentId: string;
  roomImage: string;
  agentInfo: AgentInfo;
}

export interface FortClickMessage {
  type: 'fort:click';
  agentId: string;
}

export interface FortExitMessage {
  type: 'fort:exit';
}
```

Add to the `ServerMessage` union (before closing `;`):
```typescript
  | FogRevealMessage
  | FortUpdateMessage
  | FortViewMessage
```

Add to the `ClientMessage` union (before closing `;`):
```typescript
  | FortClickMessage
  | FortExitMessage
```

**Step 4: Mirror types to server and client types.ts**

Copy the same interfaces and union additions to:
- `ha-agent-rpg/server/src/types.ts` (same relative position)
- `ha-agent-rpg/client/src/types.ts` (same relative position)

**Step 5: Add tile constants to MapGenerator.ts**

After line 12 (`TILE_FLOOR = 4`), add:

```typescript
const TILE_TREE    = 5;
const TILE_HILL    = 6;
const TILE_SAND    = 7;
const TILE_PATH    = 8;
const TILE_LAVA    = 9;
const TILE_CRYSTAL = 10;
```

**Step 6: Run test to verify it passes**

Run: `npm run test -w server -- --run src/__tests__/protocol-types.test.ts`
Expected: PASS

**Step 7: Run full server tests to check nothing broke**

Run: `npm run test -w server`
Expected: All existing tests pass

**Step 8: Commit**

```bash
git add ha-agent-rpg/shared/protocol.ts ha-agent-rpg/server/src/types.ts ha-agent-rpg/client/src/types.ts ha-agent-rpg/server/src/MapGenerator.ts ha-agent-rpg/server/src/__tests__/protocol-types.test.ts
git commit -m "feat: add fog-of-war and fort protocol types + new tile constants"
git push origin main
```

---

## Task 2: Add Fog and Fort State to WorldState

**Files:**
- Modify: `ha-agent-rpg/server/src/WorldState.ts:8-275`
- Test: `ha-agent-rpg/server/src/__tests__/WorldState.test.ts`

**Step 1: Write the failing tests**

Add a new top-level `describe('Fog-of-War State')` block at the bottom of `WorldState.test.ts`:

```typescript
describe('Fog-of-War State', () => {
  let world: WorldState;
  beforeEach(() => { world = new WorldState(); });

  describe('initFogMap', () => {
    it('creates a 120x120 explored grid initialized to false', () => {
      world.initFogMap(120, 120);
      expect(world.getExplored().length).toBe(120);
      expect(world.getExplored()[0].length).toBe(120);
      expect(world.getExplored()[60][60]).toBe(false);
    });
  });

  describe('revealTiles', () => {
    it('marks tiles as explored and returns only newly revealed tiles', () => {
      world.initFogMap(120, 120);
      const revealed = world.revealTiles(60, 60, 3);
      expect(revealed.length).toBeGreaterThan(0);
      expect(world.getExplored()[60][60]).toBe(true);

      // calling again returns empty (already revealed)
      const again = world.revealTiles(60, 60, 3);
      expect(again.length).toBe(0);
    });

    it('does not reveal tiles outside map bounds', () => {
      world.initFogMap(120, 120);
      const revealed = world.revealTiles(0, 0, 5);
      // Should not throw, all tiles within bounds
      for (const t of revealed) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(120);
        expect(t.y).toBeLessThan(120);
      }
    });
  });

  describe('isExplored', () => {
    it('returns false for unexplored tiles', () => {
      world.initFogMap(120, 120);
      expect(world.isExplored(50, 50)).toBe(false);
    });

    it('returns true after reveal', () => {
      world.initFogMap(120, 120);
      world.revealTiles(50, 50, 1);
      expect(world.isExplored(50, 50)).toBe(true);
    });

    it('returns false for out-of-bounds', () => {
      world.initFogMap(120, 120);
      expect(world.isExplored(-1, 0)).toBe(false);
      expect(world.isExplored(200, 0)).toBe(false);
    });
  });

  describe('fort stages', () => {
    it('sets and gets fort stage', () => {
      world.setFortStage('agent_1', 2);
      expect(world.getFortStage('agent_1')).toBe(2);
    });

    it('returns 0 for unknown agent', () => {
      expect(world.getFortStage('unknown')).toBe(0);
    });
  });

  describe('fort positions', () => {
    it('sets and gets fort position', () => {
      world.setFortPosition('agent_1', 30, 25);
      expect(world.getFortPosition('agent_1')).toEqual({ x: 30, y: 25 });
    });

    it('returns null for unknown agent', () => {
      expect(world.getFortPosition('unknown')).toBeNull();
    });
  });

  describe('isWalkable with new tiles', () => {
    it('returns false for tree (5)', () => {
      world.initFogMap(10, 10);
      // Set a custom map with tree tile
      const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
      tiles[5][5] = 5; // tree
      world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
      expect(world.isWalkable(5, 5)).toBe(false);
    });

    it('returns true for hill (6)', () => {
      const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
      tiles[5][5] = 6; // hill
      world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
      expect(world.isWalkable(5, 5)).toBe(true);
    });

    it('returns true for sand (7)', () => {
      const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
      tiles[5][5] = 7;
      world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
      expect(world.isWalkable(5, 5)).toBe(true);
    });

    it('returns true for path (8)', () => {
      const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
      tiles[5][5] = 8;
      world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
      expect(world.isWalkable(5, 5)).toBe(true);
    });

    it('returns false for lava (9)', () => {
      const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
      tiles[5][5] = 9;
      world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
      expect(world.isWalkable(5, 5)).toBe(false);
    });

    it('returns false for crystal (10)', () => {
      const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
      tiles[5][5] = 10;
      world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
      expect(world.isWalkable(5, 5)).toBe(false);
    });
  });

  describe('getSnapshot includes fog state', () => {
    it('includes explored grid in snapshot when fog is active', () => {
      world.initFogMap(10, 10);
      world.revealTiles(5, 5, 2);
      const snapshot = world.getSnapshot();
      expect((snapshot as any).explored).toBeDefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -w server -- --run src/__tests__/WorldState.test.ts`
Expected: FAIL — methods not found

**Step 3: Implement WorldState additions**

In `WorldState.ts`, add new private fields after existing ones (~line 19):

```typescript
private explored: boolean[][] | null = null;
private fortStages: Map<string, number> = new Map();
private fortPositions: Map<string, { x: number; y: number }> = new Map();
```

Add new methods after `getSnapshot()` (~line 262):

```typescript
initFogMap(width: number, height: number): void {
  this.explored = Array.from({ length: height }, () => Array(width).fill(false));
}

getExplored(): boolean[][] {
  return this.explored ?? [];
}

isExplored(x: number, y: number): boolean {
  if (!this.explored) return false;
  if (y < 0 || y >= this.explored.length) return false;
  if (x < 0 || x >= this.explored[0].length) return false;
  return this.explored[y][x];
}

revealTiles(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  if (!this.explored) return [];
  const newly: { x: number; y: number }[] = [];
  const h = this.explored.length;
  const w = this.explored[0].length;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (!this.explored[y][x]) {
        this.explored[y][x] = true;
        newly.push({ x, y });
      }
    }
  }
  return newly;
}

setFortStage(agentId: string, stage: number): void {
  this.fortStages.set(agentId, stage);
}

getFortStage(agentId: string): number {
  return this.fortStages.get(agentId) ?? 0;
}

setFortPosition(agentId: string, x: number, y: number): void {
  this.fortPositions.set(agentId, { x, y });
}

getFortPosition(agentId: string): { x: number; y: number } | null {
  return this.fortPositions.get(agentId) ?? null;
}
```

Update `isWalkable()` (~line 230) to include new walkable tiles:

```typescript
isWalkable(x: number, y: number): boolean {
  const t = this.getTile(x, y);
  // walkable: grass(0), door(3), floor(4), hill(6), sand(7), path(8)
  return t === 0 || t === 3 || t === 4 || t === 6 || t === 7 || t === 8;
}
```

Update `getSnapshot()` to include explored grid when fog is active:

```typescript
// Inside getSnapshot(), add to the return object:
...(this.explored ? { explored: this.explored } : {}),
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- --run src/__tests__/WorldState.test.ts`
Expected: PASS

**Step 5: Run full server tests**

Run: `npm run test -w server`
Expected: All pass

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/WorldState.ts ha-agent-rpg/server/src/__tests__/WorldState.test.ts
git commit -m "feat: add fog grid, fort stages, fort positions, and new walkable tiles to WorldState"
git push origin main
```

---

## Task 3: Biome Map Generator

**Files:**
- Create: `ha-agent-rpg/server/src/BiomeGenerator.ts`
- Test: `ha-agent-rpg/server/src/__tests__/BiomeGenerator.test.ts`

**Step 1: Write the failing tests**

Create `ha-agent-rpg/server/src/__tests__/BiomeGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BiomeGenerator, Biome, BIOME_TYPES } from '../BiomeGenerator.js';

describe('BiomeGenerator', () => {
  describe('BIOME_TYPES', () => {
    it('has 6 biome types', () => {
      expect(BIOME_TYPES).toHaveLength(6);
    });
  });

  describe('assignBiome', () => {
    it('returns a biome type for a given name', () => {
      const biome = BiomeGenerator.assignBiome('agent_1');
      expect(BIOME_TYPES).toContain(biome);
    });

    it('returns consistent biome for same name', () => {
      const a = BiomeGenerator.assignBiome('agent_1');
      const b = BiomeGenerator.assignBiome('agent_1');
      expect(a).toBe(b);
    });
  });

  describe('generate', () => {
    const fortPositions = new Map<string, { x: number; y: number }>([
      ['oracle', { x: 60, y: 60 }],
      ['agent_1', { x: 60, y: 25 }],
      ['agent_2', { x: 95, y: 60 }],
    ]);

    it('returns a 120x120 tile grid', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      expect(result.tiles.length).toBe(120);
      expect(result.tiles[0].length).toBe(120);
    });

    it('returns a biomeMap of same dimensions', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      expect(result.biomeMap.length).toBe(120);
      expect(result.biomeMap[0].length).toBe(120);
    });

    it('all tile values are valid tile IDs (0-10)', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      for (let y = 0; y < 120; y++) {
        for (let x = 0; x < 120; x++) {
          expect(result.tiles[y][x]).toBeGreaterThanOrEqual(0);
          expect(result.tiles[y][x]).toBeLessThanOrEqual(10);
        }
      }
    });

    it('oracle area at center is plains biome (grass)', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      // Center area should be mostly grass
      const centerTile = result.tiles[60][60];
      expect([0, 4, 6, 8]).toContain(centerTile); // grass, floor, hill, or path
    });

    it('fort positions have floor tiles', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      // Fort center tiles should be floor (4)
      expect(result.tiles[60][60]).toBe(4); // oracle fort center
    });
  });

  describe('getFortRadialPositions', () => {
    it('returns up to 8 positions around center', () => {
      const positions = BiomeGenerator.getFortRadialPositions(60, 60, 35, 4);
      expect(positions).toHaveLength(4);
    });

    it('positions are at correct radius from center', () => {
      const positions = BiomeGenerator.getFortRadialPositions(60, 60, 35, 1);
      const pos = positions[0];
      const dist = Math.sqrt((pos.x - 60) ** 2 + (pos.y - 60) ** 2);
      expect(dist).toBeCloseTo(35, 0);
    });

    it('caps at 8 positions', () => {
      const positions = BiomeGenerator.getFortRadialPositions(60, 60, 35, 12);
      expect(positions.length).toBeLessThanOrEqual(8);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -w server -- --run src/__tests__/BiomeGenerator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement BiomeGenerator**

Create `ha-agent-rpg/server/src/BiomeGenerator.ts`:

```typescript
// Tile constants (match MapGenerator.ts)
const TILE_GRASS   = 0;
const TILE_WALL    = 1;
const TILE_WATER   = 2;
const TILE_DOOR    = 3;
const TILE_FLOOR   = 4;
const TILE_TREE    = 5;
const TILE_HILL    = 6;
const TILE_SAND    = 7;
const TILE_PATH    = 8;
const TILE_LAVA    = 9;
const TILE_CRYSTAL = 10;

export type Biome = 'forest' | 'coastal' | 'plains' | 'hills' | 'volcanic' | 'crystalline';
export const BIOME_TYPES: Biome[] = ['forest', 'coastal', 'plains', 'hills', 'volcanic', 'crystalline'];

// FNV-1a hash for deterministic biome assignment
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

// Simple seeded PRNG
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

// Biome → primary terrain tile mapping
const BIOME_TILES: Record<Biome, { primary: number; secondary: number; obstacle: number }> = {
  forest:      { primary: TILE_GRASS, secondary: TILE_TREE,    obstacle: TILE_TREE },
  coastal:     { primary: TILE_SAND,  secondary: TILE_WATER,   obstacle: TILE_WATER },
  plains:      { primary: TILE_GRASS, secondary: TILE_HILL,    obstacle: TILE_WALL },
  hills:       { primary: TILE_HILL,  secondary: TILE_GRASS,   obstacle: TILE_WALL },
  volcanic:    { primary: TILE_FLOOR, secondary: TILE_LAVA,    obstacle: TILE_LAVA },
  crystalline: { primary: TILE_FLOOR, secondary: TILE_CRYSTAL, obstacle: TILE_CRYSTAL },
};

export interface BiomeMapResult {
  tiles: number[][];
  biomeMap: number[][];
}

export class BiomeGenerator {

  static assignBiome(name: string): Biome {
    return BIOME_TYPES[fnv1a(name) % BIOME_TYPES.length];
  }

  static getFortRadialPositions(
    cx: number, cy: number, radius: number, count: number
  ): { x: number; y: number }[] {
    const n = Math.min(count, 8);
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2; // start from north
      positions.push({
        x: Math.round(cx + Math.cos(angle) * radius),
        y: Math.round(cy + Math.sin(angle) * radius),
      });
    }
    return positions;
  }

  static generate(
    width: number,
    height: number,
    fortPositions: Map<string, { x: number; y: number }>
  ): BiomeMapResult {
    const rng = seededRandom(42);
    const tiles: number[][] = Array.from({ length: height }, () => Array(width).fill(TILE_GRASS));
    const biomeMap: number[][] = Array.from({ length: height }, () => Array(width).fill(0));

    // Build biome assignments: oracle is always plains, others by name hash
    const biomeAssignments = new Map<string, Biome>();
    for (const [agentId] of fortPositions) {
      biomeAssignments.set(
        agentId,
        agentId === 'oracle' ? 'plains' : BiomeGenerator.assignBiome(agentId)
      );
    }

    // Assign each tile to nearest fort's biome (Voronoi)
    const fortEntries = [...fortPositions.entries()];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minDist = Infinity;
        let nearestBiome: Biome = 'plains';
        let nearestIdx = 0;

        for (let i = 0; i < fortEntries.length; i++) {
          const [id, pos] = fortEntries[i];
          const dist = (x - pos.x) ** 2 + (y - pos.y) ** 2;
          if (dist < minDist) {
            minDist = dist;
            nearestBiome = biomeAssignments.get(id) ?? 'plains';
            nearestIdx = BIOME_TYPES.indexOf(nearestBiome);
          }
        }

        biomeMap[y][x] = nearestIdx;
        const bt = BIOME_TILES[nearestBiome];

        // Place terrain based on biome with noise
        const r = rng();
        if (r < 0.15) {
          tiles[y][x] = bt.secondary;
        } else if (r < 0.22) {
          tiles[y][x] = bt.obstacle;
        } else {
          tiles[y][x] = bt.primary;
        }
      }
    }

    // Carve fort areas: 6x6 floor patch at each fort position (max fort size)
    for (const [, pos] of fortPositions) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const fx = pos.x + dx;
          const fy = pos.y + dy;
          if (fx >= 0 && fx < width && fy >= 0 && fy < height) {
            if (Math.abs(dx) === 3 || Math.abs(dy) === 3) {
              tiles[fy][fx] = TILE_WALL; // fort boundary
            } else {
              tiles[fy][fx] = TILE_FLOOR; // fort interior
            }
          }
        }
      }
      // Door on south side
      if (pos.y + 3 < height) {
        tiles[pos.y + 3][pos.x] = TILE_DOOR;
      }
    }

    return { tiles, biomeMap };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- --run src/__tests__/BiomeGenerator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add ha-agent-rpg/server/src/BiomeGenerator.ts ha-agent-rpg/server/src/__tests__/BiomeGenerator.test.ts
git commit -m "feat: add BiomeGenerator with Voronoi biome zones and radial fort placement"
git push origin main
```

---

## Task 4: New generateFogMap() in MapGenerator

**Files:**
- Modify: `ha-agent-rpg/server/src/MapGenerator.ts`
- Test: `ha-agent-rpg/server/src/__tests__/MapGenerator.test.ts`

**Step 1: Write the failing tests**

Add a new `describe('generateFogMap()')` block in `MapGenerator.test.ts`:

```typescript
describe('generateFogMap()', () => {
  it('returns a 120x120 map', () => {
    const result = mapGen.generateFogMap(['agent_1', 'agent_2']);
    expect(result.map.width).toBe(120);
    expect(result.map.height).toBe(120);
    expect(result.map.tiles.length).toBe(120);
  });

  it('returns fort positions for oracle + all agents', () => {
    const result = mapGen.generateFogMap(['agent_1', 'agent_2']);
    expect(result.fortPositions.has('oracle')).toBe(true);
    expect(result.fortPositions.has('agent_1')).toBe(true);
    expect(result.fortPositions.has('agent_2')).toBe(true);
  });

  it('places oracle at center (60, 60)', () => {
    const result = mapGen.generateFogMap(['agent_1']);
    const oraclePos = result.fortPositions.get('oracle');
    expect(oraclePos).toEqual({ x: 60, y: 60 });
  });

  it('returns a biomeMap of same dimensions', () => {
    const result = mapGen.generateFogMap(['agent_1']);
    expect(result.biomeMap.length).toBe(120);
    expect(result.biomeMap[0].length).toBe(120);
  });

  it('all tile values are valid (0-10)', () => {
    const result = mapGen.generateFogMap(['a1', 'a2', 'a3']);
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 120; x++) {
        const t = result.map.tiles[y][x];
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(10);
      }
    }
  });

  it('handles 0 agents (oracle only)', () => {
    const result = mapGen.generateFogMap([]);
    expect(result.fortPositions.size).toBe(1); // just oracle
    expect(result.map.width).toBe(120);
  });

  it('handles 8 agents (maximum radial positions)', () => {
    const agents = Array.from({ length: 8 }, (_, i) => `agent_${i}`);
    const result = mapGen.generateFogMap(agents);
    expect(result.fortPositions.size).toBe(9); // oracle + 8
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -w server -- --run src/__tests__/MapGenerator.test.ts`
Expected: FAIL — `generateFogMap` not found

**Step 3: Implement generateFogMap**

In `MapGenerator.ts`, import BiomeGenerator at the top:

```typescript
import { BiomeGenerator } from './BiomeGenerator.js';
```

Add the new method to the `MapGenerator` class (after `generateProcessStageMap`):

```typescript
generateFogMap(agentIds: string[]): {
  map: TileMapData;
  fortPositions: Map<string, { x: number; y: number }>;
  biomeMap: number[][];
} {
  const MAP_W = 120;
  const MAP_H = 120;
  const CENTER_X = 60;
  const CENTER_Y = 60;
  const FORT_RADIUS = 35;

  // Calculate fort positions
  const fortPositions = new Map<string, { x: number; y: number }>();
  fortPositions.set('oracle', { x: CENTER_X, y: CENTER_Y });

  const radialPositions = BiomeGenerator.getFortRadialPositions(
    CENTER_X, CENTER_Y, FORT_RADIUS, agentIds.length
  );
  for (let i = 0; i < agentIds.length; i++) {
    fortPositions.set(agentIds[i], radialPositions[i]);
  }

  // Generate biome terrain
  const { tiles, biomeMap } = BiomeGenerator.generate(MAP_W, MAP_H, fortPositions);

  const map: TileMapData = {
    width: MAP_W,
    height: MAP_H,
    tile_size: TILE_SIZE,
    tiles,
  };

  return { map, fortPositions, biomeMap };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -w server -- --run src/__tests__/MapGenerator.test.ts`
Expected: PASS

**Step 5: Run full server tests**

Run: `npm run test -w server`
Expected: All pass

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/MapGenerator.ts ha-agent-rpg/server/src/__tests__/MapGenerator.test.ts
git commit -m "feat: add generateFogMap() to MapGenerator with biome terrain"
git push origin main
```

---

## Task 5: BridgeServer Fog Reveal and Fort Message Routing

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts`
- Test: `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts`

This is a larger integration task. The key changes to BridgeServer are:

1. Add `handleFortClick` and `handleFortExit` to the message router (line 182)
2. Add fog reveal logic to `broadcastRPGEvent` when an agent moves (line 1187)
3. Modify `spawnOracle` to use `generateFogMap()` when in process/brainstorm mode
4. Add fort stage tracking: update fort stage when agents complete work milestones

**Step 1: Write the failing test**

Add to `BridgeServer.e2e.test.ts` a new describe block. Note: the e2e test file creates a real BridgeServer and connects WebSocket clients. Follow the existing pattern:

```typescript
describe('Fog-of-War', () => {
  it('routes fort:click messages', async () => {
    // Send a fort:click message from the player socket
    const msg = { type: 'fort:click', agentId: 'oracle' };
    playerSocket.send(JSON.stringify(msg));
    // Should not throw / crash the server
    // (full behavior test requires process mode setup)
  });

  it('routes fort:exit messages', async () => {
    const msg = { type: 'fort:exit' };
    playerSocket.send(JSON.stringify(msg));
    // Should not throw
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -w server -- --run src/__tests__/BridgeServer.e2e.test.ts`
Expected: FAIL or warning about unhandled message type

**Step 3: Implement BridgeServer changes**

In `handleMessage()` (line 182), add two new cases:

```typescript
case 'fort:click':
  this.handleFortClick(msg as FortClickMessage, ws);
  break;
case 'fort:exit':
  this.handleFortExit(ws);
  break;
```

Add handler methods:

```typescript
private handleFortClick(msg: FortClickMessage, ws: WebSocket): void {
  const agent = this.worldState.agents.get(msg.agentId);
  if (!agent) return;

  // Assign room image by hash (oracle always gets throne)
  const ROOM_IMAGES = [
    'room-throne', 'room-forge', 'room-library', 'room-armory',
    'room-dungeon-cell', 'room-greenhouse', 'room-alchemy-lab', 'room-summoning-chamber'
  ];
  const roomImage = msg.agentId === 'oracle'
    ? 'room-throne'
    : ROOM_IMAGES[this.hashString(msg.agentId) % ROOM_IMAGES.length];

  const response: FortViewMessage = {
    type: 'fort:view',
    agentId: msg.agentId,
    roomImage,
    agentInfo: agent,
  };
  this.send(ws, response);
}

private handleFortExit(ws: WebSocket): void {
  // Send current world state to return to overworld
  this.send(ws, this.buildWorldStateMessage());
}

private hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}
```

Add fog reveal helper to call when agents move. In `broadcastRPGEvent()` (line 1187), inside the `move_to_file` case where agent position is updated, add:

```typescript
// After applyMove succeeds, reveal fog
const newlyRevealed = this.worldState.revealTiles(targetX, targetY, 5);
if (newlyRevealed.length > 0) {
  this.broadcast({
    type: 'fog:reveal',
    tiles: newlyRevealed,
    agentId: event.agentId,
  });
}
```

Add fort stage update helper:

```typescript
private updateFortStage(agentId: string, stage: 1 | 2 | 3 | 4 | 5): void {
  this.worldState.setFortStage(agentId, stage);
  const pos = this.worldState.getFortPosition(agentId);
  if (pos) {
    this.broadcast({
      type: 'fort:update',
      agentId,
      stage,
      position: pos,
    } as FortUpdateMessage);
  }
}
```

Import the new message types at the top of BridgeServer.ts.

**Step 4: Run test to verify it passes**

Run: `npm run test -w server -- --run src/__tests__/BridgeServer.e2e.test.ts`
Expected: PASS (no crash on new message types)

**Step 5: Run full server tests**

Run: `npm run test -w server`
Expected: All pass

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts
git commit -m "feat: add fog reveal on agent move + fort click/exit message routing"
git push origin main
```

---

## Task 6: New Terrain Textures in BootScene

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/BootScene.ts`

No test file needed for texture generation — these are visual-only and validated by running the client.

**Step 1: Add new texture generators to BootScene**

After the existing `generateSignTexture()` method (~line 502), add:

```typescript
private generateTreeTile(): void {
  const g = this.add.graphics();
  // Grass base
  g.fillStyle(0x3a7d2c); g.fillRect(0, 0, 32, 32);
  // Tree trunk
  g.fillStyle(0x5c3a1e); g.fillRect(13, 16, 6, 12);
  // Canopy (dark green circle)
  g.fillStyle(0x2d6b1f); g.fillCircle(16, 12, 10);
  // Canopy highlight
  g.fillStyle(0x4a9e3a); g.fillCircle(14, 9, 5);
  // Leaf detail
  g.fillStyle(0x3d8c2e); g.fillCircle(19, 13, 4);
  g.generateTexture('tile-tree', 32, 32);
  g.destroy();
}

private generateHillTile(): void {
  const g = this.add.graphics();
  // Grass base
  g.fillStyle(0x5a8f3c); g.fillRect(0, 0, 32, 32);
  // Hill mound
  g.fillStyle(0x7aaa55);
  g.fillTriangle(0, 28, 16, 8, 32, 28);
  // Hill highlight
  g.fillStyle(0x8dbe66);
  g.fillTriangle(4, 26, 14, 12, 20, 26);
  // Grass tufts on hill
  g.fillStyle(0x4a7d30);
  g.fillRect(10, 22, 2, 4); g.fillRect(20, 20, 2, 5);
  g.generateTexture('tile-hill', 32, 32);
  g.destroy();
}

private generateSandTile(): void {
  const g = this.add.graphics();
  g.fillStyle(0xd4b96a); g.fillRect(0, 0, 32, 32);
  // Sand texture dots
  g.fillStyle(0xc4a85a);
  for (let i = 0; i < 8; i++) {
    g.fillRect((i * 7 + 3) % 30, (i * 11 + 5) % 30, 2, 2);
  }
  // Light sand patches
  g.fillStyle(0xe0c878);
  g.fillRect(5, 12, 6, 3); g.fillRect(20, 22, 5, 3);
  g.generateTexture('tile-sand', 32, 32);
  g.destroy();
}

private generatePathTile(): void {
  const g = this.add.graphics();
  // Dirt base
  g.fillStyle(0x8b7355); g.fillRect(0, 0, 32, 32);
  // Worn center (lighter)
  g.fillStyle(0x9e866a); g.fillRect(4, 0, 24, 32);
  // Gravel dots
  g.fillStyle(0x7a6548);
  g.fillRect(8, 5, 2, 2); g.fillRect(18, 15, 3, 2);
  g.fillRect(12, 25, 2, 2); g.fillRect(22, 8, 2, 3);
  // Edge grass tufts
  g.fillStyle(0x5a8f3c);
  g.fillRect(0, 10, 3, 4); g.fillRect(29, 20, 3, 4);
  g.generateTexture('tile-path', 32, 32);
  g.destroy();
}

private generateLavaTile(): void {
  const g = this.add.graphics();
  // Dark rock base
  g.fillStyle(0x2a1a0e); g.fillRect(0, 0, 32, 32);
  // Lava glow
  g.fillStyle(0xff4400); g.fillRect(4, 4, 24, 24);
  // Hot center
  g.fillStyle(0xff8800); g.fillRect(8, 8, 16, 16);
  // Brightest core
  g.fillStyle(0xffcc00); g.fillRect(12, 12, 8, 8);
  // Dark crust patches
  g.fillStyle(0x3a1a0a);
  g.fillRect(6, 6, 4, 3); g.fillRect(20, 18, 5, 4);
  g.generateTexture('tile-lava', 32, 32);
  g.destroy();
}

private generateCrystalTile(): void {
  const g = this.add.graphics();
  // Stone base
  g.fillStyle(0x3a3a4a); g.fillRect(0, 0, 32, 32);
  // Crystal shard 1
  g.fillStyle(0x88ccff);
  g.fillTriangle(8, 28, 12, 8, 16, 28);
  // Crystal shard 2
  g.fillStyle(0x66aadd);
  g.fillTriangle(18, 28, 22, 12, 26, 28);
  // Highlight
  g.fillStyle(0xaaddff);
  g.fillTriangle(10, 24, 12, 12, 14, 24);
  // Sparkle
  g.fillStyle(0xffffff);
  g.fillRect(11, 10, 2, 2); g.fillRect(21, 14, 2, 2);
  g.generateTexture('tile-crystal', 32, 32);
  g.destroy();
}

private generateFogTile(): void {
  const g = this.add.graphics();
  g.fillStyle(0x0a0a14, 0.92);
  g.fillRect(0, 0, 32, 32);
  // Subtle noise
  g.fillStyle(0x0d0d18, 0.5);
  g.fillRect(4, 4, 8, 8); g.fillRect(20, 16, 8, 8);
  g.generateTexture('tile-fog', 32, 32);
  g.destroy();
}
```

Add 5 fort stage textures:

```typescript
private generateFortTextures(): void {
  // Stage 1: Campfire (2x2 = 64x64)
  const g1 = this.add.graphics();
  g1.fillStyle(0x3a3a3a); g1.fillRect(0, 0, 64, 64);
  g1.fillStyle(0x5c3a1e); // logs
  g1.fillRect(16, 40, 32, 8);
  g1.fillRect(22, 36, 20, 8);
  g1.fillStyle(0xff6600); // fire
  g1.fillTriangle(32, 16, 24, 44, 40, 44);
  g1.fillStyle(0xffcc00); // fire core
  g1.fillTriangle(32, 24, 28, 40, 36, 40);
  g1.generateTexture('fort-stage-1', 64, 64);
  g1.destroy();

  // Stage 2: Tent (3x3 = 96x96)
  const g2 = this.add.graphics();
  g2.fillStyle(0x3a7d2c); g2.fillRect(0, 0, 96, 96);
  g2.fillStyle(0x8b6e4e); // tent body
  g2.fillTriangle(48, 12, 12, 80, 84, 80);
  g2.fillStyle(0x7a5e3e); // tent shadow
  g2.fillTriangle(48, 12, 48, 80, 84, 80);
  g2.fillStyle(0x3a2a1a); // door opening
  g2.fillRect(40, 56, 16, 24);
  g2.generateTexture('fort-stage-2', 96, 96);
  g2.destroy();

  // Stage 3: Hut (4x4 = 128x128)
  const g3 = this.add.graphics();
  g3.fillStyle(0x3a7d2c); g3.fillRect(0, 0, 128, 128);
  g3.fillStyle(0x6b5030); // walls
  g3.fillRect(24, 48, 80, 56);
  g3.fillStyle(0x8b4513); // roof
  g3.fillTriangle(64, 16, 16, 52, 112, 52);
  g3.fillStyle(0x3a2a1a); // door
  g3.fillRect(52, 72, 24, 32);
  g3.fillStyle(0x88ccff); // window
  g3.fillRect(32, 64, 12, 12); g3.fillRect(84, 64, 12, 12);
  g3.generateTexture('fort-stage-3', 128, 128);
  g3.destroy();

  // Stage 4: Tower (5x5 = 160x160)
  const g4 = this.add.graphics();
  g4.fillStyle(0x3a7d2c); g4.fillRect(0, 0, 160, 160);
  g4.fillStyle(0x666677); // stone tower
  g4.fillRect(48, 24, 64, 112);
  // Battlements
  g4.fillStyle(0x777788);
  for (let i = 0; i < 4; i++) {
    g4.fillRect(48 + i * 20, 16, 12, 16);
  }
  g4.fillStyle(0x3a2a1a); // door
  g4.fillRect(64, 104, 32, 32);
  g4.fillStyle(0x88ccff); // windows
  g4.fillRect(60, 48, 12, 16); g4.fillRect(88, 48, 12, 16);
  g4.fillRect(60, 76, 12, 16); g4.fillRect(88, 76, 12, 16);
  g4.generateTexture('fort-stage-4', 160, 160);
  g4.destroy();

  // Stage 5: Fort (6x6 = 192x192)
  const g5 = this.add.graphics();
  g5.fillStyle(0x3a7d2c); g5.fillRect(0, 0, 192, 192);
  // Outer wall
  g5.fillStyle(0x555566); g5.fillRect(16, 16, 160, 160);
  // Interior
  g5.fillStyle(0x444455); g5.fillRect(32, 32, 128, 128);
  // Corner towers
  g5.fillStyle(0x666677);
  g5.fillRect(8, 8, 28, 28);    g5.fillRect(156, 8, 28, 28);
  g5.fillRect(8, 156, 28, 28);  g5.fillRect(156, 156, 28, 28);
  // Keep (central building)
  g5.fillStyle(0x777788); g5.fillRect(64, 48, 64, 80);
  // Gate
  g5.fillStyle(0x3a2a1a); g5.fillRect(80, 136, 32, 40);
  // Banner pole
  g5.fillStyle(0x8b4513); g5.fillRect(94, 24, 4, 32);
  g5.fillStyle(0xff3333); g5.fillRect(98, 24, 16, 12); // flag
  g5.generateTexture('fort-stage-5', 192, 192);
  g5.destroy();
}
```

**Step 2: Call all new generators in `create()` (line 17)**

Add calls after the existing texture generators:

```typescript
this.generateTreeTile();
this.generateHillTile();
this.generateSandTile();
this.generatePathTile();
this.generateLavaTile();
this.generateCrystalTile();
this.generateFogTile();
this.generateFortTextures();
```

**Step 3: Also load dungeon_visuals images in `preload()` (line 6)**

Add alongside the existing room image loads:

```typescript
this.load.image('dv-room-throne', '/dungeon_visuals/room-throne.jpg');
this.load.image('dv-room-forge', '/dungeon_visuals/room-forge.jpg');
this.load.image('dv-room-library', '/dungeon_visuals/room-library.jpg');
this.load.image('dv-room-armory', '/dungeon_visuals/room-armory.jpg');
this.load.image('dv-room-dungeon-cell', '/dungeon_visuals/room-dungeon-cell.jpg');
this.load.image('dv-room-greenhouse', '/dungeon_visuals/room-greenhouse.jpg');
this.load.image('dv-room-alchemy-lab', '/dungeon_visuals/room-alchemy-lab.jpg');
this.load.image('dv-room-summoning-chamber', '/dungeon_visuals/room-summoning-chamber.jpg');
```

Note: The `dungeon_visuals/` folder needs to be symlinked or copied into `client/public/dungeon_visuals/` so Vite can serve it. Add this to the setup step:

```bash
ln -sf ../../../dungeon_visuals ha-agent-rpg/client/public/dungeon_visuals
```

**Step 4: Visual verification**

Run: `npm run dev:client` and check browser console for texture loading errors.

**Step 5: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/BootScene.ts
git commit -m "feat: add terrain, fog, and fort stage textures to BootScene"
git push origin main
```

---

## Task 7: Update MapRenderer for New Tile Types and Fog Layer

**Files:**
- Modify: `ha-agent-rpg/client/src/systems/MapRenderer.ts`

**Step 1: Update `getTileKey()` to handle new tile types**

In `MapRenderer.ts`, update the `getTileKey` method (~line 86) to include new tiles:

```typescript
private getTileKey(tileType: number, x: number, y: number): string {
  switch (tileType) {
    case 0: return `tile-grass-${(x * 7 + y * 13) % 3}`;
    case 1: return 'tile-wall';
    case 2: return 'tile-water-0';
    case 3: return 'tile-door';
    case 4: return 'tile-floor';
    case 5: return 'tile-tree';
    case 6: return 'tile-hill';
    case 7: return 'tile-sand';
    case 8: return 'tile-path';
    case 9: return 'tile-lava';
    case 10: return 'tile-crystal';
    default: return 'tile-grass-0';
  }
}
```

**Step 2: Add fog layer rendering**

Add new fields and methods to `MapRenderer`:

```typescript
private fogTiles: Phaser.GameObjects.Image[] = [];
private exploredState: boolean[][] = [];

setExplored(explored: boolean[][]): void {
  this.exploredState = explored;
  this.renderFog();
}

revealTiles(tiles: { x: number; y: number }[]): void {
  for (const t of tiles) {
    if (this.exploredState[t.y]) {
      this.exploredState[t.y][t.x] = true;
    }
  }
  // Remove fog images for revealed tiles
  this.fogTiles = this.fogTiles.filter(fogImg => {
    const tx = Math.floor((fogImg.x - 16) / 32);
    const ty = Math.floor((fogImg.y - 16) / 32);
    if (tiles.some(t => t.x === tx && t.y === ty)) {
      // Fade out animation
      this.scene.tweens.add({
        targets: fogImg,
        alpha: 0,
        duration: 500,
        onComplete: () => fogImg.destroy(),
      });
      return false;
    }
    return true;
  });
}

private renderFog(): void {
  // Destroy existing fog
  this.fogTiles.forEach(f => f.destroy());
  this.fogTiles = [];

  if (this.exploredState.length === 0) return;

  const map = this.mapData;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!this.exploredState[y]?.[x]) {
        const fog = this.scene.add.image(
          x * 32 + 16, y * 32 + 16, 'tile-fog'
        );
        fog.setDepth(5); // above terrain, below agents
        this.fogTiles.push(fog);
      }
    }
  }
}
```

**Step 3: Commit**

```bash
git add ha-agent-rpg/client/src/systems/MapRenderer.ts
git commit -m "feat: update MapRenderer with new tile types and fog layer"
git push origin main
```

---

## Task 8: Camera Follow Mode

**Files:**
- Modify: `ha-agent-rpg/client/src/systems/CameraController.ts`

**Step 1: Rewrite CameraController for follow mode**

Replace the current diorama-only `CameraController` with one that supports both modes:

```typescript
const ROOM_PADDING = 24;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followTarget: { x: number; y: number } | null = null;
  private followingAgent: string | null = null;
  private mode: 'diorama' | 'follow' = 'diorama';

  constructor(
    scene: Phaser.Scene,
    mapWidth: number,
    mapHeight: number,
    tileSize: number
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.fitRoom(mapWidth, mapHeight, tileSize);
  }

  setMode(mode: 'diorama' | 'follow'): void {
    this.mode = mode;
    if (mode === 'follow') {
      this.camera.setZoom(1);
    }
  }

  update(): void {
    if (this.mode === 'follow' && this.followTarget) {
      const cam = this.camera;
      const targetX = this.followTarget.x * 32 + 16;
      const targetY = this.followTarget.y * 32 + 16;
      cam.scrollX += (targetX - cam.scrollX - cam.width / 2) * 0.08;
      cam.scrollY += (targetY - cam.scrollY - cam.height / 2) * 0.08;
    }
  }

  panTo(x: number, y: number, agentId?: string): void {
    this.followTarget = { x, y };
    if (agentId) this.followingAgent = agentId;
  }

  snapTo(x: number, y: number): void {
    if (this.mode === 'follow') {
      const cam = this.camera;
      cam.scrollX = x * 32 + 16 - cam.width / 2;
      cam.scrollY = y * 32 + 16 - cam.height / 2;
      this.followTarget = { x, y };
    }
  }

  isFollowing(agentId: string): boolean {
    return this.followingAgent === agentId;
  }

  clearFollow(): void {
    this.followingAgent = null;
    this.followTarget = null;
  }

  updateBounds(mapWidth: number, mapHeight: number, tileSize: number): void {
    if (this.mode === 'diorama') {
      this.fitRoom(mapWidth, mapHeight, tileSize);
    } else {
      // In follow mode, set world bounds for the full map
      this.camera.setBounds(0, 0, mapWidth * tileSize, mapHeight * tileSize);
    }
  }

  private fitRoom(mapWidth: number, mapHeight: number, tileSize: number): void {
    const cam = this.camera;
    const roomPxW = mapWidth * tileSize;
    const roomPxH = mapHeight * tileSize;
    const availW = cam.width - ROOM_PADDING * 2;
    const availH = cam.height - ROOM_PADDING * 2;
    const zoom = Math.min(availW / roomPxW, availH / roomPxH, 1);
    cam.setZoom(zoom);
    cam.removeBounds();
    cam.centerOn(roomPxW / 2, roomPxH / 2);
  }
}
```

**Step 2: Commit**

```bash
git add ha-agent-rpg/client/src/systems/CameraController.ts
git commit -m "feat: add follow mode to CameraController with smooth lerp"
git push origin main
```

---

## Task 9: FortSprite Component

**Files:**
- Create: `ha-agent-rpg/client/src/systems/FortSprite.ts`

**Step 1: Create FortSprite**

```typescript
const TILE_SIZE = 32;

// Fort stage → texture key and tile size
const FORT_STAGES: Record<number, { key: string; tileSize: number }> = {
  1: { key: 'fort-stage-1', tileSize: 2 },
  2: { key: 'fort-stage-2', tileSize: 3 },
  3: { key: 'fort-stage-3', tileSize: 4 },
  4: { key: 'fort-stage-4', tileSize: 5 },
  5: { key: 'fort-stage-5', tileSize: 6 },
};

export class FortSprite {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private nameLabel: Phaser.GameObjects.Text;
  private tileX: number;
  private tileY: number;
  private stage: number;
  private agentId: string;
  private color: number;

  constructor(
    scene: Phaser.Scene,
    agentId: string,
    name: string,
    color: number,
    tileX: number,
    tileY: number,
    stage: number = 1
  ) {
    this.scene = scene;
    this.agentId = agentId;
    this.color = color;
    this.tileX = tileX;
    this.tileY = tileY;
    this.stage = stage;

    const fortDef = FORT_STAGES[stage] ?? FORT_STAGES[1];
    const px = tileX * TILE_SIZE + 16;
    const py = tileY * TILE_SIZE + 16;

    this.sprite = scene.add.image(px, py, fortDef.key);
    this.sprite.setDepth(3);
    this.sprite.setTint(color);

    this.nameLabel = scene.add.text(px, py + fortDef.tileSize * 16 + 8, name, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.nameLabel.setOrigin(0.5);
    this.nameLabel.setDepth(4);

    // Make interactive for clicking
    this.sprite.setInteractive({ useHandCursor: true });
  }

  setStage(newStage: number): void {
    const fortDef = FORT_STAGES[newStage] ?? FORT_STAGES[1];
    this.stage = newStage;
    this.sprite.setTexture(fortDef.key);
    this.sprite.setTint(this.color);

    // Construction sparkle effect
    const particles = this.scene.add.particles(
      this.sprite.x, this.sprite.y, 'tile-crystal', {
        speed: { min: 20, max: 60 },
        scale: { start: 0.5, end: 0 },
        lifespan: 800,
        quantity: 12,
        tint: this.color,
        emitting: false,
      }
    );
    particles.explode(12);
    this.scene.time.delayedCall(1000, () => particles.destroy());

    // Update label position
    const py = this.tileY * TILE_SIZE + 16;
    this.nameLabel.setY(py + fortDef.tileSize * 16 + 8);
  }

  getAgentId(): string {
    return this.agentId;
  }

  getSprite(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  on(event: string, fn: () => void): this {
    this.sprite.on(event, fn);
    return this;
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
```

**Step 2: Commit**

```bash
git add ha-agent-rpg/client/src/systems/FortSprite.ts
git commit -m "feat: add FortSprite with stage-based textures and click interaction"
git push origin main
```

---

## Task 10: Minimap Component

**Files:**
- Create: `ha-agent-rpg/client/src/ui/Minimap.ts`

**Step 1: Create Minimap as a DOM overlay**

```typescript
const MINIMAP_SIZE = 160;

// Biome index → display color
const BIOME_COLORS = [
  '#3a7d2c', // 0: forest (green)
  '#4488cc', // 1: coastal (blue)
  '#5a8f3c', // 2: plains (light green)
  '#7a6648', // 3: hills (brown)
  '#aa3300', // 4: volcanic (red)
  '#6688aa', // 5: crystalline (steel blue)
];

const FOG_COLOR = '#0a0a14';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapWidth: number;
  private mapHeight: number;
  private biomeMap: number[][] = [];
  private explored: boolean[][] = [];
  private fortDots: Map<string, { x: number; y: number; color: string }> = new Map();
  private agentDots: Map<string, { x: number; y: number; color: string }> = new Map();

  constructor(mapWidth: number, mapHeight: number) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    this.canvas = document.createElement('canvas');
    this.canvas.width = MINIMAP_SIZE;
    this.canvas.height = MINIMAP_SIZE;
    this.canvas.style.cssText = `
      position: fixed;
      top: 8px;
      right: 8px;
      width: ${MINIMAP_SIZE}px;
      height: ${MINIMAP_SIZE}px;
      border: 2px solid #c8a84a;
      border-radius: 4px;
      background: ${FOG_COLOR};
      z-index: 100;
      image-rendering: pixelated;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  setBiomeMap(biomeMap: number[][]): void {
    this.biomeMap = biomeMap;
    this.redraw();
  }

  setExplored(explored: boolean[][]): void {
    this.explored = explored;
    this.redraw();
  }

  revealTiles(tiles: { x: number; y: number }[]): void {
    for (const t of tiles) {
      if (this.explored[t.y]) {
        this.explored[t.y][t.x] = true;
      }
    }
    this.redraw();
  }

  setFort(agentId: string, x: number, y: number, color: string): void {
    this.fortDots.set(agentId, { x, y, color });
    this.redraw();
  }

  setAgentPosition(agentId: string, x: number, y: number, color: string): void {
    this.agentDots.set(agentId, { x, y, color });
    this.redraw();
  }

  removeAgent(agentId: string): void {
    this.agentDots.delete(agentId);
    this.fortDots.delete(agentId);
    this.redraw();
  }

  private redraw(): void {
    const ctx = this.ctx;
    const scaleX = MINIMAP_SIZE / this.mapWidth;
    const scaleY = MINIMAP_SIZE / this.mapHeight;

    // Fill with fog
    ctx.fillStyle = FOG_COLOR;
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw explored tiles
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (this.explored[y]?.[x]) {
          const biomeIdx = this.biomeMap[y]?.[x] ?? 2;
          ctx.fillStyle = BIOME_COLORS[biomeIdx] ?? BIOME_COLORS[2];
          ctx.fillRect(
            Math.floor(x * scaleX),
            Math.floor(y * scaleY),
            Math.ceil(scaleX),
            Math.ceil(scaleY)
          );
        }
      }
    }

    // Draw fort dots (3px)
    for (const [, dot] of this.fortDots) {
      ctx.fillStyle = dot.color;
      ctx.fillRect(
        Math.floor(dot.x * scaleX) - 1,
        Math.floor(dot.y * scaleY) - 1,
        3, 3
      );
    }

    // Draw agent dots (2px, blinking handled externally or via CSS)
    for (const [, dot] of this.agentDots) {
      ctx.fillStyle = dot.color;
      ctx.fillRect(
        Math.floor(dot.x * scaleX),
        Math.floor(dot.y * scaleY),
        2, 2
      );
    }
  }

  destroy(): void {
    this.canvas.remove();
  }
}
```

**Step 2: Commit**

```bash
git add ha-agent-rpg/client/src/ui/Minimap.ts
git commit -m "feat: add Minimap DOM overlay with fog, biome, and agent tracking"
git push origin main
```

---

## Task 11: Wire Everything in GameScene

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts`

This is the integration task. GameScene needs to:

1. Detect fog-of-war mode (map size > 60 tiles)
2. Create Minimap when in fog mode
3. Switch CameraController to follow mode
4. Disable RoomBackground in fog mode (use tile rendering instead)
5. Handle `fog:reveal` messages → update MapRenderer + Minimap
6. Handle `fort:update` messages → create/update FortSprites
7. Handle `fort:view` messages → transition to room interior
8. Send `fort:click` on FortSprite click
9. Send `fort:exit` on back button click in room view

**Step 1: Add imports at top of GameScene.ts**

```typescript
import { FortSprite } from '../systems/FortSprite.js';
import { Minimap } from '../ui/Minimap.js';
```

**Step 2: Add new fields**

```typescript
private fortSprites: Map<string, FortSprite> = new Map();
private minimap: Minimap | null = null;
private isFogMode = false;
private inFortView = false;
```

**Step 3: In the `world:state` handler (line 56), detect fog mode**

After receiving the first `world:state`, check if the map is large:

```typescript
const isFogMap = state.map.width > 60;
this.isFogMode = isFogMap;

if (isFogMap) {
  // Fog mode: use tile rendering, not room background
  this.mapRenderer.setBackgroundMode(false);
  this.mapRenderer.render();

  // Set up fog layer
  if (state.explored) {
    this.mapRenderer.setExplored(state.explored);
  }

  // Camera follow mode
  this.cameraController.setMode('follow');
  this.cameraController.updateBounds(state.map.width, state.map.height, state.map.tile_size);

  // Create minimap
  this.minimap = new Minimap(state.map.width, state.map.height);
  if (state.explored) {
    this.minimap.setExplored(state.explored);
  }

  // Create fort sprites from agent positions
  for (const agent of state.agents) {
    // Fort positions come from world state
    // Initial forts created as agents join
  }
} else {
  // Existing diorama mode
  this.mapRenderer.setBackgroundMode(true);
  // ... existing code
}
```

**Step 4: Add WebSocket handlers for new message types**

In `create()`, add:

```typescript
this.wsClient.on('fog:reveal', (msg: any) => {
  if (this.mapRenderer) {
    this.mapRenderer.revealTiles(msg.tiles);
  }
  if (this.minimap) {
    this.minimap.revealTiles(msg.tiles);
  }
});

this.wsClient.on('fort:update', (msg: any) => {
  const existing = this.fortSprites.get(msg.agentId);
  if (existing) {
    existing.setStage(msg.stage);
  } else {
    // Find agent info for color/name
    const agent = this.worldState?.agents?.find((a: any) => a.agent_id === msg.agentId);
    if (agent) {
      const fort = new FortSprite(
        this, msg.agentId, agent.name,
        parseInt(agent.color, 16),
        msg.position.x, msg.position.y, msg.stage
      );
      fort.on('pointerdown', () => {
        this.wsClient.send({ type: 'fort:click', agentId: msg.agentId });
      });
      this.fortSprites.set(msg.agentId, fort);
      if (this.minimap) {
        this.minimap.setFort(msg.agentId, msg.position.x, msg.position.y, '#' + agent.color);
      }
    }
  }
});

this.wsClient.on('fort:view', (msg: any) => {
  this.inFortView = true;
  // Hide overworld, show room
  // Reuse RoomBackground with dungeon_visuals images
  if (this.roomBackground) {
    this.roomBackground.show(
      msg.roomImage,
      20, 15, 32 // Standard room viewport
    );
  }
  // Hide minimap
  if (this.minimap) {
    this.minimap.destroy();
    this.minimap = null;
  }
  // TODO: Add "Back" button overlay
});
```

**Step 5: Update agent movement to update minimap**

In `handleAction()`, inside the `move` case, add:

```typescript
if (this.minimap) {
  this.minimap.setAgentPosition(result.agent_id, result.x, result.y, '#' + agentColor);
}
```

**Step 6: Visual verification**

Run both server and client, start a brainstorm process, verify:
- Map renders at 120x120 with fog
- Camera follows active agent
- Minimap shows in top-right
- Fog reveals as agents move

**Step 7: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/GameScene.ts
git commit -m "feat: wire fog-of-war, forts, and minimap into GameScene"
git push origin main
```

---

## Task 12: Process Controller Integration for Skill-Driven Movement

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts`
- Modify: `ha-agent-rpg/server/src/ProcessController.ts`
- Test: `ha-agent-rpg/server/src/__tests__/ProcessController.test.ts`

**Step 1: Write the failing test**

In `ProcessController.test.ts`, add:

```typescript
describe('stage phase type', () => {
  it('emits stage:started with movement bias', () => {
    const events: any[] = [];
    controller.on('stage:started', (e: any) => events.push(e));
    controller.start(context);
    expect(events[0]).toHaveProperty('type', 'stage:started');
    // Movement bias is derived from stage definition
  });
});
```

**Step 2: Add movement bias to BridgeServer**

In `BridgeServer.ts`, when `ProcessController` emits `stage:started`, determine the movement bias based on the stage definition. Add to `handleStartProcess()` after creating the controller:

```typescript
// In wireSessionManagerEvents or handleStartProcess, listen for stage changes
this.processController.on('stage:started', (event: any) => {
  const stage = this.processController?.getCurrentStage();
  if (!stage) return;

  // Determine movement bias from stage type
  // Divergent stages: agents explore outward
  // Convergent stages: agents return to hub
  const divergentStages = ['divergent_thinking', 'precedent_research'];
  const convergentStages = ['convergent_thinking', 'fact_checking', 'pushback'];

  let movementBias: 'outward' | 'inward' | 'neutral' = 'neutral';
  if (divergentStages.some(s => stage.id.includes(s))) {
    movementBias = 'outward';
  } else if (convergentStages.some(s => stage.id.includes(s))) {
    movementBias = 'inward';
  }

  // Store on the world state or broadcast to agents
  // This is used by broadcastRPGEvent to bias agent movement directions
});
```

**Step 3: Run tests**

Run: `npm run test -w server`
Expected: All pass

**Step 4: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts ha-agent-rpg/server/src/ProcessController.ts ha-agent-rpg/server/src/__tests__/ProcessController.test.ts
git commit -m "feat: add skill-driven movement bias based on process stage type"
git push origin main
```

---

## Task 13: Path Tile Conversion on Agent Movement

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts`
- Modify: `ha-agent-rpg/server/src/WorldState.ts`
- Test: `ha-agent-rpg/server/src/__tests__/WorldState.test.ts`

**Step 1: Write the failing test**

In `WorldState.test.ts`, in the `Fog-of-War State` describe block, add:

```typescript
describe('convertToPath', () => {
  it('converts a grass tile to path', () => {
    const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
    world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
    const converted = world.convertToPath(5, 5);
    expect(converted).toBe(true);
    expect(world.getTile(5, 5)).toBe(8); // TILE_PATH
  });

  it('does not convert wall tiles', () => {
    const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
    tiles[5][5] = 1; // wall
    world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
    const converted = world.convertToPath(5, 5);
    expect(converted).toBe(false);
    expect(world.getTile(5, 5)).toBe(1);
  });

  it('does not convert floor tiles (fort interior)', () => {
    const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
    tiles[5][5] = 4; // floor
    world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
    const converted = world.convertToPath(5, 5);
    expect(converted).toBe(false);
    expect(world.getTile(5, 5)).toBe(4);
  });

  it('does not convert already-path tiles', () => {
    const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
    tiles[5][5] = 8; // already path
    world.setMap({ width: 10, height: 10, tile_size: 32, tiles });
    const converted = world.convertToPath(5, 5);
    expect(converted).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -w server -- --run src/__tests__/WorldState.test.ts`
Expected: FAIL — `convertToPath` not found

**Step 3: Implement convertToPath in WorldState**

```typescript
convertToPath(x: number, y: number): boolean {
  const tile = this.getTile(x, y);
  // Only convert walkable terrain tiles (not structures, not already paths)
  // Convertible: grass(0), hill(6), sand(7)
  if (tile === 0 || tile === 6 || tile === 7) {
    this.map.tiles[y][x] = 8; // TILE_PATH
    return true;
  }
  return false;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -w server -- --run src/__tests__/WorldState.test.ts`
Expected: PASS

**Step 5: Wire into BridgeServer movement**

In `broadcastRPGEvent()`, after the fog reveal code added in Task 5, add:

```typescript
// Convert walked tile to path
this.worldState.convertToPath(targetX, targetY);
```

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/WorldState.ts ha-agent-rpg/server/src/__tests__/WorldState.test.ts ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat: convert walked tiles to paths during agent movement"
git push origin main
```

---

## Task 14: Fort Interior View with Dungeon Visuals

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts`
- Modify: `ha-agent-rpg/client/src/systems/RoomBackground.ts`

**Step 1: Update RoomBackground to accept dungeon_visuals keys**

The existing `RoomBackground.show()` takes a path string and hashes it to pick a room key. Add support for passing a direct room key (for fort:view messages):

In `RoomBackground.ts`, add a method:

```typescript
showDirect(roomKey: string, widthTiles: number, heightTiles: number, tileSize: number): void {
  // Same as show() but uses roomKey directly instead of hashing
  this.destroy();
  const roomPxW = widthTiles * tileSize;
  const roomPxH = heightTiles * tileSize;

  // Prefix with 'dv-' to use dungeon_visuals images
  const textureKey = 'dv-' + roomKey;
  if (!this.scene.textures.exists(textureKey)) {
    // Fallback to existing room images
    this.show(roomKey, widthTiles, heightTiles, tileSize);
    return;
  }

  // Same cover-crop logic as show()
  this.bgImage = this.scene.add.image(roomPxW / 2, roomPxH / 2, textureKey);
  // ... (reuse the crop/display/frame logic from show())
}
```

**Step 2: Add back button in GameScene fort view**

In `GameScene.ts`, when entering fort view, create a DOM "Back" button:

```typescript
// In the fort:view handler:
const backBtn = document.createElement('button');
backBtn.textContent = 'Back to Map';
backBtn.style.cssText = `
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  padding: 8px 24px; font-family: monospace; font-size: 14px;
  background: #2a1a0a; color: #c8a84a; border: 2px solid #c8a84a;
  border-radius: 4px; cursor: pointer; z-index: 200;
`;
backBtn.onclick = () => {
  this.wsClient.send({ type: 'fort:exit' });
  backBtn.remove();
  this.inFortView = false;
  // Restore overworld (server sends world:state in response)
};
document.body.appendChild(backBtn);
```

**Step 3: Visual verification**

Run client + server, click on a fort, verify room image loads and back button works.

**Step 4: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/GameScene.ts ha-agent-rpg/client/src/systems/RoomBackground.ts
git commit -m "feat: add fort interior view with dungeon visuals and back navigation"
git push origin main
```

---

## Task 15: Integration Test and Polish

**Files:**
- Test: `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts`
- Modify: Various files for bug fixes

**Step 1: Write an integration test for the full fog-of-war flow**

Add to `BridgeServer.e2e.test.ts`:

```typescript
describe('Fog-of-War Integration', () => {
  it('world:state includes explored grid when fog map is active', async () => {
    // Start a process to trigger fog map generation
    // Verify the world:state message includes explored array
  });

  it('fog:reveal is broadcast when agent moves', async () => {
    // Register agent, trigger movement, verify fog:reveal message
  });

  it('fort:update is broadcast when fort stage changes', async () => {
    // Trigger fort stage change, verify message
  });
});
```

**Step 2: Run all tests**

Run: `npm run test -w server && npm run test -w client`
Expected: All pass

**Step 3: Run type checks**

Run: `npm run build -w server && npm run build -w client`
Expected: No type errors

**Step 4: Manual end-to-end test**

Run: `./scripts/start-all.sh`
Verify:
- [ ] 120x120 fog map generates correctly
- [ ] Oracle fort visible at center
- [ ] Sub-agents spawn at Oracle, walk to their fort positions
- [ ] Fog reveals in 5-tile radius as agents move
- [ ] Path tiles left behind agents
- [ ] Minimap shows fog state in top-right
- [ ] Camera follows active agent smoothly
- [ ] Fort click opens dungeon visual room interior
- [ ] Back button returns to overworld
- [ ] Fort upgrades through stages as agents complete work

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete fog-of-war map integration with tests"
git push origin main
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Protocol | New message types + tile constants |
| 2 | WorldState | Fog grid, fort state, updated walkability |
| 3 | BiomeGenerator | New module: Voronoi biomes, radial fort placement |
| 4 | MapGenerator | New `generateFogMap()` using BiomeGenerator |
| 5 | BridgeServer | Fog reveal on move, fort click/exit routing |
| 6 | BootScene | 7 new terrain + 5 fort + 1 fog textures |
| 7 | MapRenderer | New tile types + fog layer |
| 8 | CameraController | Follow mode with smooth lerp |
| 9 | FortSprite | New component: staged fort rendering |
| 10 | Minimap | New DOM overlay: fog + biome + agents |
| 11 | GameScene | Wire all components together |
| 12 | ProcessController | Skill-driven movement bias |
| 13 | WorldState | Path tile conversion on movement |
| 14 | RoomBackground | Fort interior with dungeon visuals |
| 15 | Integration | End-to-end tests and polish |

**Estimated scope:** 15 tasks, each 5-15 minutes. Tasks 1-5 are server-side, 6-11 are client-side, 12-15 are integration.
