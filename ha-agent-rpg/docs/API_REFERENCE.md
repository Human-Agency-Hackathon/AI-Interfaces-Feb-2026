# WebSocket Protocol API Reference

Complete reference for the AI Agent RPG WebSocket protocol.

## Connection

**Endpoint:** `ws://localhost:3001`

**Protocol:** Standard WebSocket (RFC 6455)

**Format:** JSON messages (all messages are valid JSON objects)

## Message Types

All messages have a `type` field identifying the message kind.

### Agent → Server Messages

#### `agent:register`

Register a new agent with the server.

```typescript
{
  type: 'agent:register';
  agent_id: string;        // Unique identifier (e.g., "oracle_1")
  name: string;            // Display name (e.g., "The Oracle")
  role: string;            // Agent role (e.g., "Code Explorer")
  realm: string;           // Directory scope (e.g., "/src/api/")
  color: number;           // Hex color (e.g., 0xff6b35)
}
```

**Response:** Server broadcasts `agent:joined` to all clients and sends `world:state` to the new agent.

**Example:**
```json
{
  "type": "agent:register",
  "agent_id": "oracle_1",
  "name": "The Oracle",
  "role": "Code Explorer",
  "realm": "/",
  "color": 16737075
}
```

---

#### `agent:action`

Execute an action during the agent's turn (used by non-SDK agents).

```typescript
{
  type: 'agent:action';
  agent_id: string;
  turn_id: number;
  action: ActionType;
  params: ActionParams;
}

type ActionType = 'move' | 'speak' | 'skill' | 'interact' | 'emote' | 'wait' | 'think';
```

**Action Parameters:**

| Action | Params | Description |
|--------|--------|-------------|
| `move` | `{ x: number, y: number }` | Move to adjacent tile |
| `speak` | `{ text: string, emote?: string }` | Display dialogue |
| `skill` | `{ skill_id: string, target_id: string }` | Use skill on target |
| `interact` | `{ object_id: string }` | Interact with map object |
| `emote` | `{ type: 'exclamation' \| 'question' \| 'heart' \| 'sweat' \| 'music' }` | Show emote bubble |
| `wait` | `{ duration_ms: number }` | Idle for duration |
| `think` | `{ text: string }` | Show thought bubble |

**Response:** Server sends `action:result` with success/failure.

**Example:**
```json
{
  "type": "agent:action",
  "agent_id": "oracle_1",
  "turn_id": 42,
  "action": "speak",
  "params": {
    "text": "I found something interesting in the codebase!",
    "emote": "exclamation"
  }
}
```

---

### Player → Server Messages

#### `player:command`

Execute a player command (slash command).

```typescript
{
  type: 'player:command';
  player_id: string;
  command: string;      // Command name (e.g., "summon", "quest")
  args: string[];       // Command arguments
}
```

**Available Commands:**

| Command | Args | Description |
|---------|------|-------------|
| `/summon` | `name="..." role="..." realm="..."` | Spawn new agent |
| `/quest` | (none) | Toggle quest log |
| `/help` | (none) | Show help |
| `/nav` | (none) | Show navigation help |
| `/dismiss` | `agent_id` | Dismiss an agent |

**Example:**
```json
{
  "type": "player:command",
  "player_id": "player_1",
  "command": "summon",
  "args": ["name=\"Doc Scribe\"", "role=\"Documentation Specialist\""]
}
```

---

#### `player:navigate-enter`

Enter a subdirectory (click on nav_door).

```typescript
{
  type: 'player:navigate-enter';
  player_id: string;
  object_id: string;    // MapObject ID (nav_door)
}
```

**Response:** Server sends `map:change` with new map data.

---

#### `player:navigate-back`

Return to parent directory (click on nav_back).

```typescript
{
  type: 'player:navigate-back';
  player_id: string;
}
```

**Response:** Server sends `map:change` with parent map data.

---

#### `player:link-repo`

Link a local repository for exploration.

```typescript
{
  type: 'player:link-repo';
  player_id: string;
  repo_path: string;    // Absolute path to repo
}
```

**Response:** Server sends `repo:ready` when map is generated.

---

### Server → All Messages

#### `world:state`

Full world snapshot (sent on connect and major changes).

