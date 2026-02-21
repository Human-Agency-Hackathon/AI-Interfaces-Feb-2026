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
