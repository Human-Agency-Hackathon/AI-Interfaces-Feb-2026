# Client Rendering

How the Phaser client receives data and turns it into pixels. The client is a **pure renderer**; the server is the single source of truth.

## Screen Flow

```mermaid
stateDiagram-v2
    [*] --> SplashScreen: Page load
    SplashScreen --> SetupScreen: "Enter the Dungeon" clicked
    SetupScreen --> Loading: Submit (name + color + problem)
    Loading --> Playing: process:started received

    Playing --> SessionComplete: process:completed
    SessionComplete --> Playing: "Keep Reading"
    SessionComplete --> SetupScreen: "New Session"

    Playing --> SetupScreen: /quit command

    note right of SplashScreen: Dungeon branding<br/>"Agent Dungeon" logo
    note right of SetupScreen: Name + color picker +<br/>problem textarea<br/>(all in one form)
    note right of Loading: SetupScreen.showLoading()<br/>+ process-loading-overlay<br/>"Spawning agents..."
    note right of Playing: Phaser game active<br/>+ DOM panels visible
    note right of SessionComplete: Overlay with options:<br/>Keep reading, Export, New session
```

---

## Phaser Scene Lifecycle

Three scenes run in sequence. BootScene runs once; GameScene and UIScene run for the session. Agent speech/thought/activity is rendered by SpeechBubbleManager as in-world bubbles above sprites (replacing the old DialogueLog sidebar panel and ThoughtBubble float-up).

```mermaid
sequenceDiagram
    participant Boot as BootScene
    participant Game as GameScene
    participant SBM as SpeechBubbleManager
    participant UI as UIScene
    participant WS as WebSocketClient

    Note over Boot: Preloads room background images
    Boot->>Boot: Generate 30+ procedural textures
    Note over Boot: Terrain: grass (3), wall, water (3),<br/>door, floor, tree, hill, sand,<br/>path, lava, crystal, fog<br/>Forts: stage 1-5<br/>Characters + file objects

    Boot->>Game: scene.start('GameScene')
    Boot->>UI: scene.launch('UIScene')
    Note over Game,UI: Both scenes run simultaneously
    Game->>SBM: new SpeechBubbleManager(this)

    WS-->>Game: world:state (initial)

    alt Large map (width > 60) — Fog-of-War mode
        Game->>Game: Create MapRenderer (tile mode)
        Game->>Game: Create CameraController (follow mode)
        Game->>Game: Create Minimap (canvas overlay)
        Game->>Game: Set initial fog/explored state
    else Small map (width <= 60) — Diorama mode
        Game->>Game: Create MapRenderer + RoomBackground
        Game->>Game: Create CameraController (diorama mode)
    end

    Game->>Game: Create AgentSprites for each agent

    WS-->>Game: action:result (speak/think)
    Game->>SBM: updateBubble(agentId, type, text, ...)
    Note over SBM: Per-agent bubble above sprite

    WS-->>Game: agent:thought
    Game->>SBM: updateBubble(agentId, 'think', ...)
    Game->>UI: Emit agent-thought (status text only)

    WS-->>Game: agent:activity
    Game->>SBM: updateBubble(agentId, 'activity', ...)

    WS-->>Game: action:result (move)
    Game->>SBM: repositionBubble(agentId, x, y)
    Note over SBM: Bubble follows sprite with tween

    Note over SBM: Per-frame update():<br/>off-screen detection,<br/>edge indicators,<br/>overlap stacking

    WS-->>Game: fog:reveal (fog-of-war mode only)
    Game->>Game: Reveal tiles on MapRenderer + Minimap

    WS-->>Game: fort:update (fog-of-war mode only)
    Game->>Game: Create/upgrade FortSprite
```

---

## Data Flow: WebSocket to Pixels

