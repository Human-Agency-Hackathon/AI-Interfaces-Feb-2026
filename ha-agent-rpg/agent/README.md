# AI Agents

This directory contains reference implementations of AI agents that connect to the AI Agent RPG bridge server.

## Agent Types

### 1. Scripted Agent (`agent.py`)

**Simple, deterministic agent for testing and demonstration.**

- Uses `ScriptedBehavior` to cycle through action types
- No external dependencies (just `websockets`)
- Good for testing the protocol and game mechanics

**Usage:**
```bash
python3 agent.py <agent_id> <name> <color_hex>

# Example
python3 agent.py scout_1 "Scout" ff6b35
```

---

### 2. LLM-Powered Agent (`llm_agent.py`)

**Autonomous agent using Claude API for intelligent decision-making.**

- Uses Claude 3.5 to analyze world state and choose actions
- Maintains conversation history for coherent behavior
- Can accomplish complex missions (explore, document, test)
- Two behavior modes: full (conversational) and simple (reflex)

**Prerequisites:**
```bash
pip install anthropic websockets

export ANTHROPIC_API_KEY="your-api-key"
# Get API key at: https://console.anthropic.com/
```

**Usage:**
```bash
python3 llm_agent.py <agent_id> <name> <color_hex> --mission "your mission"

# Examples:
python3 llm_agent.py explorer "Code Explorer" ff6b35 \
  --mission "Find and document all API endpoints in the codebase"

python3 llm_agent.py tester "Test Guardian" 3b82f6 \
  --mission "Identify files that need test coverage and report findings"

python3 llm_agent.py docs "Doc Scribe" 10b981 \
  --mission "Create documentation for undocumented modules"

# Use simple mode (faster, cheaper, no memory)
python3 llm_agent.py scout "Quick Scout" fbbf24 \
  --mission "Quickly explore the codebase" --simple
```

**Behavior Modes:**

| Mode | Model | Memory | Cost | Speed | Use Case |
|------|-------|--------|------|-------|----------|
| Full (default) | Sonnet 3.5 | Conversation history | Higher | Slower | Complex missions requiring context |
| Simple (`--simple`) | Haiku 3.5 | None (stateless) | Lower | Faster | Quick exploration, simple tasks |

---

## Creating Your Own Agent

Any language with WebSocket support can create an agent. Here's the protocol:

### 1. Connect

```
ws://localhost:3001
```

### 2. Register

```json
{
  "type": "agent:register",
  "agent_id": "my_agent_id",
  "name": "Display Name",
  "role": "Role Description",
  "realm": "/",
  "color": 16737075
}
```

### 3. Listen for Your Turn

```json
{
  "type": "turn:start",
  "agent_id": "my_agent_id",
  "turn_id": 42,
  "timeout_ms": 5000
}
```

### 4. Send Action

```json
{
  "type": "agent:action",
  "agent_id": "my_agent_id",
  "turn_id": 42,
  "action": "speak",
  "params": {
    "text": "Hello world!",
    "emote": "exclamation"
  }
}
```

### 5. Receive Result

```json
{
  "type": "action:result",
  "agent_id": "my_agent_id",
  "success": true
}
```

---

## Available Actions

| Action | Params | Description |
|--------|--------|-------------|
| `move` | `{ x: number, y: number }` | Move to adjacent tile |
| `speak` | `{ text: string, emote?: string }` | Display dialogue box |
| `skill` | `{ skill_id: string, target_id: string }` | Use skill on target |
| `interact` | `{ object_id: string }` | Interact with object |
| `emote` | `{ type: string }` | Show emote bubble (!, ?, ♥, ♪) |
| `wait` | `{ duration_ms: number }` | Idle for duration |
| `think` | `{ text: string }` | Show thought bubble |

---

## Module Reference

### `protocol.py`

Helper functions for protocol messages.

```python
from protocol import create_register_message, create_action_message

register = create_register_message("agent_1", "Explorer", 0xff6b35)
action = create_action_message("agent_1", 42, "speak", {"text": "Hello"})
```

### `behaviors.py`

Behavior implementations.

```python
from behaviors import ScriptedBehavior

behavior = ScriptedBehavior("agent_1")
action = behavior.next_action(world_state)  # Returns action dict
```

### `llm_behavior.py`

LLM-powered behaviors using Claude API.

```python
from llm_behavior import LLMBehavior, SimpleReflexBehavior

# Full conversational agent
behavior = LLMBehavior(
    agent_id="explorer_1",
    mission="Find all API endpoints",
    role="Code Explorer"
)

# Simple reflex agent (no memory)
simple = SimpleReflexBehavior(
    agent_id="scout_1",
    mission="Quick exploration"
)

action = behavior.next_action(world_state)
```

---

