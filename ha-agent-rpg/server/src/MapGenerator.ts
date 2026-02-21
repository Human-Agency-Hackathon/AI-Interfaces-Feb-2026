import type { TileMapData, MapObject, Quest, MapNode } from './types.js';
import type { RepoData, RepoTreeEntry } from './RepoAnalyzer.js';

// ---------- Constants ----------

/** Tile IDs */
const TILE_GRASS = 0;
const TILE_WALL = 1;
const TILE_WATER = 2;
const TILE_DOOR = 3;
const TILE_FLOOR = 4;

const TILE_SIZE = 32;

/** Room size constraints (in tiles) */
const MIN_ROOM_W = 5;
const MIN_ROOM_H = 5;
const MAX_ROOM_W = 12;
const MAX_ROOM_H = 10;

/** Root room is always 8x8 */
const ROOT_ROOM_W = 8;
const ROOT_ROOM_H = 8;

/** Corridor width (tiles) */
const CORRIDOR_W = 3;

/** Spacing between rooms and from corridor endpoints */
const ROOM_GAP = 4;

// ---------- Agent-room layout constants ----------

const AGENT_ROOM_W = 12;
const AGENT_ROOM_H = 10;
const AGENT_MAP_W = 60;
const AGENT_MAP_H = 50;

// ---------- Internal helper types ----------

interface DirNode {
  name: string;
  path: string;
  files: RepoTreeEntry[];
  children: DirNode[];
}

interface Room {
  /** Top-left corner of the room (including walls) */
  x: number;
  y: number;
  /** Outer dimensions (including walls) */
  w: number;
  h: number;
  /** The directory path this room represents */
  dirPath: string;
  /** The display label for this room */
  label: string;
  /** Files that belong in this room */
  files: RepoTreeEntry[];
  /** Door position (tile coordinate) */
  doorX: number;
  doorY: number;
}

// ---------- Agent-room types ----------

interface AgentRoomSpec { agentId: string; name: string; role: string; }

export interface AgentMapResult {
  map: TileMapData;
  objects: MapObject[];
  agentPositions: Record<string, { x: number; y: number }>;
}

// ---------- File classification ----------

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.py', '.rs', '.go', '.java',
  '.rb', '.c', '.cpp', '.h',
]);

const CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'tsconfig.base.json',
  'cargo.toml', 'cargo.lock',
  'go.mod', 'go.sum',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt',
  'gemfile', 'gemfile.lock',
  'makefile', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js',
  '.prettierrc', '.prettierrc.json',
  '.gitignore', '.editorconfig',
  'jest.config.js', 'jest.config.ts',
  'vite.config.ts', 'vite.config.js',
  'webpack.config.js', 'rollup.config.js',
]);

function classifyFile(path: string): MapObject['type'] {
  const basename = path.split('/').pop()?.toLowerCase() ?? '';
  const ext = basename.includes('.') ? '.' + basename.split('.').pop() : '';

  // Documentation
  if (
    basename.startsWith('readme') ||
    ext === '.md' ||
    path.startsWith('docs/') ||
    path.includes('/docs/')
  ) {
    return 'doc';
  }

  // Config
  if (CONFIG_NAMES.has(basename)) {
    return 'config';
  }

  // Source code
  if (SOURCE_EXTENSIONS.has(ext)) {
    return 'file';
  }

  // Default to file for anything else
  return 'file';
}

// ---------- Directory tree builder ----------