```mermaid
graph TD
    subgraph Network ["WebSocket Messages"]
        WS1["world:state"]
        WS2["action:result"]
        WS3["agent:joined"]
        WS4["agent:left"]
        WS5["map:change"]
        WS6["agent:thought"]
        WS7["agent:activity"]
        WS8["findings:posted"]
        WS9["stage:advanced"]
        WS10["agent:details"]
        WS11["fog:reveal"]
        WS12["fort:update"]
        WS13["fort:view"]
        WS14["spectator:welcome/joined/left"]
        WS15["process:completed"]
    end

    subgraph GameScene ["GameScene Handlers"]
        GS1["Sync agent sprites<br/>(create/update/remove)"]
        GS2["Animate: walkTo, emote,<br/>skill effect, interact"]
        GS3["Create new AgentSprite"]
        GS4["Destroy AgentSprite +<br/>removeBubble"]
        GS5["Fade out -> new map -> fade in"]
        GS6["Reveal fog tiles +<br/>update Minimap"]
        GS7["Create/upgrade FortSprite"]
        GS8["Enter fort interior<br/>(switch to diorama)"]
    end

    subgraph Bubbles ["SpeechBubbleManager (in-world)"]
        SB1["Speech bubble (speak)<br/>persists until replaced"]
        SB2["Thought bubble (think)<br/>fades after 4s + 2s"]
        SB3["Activity bubble (activity)<br/>fades after 3s + 1s"]
        SB4["repositionBubble<br/>(follows agent on move)"]
    end

    subgraph UIScene ["UIScene (minimal)"]
        UI1["statusText<br/>(active agent indicator)"]
        UI2["AgentDetailsPanel<br/>(show on agent click)"]
    end

    subgraph Panels ["DOM Sidebar Panels (collapsible)"]
        P1["MiniMap: realm tree + presence"]
        P2["QuestLog: quest status"]
        P3["StageProgressBar: stage indicator"]
        P4["SpectatorPanel: connected viewers"]
        P5["ServerInfoPanel: LAN address"]
    end

    WS1 --> GS1
    WS1 --> P1
    WS1 --> P2
    WS2 -->|"speak/think"| SB1
    WS2 -->|"speak/think"| SB2
    WS2 -->|"move"| GS2
    WS2 -->|"move"| SB4
    WS3 --> GS3
    WS4 --> GS4
    WS5 --> GS5
    WS6 --> SB2
    WS6 -->|"status text"| UI1
    WS7 --> SB3
    WS9 --> P3
    WS10 --> UI2
    WS11 --> GS6
    WS12 --> GS7
    WS13 --> GS8
    WS14 --> P4
    WS15 --> P5
```

---

## SpeechBubbleManager

Replaces the old ThoughtBubble (ephemeral float-up) and DialogueLog (sidebar scrollback) with persistent, per-agent speech bubbles rendered directly in the Phaser game world above each agent's sprite.

```mermaid
graph TD
    subgraph Sources ["Message Sources"]
        Speak["action:result (speak)"]
        Think1["action:result (think)"]
        Think2["agent:thought"]
        Activity["agent:activity"]
    end

    subgraph Manager ["SpeechBubbleManager"]
        UB["updateBubble(agentId, type,<br/>text, x, y, color, name)"]
        RP["repositionBubble(agentId, x, y)<br/>tween follows agent movement"]
        UF["update(camera)<br/>called every frame"]
        RB["removeBubble(agentId)<br/>on agent:left"]
    end

    subgraph BubbleTypes ["Bubble Types (hybrid fade)"]
        ST["speak: persists until<br/>agent's next message"]
        TT["think: italic text,<br/>fades after 4s delay + 2s"]
        AT["activity: tool icons,<br/>fades after 3s delay + 1s"]
    end

    subgraph Features ["Per-Frame Features"]
        Stack["Overlap stacking:<br/>push overlapping bubbles<br/>upward with gap"]
        Edge["Off-screen indicators:<br/>colored arrow + name label<br/>clamped to viewport edge"]
        Vis["Visibility toggle:<br/>hide bubble when agent<br/>leaves viewport"]
    end

    subgraph Anatomy ["Bubble Anatomy (Phaser objects)"]
        BG["Rectangle background<br/>depth 25, styled per type"]
        Name["Name tag (agent color)<br/>depth 27, uppercase"]
        Text["Text content (monospace)<br/>depth 26, word-wrapped"]
        Tail["Triangle tail (speak only)<br/>depth 25, points to sprite"]
    end

    Speak --> UB
    Think1 --> UB
    Think2 --> UB
    Activity --> UB

    UB --> ST
    UB --> TT
    UB --> AT

    UF --> Stack
    UF --> Edge
    UF --> Vis
```

