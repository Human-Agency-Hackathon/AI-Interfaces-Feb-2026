# AI Agent RPG Interface

A JRPG-style visual platform for autonomous AI agents collaborating on codebases. Agents explore directory structures as dungeon maps, claim GitHub issues as quests, and share knowledge using custom MCP tools — all powered by the Claude Agent SDK.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Agent   │────▶│   Bridge Server  │────▶│  Phaser Client  │
│  SDK Sessions   │◀────│   (WebSocket)    │◀────│   (browser)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                        │                         │
        │                        │                         │
   Autonomous AI          Event translation         Renders world
   with MCP tools         + world state              as a JRPG
```

## Quick Start

**Prerequisites:** Node.js 18+, Python 3.10+

```bash
# Clone and install
git clone https://github.com/bgarakani/ha-agent-rpg.git
cd ha-agent-rpg
npm install

# Set up environment
export ANTHROPIC_API_KEY="your-api-key"
# Get your key at: https://console.anthropic.com/

# Start server and client
npm run dev:server  # Terminal 1 (port 3001)
npm run dev:client  # Terminal 2 (port 5173)
```

Open **http://localhost:5173**, then use the in-game prompt bar to summon agents:

```
/summon name="Code Explorer" role="Explorer" mission="Find all API endpoints"
/summon name="Doc Scribe" role="Writer" mission="Document the authentication system"
```

Watch agents autonomously explore your codebase, collaborate, and share findings in real-time!

### Alternative: Scripted Test Agents

For testing the visualization without API costs:

```bash
# Terminal 3 - Launch test agents
./scripts/start-all.sh
```

This starts the bridge server, Phaser client, and two scripted test agents (Hero, Mage).

## What Makes This Different?

**Traditional JRPG:** Players control characters manually
**AI Agent RPG:** AI agents act autonomously using Claude Agent SDK

### Core Capabilities

- **🤖 Autonomous Agents**: Claude SDK agents with file system access (Read, Edit, Write, Grep, Glob, Bash)
- **🎮 JRPG Visualization**: Phaser 3 rendering with agent sprites, dialogue boxes, emotes
- **🗺️ Hierarchical Navigation**: Directories become dungeon rooms, files become interactive objects
- **🛠️ Custom MCP Tools**: 6 collaboration tools (SummonAgent, RequestHelp, PostFindings, UpdateKnowledge, ClaimQuest, CompleteQuest)
- **📚 Knowledge Persistence**: Agent memories saved across sessions (`.agent-rpg/knowledge/`)
- **🎯 Quest System**: GitHub issues integrated as in-game quests
- **👥 Team Collaboration**: Agents share findings, request help, and summon specialists

## Architecture Overview

### Agent Workflow

1. **Summon Agent** → Player or agent uses `/summon` command or `SummonAgent` MCP tool
2. **Agent Spawns** → BridgeServer creates Claude SDK session with mission prompt + MCP tools
3. **Autonomous Exploration** → Agent uses SDK tools (Read, Grep, Edit) to explore/modify codebase
4. **Visual Feedback** → EventTranslator converts SDK events to JRPG protocol (dialogue, movement, emotes)
5. **Collaboration** → Agents post findings, request help, update knowledge vault
6. **Quest Completion** → Agent marks GitHub issues as complete

### MCP Tools Available to Agents

| Tool | Purpose | Example |
|------|---------|---------|
| `SummonAgent` | Request specialist agent | Summon a test-writer when fixing bugs |
| `RequestHelp` | Ask another agent | "What's the auth strategy?" |
| `PostFindings` | Share discovery | "Found critical security issue in auth.ts" |
| `UpdateKnowledge` | Save insight | "This codebase uses Phaser 3 for rendering" |
| `ClaimQuest` | Assign GitHub issue | Claim issue #42 |
| `CompleteQuest` | Mark quest done | Complete with summary |

### Directory Structure

```
ha-agent-rpg/
├── server/              # Bridge server (TypeScript, WebSocket)
│   ├── src/
│   │   ├── BridgeServer.ts        # WebSocket hub + message routing
│   │   ├── AgentSessionManager.ts # Claude SDK session management
│   │   ├── WorldState.ts          # Game state (single source of truth)
│   │   ├── MapGenerator.ts        # Directory → tile map converter
│   │   ├── CustomToolHandler.ts   # MCP tool execution
│   │   ├── EventTranslator.ts     # SDK events → RPG protocol
│   │   ├── KnowledgeVault.ts      # Persistent agent memory
│   │   ├── FindingsBoard.ts       # Team knowledge sharing
│   │   └── QuestManager.ts        # GitHub issues integration
│   └── __tests__/       # 209 passing tests
├── client/              # Phaser 3 game client
│   ├── src/
│   │   ├── scenes/      # GameScene, UIScene, BootScene
│   │   ├── systems/     # AgentSprite, MapRenderer, Dialogue
│   │   └── panels/      # MiniMap, QuestLog, PromptBar
├── agent/               # Reference agent implementations
│   ├── agent.py         # Scripted test agent
│   ├── llm_agent.py     # Claude-powered agent (alternative)
│   └── README.md        # Agent development guide
├── docs/
│   ├── ARCHITECTURE.md  # Comprehensive architecture guide
│   ├── API_REFERENCE.md # Protocol and API documentation
│   └── CONTRIBUTING.md  # Developer onboarding
└── scripts/
    └── start-all.sh     # Launch server + client + test agents