```typescript
{
  type: 'world:state';
  agents: AgentInfo[];
  players: PlayerInfo[];
  map: TileMapData;
  objects: MapObject[];
  turn_state: {
    current_agent_id: string | null;
    turn_id: number;
    timeout_ms: number;
  };
  quests: Quest[];
}
```

**AgentInfo:**
```typescript
{
  agent_id: string;
  name: string;
  color: number;
  x: number;           // Tile X position
  y: number;           // Tile Y position
  role: string;
  realm: string;
  stats: AgentStats;
  status: 'starting' | 'running' | 'idle' | 'stopped';
  current_activity?: string;
}
```

**TileMapData:**
```typescript
{
  width: number;       // Grid width (default 20)
  height: number;      // Grid height (default 15)
  tile_size: number;   // Pixels per tile (default 32)
  tiles: number[][];   // 2D array of tile IDs (1=grass, 2=wall, 3=water)
}
```

**MapObject:**
```typescript
{
  id: string;
  type: 'file' | 'config' | 'doc' | 'quest_marker' | 'sign' | 'nav_door' | 'nav_back';
  x: number;
  y: number;
  label: string;
  metadata: {
    file_path?: string;       // For file objects
    target_realm?: string;    // For nav_door objects
    parent_realm?: string;    // For nav_back objects
  };
}
```

---

#### `agent:joined`

Broadcast when a new agent connects.

```typescript
{
  type: 'agent:joined';
  agent: AgentInfo;
}
```

---

#### `agent:left`

Broadcast when an agent disconnects.

```typescript
{
  type: 'agent:left';
  agent_id: string;
}
```

---

#### `action:result`

Result of an agent action.

```typescript
{
  type: 'action:result';
  agent_id: string;
  turn_id: number;
  action: ActionType;
  success: boolean;
  error?: string;       // Present if success=false
  result?: any;         // Action-specific result data
}
```

---

#### `turn:start`

Notify agent their turn has started (not broadcast).

```typescript
{
  type: 'turn:start';
  agent_id: string;
  turn_id: number;
  timeout_ms: number;   // Time to respond (default 5000)
}
```

---

#### `agent:thought`

Agent is thinking (thought bubble).

```typescript
{
  type: 'agent:thought';
  agent_id: string;
  text: string;         // Thought text
}
```

**Visual:** Shows thought bubble above agent sprite.

---

#### `agent:activity`

Agent is performing an activity.

```typescript
{
  type: 'agent:activity';
  agent_id: string;
  activity: string;     // Activity description (e.g., "Reading file...")
}
```

**Visual:** Shows activity indicator in UI.

---

#### `map:change`

Map changed due to navigation.

```typescript
{
  type: 'map:change';
  map: TileMapData;
  objects: MapObject[];
  current_path: string;    // Current directory path
  parent_path: string | null;
}
```

**Visual:** Client fades out, loads new map, fades in.

---

#### `realm:tree`

Directory hierarchy tree (for MiniMap).

```typescript
{
  type: 'realm:tree';
  tree: RealmNode;
}

interface RealmNode {
  path: string;
  name: string;
  children: RealmNode[];
}
```

---

#### `realm:presence`

Agent presence in realms (for MiniMap dots).

```typescript
{
  type: 'realm:presence';
  presence: Record<string, string[]>;  // realm_path → agent_ids
}
```

**Example:**
```json
{
  "type": "realm:presence",
  "presence": {
    "/": ["oracle_1"],
    "/src/api/": ["guardian_2"],
    "/client/": ["doc_scribe_3"]
  }
}
```

---

#### `quest:update`

Quest list updated.

```typescript
{
  type: 'quest:update';
  quests: Quest[];
}

interface Quest {
  quest_id: string;       // GitHub issue number
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  assigned_to: string[];  // Agent IDs
  status: 'open' | 'in_progress' | 'completed';
  labels: string[];
  url: string;            // GitHub issue URL
}
```

---

#### `spawn:request`

Agent requested to spawn another agent.

```typescript
{
  type: 'spawn:request';
  agent: {
    name: string;
    role: string;
    realm: string;
    mission: string;
    priority: 'low' | 'medium' | 'high';
  };
}
```

**Trigger:** Agent calls `SummonAgent` MCP tool.

---

#### `findings:posted`