---

## Dual Rendering Modes

The client operates in one of two rendering modes based on the initial `world:state` map dimensions.

```mermaid
graph TD
    WorldState["world:state received"]
    WorldState --> Check{"map.width > 60?"}

    Check -->|"Yes"| Fog["Fog-of-War Mode"]
    Check -->|"No"| Diorama["Diorama Mode"]

    subgraph FogMode ["Fog-of-War Mode (120x120 overworld)"]
        F1["MapRenderer: tile rendering<br/>(no room background)"]
        F2["CameraController: follow mode<br/>(smooth lerp, scroll bounds)"]
        F3["Minimap: canvas overlay<br/>(biome + fog + agents + forts)"]
        F4["FortSprites: per-agent forts<br/>(5 evolution stages, tinted)"]
        F5["Fog overlay: dark tiles<br/>(revealed incrementally)"]
    end

    subgraph DioramaMode ["Diorama Mode (small rooms)"]
        D1["MapRenderer: background mode"]
        D2["RoomBackground: JPEG illustration<br/>(hash-selected from 8 types)"]
        D3["CameraController: diorama mode<br/>(fit room, no scroll)"]
        D4["MapObjectSprites: file icons,<br/>nav doors, signs"]
    end

    Fog --> F1
    Fog --> F2
    Fog --> F3
    Fog --> F4
    Fog --> F5
    Diorama --> D1
    Diorama --> D2
    Diorama --> D3
    Diorama --> D4
```

---

## Agent Sprite Rendering

Each agent is rendered as a group of Phaser objects:

```mermaid
graph TD
    subgraph Sprite ["AgentSprite (per agent)"]
        Shadow["Shadow (ellipse)<br/>depth 9, pulse animation"]
        Char["Character sprite (20x24)<br/>depth 10, procedural pixel art"]
        Name["Name label (white text)<br/>depth 11, black stroke"]
        Status["Status dot (colored circle)<br/>depth 12"]
        Role["Role label (gray text)<br/>depth 11, below sprite"]
    end

    subgraph Animations ["Animations"]
        Walk["walkTo(x, y)<br/>300ms tween + squash bounce"]
        Emote["showEmote(type)<br/>Pop in → float up → fade out<br/>Types: !, ?, heart, sweat, music"]
        Idle["playIdle()<br/>Gentle squash loop"]
        Interact["playInteract()<br/>Blink + sparkle particles"]
    end

    subgraph Click ["Click Interaction"]
        ClickAgent["pointerdown on AgentSprite"]
        ClickAgent --> PanCam["Camera pans to agent"]
        ClickAgent --> ReqDetails["Send player:get-agent-details"]
        ClickAgent --> ShowPanel["UIScene shows AgentDetailsPanel"]
    end

    subgraph Generation ["Character Generation"]
        Color["Agent's hex color (e.g. #ff3300)"]
        Color --> Body["Body (base color)"]
        Color --> Dark["Body dark (0.6x)"]
        Color --> Light["Body light (1.4x)"]
        Color --> Hair["Hair (0.4x)"]
        Body --> PixelArt["20x24 pixel art character<br/>tunic, belt, arms, legs, boots"]
        PixelArt --> Cache["Cached by color hex<br/>(agent-char-ff3300)"]
    end
```

