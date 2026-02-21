# Fog-of-War Map with Agent Forts

**Date**: 2026-02-21
**Author**: Behrang
**Status**: Approved

## Overview

Replace the current static room-based map with a 120x120 tile overworld featuring fog-of-war exploration, procedural biomes, evolving agent forts, and skill-driven movement. Agents emerge from a central Oracle hub, explore outward through fog, build forts that grow as they work, and leave paths connecting the settlement network.

## Architecture: Hybrid Server-Client Fog

Server maintains the canonical `explored[][]` grid and sends incremental `fog:reveal` events. Client handles all visual rendering (fog overlay, reveal animations, trail drawing). This gives authoritative state for skill-phase isolation while keeping smooth client-side animation.

## Map Structure

- **Size**: 120x120 tiles (3840x3840 px at 32px/tile)
- **Initial state**: All tiles fogged except Oracle's fort area (~12x10 tiles at center)
- **Terrain**: Pre-generated on process start using Voronoi-style biome zones. Each sub-agent fort seeds a biome. Biomes blend at boundaries with weighted noise.

### Tile Types

| ID | Tile | Walkable | Biome |
|----|------|----------|-------|
| 0 | Grass | Yes | Plains |
| 1 | Wall | No | Any (fort boundaries) |
| 2 | Water | No | Coastal |
| 3 | Door | Yes | Fort entrances |
| 4 | Floor | Yes | Fort interiors |
| 5 | Tree | No | Forest |
| 6 | Hill | Yes (slow) | Plains/Hills |
| 7 | Sand | Yes | Coastal |
| 8 | Path | Yes (fast) | Any (agent trails) |
| 9 | Lava | No | Volcanic |
| 10 | Crystal | No | Crystalline |

### Biomes

Each sub-agent fort location seeds a biome zone:

- **Forest**: Dense trees with grass clearings
- **Coastal**: Sand shores with water pools
- **Plains**: Open grass with scattered hills
- **Hills**: Elevated terrain with rocky outcrops
- **Volcanic**: Lava flows with obsidian floors
- **Crystalline**: Crystal formations with stone floors

Biomes are assigned by agent role/name hash. Oracle's central area is always plains.

## Camera System

**Split view**:
- **Main viewport** (640x480): Follows the active agent with smooth lerp. Shows ~20x15 tile area. Camera bounded to explored areas.
- **Minimap** (160x160px DOM overlay, top-right): Shows full 120x120 map at ~1.3px/tile. Dark = fog, colored = biome. Fort dots pulse in agent color. Active agent has larger dot.

## Agent Forts

### Placement

Oracle's fort at map center (60, 60). Sub-agent forts placed at evenly-spaced angles on a ~35-tile radius from center. 8 possible positions (N, NE, E, SE, S, SW, W, NW). Position is pre-determined at summon time.

### Evolution Stages

| Stage | Name | Size | Trigger |
|-------|------|------|---------|
| 1 | Campfire | 2x2 | Agent spawned, begins walking to location |
| 2 | Tent | 3x3 | Agent arrives at fort location |
| 3 | Hut | 4x4 | Agent completes first skill action |
| 4 | Tower | 5x5 | Agent reaches ~50% of work |
| 5 | Fort | 6x6 | Agent completes all skill work |

Stage transitions play a sparkle/construction particle effect. Agent's color tints the fort banner/flag.

### Fort Interiors

Clicking a fort transitions to a room view using images from `dungeon_visuals/`:

| Room Image | Assignment |
|------------|------------|
| room-throne.jpg | Oracle (always) |
| room-forge.jpg | By agent role hash |
| room-library.jpg | By agent role hash |
| room-armory.jpg | By agent role hash |
| room-dungeon-cell.jpg | By agent role hash |
| room-greenhouse.jpg | By agent role hash |
| room-alchemy-lab.jpg | By agent role hash |
| room-summoning-chamber.jpg | By agent role hash |

