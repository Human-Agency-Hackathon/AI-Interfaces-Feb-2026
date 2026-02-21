import type { AgentInfo, AgentStats, TileMapData, MapObject, Quest, WorldStateMessage, MapNode, ProcessState } from './types.js';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;
const TILE_SIZE = 32;

// Tile types: 0=grass, 1=wall, 2=water
export class WorldState {
  agents: Map<string, AgentInfo> = new Map();
  map: TileMapData;
  private objects: MapObject[] = [];
  private quests: Quest[] = [];
  tick = 0;
  mapTree: MapNode | null = null;

  // ── Process State ──────────────────────────────────
  // Set when a brainstorming process is active. Null until
  // player:start-process is received.
  private processState: ProcessState | null = null;

  constructor() {
    this.map = this.generateDefaultMap();
  }

  /** Replace the map with a provided map (e.g. from MapGenerator). */
  setMap(map: TileMapData): void {
    this.map = map;
  }

  /** Store map objects generated from the repo tree. */
  setObjects(objects: MapObject[]): void {
    this.objects = objects;
  }

  /** Return stored map objects. */
  getObjects(): MapObject[] {
    return this.objects;
  }

  /** Store quests. */
  setQuests(quests: Quest[]): void {
    this.quests = quests;
  }

  /** Return stored quests. */
  getQuests(): Quest[] {
    return this.quests;
  }

  /** Store the hierarchical map tree rooted at the repo root. */
  setMapTree(root: MapNode): void {
    this.mapTree = root;
  }

  /** Find a MapNode by path. Returns null if not found or if no mapTree is set. */
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