---

## Fort Sprite Rendering (Fog-of-War Mode)

Agent forts evolve through 5 stages as agents progress through their work.

```mermaid
graph TD
    subgraph FortEvolution ["Fort Evolution Stages"]
        S1["Stage 1: Campfire<br/>2x2 tiles"]
        S2["Stage 2: Tent<br/>3x3 tiles"]
        S3["Stage 3: Hut<br/>4x4 tiles"]
        S4["Stage 4: Tower<br/>5x5 tiles"]
        S5["Stage 5: Fort<br/>6x6 tiles"]
        S1 --> S2 --> S3 --> S4 --> S5
    end

    subgraph FortRender ["FortSprite Components"]
        Img["Image (fort-stage-N texture)<br/>depth 3, tinted by agent color"]
        Label["Name label (monospace 9px)<br/>depth 4, below fort"]
        Click2["Interactive: useHandCursor"]
        Click2 -->|"pointerdown"| Send["Send fort:click"]
        Send --> View["Receive fort:view"]
        View --> Interior["Switch to diorama mode<br/>(room JPEG + back button)"]
    end

    subgraph Upgrade ["Stage Upgrade"]
        NewStage["fort:update message"]
        NewStage --> SwapTex["Swap texture + re-tint"]
        NewStage --> Particles["Crystal particle burst<br/>(12 particles, 800ms)"]
    end
```

---

## Room Rendering (Diorama Mode)

Rooms use full-illustration backgrounds instead of tile-by-tile rendering.

```mermaid
graph TD
    subgraph Selection ["Room Selection (deterministic)"]
        Path["Folder path string"]
        Path --> Hash["FNV-1a hash"]
        Hash --> Room["Select room image<br/>(hash % 8 room types)"]
        Root["Root path (/ or '')"] --> Throne["Always throne room"]
    end

    subgraph Rooms ["8 Room Types"]
        R1["Throne Room"]
        R2["Laboratory"]
        R3["Library"]
        R4["Armory"]
        R5["Greenhouse"]
        R6["Forge"]
        R7["Test Chamber"]
        R8["Dungeon Cell"]
    end

    subgraph Render ["Rendering"]
        Source["1024x1024 JPEG"]
        Source --> Crop["Center-crop to room<br/>aspect ratio (cover mode)"]
        Crop --> Scale["Scale to room pixel dimensions"]
        Scale --> Filter["Linear filtering<br/>(smooth downscale)"]
        Filter --> Frame["Gold decorative frame<br/>(3px border)"]
    end
```

---

## Camera System

The camera has two modes depending on the rendering mode.

```mermaid
graph TD
    subgraph DioramaCam ["Diorama Mode"]
        Canvas["Canvas: 640 x 480"]
        Padding["Padding: 24px each side"]
        Available["Available: 592 x 432"]
        RoomSize["Room size in pixels:<br/>width * 32, height * 32"]

        Canvas --> Available
        Padding --> Available
        Available --> Zoom["zoom = min(<br/>  592 / roomPxW,<br/>  432 / roomPxH,<br/>  1.0)"]
        RoomSize --> Zoom
        Zoom --> Center["Camera centers on<br/>room midpoint"]
    end

    subgraph FollowCam ["Follow Mode (Fog-of-War)"]
        Target["Active agent position"]
        Target --> Lerp["Smooth lerp tracking"]
        Lerp --> Bounds["Camera bounded to<br/>map dimensions (120x120)"]
        Bounds --> Viewport["Shows ~20x15 tile area"]

        PanTo["panTo(x, y, agentId)"]
        PanTo --> Lerp
    end
```

---

## Map Transitions (Diorama Mode)

When navigating between folders, the camera fades between rooms.