```

## Key Features

### 1. Hierarchical Navigation

Directories map to dungeon rooms. Agents can navigate using visual "doors":

- **Yellow Triangles** (▼) → Subdirectories (navigate down)
- **Blue Triangle** (▲) → Parent directory (navigate up)
- MiniMap shows directory tree with agent presence indicators

### 2. Persistent Knowledge

Agents remember what they learn across sessions:

```yaml
# .agent-rpg/knowledge/agents/CodeExplorer.md
expertise:
  Architecture: 5
  Testing: 3
realm_knowledge:
  /src/api/: 4
insights:
  - "Server uses TypeScript strict mode + ESM"
  - "Client bundle is 1.53 MB - could be code-split"
```

### 3. Team Findings Board

All agents see shared discoveries:

```json
{
  "agent_id": "code_explorer",
  "severity": "high",
  "realm": "/client/",
  "finding": "Client tests failing with ERR_REQUIRE_ESM",
  "timestamp": "2026-02-21T10:00:00Z"
}
```

### 4. Quest Integration

GitHub issues become in-game quests. Agents can:
- View open issues in Quest Log (toggle with `/quest`)
- Claim issues with `ClaimQuest` tool
- Mark complete with `CompleteQuest` tool (updates GitHub labels)

## Writing Custom Agents

### Option 1: Use Claude SDK (Recommended)

Summon agents via `/summon` command in the game. No code required!

### Option 2: Use llm_agent.py (Standalone)

```bash
cd agent
pip install anthropic websockets

python3 llm_agent.py explorer "Explorer" ff6b35 \
  --mission "Find all TODO comments and create a report"
```

### Option 3: Build Your Own (Any Language)

Minimal WebSocket protocol:

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:3001") as ws:
        # Register
        await ws.send(json.dumps({
            "type": "agent:register",
            "agent_id": "my_agent",
            "name": "Scout",
            "role": "Explorer",
            "realm": "/src/",
            "color": 0xa855f7
        }))

        # Listen for events
        async for raw in ws:
            msg = json.loads(raw)
            # Handle world:state, action:result, etc.

asyncio.run(main())
```

See [`agent/README.md`](./agent/README.md) for full protocol documentation.

## Player Commands

Type commands in the in-game prompt bar:

| Command | Description | Example |
|---------|-------------|---------|
| `/summon` | Spawn new agent | `/summon name="Tester" mission="Write tests for auth"` |
| `/quest` | Toggle quest log | `/quest` |
| `/help` | Show commands | `/help` |
| `/nav <path>` | Navigate to directory | `/nav src/api/` |

## Development

### Run Tests

```bash
# Server tests (209 tests, all passing)
npm run test:server

# Client tests (5 tests)
npm run test:client

# Coverage reports
npm run coverage:server
```

### Build for Production

```bash
npm run build:server  # → server/dist/
npm run build:client  # → client/dist/

npm run start:server  # Production server
```

## Documentation

- **[📚 Architecture Guide](./docs/ARCHITECTURE.md)** - Deep dive into system design, modules, data flow
- **[📖 API Reference](./docs/API_REFERENCE.md)** - Protocol messages, schemas, examples
- **[🤝 Contributing](./docs/CONTRIBUTING.md)** - Developer onboarding, coding standards, PR process
- **[🤖 Agent Guide](./agent/README.md)** - How to create and customize agents

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Game Client | Phaser 3, TypeScript, Vite |
| Bridge Server | Node.js, `ws`, TypeScript, `tsx` |
| AI Agents | Claude Agent SDK (via Anthropic) |
| MCP Tools | Custom in-process MCP server |
| Testing | Vitest, 209 server tests passing |

## Current Status

✅ **Production Ready**
- 209/209 server tests passing
- Full Claude Agent SDK integration
- Comprehensive documentation (1,690 lines)
- Event-driven WebSocket architecture
- 6 custom MCP tools operational
- Knowledge persistence + findings board
- Quest system (GitHub integration)
- Hierarchical navigation system

## License

MIT

---

**Next Steps:**
1. Set your `ANTHROPIC_API_KEY` environment variable
2. Start the server and client (`npm run dev:server`, `npm run dev:client`)
3. Open http://localhost:5173
4. Use `/summon` to spawn agents and watch them work!

For detailed architectural information, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
