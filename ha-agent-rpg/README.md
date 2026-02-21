# AI Agent RPG Interface

A visual theater for autonomous AI agents, rendered as a classic JRPG.

AI agents run as independent processes, connect via WebSocket to a bridge server, and their actions are rendered in real time by a Phaser.js game client — movement on a tile map, dialogue boxes, emote bubbles, skill effects, and more.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Python Agent  │────▶│   Bridge Server  │────▶│  Phaser Client  │
│  (any runtime)  │◀────│   (WebSocket)    │◀────│   (browser)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                        │                         │
        │                        │                         │
   LLM / script           Source of truth            Renders world
   decides actions       validates & broadcasts      as a JRPG
```

## Quick Start

**Prerequisites:** Node.js 18+, Python 3.10+

```bash
# Clone and install
git clone https://github.com/bgarakani/ha-agent-rpg.git
cd ha-agent-rpg
npm install
pip install -r agent/requirements.txt

# Run everything
./scripts/start-all.sh
```

Then open **http://localhost:5173** and watch two agents explore the world.

### Run Individually (3 terminals)

```bash
# Terminal 1 — Bridge server
npm run dev:server

# Terminal 2 — Phaser client
npm run dev:client

# Terminal 3 — Agent(s)
cd agent
python3 agent.py agent_1 Hero ff3300
python3 agent.py agent_2 Mage 3366ff    # in a 4th terminal
```

## Architecture

### Bridge Server (`server/`)

TypeScript WebSocket server on **port 3001**. The single source of truth.

- **WorldState** — 20x15 tile map (grass, walls, water), agent positions, HP/MP
- **TurnManager** — Round-robin turns, 5-second timeout per turn
- **ActionValidator** — Validates every action before applying it
- Broadcasts results to all connected agents and game clients

### Phaser Client (`client/`)

Phaser 3 game running in the browser on **port 5173**. Purely a renderer — it never sends actions, only receives state and results from the bridge.

- Tile-based map rendered from world state
- Agent sprites as colored rectangles (swap in real sprites later)
- JRPG dialogue box with typewriter text effect
- Emote bubbles (!, ?, ♥, ♪), skill effects, walk animations
- All textures generated programmatically — zero asset files

### Python Agent (`agent/`)

Sample agent demonstrating the full protocol lifecycle.

```bash
python3 agent.py <agent_id> <name> <color_hex>
```

The included `ScriptedBehavior` cycles through all 6 action types. Replace it with LLM calls to make agents autonomous.

## Action Schema

Every agent action follows the format:

```json
{
  "type": "agent:action",
  "agent_id": "scholar",
  "turn_id": 1,
  "action": "speak",
  "params": { "text": "I found something in the archives..." }
}
```

| Action      | Params                              | What Happens                    |
|-------------|-------------------------------------|---------------------------------|
| `move`      | `{ x, y }`                         | Sprite walks to adjacent tile   |
| `speak`     | `{ text, emote? }`                 | Dialogue box with typewriter    |
| `skill`     | `{ skill_id, target_id }`          | Effect animation + damage calc  |
| `interact`  | `{ object_id }`                    | Examine, open, trade            |
| `emote`     | `{ type }`                         | Floating bubble (!, ?, ♥, ♪)   |
| `wait`      | `{ duration_ms }`                  | Idle animation                  |

**Emote types:** `exclamation`, `question`, `heart`, `sweat`, `music`

## Protocol Flow

```
1. Agent connects     → sends agent:register { agent_id, name, color }
2. Server responds    → world:state (full snapshot)
3. Server broadcasts  → agent:joined (to everyone else)

Turn loop (round-robin):
4. Server → turn:start { agent_id, turn_id, timeout_ms }
5. Agent  → agent:action { action, params, turn_id }
6. Server validates, applies, broadcasts → action:result { success, error? }
7. Server → turn:start for next agent
```

If an agent doesn't respond within 5 seconds, the server auto-applies a `wait` action and advances the turn.

## Writing Your Own Agent

Any language with WebSocket support works. Here's the minimal loop:

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:3001") as ws:
        # Register
        await ws.send(json.dumps({
            "type": "agent:register",
            "agent_id": "my_agent",
            "name": "Scholar",
            "color": 0xa855f7
        }))

        async for raw in ws:
            msg = json.loads(raw)

            if msg["type"] == "turn:start" and msg["agent_id"] == "my_agent":
                # Your LLM / logic decides the action here
                await ws.send(json.dumps({
                    "type": "agent:action",
                    "agent_id": "my_agent",
                    "turn_id": msg["turn_id"],
                    "action": "speak",
                    "params": {"text": "Hello world!"}
                }))

asyncio.run(main())
```

## Project Structure

```
ha-agent-rpg/
├── shared/protocol.ts            # Canonical type definitions
├── server/src/
│   ├── index.ts                  # Entry point (port 3001)
│   ├── BridgeServer.ts           # WebSocket hub + message routing
│   ├── WorldState.ts             # Map, agents, positions, HP/MP
│   ├── TurnManager.ts            # Round-robin turn controller
│   └── ActionValidator.ts        # Action validation rules
├── client/src/
│   ├── main.ts                   # Phaser game entry point
│   ├── scenes/
│   │   ├── BootScene.ts          # Generates textures (no assets needed)
│   │   ├── GameScene.ts          # Map rendering + action handling
│   │   └── UIScene.ts            # Dialogue box + turn indicator
│   ├── systems/
│   │   ├── AgentSprite.ts        # Sprite with walk/emote/idle
│   │   ├── MapRenderer.ts        # Tile map renderer
│   │   ├── DialogueSystem.ts     # JRPG text box + typewriter
│   │   └── EffectSystem.ts       # Skill visual effects
│   └── network/
│       └── WebSocketClient.ts    # WS client with auto-reconnect
├── agent/
│   ├── agent.py                  # Sample agent entry point
│   ├── behaviors.py              # Scripted behavior sequence
│   └── protocol.py               # Python message helpers
└── scripts/
    └── start-all.sh              # Launch everything at once
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Game Client | Phaser 3, TypeScript, Vite |
| Bridge Server | Node.js, `ws`, TypeScript, `tsx` |
| Sample Agent | Python 3, `websockets` |

## License

MIT
