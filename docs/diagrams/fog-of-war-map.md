# Fog-of-War Map System

The fog-of-war overworld replaces static room-based maps with a 120x120 tile world featuring procedural biomes, evolving agent forts, and incremental fog reveal. Agents explore outward from a central Oracle hub, build forts that grow as they work, and leave paths connecting the settlement network.

## Architecture: Hybrid Server-Client Fog

```mermaid
graph TD
    subgraph Server ["Server (Source of Truth)"]
        WS["WorldState<br/>explored[][] (120x120 bool grid)<br/>fortStages (agent → level 1-5)<br/>fortPositions (agent → {x,y})<br/>biomeMap[][] (zone IDs)"]
        MG["MapGenerator<br/>generateFogMap()"]
        BG["BiomeGenerator<br/>Voronoi zone seeding"]
        BS["BridgeServer<br/>Triggers fog:reveal on move<br/>Routes fort:click/exit"]
    end

    subgraph Client ["Client (Pure Renderer)"]
        MR["MapRenderer<br/>Fog overlay layer<br/>Tile reveal animations"]
        FS["FortSprites<br/>5-stage structures<br/>Agent-colored tints"]
        MM["Minimap<br/>Canvas overlay (160x160)<br/>Fog + biome + agents"]
        CC["CameraController<br/>Follow mode (smooth lerp)"]
    end

    MG --> BG
    MG --> WS
    BS -->|"fog:reveal"| MR
    BS -->|"fort:update"| FS
    WS -->|"world:state (initial)"| MR
    WS -->|"world:state (initial)"| MM
```

---

## World Generation

When a brainstorm process starts, the server generates a 120x120 overworld.

```mermaid
sequenceDiagram
    participant BS as BridgeServer
    participant MG as MapGenerator
    participant BG as BiomeGenerator
    participant WS as WorldState

    BS->>MG: generateFogMap(agentCount, roles)

    MG->>MG: Place Oracle fort at center (60, 60)
    MG->>MG: Calculate sub-agent fort positions<br/>(radial, ~35-tile radius, 8 compass points)

    MG->>BG: generateBiomes(fortPositions)
    Note over BG: Voronoi zone seeding:<br/>Each fort seeds a biome zone<br/>Biome type from agent role hash

    BG-->>MG: biomeMap[][] (zone IDs per tile)

    MG->>MG: Fill terrain from biome map
    Note over MG: Forest = trees + grass clearings<br/>Coastal = sand + water pools<br/>Plains = open grass + hills<br/>Volcanic = lava + obsidian<br/>Crystalline = crystal + stone

    MG-->>BS: TileMapData (120x120)
    BS->>WS: setMap(), initFogMap()
    Note over WS: explored[][] initialized:<br/>all false except Oracle area (~12x10)
```

### Tile Types

| ID | Tile | Walkable | Biome |
|----|------|----------|-------|
| 0 | Grass | Yes | Plains |
| 1 | Wall | No | Fort boundaries |
| 2 | Water | No | Coastal |
| 3 | Door | Yes | Fort entrances |
| 4 | Floor | Yes | Fort interiors |
| 5 | Tree | No | Forest |
| 6 | Hill | Yes (slow) | Plains/Hills |
| 7 | Sand | Yes | Coastal |
| 8 | Path | Yes (fast) | Agent trails |
| 9 | Lava | No | Volcanic |
| 10 | Crystal | No | Crystalline |

### Biomes

```mermaid
graph TD
    subgraph Biomes ["Biome Types (assigned by agent role hash)"]
        B1["Forest<br/>Dense trees, grass clearings"]
        B2["Coastal<br/>Sand shores, water pools"]
        B3["Plains<br/>Open grass, scattered hills"]
        B4["Hills<br/>Elevated terrain, rocky outcrops"]
        B5["Volcanic<br/>Lava flows, obsidian floors"]
        B6["Crystalline<br/>Crystal formations, stone floors"]
    end

    Center["Oracle hub (center)<br/>Always Plains biome"]
    Center -.-> B1
    Center -.-> B2
    Center -.-> B3
    Center -.-> B4
    Center -.-> B5
    Center -.-> B6
```

---

## Fort Evolution

Agent forts evolve through 5 stages as agents progress through their work.

```mermaid
stateDiagram-v2
    [*] --> Campfire: Agent spawned
    Campfire --> Tent: Agent arrives at fort location
    Tent --> Hut: First skill action completed
    Hut --> Tower: ~50% of work done
    Tower --> Fort: All skill work complete
    Fort --> [*]: Agent dismissed

    note right of Campfire: 2x2 tiles
    note right of Tent: 3x3 tiles
    note right of Hut: 4x4 tiles
    note right of Tower: 5x5 tiles
    note right of Fort: 6x6 tiles
```

### Fort Placement

```mermaid
graph TD
    subgraph Layout ["Fort Placement (radial)"]
        Oracle["Oracle Fort<br/>Center (60, 60)<br/>Always present"]

        N["N"]
        NE["NE"]
        E["E"]
        SE["SE"]
        S["S"]
        SW["SW"]
        W["W"]
        NW["NW"]

        Oracle --- N
        Oracle --- NE
        Oracle --- E
        Oracle --- SE
        Oracle --- S
        Oracle --- SW
        Oracle --- W
        Oracle --- NW
    end

    Note["8 compass positions<br/>~35-tile radius from center<br/>Sub-agents assigned at spawn time"]
```