```mermaid
sequenceDiagram
    participant Player
    participant GS as GameScene
    participant Cam as Camera
    participant MR as MapRenderer
    participant RB as RoomBackground
    participant Server as BridgeServer

    Player->>GS: Click nav_door object
    GS->>Server: player:navigate-enter { path }
    Server-->>GS: map:change { path, map, objects, position }

    GS->>Cam: fadeOut(300ms)
    Note over GS: Wait for fade complete
    GS->>GS: Destroy old MapObject sprites
    GS->>RB: setRoom(new path)
    Note over RB: Hash path → select room image<br/>Crop + scale to new dimensions
    GS->>MR: loadMap(new TileMapData)
    GS->>GS: Create new MapObject sprites
    GS->>GS: Reposition agent sprites
    GS->>Cam: fitRoom(new dimensions)
    GS->>Cam: fadeIn(300ms)
```

---

## DOM Panel Layout

UI panels are HTML elements positioned around the Phaser canvas. The sidebar is collapsible via a toggle button (`<<` / `>>`). Agent dialogue is no longer in the sidebar; it is rendered as in-world speech bubbles by SpeechBubbleManager directly above agent sprites in the Phaser canvas.

```
+--------------------------------------------------+
|                                  | [<<] toggle    |
|                                  +----------------+
|     Phaser Canvas (640x480)      |                |
|                                  | StageProgress  |
|  In-world speech bubbles:        | [3 of 9]       |
|     AGENT NAME (colored)         +----------------+
|     "Speech persists until       |                |
|      next message"               | AgentDetails   |
|     (think/activity auto-fade)   | (on click)     |
|                                  +----------------+
|  Diorama mode:                   |                |
|     - Room background            | Settings       |
|     - Agent sprites              | (max agents,   |
|     - Map objects                |  budget, etc.) |
|                                  +----------------+
|  Fog-of-war mode:                |                |
|     - Tile terrain + fog layer   | QuestLog       |
|     - Fort sprites               | (quest list)   |
|     - Agent sprites              |                |
|     - Minimap overlay (top-right)+----------------+
|                                  |                |
|                                  | PromptBar      |
|                                  | > /command...  |
+----------------------------------+----------------+

Sidebar collapsed (toggle shows >>):
+--------------------------------------------------+
|                                               [>>]|
|                                                   |
|     Phaser Canvas (full width)                    |
|                                                   |
|  Speech bubbles still render above agents         |
|  in the game world (independent of sidebar)       |
|                                                   |
+--------------------------------------------------+
```

---

## PromptBar Command Processing

```mermaid
graph TD
    Input["User types in PromptBar"]

    Input --> SlashCheck{"Starts with /?"}

    SlashCheck -->|"Yes"| Menu["Show autocomplete menu<br/>(filter matching commands)"]
    Menu --> Select["User selects command"]
    Select --> LocalCheck{"Local command?<br/>(/clear, /quit, /help)"}
    LocalCheck -->|"Yes"| Execute["Execute locally"]
    LocalCheck -->|"No"| SendCmd["Send as spectator:command"]

    SlashCheck -->|"No"| SendMsg["Send as spectator:command<br/>(plain text message)"]

    SendCmd --> Server["BridgeServer routes to<br/>target agent or ProcessController"]
    SendMsg --> Server
```

### Slash Commands

| Command | Action | Scope |
|---------|--------|-------|
| `/summon [name]` | Request agent spawn | Server |
| `/dismiss [name]` | Remove agent | Server |
| `/focus [name]` | Direct all commands to agent | Local |
| `/quit` | Return to setup screen | Local |
| `/approve` | Approve brainstorm gate | Server (ProcessController) |
| `/inject [idea]` | Add idea to brainstorm | Server (ProcessController) |
| `/skip` | Skip optional stage | Server (ProcessController) |
| `/kill [id]` | Remove candidate | Server (ProcessController) |
| `/export` | Export brainstorm results | Server (ProcessController) |