Agent posted a finding to the team board.

```typescript
{
  type: 'findings:posted';
  finding: {
    finding_id: string;
    agent_id: string;
    realm: string;
    severity: 'low' | 'medium' | 'high';
    text: string;
    timestamp: string;  // ISO 8601
  };
}
```

**Trigger:** Agent calls `PostFindings` MCP tool.

---

#### `knowledge:level-up`

Agent gained expertise in an area.

```typescript
{
  type: 'knowledge:level-up';
  agent_id: string;
  area: string;         // Expertise area (e.g., "Testing")
  level: number;        // New level (1-10)
}
```

**Trigger:** Agent calls `UpdateKnowledge` MCP tool.

---

#### `repo:ready`

Repository linked and ready for exploration.

```typescript
{
  type: 'repo:ready';
  repo_path: string;
  initial_map: TileMapData;
  initial_objects: MapObject[];
}
```

---

## Connection Lifecycle

### Agent Connection Flow

```
1. Agent connects to ws://localhost:3001
2. Agent sends agent:register
3. Server sends world:state to agent
4. Server broadcasts agent:joined to all clients
5. Agent sprite appears in game

Turn loop:
6. Server sends turn:start to agent
7. Agent sends agent:action
8. Server sends action:result
9. Server broadcasts updates to all clients
10. Repeat from step 6 for next agent
```

### Player Connection Flow

```
1. Browser connects to ws://localhost:3001
2. Server sends world:state
3. Player can send player:command messages
4. Player receives all broadcasts (agent actions, state updates)
```

### Disconnection

- **Clean:** Client sends WebSocket close frame
- **Unclean:** Server detects connection loss after timeout
- **Result:** Server broadcasts `agent:left` or removes player
- **Reconnection:** Agents can reconnect with same agent_id to resume

## Error Handling

### Protocol Errors

If server receives invalid message:

```typescript
{
  type: 'error';
  error: string;        // Error description
  message_type: string; // Type of message that failed
}
```

**Common Errors:**
- `"Invalid message format"` - Malformed JSON
- `"Missing required field"` - Required field omitted
- `"Unknown message type"` - Unrecognized type
- `"Agent not registered"` - Action sent before registration
- `"Not your turn"` - Action sent when not current agent

### Action Errors

If action fails validation:

```typescript
{
  type: 'action:result';
  success: false;
  error: string;
}
```

**Common Action Errors:**
- `"Invalid move target"` - Target tile is blocked
- `"Target out of range"` - Skill target too far
- `"Unknown object"` - Interact target doesn't exist
- `"Invalid params"` - Missing or malformed params

## Rate Limiting

**Current:** No rate limiting (local development)

**Future:** 100 messages/second per connection

## Authentication

**Current:** None (local development only)

**Future:** API key authentication for agents, OAuth for players

## Versioning

**Current Version:** 1.0

**Header:** Include `X-Protocol-Version: 1.0` in WebSocket upgrade request (optional)

**Breaking Changes:** Will increment major version (2.0, 3.0, etc.)

## Testing

### WebSocket Client Examples

**JavaScript (Browser):**
```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'agent:register',
    agent_id: 'test_agent',
    name: 'Test',
    role: 'Tester',
    realm: '/',
    color: 0xff6b35
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Received:', msg);
};
```

**Python:**
```python
import asyncio
import json
import websockets

async def test_agent():
    async with websockets.connect('ws://localhost:3001') as ws:
        # Register
        await ws.send(json.dumps({
            'type': 'agent:register',
            'agent_id': 'test_agent',
            'name': 'Test',
            'role': 'Tester',
            'realm': '/',
            'color': 0xff6b35
        }))

        # Listen
        async for message in ws:
            msg = json.loads(message)
            print('Received:', msg)

asyncio.run(test_agent())
```

**curl (handshake only):**
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(echo -n $RANDOM | base64)" \
  http://localhost:3001
```

## Debugging

Enable debug logging by setting environment variable:

```bash
DEBUG=agent-rpg:* npm run dev:server
```

## References

- **WebSocket RFC:** https://datatracker.ietf.org/doc/html/rfc6455
- **JSON Specification:** https://www.json.org/
- **TypeScript Types:** See `shared/protocol.ts` for canonical type definitions