---

## Fog Reveal Mechanics

The server maintains the canonical fog state. Fog is revealed incrementally as agents move.

```mermaid
sequenceDiagram
    participant Agent as Agent (SDK)
    participant BS as BridgeServer
    participant WS as WorldState
    participant Clients as All Clients
    participant MR as MapRenderer
    participant MM as Minimap

    Agent->>BS: action:result (move to x, y)
    BS->>WS: revealTiles(x, y, radius=5)
    Note over WS: Mark 5-tile radius as explored<br/>in explored[][] grid
    WS-->>BS: Newly revealed tile coordinates

    BS->>Clients: fog:reveal { tiles, agentId }

    Clients->>MR: revealTiles(tiles)
    Note over MR: Animate fog → transparent<br/>over ~500ms per tile

    Clients->>MM: revealTiles(tiles)
    Note over MM: Update minimap canvas<br/>Dark → biome color
```

### Skill-Driven Movement

Movement direction varies by brainstorm phase:

```mermaid
graph TD
    subgraph Divergent ["Divergent Phases"]
        D1["Agents explore OUTWARD<br/>from their fort"]
        D2["Biased away from center"]
        D3["Radius grows 2-4 tiles/turn"]
        D4["Agents isolated —<br/>fog between forts enforces<br/>can't see each other's output"]
    end

    subgraph Convergent ["Convergent Phases"]
        C1["Agents walk INWARD<br/>along established paths"]
        C2["Biased toward Oracle or<br/>toward each other"]
        C3["2x speed on path tiles"]
    end

    subgraph Parallel ["Parallel Phases"]
        P1["Agents with different biomes<br/>explore independently"]
    end
```

---

## Path System

Every tile an agent walks on becomes a path tile (type 8) if it's not already a structure tile. Over time, organic road networks form between forts and the hub.

```mermaid
graph TD
    Walk["Agent walks on tile"]
    Walk --> Check{"Tile is structure<br/>(wall, door, floor)?"}
    Check -->|"Yes"| NoChange["Keep original tile"]
    Check -->|"No"| Convert["Convert to path tile (8)"]
    Convert --> Network["Path networks form<br/>between forts and Oracle hub"]
    Network --> Speed["Convergent agents use paths<br/>at 2x movement speed"]
```

---

## Fort Interior View

Clicking a fort transitions to a room view using dungeon JPEG illustrations.

```mermaid
sequenceDiagram
    participant Player
    participant GS as GameScene
    participant WS as WebSocketClient
    participant BS as BridgeServer
    participant RB as RoomBackground
    participant CC as CameraController

    Player->>GS: Click FortSprite
    GS->>WS: fort:click { agentId }
    WS->>BS: Route to handler
    BS-->>WS: fort:view { agentId, roomImage, agentInfo }

    GS->>GS: inFortView = true
    GS->>RB: showDirect(roomImage, 20, 15, 32)
    GS->>CC: setMode('diorama')
    GS->>CC: updateBounds(20, 15, 32)
    GS->>GS: Add "Back to Map" button

    Player->>GS: Click "Back to Map"
    GS->>WS: fort:exit
    GS->>GS: inFortView = false
    GS->>CC: setMode('follow')
    Note over GS: Restore fog-of-war view
```

### Room Assignment

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

---

## Camera and Minimap

```mermaid
graph TD
    subgraph MainViewport ["Main Viewport (640x480)"]
        Camera["CameraController (follow mode)"]
        Camera --> Lerp["Smooth lerp tracking<br/>of active agent"]
        Camera --> Bounds["Bounded to 120x120 map<br/>(3840x3840 px)"]
        Camera --> View["Shows ~20x15 tile area"]
    end

    subgraph MinimapOverlay ["Minimap (160x160 DOM overlay)"]
        Mini["Canvas element (top-right)"]
        Mini --> Scale["~1.3px per tile"]
        Mini --> FogLayer["Dark = fogged<br/>Colored = biome"]
        Mini --> Forts2["Fort dots pulse<br/>in agent color"]
        Mini --> ActiveDot["Active agent =<br/>larger dot"]
    end
```

---

## Protocol Messages

### Client → Server

| Message | Fields | Purpose |
|---------|--------|---------|
| `fort:click` | `agentId` | Player clicks an agent's fort |
| `fort:exit` | (none) | Player exits fort interior view |

### Server → Client

| Message | Fields | Purpose |
|---------|--------|---------|
| `fog:reveal` | `tiles[], agentId` | Incrementally reveal fog tiles |
| `fort:update` | `agentId, stage, position` | Fort evolution stage change |
| `fort:view` | `agentId, roomImage, agentInfo` | Fort interior room data |

### WorldState Additions

| Field | Type | Purpose |
|-------|------|---------|
| `explored` | `boolean[][]` | 120x120 canonical fog grid |
| `fortStages` | `Map<string, number>` | Per-agent fort level (1-5) |
| `fortPositions` | `Map<string, {x,y}>` | Pre-assigned fort locations |
| `biomeMap` | `number[][]` | Biome zone IDs for terrain |