Uses the existing `RoomBackground` system. Agent sprites visible inside room showing current status. "Back" arrow returns to overworld.

## Exploration Mechanic

### Agent Journey

1. Agent spawns at Oracle's fort (center)
2. Walks toward pre-assigned fort location, revealing 5-tile radius fog along the way
3. Arrives, fort upgrades to Stage 2 (Tent)
4. Begins skill work, exploring outward from fort

### Skill-Driven Movement

Movement direction is tied to the brainstorm skill phases:

- **Divergent phases** (Divergent Thinking, Precedent Research): Agents explore outward from their fort, biased away from center. Exploration radius grows 2-4 tiles per turn. Agents are isolated -- fog between forts enforces "can't see each other's output."
- **Convergent phases** (Convergent Thinking, Fact Checking): Agents walk back along established paths toward Oracle or toward each other. Faster movement on path tiles (2x speed).
- **Parallel phases**: Agents with different biomes explore independently.

### Path System

Every tile an agent walks on becomes a path tile (type 8) if it isn't already a structure tile. Over time, organic road networks form between forts and the hub. During convergent phases, agents prefer traveling on existing paths for 2x movement speed.

## Protocol Changes

### New Server-to-Client Messages

```typescript
// Incremental fog reveal
interface FogRevealMessage {
  type: 'fog:reveal';
  tiles: { x: number; y: number }[];
  agentId: string;
}

// Fort stage update
interface FortUpdateMessage {
  type: 'fort:update';
  agentId: string;
  stage: 1 | 2 | 3 | 4 | 5;
  position: { x: number; y: number };
}

// Fort interior view data
interface FortViewMessage {
  type: 'fort:view';
  agentId: string;
  roomImage: string;
  agentInfo: AgentInfo;
}
```

### New Client-to-Server Messages

```typescript
// Player clicks a fort
interface FortClickMessage {
  type: 'fort:click';
  agentId: string;
}

// Player exits fort view
interface FortExitMessage {
  type: 'fort:exit';
}
```

### Server State Additions

```typescript
// Added to WorldState
explored: boolean[][];           // 120x120 fog grid
fortStages: Map<string, number>; // per-agent fort level (1-5)
fortPositions: Map<string, { x: number; y: number }>; // pre-assigned locations
biomeMap: number[][];            // biome zone IDs for terrain generation
```

## Client Rendering

### New Textures (BootScene)

All programmatically generated at 32x32px, matching existing pixel-art style:

- **Terrain**: tree, hill, sand, lava, crystal tiles (+ variants for visual variety)
- **Forts**: 5 stage textures (campfire, tent, hut, tower, fort)
- **Fog**: Dark semi-transparent overlay tile

### Fog Rendering

Separate Phaser layer above terrain. Fogged tiles show dark overlay with subtle animated edge particles (smoke/mist at fog boundaries). Reveal animation: tiles fade dark -> semi-transparent -> gone over ~500ms.

### Construction Animation

Fort stage transitions: sparkle particle emitter at fort location + brief camera shake. Particles use agent's color.

## Assets

No external assets needed beyond what already exists:

- **Overworld terrain**: All new tile types drawn programmatically in BootScene (same as existing grass/wall/water)
- **Fort interiors**: 8 JPEGs in `dungeon_visuals/` (already present)
- **Agent sprites**: Existing `AgentSprite` system unchanged
- **Fort sprites**: New programmatic textures in BootScene

## Integration with Existing Systems

- **MapGenerator**: New `generateFogMap()` method for the 120x120 world with biome zones
- **ProcessController**: Hook into stage transitions to change agent movement bias (divergent = outward, convergent = inward)
- **BridgeServer**: Route new message types, trigger fog reveals on agent movement
- **GameScene**: Add fog layer, minimap, camera follow, fort click handlers
- **BootScene**: Add new terrain/fort texture generation methods
- **RoomBackground**: Reuse existing system for fort interior views