function buildDirTree(tree: RepoTreeEntry[]): DirNode {
  const root: DirNode = { name: '(root)', path: '', files: [], children: [] };

  // Index of directories by path
  const dirIndex = new Map<string, DirNode>();
  dirIndex.set('', root);

  // First pass: create all directory nodes
  for (const entry of tree) {
    if (entry.type === 'tree') {
      const parts = entry.path.split('/');
      const name = parts[parts.length - 1];
      const node: DirNode = { name, path: entry.path, files: [], children: [] };
      dirIndex.set(entry.path, node);
    }
  }

  // Wire up parent-child for directories
  for (const [path, node] of dirIndex) {
    if (path === '') continue;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parent = dirIndex.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
  }

  // Second pass: assign files to their parent directory
  for (const entry of tree) {
    if (entry.type === 'blob') {
      const parentPath = entry.path.includes('/')
        ? entry.path.slice(0, entry.path.lastIndexOf('/'))
        : '';
      const parent = dirIndex.get(parentPath);
      if (parent) {
        parent.files.push(entry);
      } else {
        root.files.push(entry);
      }
    }
  }

  return root;
}

// ---------- Priority from labels ----------

function priorityFromLabels(labels: string[]): Quest['priority'] {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes('bug') || l.includes('critical'))) {
    return 'high';
  }
  if (lower.some((l) => l.includes('enhancement'))) {
    return 'medium';
  }
  return 'low';
}

// ---------- Radial placement directions ----------

/** Offsets (dx, dy) for placing rooms around the root in a radial pattern. */
const DIRECTIONS: Array<{ dx: number; dy: number; doorSide: 'south' | 'north' | 'west' | 'east' }> = [
  { dx: 0, dy: -1, doorSide: 'south' },   // north
  { dx: 1, dy: 0, doorSide: 'west' },      // east
  { dx: 0, dy: 1, doorSide: 'north' },     // south
  { dx: -1, dy: 0, doorSide: 'east' },     // west
  { dx: 1, dy: -1, doorSide: 'south' },    // NE
  { dx: -1, dy: -1, doorSide: 'south' },   // NW
  { dx: 1, dy: 1, doorSide: 'north' },     // SE
  { dx: -1, dy: 1, doorSide: 'north' },    // SW
];

// ---------- Seeded RNG helpers ----------

// Seeded RNG (mulberry32) — same seed always produces the same layout
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

// ---------- Map Generator ----------

