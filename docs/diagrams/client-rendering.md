# Client Rendering

How the Phaser client receives data and turns it into pixels. The client is a **pure renderer**; the server is the single source of truth.

## Screen Flow

```mermaid
stateDiagram-v2
    [*] --> TitleScreen: Page load
    TitleScreen --> RepoScreen: "Begin Quest" clicked
    RepoScreen --> Analyzing: Submit problem / resume realm
    Analyzing --> GameStarted: process:started or repo:ready
    GameStarted --> JoinScreen: Overlay appears
    JoinScreen --> Playing: Spectator registered

    Playing --> TitleScreen: /quit command

    note right of TitleScreen: Static landing page<br/>"Agent RPG" branding
    note right of RepoScreen: Problem input or<br/>realm history list
    note right of Analyzing: Loading spinner<br/>server analyzing repo
    note right of JoinScreen: Name + color picker<br/>for spectator identity
    note right of Playing: Phaser game active<br/>+ DOM panels visible
```

---

## Phaser Scene Lifecycle

Three scenes run in sequence. BootScene runs once; GameScene and UIScene run for the session.

```mermaid
sequenceDiagram
    participant Boot as BootScene
    participant Game as GameScene
    participant UI as UIScene
    participant WS as WebSocketClient

    Note over Boot: Preloads room background images
    Boot->>Boot: Generate 20+ procedural textures
    Note over Boot: grass (3 variants), wall, water (3 frames),<br/>door, floor, file objects, characters

    Boot->>Game: scene.start('GameScene')
    Boot->>UI: scene.launch('UIScene')
    Note over Game,UI: Both scenes run simultaneously

    WS-->>Game: world:state (initial)
    Game->>Game: Create MapRenderer + RoomBackground
    Game->>Game: Create CameraController
    Game->>Game: Create AgentSprites for each agent

    WS-->>Game: action:result (agent moves, speaks, etc.)
    Game->>Game: Animate sprites
    Game->>UI: Emit show-dialogue, agent-thought, agent-activity

    WS-->>Game: map:change (room transition)
    Game->>Game: Fade out → swap map → fade in
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
    end

    subgraph GameScene ["GameScene Handlers"]
        GS1["Sync agent sprites<br/>(create/update/remove)"]
        GS2["Animate: walkTo, emote,<br/>skill effect, interact"]
        GS3["Create new AgentSprite"]
        GS4["Destroy AgentSprite"]
        GS5["Fade out → new map → fade in"]
    end

    subgraph UIScene ["UIScene + Panels"]
        UI1["DialogueLog entry (speak)"]
        UI2["DialogueLog entry (thought)"]
        UI3["DialogueLog entry (activity)"]
        UI4["DialogueLog entry (finding)"]
        UI5["DialogueLog entry (stage announcement)"]
    end

    subgraph Panels ["DOM Panels"]
        P1["MiniMap: realm tree + presence"]
        P2["QuestLog: quest status"]
        P3["StageProgressBar: stage indicator"]
    end

    WS1 --> GS1
    WS1 --> P1
    WS1 --> P2
    WS2 --> GS2
    WS2 --> UI1
    WS3 --> GS3
    WS4 --> GS4
    WS5 --> GS5
    WS6 --> UI2
    WS7 --> UI3
    WS8 --> UI4
    WS9 --> UI5
    WS9 --> P3
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

## Room Rendering

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

## Camera System (Diorama Framing)

The camera always shows the entire room. No scrolling; the room is the stage.

```mermaid
graph TD
    subgraph Calculation ["Zoom Calculation"]
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
```

---

## Map Transitions

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

UI panels are HTML elements positioned around the Phaser canvas.

```
+--------------------------------------------------+
|  [Mode: Autonomous]              [Stage 3 of 9]  |  <- StageProgressBar
+--------------------------------------------------+
|                                  |                |
|                                  | MiniMap        |
|     Phaser Canvas (640x480)      | (folder tree)  |
|     - Room background            |                |
|     - Agent sprites              +----------------+
|     - Map objects                |                |
|                                  | QuestLog       |
|                                  | (quest list)   |
+----------------------------------+----------------+
|                                                   |
|  DialogueLog (scrolling message history)          |
|  [Oracle] Found race condition in reconnect...    |
|  [Test Guardian] Writing regression test...       |
|                                                   |
+--------------------------------------------------+
|  > Type a message or /command...          [Send]  |  <- PromptBar
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
| `/clear` | Clear dialogue log | Local |
| `/quit` | Return to title screen | Local |
| `/approve` | Approve brainstorm gate | Server (ProcessController) |
| `/inject [idea]` | Add idea to brainstorm | Server (ProcessController) |
| `/skip` | Skip optional stage | Server (ProcessController) |
| `/kill [id]` | Remove candidate | Server (ProcessController) |
| `/export` | Export brainstorm results | Server (ProcessController) |
