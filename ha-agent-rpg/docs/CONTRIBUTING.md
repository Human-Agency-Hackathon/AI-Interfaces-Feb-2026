# Contributing Guide

Welcome to the AI Agent RPG project! This guide will help you get started contributing.

## Quick Start

### Prerequisites

- **Node.js** 18+ (check with `node --version`)
- **Python** 3.10+ (check with `python3 --version`)
- **Git** (check with `git --version`)
- **GitHub CLI** (optional, for quest system): `brew install gh` or see [cli.github.com](https://cli.github.com)

### Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/ha-agent-rpg.git
cd ha-agent-rpg

# 3. Install dependencies
npm install

# 4. Install Python agent dependencies
cd agent
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 5. Run tests to verify setup
npm test                    # Server tests
npm run test:client         # Client tests

# 6. Start development servers
./scripts/start-all.sh
```

Visit http://localhost:5173 - you should see the game client.

## Project Structure

```
ha-agent-rpg/
├── server/          # Bridge server (TypeScript, Node.js, WebSocket)
├── client/          # Game client (TypeScript, Phaser 3, Vite)
├── agent/           # Sample Python agent
├── shared/          # Shared protocol types
├── .knowledge/      # Agent knowledge vault (git-ignored)
├── docs/            # Documentation
└── scripts/         # Utility scripts
```

## Development Workflow

### Branch Strategy

- `main` - Stable release branch
- `develop` - Active development branch
- Feature branches: `feat/your-feature-name`
- Bug fixes: `fix/issue-description`

### Making Changes

1. **Create a branch from `develop`:**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/your-feature
   ```

2. **Make your changes**

3. **Write tests** (required for new features)

4. **Run tests and type checks:**
   ```bash
   npm test                    # Server tests
   npm run test:client         # Client tests
   npm run build               # Verify TypeScript compiles
   ```

5. **Commit with conventional commits:**
   ```bash
   git commit -m "feat: add agent collaboration tools"
   git commit -m "fix: resolve WebSocket reconnection bug"
   git commit -m "docs: update architecture guide"
   ```

6. **Push and create PR:**
   ```bash
   git push origin feat/your-feature
   # Then create PR on GitHub targeting `develop`
   ```

## Coding Standards

### TypeScript

- **Strict mode:** All code uses TypeScript strict mode
- **Naming:**
  - Classes: `PascalCase` (e.g., `AgentSprite`)
  - Functions/variables: `camelCase` (e.g., `handleMessage`)
  - Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_AGENTS`)
  - Files: `PascalCase.ts` for classes, `camelCase.ts` for utilities
- **Imports:** Use absolute imports from workspace roots
- **Types:** Prefer interfaces over types, export from `types.ts`

### Python

- **Style:** Follow PEP 8
- **Type hints:** Required for all functions
- **Docstrings:** Required for public APIs

### File Organization

**Server:**
```
server/src/
├── BridgeServer.ts           # Main server class
├── WorldState.ts             # Game state
├── systems/                  # Game systems (turn, action, etc.)
├── generators/               # Map generation, etc.
├── network/                  # WebSocket, protocol handlers
├── mcp/                      # MCP tool integration
└── __tests__/                # Test files
```

**Client:**
```
client/src/
├── main.ts                   # Entry point
├── scenes/                   # Phaser scenes
├── systems/                  # Game systems (sprites, rendering)
├── panels/                   # DOM UI panels
├── network/                  # WebSocket client
├── types.ts                  # Type definitions
└── __tests__/                # Test files
```

## Testing

### Server Tests

- **Framework:** Vitest + tsx
- **Location:** `server/src/__tests__/**/*.test.ts`
- **Run:** `npm test` (from root) or `npm test` (from server/)
- **Coverage:** `npm run test:coverage`
- **Pattern:** Co-locate tests with code in `__tests__/` directories

**Example:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../WorldState';

describe('WorldState', () => {
  let world: WorldState;

  beforeEach(() => {
    world = new WorldState();
  });

  it('should add agent', () => {
    const agent = { agent_id: 'a1', name: 'Test', /* ... */ };
    world.addAgent(agent);
    expect(world.agents.has('a1')).toBe(true);
  });
});
```

### Client Tests

- **Framework:** Vitest + jsdom
- **Location:** `client/src/__tests__/**/*.test.ts`
- **Run:** `npm run test:client` (from root)
- **Mocking:** WebSocket is mocked globally in `src/test/setup.ts`

**Example:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { WebSocketClient } from '../../network/WebSocketClient';

describe('WebSocketClient', () => {
  it('should register listeners', () => {
    const client = new WebSocketClient('ws://localhost:3001');
    const handler = vi.fn();
    client.on('world:state', handler);
    // ...
  });
});
```

### Testing Phaser Components

Phaser needs mocking. Here's a basic pattern:

```typescript
import { vi } from 'vitest';

// Mock Phaser globally
vi.mock('phaser', () => ({
  Scene: class MockScene {
    add = { sprite: vi.fn() };
    tweens = { add: vi.fn() };
  }
}));

// Then test your component
```

## Common Tasks

### Adding a New Protocol Message

1. **Define type in `shared/protocol.ts`:**
   ```typescript
   export interface AgentThoughtMessage {
     type: 'agent:thought';
     agent_id: string;
     text: string;
   }
   ```

2. **Add to union type:**
   ```typescript
   export type Message =
     | WorldStateMessage
     | AgentThoughtMessage  // Add here
     | ...;
   ```

3. **Handle in BridgeServer:**
   ```typescript
   private handleAgentMessage(ws: WebSocket, msg: Message) {
     if (msg.type === 'agent:thought') {
       this.broadcast(msg);
     }
   }
   ```

4. **Handle in client:**
   ```typescript
   this.ws.on('agent:thought', (msg) => {
     this.showThoughtBubble(msg.agent_id, msg.text);
   });
   ```

5. **Write tests** for server and client handlers

### Adding a New MCP Tool

1. **Define in `server/src/mcp/RpgMcpServer.ts`:**
   ```typescript
   {
     name: 'MyNewTool',
     description: 'What this tool does',
     inputSchema: {
       type: 'object',
       properties: {
         param1: { type: 'string', description: '...' }
       },
       required: ['param1']
     }
   }
   ```

2. **Implement handler in `CustomToolHandler.ts`:**
   ```typescript
   private async handleMyNewTool(args: { param1: string }) {
     // Tool logic here
     return { success: true, result: '...' };
   }
   ```

3. **Add to switch in `executeTool()`:**
   ```typescript
   case 'MyNewTool':
     return this.handleMyNewTool(args);
   ```

4. **Update agent system prompt** to document the tool

5. **Write integration test**

### Adding a New UI Panel

1. **Create panel class in `client/src/panels/MyPanel.ts`:**
   ```typescript
   export class MyPanel {
     private element: HTMLElement;

     constructor() {
       this.element = document.getElementById('my-panel')!;
       this.setupListeners();
     }

     show() { this.element.style.display = 'block'; }
     hide() { this.element.style.display = 'none'; }
   }
   ```

2. **Add DOM element in `client/index.html`:**
   ```html
   <div id="my-panel" class="panel">
     <!-- Panel content -->
   </div>
   ```

3. **Style in `client/src/style.css`:**
   ```css
   #my-panel {
     position: absolute;
     /* ... */
   }
   ```

4. **Wire in GameScene:**
   ```typescript
   this.myPanel = new MyPanel();
   this.ws.on('some:event', (msg) => {
     this.myPanel.update(msg);
   });
   ```

### Adding a New Agent Action Type

1. **Define in `shared/protocol.ts`:**
   ```typescript
   export interface MyActionParams {
     /* params */
   }
   export type ActionType = 'move' | 'speak' | 'myaction' | ...;
   ```

2. **Add validation in `server/src/ActionValidator.ts`:**
   ```typescript
   private validateMyAction(agent: AgentInfo, params: MyActionParams): boolean {
     // Validation logic
   }
   ```

3. **Add execution in `server/src/WorldState.ts`:**
   ```typescript
   private applyMyAction(agent: AgentInfo, params: MyActionParams) {
     // Update world state
   }
   ```

4. **Add rendering in `client/src/scenes/GameScene.ts`:**
   ```typescript
   if (result.action === 'myaction') {
     this.renderMyAction(agent, params);
   }
   ```

5. **Write tests** for validation and execution

## CI/CD

### GitHub Actions Workflows

- **`ci.yml`** - Runs on every push to `main`/`develop`
  - Server tests with coverage
  - Client build
  - Type checking
  - Coverage reporting to Codecov

- **`pr-validation.yml`** - Runs on all PRs
  - PR size validation (max 800 lines)
  - Required labels check
  - Full test suite
  - Build verification

### PR Requirements

Your PR must:
- ✅ Pass all tests (`npm test` and `npm run test:client`)
- ✅ Pass type checking (`npm run build`)
- ✅ Have at least one label (e.g., `feature`, `bugfix`, `documentation`)
- ✅ Be under 800 lines (or have `large-pr` label with justification)
- ✅ Include tests for new features
- ✅ Update documentation if changing APIs

## Debugging

### Server Debugging

```bash
# Run with debug logging
DEBUG=* npm run dev:server