  private generateDefaultMap(): TileMapData {
    const tiles: number[][] = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        // Border walls
        if (y === 0 || y === MAP_HEIGHT - 1 || x === 0 || x === MAP_WIDTH - 1) {
          row.push(1);
        }
        // Small pond in center-right area
        else if (x >= 10 && x <= 12 && y >= 6 && y <= 8) {
          row.push(2);
        }
        // A few scattered wall obstacles
        else if ((x === 5 && y === 4) || (x === 5 && y === 5) ||
                 (x === 14 && y === 10) || (x === 15 && y === 10)) {
          row.push(1);
        }
        // Everything else is grass
        else {
          row.push(0);
        }
      }
      tiles.push(row);
    }

    return { width: MAP_WIDTH, height: MAP_HEIGHT, tile_size: TILE_SIZE, tiles };
  }

  // ── Process state accessors ────────────────────────

  setProcessState(state: ProcessState): void {
    this.processState = state;
  }

  getProcessState(): ProcessState | null {
    return this.processState;
  }

  /**
   * Advance the active process to the next stage by index.
   * Records an artifact for the stage that just completed before advancing.
   */
  advanceStage(completedStageId: string, artifacts: Record<string, string>): void {
    if (!this.processState) return;
    this.processState.collectedArtifacts[completedStageId] = { ...artifacts };
    this.processState.currentStageIndex++;
  }

  /**
   * Mark the active process as completed and record the final stage's artifacts.
   */
  completeProcess(finalStageId: string, artifacts: Record<string, string>): void {
    if (!this.processState) return;
    this.processState.collectedArtifacts[finalStageId] = { ...artifacts };
    this.processState.status = 'completed';
    this.processState.completedAt = new Date().toISOString();
  }

  /**
   * Store a single artifact produced mid-stage (e.g. from an idea:proposed tool call).
   * Artifacts are keyed by stageId → artifactId → content.
   */
  setArtifact(stageId: string, artifactId: string, content: string): void {
    if (!this.processState) return;
    if (!this.processState.collectedArtifacts[stageId]) {
      this.processState.collectedArtifacts[stageId] = {};
    }
    this.processState.collectedArtifacts[stageId][artifactId] = content;
  }

  addAgent(
    agent_id: string,
    name: string,
    color: number,
    role: string,
    realm: string,
    spawnAt?: { x: number; y: number },
  ): AgentInfo {
    const pos = spawnAt ?? this.findSpawnPosition();
    const stats: AgentStats = {
      realm_knowledge: {},
      expertise: {},
      codebase_fluency: 0,
      collaboration_score: 0,
    };
    const agent: AgentInfo = {
      agent_id,
      name,
      color,
      x: pos.x,
      y: pos.y,
      role,
      realm,
      stats,
      status: 'starting',
    };
    this.agents.set(agent_id, agent);
    return agent;
  }

  removeAgent(agent_id: string): void {
    this.agents.delete(agent_id);
  }

  updateAgentStatus(agent_id: string, status: AgentInfo['status']): void {
    const agent = this.agents.get(agent_id);
    if (agent) agent.status = status;
  }

  updateAgentActivity(agent_id: string, activity: string): void {
    const agent = this.agents.get(agent_id);
    if (agent) agent.current_activity = activity;
  }

  updateAgentStats(agent_id: string, stats: Partial<AgentStats>): void {
    const agent = this.agents.get(agent_id);
    if (!agent) return;
    if (stats.realm_knowledge) Object.assign(agent.stats.realm_knowledge, stats.realm_knowledge);
    if (stats.expertise) Object.assign(agent.stats.expertise, stats.expertise);
    if (stats.codebase_fluency !== undefined) agent.stats.codebase_fluency = stats.codebase_fluency;
    if (stats.collaboration_score !== undefined) agent.stats.collaboration_score = stats.collaboration_score;
  }

  private findSpawnPosition(): { x: number; y: number } {
    const w = this.map.width;
    const h = this.map.height;
    // Try random positions, fall back to sequential scan
    for (let i = 0; i < 100; i++) {
      const x = 2 + Math.floor(Math.random() * (w - 4));
      const y = 2 + Math.floor(Math.random() * (h - 4));
      if (this.isWalkable(x, y) && !this.isOccupied(x, y)) {
        return { x, y };
      }
    }
    // Fallback: scan for any open tile
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (this.isWalkable(x, y) && !this.isOccupied(x, y)) {
          return { x, y };
        }
      }
    }
    return { x: 1, y: 1 };
  }

  getTile(x: number, y: number): number {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) return 1;
    return this.map.tiles[y][x];
  }

  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    // Walkable tiles: 0=grass, 3=door, 4=floor
    return tile === 0 || tile === 3 || tile === 4;
  }

  isOccupied(x: number, y: number): boolean {
    for (const agent of this.agents.values()) {
      if (agent.x === x && agent.y === y) return true;
    }
    return false;
  }

  applyMove(agent_id: string, x: number, y: number): boolean {
    const agent = this.agents.get(agent_id);
    if (!agent) return false;
    agent.x = x;
    agent.y = y;
    return true;
  }

  getSnapshot(): WorldStateMessage {
    this.tick++;
    return {
      type: 'world:state',
      tick: this.tick,
      agents: Array.from(this.agents.values()),
      map: this.map,
      objects: this.objects,
      quests: this.quests,
    };
  }

  toJSON(): string {
    return JSON.stringify({
      agents: Array.from(this.agents.entries()),
      map: this.map,
      objects: this.objects,
      quests: this.quests,
      tick: this.tick,
      mapTree: this.mapTree ?? null,
      processState: this.processState ?? null,
    });
  }

  static fromJSON(json: string): WorldState {
    const data = JSON.parse(json);
    const ws = new WorldState();
    ws.map = data.map;
    ws.agents = new Map(data.agents);
    ws.setObjects(data.objects ?? []);
    ws.setQuests(data.quests ?? []);
    ws.tick = data.tick ?? 0;
    if (data.mapTree) ws.setMapTree(data.mapTree as MapNode);
    if (data.processState) ws.setProcessState(data.processState as ProcessState);
    return ws;
  }
}