## Example: Custom JavaScript Agent

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  // Register
  ws.send(JSON.stringify({
    type: 'agent:register',
    agent_id: 'js_agent_1',
    name: 'JS Explorer',
    role: 'JavaScript Agent',
    realm: '/',
    color: 0x3b82f6
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'world:state') {
    console.log('World state received');
  }

  if (msg.type === 'turn:start' && msg.agent_id === 'js_agent_1') {
    // Your turn! Decide action
    ws.send(JSON.stringify({
      type: 'agent:action',
      agent_id: 'js_agent_1',
      turn_id: msg.turn_id,
      action: 'speak',
      params: { text: 'Hello from JavaScript!' }
    }));
  }
});
```

---

## Example: Custom Rust Agent

```rust
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures::{StreamExt, SinkExt};
use serde_json::json;

#[tokio::main]
async fn main() {
    let (ws_stream, _) = connect_async("ws://localhost:3001")
        .await
        .expect("Failed to connect");

    let (mut write, mut read) = ws_stream.split();

    // Register
    let register = json!({
        "type": "agent:register",
        "agent_id": "rust_agent",
        "name": "Rust Explorer",
        "role": "Systems Agent",
        "realm": "/",
        "color": 0xf97316
    });

    write.send(Message::Text(register.to_string())).await.unwrap();

    // Listen for messages
    while let Some(msg) = read.next().await {
        let msg = msg.unwrap();
        if let Message::Text(text) = msg {
            let data: serde_json::Value = serde_json::from_str(&text).unwrap();

            if data["type"] == "turn:start" && data["agent_id"] == "rust_agent" {
                let action = json!({
                    "type": "agent:action",
                    "agent_id": "rust_agent",
                    "turn_id": data["turn_id"],
                    "action": "speak",
                    "params": { "text": "Hello from Rust!" }
                });

                write.send(Message::Text(action.to_string())).await.unwrap();
            }
        }
    }
}
```

---

## Tips for LLM Agents

### Mission Design

Good missions are:
- **Specific:** "Document all API endpoints in src/api/" not "improve the code"
- **Measurable:** "Identify 10 files needing tests" not "make tests better"
- **Achievable:** Limited scope (1-2 directories, specific task)
- **Time-bound:** "Explore src/ and report in 20 turns"

**Examples:**
```bash
# Good
--mission "Find all TypeScript files in src/ and list their exported functions"
--mission "Identify configuration files and summarize their purpose"
--mission "Explore server/ directory and report architectural patterns"

# Too vague
--mission "Make the code better"
--mission "Help with the project"
```

### Cost Management

**Approximate costs per 100 turns:**

| Mode | Model | Input Tokens | Output Tokens | Cost |
|------|-------|--------------|---------------|------|
| Full | Sonnet 3.5 | ~50k | ~10k | ~$2.00 |
| Simple | Haiku 3.5 | ~10k | ~2k | ~$0.08 |

**Tips:**
- Use `--simple` for exploration/scouting
- Use full mode for complex analysis
- Set shorter missions (20-50 turns max)
- Monitor via Claude console dashboard

### Performance

- **Full mode:** ~2-3 seconds per action
- **Simple mode:** ~0.5-1 second per action
- Network latency: ~50-100ms
- Turn timeout: 5 seconds (configurable)

---

## Testing Your Agent

### 1. Start the server and client

```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:client
```

### 2. Run your agent

```bash
# Terminal 3
cd agent
source .venv/bin/activate
python3 llm_agent.py test_agent "Tester" ff0000 --mission "Test mission"
```

### 3. Watch in browser

Open http://localhost:5173 to see your agent in action!

---

## Troubleshooting

### "Connection refused"

Server isn't running. Start it with `npm run dev:server`

### "ANTHROPIC_API_KEY not set"

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Agent takes no actions

Check console for errors. Common issues:
- Invalid action format
- Claude API rate limit
- Network timeout

### "Invalid action" errors

Action doesn't match protocol. Check params match expected schema.

---

## Advanced: Claude Agent SDK Integration

The server itself uses the **Claude Agent SDK** to spawn agents. These agents:
- Are more powerful (can use MCP tools like SummonAgent, PostFindings)
- Run server-side (no network latency)
- Can access filesystem tools (Read, Edit, Write, Grep, Glob)
- Are spawned via `/summon` command

**Example:**
```
/summon name="Test Guardian" role="Testing Specialist" realm="/client/" mission="Write tests for client code"
```

This creates a full Claude Agent SDK session with access to all tools.

---

## Contributing

Want to add a new agent implementation?

1. Create a new file in `agent/` (e.g., `go_agent.go`, `java_agent.java`)
2. Implement the WebSocket protocol (see sections above)
3. Add example usage to this README
4. Submit a PR!

---

## References

- **Protocol Docs:** `../docs/API_REFERENCE.md`
- **Architecture:** `../docs/ARCHITECTURE.md`
- **Claude API:** https://docs.anthropic.com/
- **WebSocket Protocol:** https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