# Run tests with debugging
npm test -- --inspect-brk
```

### Client Debugging

- Open browser dev tools (F12)
- Check Console tab for logs
- Use Network tab to inspect WebSocket messages
- Phaser Debug Draw: Press `D` in game (if implemented)

### Agent Debugging

```bash
cd agent
source .venv/bin/activate

# Run with verbose logging
python3 agent.py my_agent "Test" ff0000 --verbose
```

## Troubleshooting

### "Cannot find module" errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### WebSocket connection fails

- Check server is running on port 3001: `lsof -i :3001`
- Check client .env has correct WS URL
- Check firewall settings

### Tests fail with "setup.ts not found"

This should be fixed now, but if you see it:
```bash
cd client
ls src/test/setup.ts  # Should exist
```

### Python agent won't connect

```bash
# Check server is running
curl http://localhost:3001

# Check Python deps
pip install -r agent/requirements.txt

# Check Python version
python3 --version  # Should be 3.10+
```

## Communication

- **Issues:** Report bugs and request features via GitHub Issues
- **Discussions:** Design discussions in GitHub Discussions
- **PRs:** Code review happens in pull request comments

## Code Review Process

1. **Automated checks** run first (tests, linting)
2. **Reviewer** assigned automatically (or self-assign)
3. **Feedback** provided as PR comments
4. **Revisions** made based on feedback
5. **Approval** from at least 1 reviewer
6. **Merge** to `develop` (squash merge for features)

## Documentation

- **Architecture changes:** Update `docs/ARCHITECTURE.md`
- **API changes:** Update relevant docs + code comments
- **New features:** Add usage examples to README.md
- **Protocol changes:** Update protocol diagrams in docs/

## Getting Help

- **Stuck?** Open a GitHub Issue with the `question` label
- **Found a bug?** Open an Issue with the `bug` label
- **Want to contribute but don't know where?** Check issues labeled `good-first-issue`

## Recognition

Contributors are listed in:
- Repository contributors page (automatic)
- Release notes (manual, for significant contributions)
- Thank you in commit messages with `Co-Authored-By`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Happy coding!** 🎮🤖