export class MapGenerator {
  /**
   * Build a hierarchical MapNode tree from a flat repo tree array.
   * Each folder becomes a node of type 'folder'; each file becomes a node of type 'file'.
   */
  buildMapTree(tree: RepoTreeEntry[]): MapNode {
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
        } else if (!isLast && child.type === 'file') {
          // Promote: this node is actually an intermediate directory
          child.type = 'folder';
        }
        current = child;
      }
    }

    return root;
  }

  /**
   * Generate a tile map for a single folder node.
   * The map size scales with the number of children.
   * Subfolders become nav_door objects; files become file/config/doc objects.
   * A nav_back breadcrumb is placed at the entry position (top wall, centred).
   */
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
      Array.from({ length: width }, () => TILE_WALL),
    );

    // Carve floor interior
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        tiles[y][x] = TILE_FLOOR;
      }
    }

    const objects: MapObject[] = [];
    const doorPositions: Record<string, { x: number; y: number }> = {};

    // Entry/breadcrumb: top wall, horizontally centred (never in a corner column)
    const entryX = Math.floor(width / 2);
    tiles[0][entryX] = TILE_DOOR;
    const entryPosition = { x: entryX, y: 1 };

    // nav_back only for non-root folders (depth > 0)
    if (depth > 0) {
      objects.push({
        id: `nav_back_${node.path || 'root'}`,
        type: 'nav_back',
        x: entryPosition.x,
        y: entryPosition.y,
        label: '← Back',
        metadata: {},
      });
    }

    // Subfolder doors: evenly spaced along the bottom wall
    if (folderChildren.length > 0) {
      const maxDoors = width - 3; // Maximum doors that can fit with spacing >= 1
      const visibleFolderChildren = folderChildren.slice(0, maxDoors);
      const spacing = Math.max(1, Math.floor((width - 2) / (visibleFolderChildren.length + 1)));
      visibleFolderChildren.forEach((child, i) => {
        const dx = 1 + spacing * (i + 1);
        const dy = height - 1;
        tiles[dy][dx] = TILE_DOOR;
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
    if (depth > 0) {
      occupied.add(`${entryPosition.x},${entryPosition.y}`);
    }
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
          type: classifyFile(child.path) as MapObject['type'],
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

  /**
   * Convert analysed repo data into a tile map, map objects, and quests.
   */
  generate(repoData: RepoData): { map: TileMapData; objects: MapObject[]; quests: Quest[] } {
    const dirTree = buildDirTree(repoData.tree);

    // Compute room sizes for top-level directories
    const topDirs = dirTree.children;
    const roomSpecs = topDirs.map((dir) => this.roomSizeForDir(dir));

    // Determine overall map dimensions.
    // We need enough space for the root room plus surrounding rooms and corridors.
    const maxChildW = roomSpecs.reduce((mx, s) => Math.max(mx, s.w), 0);
    const maxChildH = roomSpecs.reduce((mx, s) => Math.max(mx, s.h), 0);
    const armLength = ROOM_GAP + Math.max(maxChildW, maxChildH) + ROOM_GAP;
    const mapW = ROOT_ROOM_W + 2 * armLength + 2 * maxChildW + ROOM_GAP * 2;
    const mapH = ROOT_ROOM_H + 2 * armLength + 2 * maxChildH + ROOM_GAP * 2;

    // Ensure minimum sensible size
    const width = Math.max(mapW, 40);
    const height = Math.max(mapH, 30);

    // Initialise map (all grass)
    const tiles = this.createBlankGrid(width, height);

    const rooms: Room[] = [];
    const objects: MapObject[] = [];

    // ---------- Place root room ----------
    const rootX = Math.floor((width - ROOT_ROOM_W) / 2);
    const rootY = Math.floor((height - ROOT_ROOM_H) / 2);
    const rootRoom: Room = {
      x: rootX,
      y: rootY,
      w: ROOT_ROOM_W,
      h: ROOT_ROOM_H,
      dirPath: '',
      label: repoData.repo,
      files: dirTree.files,
      doorX: rootX + Math.floor(ROOT_ROOM_W / 2),
      doorY: rootY, // top edge by default; will be overridden per connection
    };
    rooms.push(rootRoom);
    this.carveRoom(tiles, rootRoom);

    // Place root files as objects inside the root room
    this.placeFileObjects(rootRoom, dirTree.files, objects);

    // ---------- Place child rooms ----------
    const dirCount = Math.min(topDirs.length, DIRECTIONS.length);

    for (let i = 0; i < dirCount; i++) {
      const dir = topDirs[i];
      const spec = roomSpecs[i];
      const d = DIRECTIONS[i];

      // Compute child room position based on direction
      const distance = ROOM_GAP + Math.floor((ROOT_ROOM_W + spec.w) / 2) + CORRIDOR_W + ROOM_GAP;
      const childCenterX = rootX + Math.floor(ROOT_ROOM_W / 2) + d.dx * distance;
      const childCenterY = rootY + Math.floor(ROOT_ROOM_H / 2) + d.dy * distance;
      const childX = Math.max(1, Math.min(width - spec.w - 1, childCenterX - Math.floor(spec.w / 2)));
      const childY = Math.max(1, Math.min(height - spec.h - 1, childCenterY - Math.floor(spec.h / 2)));

      // Determine door position based on which side faces the root
      let doorX: number;
      let doorY: number;
      switch (d.doorSide) {
        case 'north':
          doorX = childX + Math.floor(spec.w / 2);
          doorY = childY;
          break;
        case 'south':
          doorX = childX + Math.floor(spec.w / 2);
          doorY = childY + spec.h - 1;
          break;
        case 'west':
          doorX = childX;
          doorY = childY + Math.floor(spec.h / 2);
          break;
        case 'east':
          doorX = childX + spec.w - 1;
          doorY = childY + Math.floor(spec.h / 2);
          break;
      }

      const childRoom: Room = {
        x: childX,
        y: childY,
        w: spec.w,
        h: spec.h,
        dirPath: dir.path,
        label: dir.name,
        files: this.collectAllFiles(dir),
        doorX,
        doorY,
      };

      rooms.push(childRoom);
      this.carveRoom(tiles, childRoom);
      this.placeFileObjects(childRoom, childRoom.files, objects);

      // ---------- Draw corridor from root to child room ----------
      this.carveCorridor(tiles, rootRoom, childRoom);
    }

    // Handle overflow directories that exceed 8 slots: place as sub-rooms of the
    // nearest child room.  For the MVP we just fold them into the root room's objects.
    for (let i = dirCount; i < topDirs.length; i++) {
      const dir = topDirs[i];
      const allFiles = this.collectAllFiles(dir);
      this.placeFileObjects(rootRoom, allFiles, objects);
    }

    // ---------- Add decorative water features ----------
    this.addWaterFeatures(tiles, width, height, rooms);

    // ---------- Quests from issues ----------
    const quests = this.generateQuests(repoData);

    // Place quest markers in the root room
    this.placeQuestMarkers(rootRoom, quests, objects);

    return {
      map: { width, height, tile_size: TILE_SIZE, tiles },
      objects,
      quests,
    };
  }

  // ================================================================
  // Private helpers
  // ================================================================

  private createBlankGrid(w: number, h: number): number[][] {
    const tiles: number[][] = [];
    for (let y = 0; y < h; y++) {
      tiles.push(new Array<number>(w).fill(TILE_GRASS));
    }
    return tiles;
  }

  /** Compute room outer dimensions based on the number of files in a directory subtree. */
  private roomSizeForDir(dir: DirNode): { w: number; h: number } {
    const fileCount = this.countFiles(dir);
    // Heuristic: ~2 tiles per file, then take a rough square root for dimensions
    const area = Math.max(MIN_ROOM_W * MIN_ROOM_H, fileCount * 2 + 10);
    const side = Math.ceil(Math.sqrt(area));
    const w = Math.min(MAX_ROOM_W, Math.max(MIN_ROOM_W, side));
    const h = Math.min(MAX_ROOM_H, Math.max(MIN_ROOM_H, Math.ceil(area / w)));
    return { w, h };
  }

  private countFiles(dir: DirNode): number {
    let count = dir.files.length;
    for (const child of dir.children) {
      count += this.countFiles(child);
    }
    return count;
  }

  private collectAllFiles(dir: DirNode): RepoTreeEntry[] {
    const result: RepoTreeEntry[] = [...dir.files];
    for (const child of dir.children) {
      result.push(...this.collectAllFiles(child));
    }
    return result;
  }

  /** Carve a room: walls on border, floor inside, door at doorX/doorY. */
  private carveRoom(tiles: number[][], room: Room): void {
    const { x, y, w, h } = room;
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(tiles, rx, ry)) continue;
        const onBorder = ry === y || ry === y + h - 1 || rx === x || rx === x + w - 1;
        tiles[ry][rx] = onBorder ? TILE_WALL : TILE_FLOOR;
      }
    }
    // Place the door
    if (this.inBounds(tiles, room.doorX, room.doorY)) {
      tiles[room.doorY][room.doorX] = TILE_DOOR;
    }
  }

  /** Draw an L-shaped corridor between two rooms. */
  private carveCorridor(tiles: number[][], from: Room, to: Room): void {
    // Find the midpoints of each room's door
    const ax = from.x + Math.floor(from.w / 2);
    const ay = from.y + Math.floor(from.h / 2);
    const bx = to.doorX;
    const by = to.doorY;

    // Determine the point on the root room's wall closest to the target
    const startX = this.clampToRoomEdge(from, bx, 'x');
    const startY = this.clampToRoomEdge(from, by, 'y');

    // Place a door on the root room at the corridor start
    if (this.inBounds(tiles, startX, startY)) {
      tiles[startY][startX] = TILE_DOOR;
    }

    // Corridor goes: horizontal from startX to bx, then vertical to by (or vice versa)
    // Choose which leg first based on shorter distance to avoid overlaps
    const halfW = Math.floor(CORRIDOR_W / 2);

    // Horizontal segment: startX -> bx at row startY
    const xMin = Math.min(startX, bx);
    const xMax = Math.max(startX, bx);
    for (let cx = xMin; cx <= xMax; cx++) {
      for (let offset = -halfW; offset <= halfW; offset++) {
        const cy = startY + offset;
        if (this.inBounds(tiles, cx, cy) && tiles[cy][cx] === TILE_GRASS) {
          tiles[cy][cx] = TILE_FLOOR;
        }
      }
    }

    // Vertical segment: startY -> by at column bx
    const yMin = Math.min(startY, by);
    const yMax = Math.max(startY, by);
    for (let cy = yMin; cy <= yMax; cy++) {
      for (let offset = -halfW; offset <= halfW; offset++) {
        const cx = bx + offset;
        if (this.inBounds(tiles, cx, cy) && tiles[cy][cx] === TILE_GRASS) {
          tiles[cy][cx] = TILE_FLOOR;
        }
      }
    }
  }

  /** Clamp a target coordinate to the edge of a room. */
  private clampToRoomEdge(room: Room, target: number, axis: 'x' | 'y'): number {
    if (axis === 'x') {
      if (target < room.x) return room.x;
      if (target >= room.x + room.w) return room.x + room.w - 1;
      return target;
    } else {
      if (target < room.y) return room.y;
      if (target >= room.y + room.h) return room.y + room.h - 1;
      return target;
    }
  }

  /** Place MapObjects for files inside a room's interior. */
  private placeFileObjects(
    room: Room,
    files: RepoTreeEntry[],
    objects: MapObject[],
  ): void {
    // Interior bounds (excluding walls)
    const interiorX = room.x + 1;
    const interiorY = room.y + 1;
    const interiorW = room.w - 2;
    const interiorH = room.h - 2;

    if (interiorW <= 0 || interiorH <= 0) return;

    const maxSlots = interiorW * interiorH;
    const filesToPlace = files.slice(0, maxSlots);

    for (let i = 0; i < filesToPlace.length; i++) {
      const file = filesToPlace[i];
      const col = i % interiorW;
      const row = Math.floor(i / interiorW);
      if (row >= interiorH) break;

      const objX = interiorX + col;
      const objY = interiorY + row;

      const basename = file.path.split('/').pop() ?? file.path;
      objects.push({
        id: `file_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        type: classifyFile(file.path),
        x: objX,
        y: objY,
        label: basename,
        metadata: {
          fullPath: file.path,
          size: file.size,
        },
      });
    }
  }

  /** Place quest markers inside the root room. */
  private placeQuestMarkers(
    rootRoom: Room,
    quests: Quest[],
    objects: MapObject[],
  ): void {
    // Place quest markers along the bottom-right interior of the root room
    const startX = rootRoom.x + rootRoom.w - 2;
    const startY = rootRoom.y + 1;

    for (let i = 0; i < quests.length; i++) {
      const quest = quests[i];
      const qx = startX;
      const qy = startY + i;

      if (qy >= rootRoom.y + rootRoom.h - 1) break; // out of room space

      objects.push({
        id: `quest_${quest.quest_id}`,
        type: 'quest_marker',
        x: qx,
        y: qy,
        label: quest.title,
        metadata: {
          quest_id: quest.quest_id,
          priority: quest.priority,
          source_url: quest.source_url,
        },
      });
    }
  }

  /** Convert repo issues into Quest objects. */
  private generateQuests(repoData: RepoData): Quest[] {
    return repoData.issues.map((issue) => ({
      quest_id: `issue_${issue.number}`,
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
      priority: priorityFromLabels(issue.labels),
      source_url: issue.url,
      related_files: this.guessRelatedFiles(issue.title + ' ' + issue.body, repoData.tree),
    }));
  }

  /**
   * Simple heuristic: scan the issue text for file paths or basenames that
   * appear in the repo tree.  Very naive but useful for the MVP.
   */
  private guessRelatedFiles(text: string, tree: RepoTreeEntry[]): string[] {
    const related: string[] = [];
    const lowerText = text.toLowerCase();

    for (const entry of tree) {
      if (entry.type !== 'blob') continue;
      const basename = (entry.path.split('/').pop() ?? '').toLowerCase();
      if (basename.length > 3 && lowerText.includes(basename)) {
        related.push(entry.path);
      }
      if (related.length >= 5) break;
    }

    return related;
  }

  /** Add a few small water features in open grass areas between rooms. */
  private addWaterFeatures(
    tiles: number[][],
    width: number,
    height: number,
    rooms: Room[],
  ): void {
    // Place a handful of small ponds in open spaces
    const attempts = 6;
    let placed = 0;
    const rng = this.seededRandom(width * height);

    for (let i = 0; i < attempts * 10 && placed < attempts; i++) {
      const px = 2 + Math.floor(rng() * (width - 4));
      const py = 2 + Math.floor(rng() * (height - 4));

      // Check that this spot and a 2x2 area around it are all grass
      if (!this.isAreaClear(tiles, px, py, 3, 3, rooms)) continue;

      // Place a small 2x2 pond
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (this.inBounds(tiles, px + dx, py + dy)) {
            tiles[py + dy][px + dx] = TILE_WATER;
          }
        }
      }
      placed++;
    }
  }

  /** Check whether a rectangular area is all grass and not overlapping any room. */
  private isAreaClear(
    tiles: number[][],
    x: number,
    y: number,
    w: number,
    h: number,
    rooms: Room[],
  ): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!this.inBounds(tiles, tx, ty)) return false;
        if (tiles[ty][tx] !== TILE_GRASS) return false;
      }
    }
    // Also ensure we're not inside or adjacent to any room
    for (const room of rooms) {
      if (
        x < room.x + room.w + 1 &&
        x + w > room.x - 1 &&
        y < room.y + room.h + 1 &&
        y + h > room.y - 1
      ) {
        return false;
      }
    }
    return true;
  }

  private inBounds(tiles: number[][], x: number, y: number): boolean {
    return y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length;
  }

  /** A simple deterministic PRNG so water placement is reproducible. */
  private seededRandom(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) / 0xFFFFFFFF);
    };
  }

  // ================================================================
  // Agent-room map generation
  // ================================================================

  /**
   * Build a flat "medieval offices" map: one room per agent on a fixed 60×50 canvas.
   * Oracle's room is always at (24,20); sub-agent rooms radiate outward.
   */
  generateAgentMap(agents: AgentRoomSpec[]): AgentMapResult {
    const tiles = this.createBlankGrid(AGENT_MAP_W, AGENT_MAP_H);
    const objects: MapObject[] = [];
    const agentPositions: Record<string, { x: number; y: number }> = {};

    if (agents.length === 0) {
      return { map: { width: AGENT_MAP_W, height: AGENT_MAP_H, tile_size: TILE_SIZE, tiles }, objects, agentPositions };
    }

    // Fixed room top-left positions matching DIRECTIONS order (N,E,S,W,NE,NW,SE,SW)
    const ORACLE_X = 24;
    const ORACLE_Y = 20;
    const SUB_POSITIONS = [
      { x: 24, y: 5 },   // N
      { x: 41, y: 20 },  // E
      { x: 24, y: 35 },  // S
      { x: 7,  y: 20 },  // W
      { x: 41, y: 5 },   // NE
      { x: 7,  y: 5 },   // NW
      { x: 41, y: 35 },  // SE
      { x: 7,  y: 35 },  // SW
    ];

    // Oracle room
    const oracle = agents[0];
    this.carveAgentRoom(tiles, ORACLE_X, ORACLE_Y, AGENT_ROOM_W, AGENT_ROOM_H);
    this.decorateAgentRoom(objects, ORACLE_X, ORACLE_Y, AGENT_ROOM_W, AGENT_ROOM_H, oracle);
    agentPositions[oracle.agentId] = {
      x: ORACLE_X + Math.floor(AGENT_ROOM_W / 2),
      y: ORACLE_Y + Math.floor(AGENT_ROOM_H / 2),
    };

    // Sub-agent rooms
    for (let i = 1; i < agents.length && i - 1 < SUB_POSITIONS.length; i++) {
      const agent = agents[i];
      const pos = SUB_POSITIONS[i - 1];
      const dir = DIRECTIONS[i - 1];

      this.carveAgentRoom(tiles, pos.x, pos.y, AGENT_ROOM_W, AGENT_ROOM_H);
      this.decorateAgentRoom(objects, pos.x, pos.y, AGENT_ROOM_W, AGENT_ROOM_H, agent);
      agentPositions[agent.agentId] = {
        x: pos.x + Math.floor(AGENT_ROOM_W / 2),
        y: pos.y + Math.floor(AGENT_ROOM_H / 2),
      };

      this.carveAgentCorridor(
        tiles,
        ORACLE_X, ORACLE_Y, AGENT_ROOM_W, AGENT_ROOM_H,
        pos.x, pos.y, AGENT_ROOM_W, AGENT_ROOM_H,
        dir,
      );
    }

    return { map: { width: AGENT_MAP_W, height: AGENT_MAP_H, tile_size: TILE_SIZE, tiles }, objects, agentPositions };
  }

  /** Carve walls on border, floor inside. Doors are added later by carveAgentCorridor. */
  private carveAgentRoom(tiles: number[][], x: number, y: number, w: number, h: number): void {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(tiles, rx, ry)) continue;
        const onBorder = ry === y || ry === y + h - 1 || rx === x || rx === x + w - 1;
        tiles[ry][rx] = onBorder ? TILE_WALL : TILE_FLOOR;
      }
    }
  }

  /** Place sign (nameplate), 2× doc (books), 1× file (papers) in the four interior corners. */
  private decorateAgentRoom(
    objects: MapObject[],
    x: number, y: number, w: number, h: number,
    agent: AgentRoomSpec,
  ): void {
    const ix = x + 1;
    const iy = y + 1;
    const iw = w - 2;
    const ih = h - 2;
    objects.push({
      id: `sign_${agent.agentId}`,
      type: 'sign',
      x: ix, y: iy,
      label: `${agent.name} (${agent.role})`,
      metadata: { agentId: agent.agentId },
    });
    objects.push({
      id: `doc_${agent.agentId}_1`,
      type: 'doc',
      x: ix + iw - 1, y: iy,
      label: 'Research',
      metadata: { agentId: agent.agentId },
    });
    objects.push({
      id: `doc_${agent.agentId}_2`,
      type: 'doc',
      x: ix, y: iy + ih - 1,
      label: 'Findings',
      metadata: { agentId: agent.agentId },
    });
    objects.push({
      id: `file_${agent.agentId}`,
      type: 'file',
      x: ix + iw - 1, y: iy + ih - 1,
      label: 'Notes',
      metadata: { agentId: agent.agentId },
    });
  }

  /**
   * Place TILE_DOOR on each room's connecting wall and carve a TILE_FLOOR corridor between them.
   * Cardinal directions use a straight corridor; diagonals use an L-shape.
   * Only TILE_GRASS tiles are overwritten (rooms protect themselves).
   */
  private carveAgentCorridor(
    tiles: number[][],
    oX: number, oY: number, oW: number, oH: number,
    sX: number, sY: number, sW: number, sH: number,
    dir: { dx: number; dy: number },
  ): void {
    const halfW = Math.floor(CORRIDOR_W / 2);
    const oCx = oX + Math.floor(oW / 2);
    const oCy = oY + Math.floor(oH / 2);
    const sCx = sX + Math.floor(sW / 2);
    const sCy = sY + Math.floor(sH / 2);

    // Door positions based on direction
    let oDoorX: number, oDoorY: number, sDoorX: number, sDoorY: number;
    if (dir.dx === 0 && dir.dy === -1) {        // N
      oDoorX = oCx; oDoorY = oY;
      sDoorX = sCx; sDoorY = sY + sH - 1;
    } else if (dir.dx === 1 && dir.dy === 0) {  // E
      oDoorX = oX + oW - 1; oDoorY = oCy;
      sDoorX = sX; sDoorY = sCy;
    } else if (dir.dx === 0 && dir.dy === 1) {  // S
      oDoorX = oCx; oDoorY = oY + oH - 1;
      sDoorX = sCx; sDoorY = sY;
    } else if (dir.dx === -1 && dir.dy === 0) { // W
      oDoorX = oX; oDoorY = oCy;
      sDoorX = sX + sW - 1; sDoorY = sCy;
    } else if (dir.dx === 1 && dir.dy === -1) { // NE
      oDoorX = oX + oW - 1; oDoorY = oCy;
      sDoorX = sCx; sDoorY = sY + sH - 1;
    } else if (dir.dx === -1 && dir.dy === -1) { // NW
      oDoorX = oX; oDoorY = oCy;
      sDoorX = sCx; sDoorY = sY + sH - 1;
    } else if (dir.dx === 1 && dir.dy === 1) {  // SE
      oDoorX = oX + oW - 1; oDoorY = oCy;
      sDoorX = sCx; sDoorY = sY;
    } else {                                     // SW
      oDoorX = oX; oDoorY = oCy;
      sDoorX = sCx; sDoorY = sY;
    }

    if (this.inBounds(tiles, oDoorX, oDoorY)) tiles[oDoorY][oDoorX] = TILE_DOOR;
    if (this.inBounds(tiles, sDoorX, sDoorY)) tiles[sDoorY][sDoorX] = TILE_DOOR;

    const carve = (x: number, y: number): void => {
      if (this.inBounds(tiles, x, y) && tiles[y][x] === TILE_GRASS) tiles[y][x] = TILE_FLOOR;
    };

    if (dir.dx === 0) {
      // N or S: straight vertical corridor
      const xC = oDoorX;
      const yMin = Math.min(oDoorY, sDoorY) + 1;
      const yMax = Math.max(oDoorY, sDoorY) - 1;
      for (let cy = yMin; cy <= yMax; cy++) {
        for (let off = -halfW; off <= halfW; off++) carve(xC + off, cy);
      }
    } else if (dir.dy === 0) {
      // E or W: straight horizontal corridor
      const yC = oDoorY;
      const xMin = Math.min(oDoorX, sDoorX) + 1;
      const xMax = Math.max(oDoorX, sDoorX) - 1;
      for (let cx = xMin; cx <= xMax; cx++) {
        for (let off = -halfW; off <= halfW; off++) carve(cx, yC + off);
      }
    } else {
      // Diagonal: L-shape — horizontal from oracle door to sub's X, then vertical to sub door
      const xMin = Math.min(oDoorX, sDoorX) + 1;
      const xMax = Math.max(oDoorX, sDoorX) - 1;
      for (let cx = xMin; cx <= xMax; cx++) {
        for (let off = -halfW; off <= halfW; off++) carve(cx, oDoorY + off);
      }
      const yMin = Math.min(oDoorY, sDoorY) + 1;
      const yMax = Math.max(oDoorY, sDoorY) - 1;
      for (let cy = yMin; cy <= yMax; cy++) {
        for (let off = -halfW; off <= halfW; off++) carve(sDoorX + off, cy);
      }
    }
  }
}
