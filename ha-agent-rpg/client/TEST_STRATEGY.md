# Client Test Implementation Strategy

> **Mission:** Close the critical test coverage gap in the client codebase (currently 1 test file vs 23 source files)
>
> **Priority:** High (Task #6 in TASKS.md)
>
> **Target Coverage:** 80% (lines, functions, branches, statements per vite.config.ts)

---

## 📊 Current State Analysis

### Test Coverage Snapshot
- **Existing Tests:** 1 file (`WebSocketClient.test.ts` - 80 lines, 5 tests)
- **Source Files:** 23 TypeScript files
- **Coverage Gap:** ~95% of codebase untested
- **Infrastructure:** ✅ Vitest + jsdom + coverage tools configured

### Codebase Structure
```
client/src/
├── scenes/           # 3 files (867 lines) - Phaser lifecycle
│   ├── BootScene.ts       # 493 lines - texture generation
│   ├── GameScene.ts       # 394 lines - game orchestration
│   └── UIScene.ts         # 74 lines - UI event coordination
├── systems/          # 9 files - game mechanics
│   ├── AgentSprite.ts     # 373 lines - character rendering
│   ├── CameraController.ts # 97 lines - camera logic
│   ├── DialogueSystem.ts  # 103 lines - text display
│   ├── EffectSystem.ts    # 117 lines - particle effects
│   └── ... (5 more)
├── panels/           # 5 files - DOM UI components
│   ├── PromptBar.ts       # 595 lines - command system
│   └── ... (4 more)
├── network/          # 1 file - WebSocket client
│   └── WebSocketClient.ts # 57 lines - ✅ 5 basic tests exist
├── screens/          # 2 files - pre-game UI
└── main.ts           # 241 lines - app entry, WS message routing
```

---

## 🎯 Testing Priority Tiers

### Tier 1: Critical Path (High ROI, Low Complexity)
**Goal:** Establish test foundation + cover business-critical logic

1. **WebSocketClient** (enhance existing tests)
   - ✅ Basic tests exist
   - ❌ Missing: reconnection logic, error handling, message routing
   - **Priority:** High | **Complexity:** Low | **Impact:** High

2. **CameraController** (pure logic, no Phaser dependencies)
   - Pan/snap logic
   - Follow mode state management
   - Bounds enforcement
   - **Priority:** High | **Complexity:** Low | **Impact:** Medium

3. **main.ts Message Handlers** (critical orchestration)
   - Test 9 WebSocket message types
   - Game start/stop lifecycle
   - Event routing to Phaser
   - **Priority:** High | **Complexity:** Medium | **Impact:** High

### Tier 2: Game Systems (Medium Complexity)
**Goal:** Cover sprite and effect logic with Phaser mocks

4. **AgentSprite**
   - Texture generation (snapshot tests)
   - Walk animation logic
   - Emote system
   - **Priority:** Medium | **Complexity:** Medium | **Impact:** Medium

5. **DialogueSystem**
   - Typewriter effect timing
   - Layout calculations
   - Auto-dismiss behavior
   - **Priority:** Medium | **Complexity:** Medium | **Impact:** Low

6. **EffectSystem**
   - Particle creation
   - Tween sequences
   - Target resolution
   - **Priority:** Medium | **Complexity:** Medium | **Impact:** Low

### Tier 3: Scenes (High Complexity, Integration Tests)
**Goal:** Test scene lifecycle with Phaser Test Runner

7. **BootScene**
   - Texture generation (12+ textures)
   - Scene transition to GameScene
   - **Priority:** Medium | **Complexity:** High | **Impact:** Medium

8. **GameScene**
   - System initialization
   - WebSocket event handling
   - Player input processing
   - Map rendering coordination
   - **Priority:** High | **Complexity:** High | **Impact:** High

9. **UIScene**
   - Event subscription
   - DOM panel coordination
   - **Priority:** Low | **Complexity:** Medium | **Impact:** Low

### Tier 4: Panels (DOM-heavy, E2E tests)
**Goal:** Test DOM manipulation with jsdom

10. **PromptBar**
    - Slash command parsing
    - Command menu autocomplete
    - Mode cycling
    - WebSocket message sending
    - **Priority:** High | **Complexity:** Medium | **Impact:** High

11. **QuestLog, MiniMap, DialogueLog, SidebarPanel**
    - DOM rendering
    - Event handling
    - State updates
    - **Priority:** Low | **Complexity:** Low | **Impact:** Low

---

## 🛠️ Technical Implementation Guide

### Testing Patterns by Component Type

#### Pattern 1: Pure Logic (No Phaser Dependencies)
**Examples:** CameraController, WebSocketClient (partial)

```typescript
// __tests__/systems/CameraController.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CameraController } from '../../systems/CameraController';

describe('CameraController', () => {
  let mockScene: any;
  let mockCamera: any;
  let controller: CameraController;

  beforeEach(() => {
    mockCamera = {
      setBounds: vi.fn(),
      scrollX: 0,
      scrollY: 0,
      width: 640,
      height: 480,
      setScroll: vi.fn(),
    };

    mockScene = {
      cameras: { main: mockCamera },
      input: { keyboard: null },
      tweens: {
        add: vi.fn(),
        killTweensOf: vi.fn(),
      },
    };

    controller = new CameraController(mockScene, 100, 100, 32);
  });

  describe('snapTo', () => {
    it('should center camera on position instantly', () => {
      controller.snapTo(1600, 1600);

      expect(mockCamera.setScroll).toHaveBeenCalledWith(
        1600 - 640/2,  // x - halfWidth
        1600 - 480/2   // y - halfHeight
      );
    });
  });

  describe('panTo', () => {
    it('should create tween to target position', () => {
      controller.panTo(800, 600, 'agent-1');

      expect(mockScene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: mockCamera,
          scrollX: 800 - 320,
          scrollY: 600 - 240,
          duration: 400,
        })
      );
    });

    it('should track followed agent ID', () => {
      controller.panTo(800, 600, 'agent-1');
      expect(controller.isFollowing('agent-1')).toBe(true);
    });
  });
});
```

#### Pattern 2: Phaser Systems (Mock Scene + Graphics)
**Examples:** AgentSprite, EffectSystem, DialogueSystem

```typescript
// __tests__/systems/AgentSprite.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentSprite } from '../../systems/AgentSprite';
import type { AgentInfo } from '../../types';

describe('AgentSprite', () => {
  let mockScene: any;
  let mockGraphics: any;
  let agent: AgentInfo;

  beforeEach(() => {
    mockGraphics = {
      fillStyle: vi.fn().mockReturnThis(),
      fillRect: vi.fn().mockReturnThis(),
      generateTexture: vi.fn(),
      destroy: vi.fn(),
    };

    mockScene = {
      add: {
        graphics: vi.fn(() => mockGraphics),
        ellipse: vi.fn(() => ({ setDepth: vi.fn().mockReturnThis() })),
        image: vi.fn(() => ({ setDepth: vi.fn().mockReturnThis() })),
        text: vi.fn(() => ({
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          width: 50,
        })),
        circle: vi.fn(() => ({ setDepth: vi.fn().mockReturnThis() })),
      },
      textures: {
        exists: vi.fn(() => false),
      },
      tweens: {
        add: vi.fn(),
      },
    };

    agent = {
      agent_id: 'test-agent',
      name: 'TestBot',
      role: 'Engineer',
      color: 0xff6600,
      x: 5,
      y: 5,
      realm: '/test',
      status: 'running',
    };
  });

  it('should generate character texture on first use', () => {
    new AgentSprite(mockScene, agent);

    expect(mockScene.textures.exists).toHaveBeenCalledWith('agent-char-ff6600');
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith(
      'agent-char-ff6600',
      20,
      24
    );
  });

  it('should reuse cached texture for same color', () => {
    mockScene.textures.exists = vi.fn(() => true);

    new AgentSprite(mockScene, agent);

    expect(mockGraphics.generateTexture).not.toHaveBeenCalled();
  });

  it('should create sprite at correct tile position', () => {
    new AgentSprite(mockScene, agent);

    const expectedX = 5 * 32 + 16; // x * TILE_SIZE + TILE_SIZE/2
    const expectedY = 5 * 32 + 16;

    expect(mockScene.add.image).toHaveBeenCalledWith(
      expectedX,
      expectedY - 2, // shifted up
      'agent-char-ff6600'
    );
  });

  describe('walkTo', () => {
    it('should tween sprite to target tile', () => {
      const sprite = new AgentSprite(mockScene, agent);

      sprite.walkTo(10, 8);

      const targetX = 10 * 32 + 16;
      const targetY = 8 * 32 + 16;

      expect(mockScene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          x: targetX,
          y: targetY - 2,
          duration: 300,
        })
      );
    });
  });
});
```

#### Pattern 3: Scene Integration Tests
**Examples:** BootScene, GameScene, UIScene

```typescript
// __tests__/scenes/BootScene.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BootScene } from '../../scenes/BootScene';

describe('BootScene', () => {
  let scene: BootScene;
  let mockGraphics: any;

  beforeEach(() => {
    mockGraphics = {
      fillStyle: vi.fn().mockReturnThis(),
      fillRect: vi.fn().mockReturnThis(),
      lineStyle: vi.fn().mockReturnThis(),
      strokeRect: vi.fn().mockReturnThis(),
      fillCircle: vi.fn().mockReturnThis(),
      setStrokeStyle: vi.fn().mockReturnThis(),
      generateTexture: vi.fn(),
      destroy: vi.fn(),
    };

    scene = new BootScene();

    // Mock scene methods
    scene.add = { graphics: vi.fn(() => mockGraphics) } as any;
    scene.scene = { start: vi.fn() } as any;
  });

  it('should generate all tile textures', () => {
    scene.create();

    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-grass-0', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-grass-1', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-grass-2', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-wall', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-water-0', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-water-1', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-water-2', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-door', 32, 32);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('tile-floor', 32, 32);
  });

  it('should generate all map object textures', () => {
    scene.create();

    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('obj-file', 16, 16);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('obj-config', 16, 16);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('obj-doc', 16, 16);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('obj-quest', 16, 16);
    expect(mockGraphics.generateTexture).toHaveBeenCalledWith('obj-sign', 16, 16);
  });

  it('should start GameScene after texture generation', () => {
    scene.create();

    expect(scene.scene.start).toHaveBeenCalledWith('GameScene');
  });

  it('should destroy graphics objects after texture generation', () => {
    scene.create();

    // 3 grass variants + other tiles + objects = many destroy calls
    expect(mockGraphics.destroy).toHaveBeenCalled();
  });
});
```

#### Pattern 4: DOM Panel Tests
**Examples:** PromptBar, QuestLog, MiniMap

```typescript
// __tests__/panels/PromptBar.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptBar } from '../../panels/PromptBar';
import { WebSocketClient } from '../../network/WebSocketClient';

describe('PromptBar', () => {
  let container: HTMLElement;
  let mockWs: WebSocketClient;
  let promptBar: PromptBar;

  beforeEach(() => {
    // Setup DOM container
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    // Mock WebSocket
    mockWs = {
      send: vi.fn(),
    } as any;

    promptBar = new PromptBar('test-container', mockWs);
  });

  afterEach(() => {
    promptBar.destroy();
    document.body.removeChild(container);
  });

  describe('Command Parsing', () => {
    it('should recognize slash commands', () => {
      const textarea = container.querySelector('textarea')!;
      textarea.value = '/help';

      const sendBtn = container.querySelector('.prompt-send-btn') as HTMLButtonElement;
      sendBtn.click();

      // Should NOT send WS message for /help (local command)
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should send player:command for regular text', () => {
      const textarea = container.querySelector('textarea')!;
      textarea.value = 'Please explore the codebase';

      const sendBtn = container.querySelector('.prompt-send-btn') as HTMLButtonElement;
      sendBtn.click();

      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'player:command',
        text: 'Please explore the codebase',
      });
    });

    it('should prefix message with focused agent', () => {
      promptBar.setFocusedAgent('engineer');

      const textarea = container.querySelector('textarea')!;
      textarea.value = 'fix the bug';

      const sendBtn = container.querySelector('.prompt-send-btn') as HTMLButtonElement;
      sendBtn.click();

      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'player:command',
        text: 'engineer, fix the bug',
      });
    });
  });

  describe('Mode Cycling', () => {
    it('should cycle through autonomy modes', () => {
      expect(promptBar.getMode()).toBe('supervised');

      const modeBadge = container.querySelector('.prompt-mode-badge') as HTMLElement;
      modeBadge.click();
      expect(promptBar.getMode()).toBe('autonomous');

      modeBadge.click();
      expect(promptBar.getMode()).toBe('manual');

      modeBadge.click();
      expect(promptBar.getMode()).toBe('supervised');
    });

    it('should send settings update on mode change', () => {
      const modeBadge = container.querySelector('.prompt-mode-badge') as HTMLElement;
      modeBadge.click();

      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'player:update-settings',
        settings: { autonomy_mode: 'autonomous' },
      });
    });
  });

  describe('Command Menu', () => {
    it('should show filtered commands when typing slash', () => {
      const textarea = container.querySelector('textarea')!;
      const menu = container.querySelector('.prompt-command-menu') as HTMLElement;

      // Initially hidden
      expect(menu.style.display).toBe('none');

      textarea.value = '/';
      textarea.dispatchEvent(new Event('input'));

      // Should show all commands
      expect(menu.style.display).toBe('block');
      expect(menu.children.length).toBeGreaterThan(0);
    });

    it('should filter commands by prefix', () => {
      const textarea = container.querySelector('textarea')!;
      const menu = container.querySelector('.prompt-command-menu') as HTMLElement;

      textarea.value = '/su';
      textarea.dispatchEvent(new Event('input'));

      const items = Array.from(menu.children);
      const names = items.map(item =>
        item.querySelector('.prompt-command-name')?.textContent
      );

      expect(names).toContain('/summon');
      expect(names).not.toContain('/help');
    });
  });
});
```

#### Pattern 5: main.ts Integration Tests
**Examples:** WebSocket message routing, game lifecycle

```typescript
// __tests__/main.integration.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('main.ts WebSocket Integration', () => {
  let mockWs: any;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="title-screen"></div>
      <div id="repo-screen"></div>
      <div id="game-viewport" style="display: none;">
        <div id="game-container"></div>
        <div id="sidebar">
          <div id="dialogue-log"></div>
          <div id="quest-log"></div>
        </div>
      </div>
    `;

    // Mock Phaser.Game constructor
    vi.mock('phaser', () => ({
      default: {
        Game: vi.fn(),
      },
    }));
  });

  it('should start game on repo:ready message', async () => {
    // Dynamic import main.ts to trigger initialization
    const { default: main } = await import('../../main');

    const gameViewport = document.getElementById('game-viewport')!;
    expect(gameViewport.style.display).toBe('none');

    // Simulate repo:ready message
    mockWs.triggerMessage({ type: 'repo:ready', repo_url: 'test-repo' });

    expect(gameViewport.style.display).toBe('flex');
  });

  it('should route agent:activity to console', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../../main');

    mockWs.triggerMessage({
      type: 'agent:activity',
      agent_id: 'oracle',
      activity: 'Exploring codebase',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Activity] oracle: Exploring codebase'
    );
  });
});
```

---

## 📋 Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal:** Establish test patterns and infrastructure

- [ ] Enhance WebSocketClient tests (reconnection, error handling)
- [ ] Create CameraController test suite (full coverage)
- [ ] Document testing patterns in this file
- [ ] Setup test utilities (mock factories)

**Deliverable:** 2 systems at 100% coverage + reusable mocks

### Phase 2: Game Systems (Week 2)
**Goal:** Cover sprite and effect logic

- [ ] AgentSprite tests (texture generation, animations)
- [ ] DialogueSystem tests (typewriter, layout)
- [ ] EffectSystem tests (particle spawning)
- [ ] PlayerSprite tests
- [ ] MapObjectSprite tests

**Deliverable:** 5 sprite/system files at 80%+ coverage

### Phase 3: Scenes (Week 3)
**Goal:** Integration tests for Phaser scenes

- [ ] BootScene tests (texture generation pipeline)
- [ ] GameScene tests (system orchestration, message handling)
- [ ] UIScene tests (event routing)

**Deliverable:** 3 scenes at 60%+ coverage (integration focus)

### Phase 4: Panels (Week 4)
**Goal:** DOM UI component coverage

- [ ] PromptBar tests (command parsing, mode cycling)
- [ ] QuestLog tests
- [ ] MiniMap tests
- [ ] DialogueLog tests

**Deliverable:** 4 panels at 70%+ coverage

### Phase 5: Integration & E2E (Week 5)
**Goal:** End-to-end critical paths

- [ ] main.ts message routing tests
- [ ] Player movement flow (input → WS → sprite)
- [ ] Agent following flow (click → camera → track)
- [ ] Command execution flow (prompt → WS → action)

**Deliverable:** 4 E2E scenarios + 80% overall coverage

---

## 🧰 Test Utilities to Create

### 1. Mock Factories
```typescript
// __tests__/helpers/mockFactory.ts

export function createMockScene(overrides = {}) {
  return {
    add: {
      graphics: vi.fn(() => createMockGraphics()),
      image: vi.fn(() => createMockGameObject()),
      text: vi.fn(() => createMockText()),
      ellipse: vi.fn(() => createMockGameObject()),
      circle: vi.fn(() => createMockGameObject()),
      rectangle: vi.fn(() => createMockGameObject()),
      container: vi.fn(() => createMockContainer()),
    },
    cameras: { main: createMockCamera() },
    input: { keyboard: null },
    tweens: {
      add: vi.fn(),
      killTweensOf: vi.fn(),
    },
    time: {
      addEvent: vi.fn(),
      delayedCall: vi.fn(),
    },
    textures: {
      exists: vi.fn(() => false),
    },
    events: {
      on: vi.fn(),
      emit: vi.fn(),
    },
    scene: {
      start: vi.fn(),
      get: vi.fn(() => createMockScene()),
    },
    ...overrides,
  };
}

export function createMockAgentInfo(overrides = {}): AgentInfo {
  return {
    agent_id: 'test-agent',
    name: 'TestBot',
    role: 'Engineer',
    color: 0xff6600,
    x: 0,
    y: 0,
    realm: '/test',
    status: 'running',
    ...overrides,
  };
}

export function createMockWebSocket() {
  const listeners = new Map<string, Function[]>();

  return {
    send: vi.fn(),
    on: vi.fn((type, callback) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(callback);
    }),
    triggerMessage: (msg: any) => {
      const handlers = listeners.get(msg.type) || [];
      handlers.forEach(h => h(msg));
    },
  };
}
```

### 2. Snapshot Helpers
```typescript
// __tests__/helpers/textureSnapshot.ts

export function captureTextureGeneration(mockGraphics: any) {
  const calls = mockGraphics.generateTexture.mock.calls;
  return calls.map(([key, width, height]) => ({
    key,
    dimensions: `${width}x${height}`,
    drawCalls: mockGraphics.fillRect.mock.calls.length,
  }));
}
```

### 3. DOM Test Utilities
```typescript
// __tests__/helpers/domHelper.ts

export function createContainer(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

export function cleanupContainer(id: string): void {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export function triggerInput(selector: string, value: string): void {
  const el = document.querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
```

---

## 🎓 Testing Best Practices

### 1. Arrange-Act-Assert Pattern
```typescript
it('should pan camera to agent position', () => {
  // Arrange
  const controller = new CameraController(mockScene, 100, 100, 32);

  // Act
  controller.panTo(800, 600, 'agent-1');

  // Assert
  expect(mockScene.tweens.add).toHaveBeenCalledWith(
    expect.objectContaining({ scrollX: 480, scrollY: 360 })
  );
});
```

### 2. Test One Thing Per Test
```typescript
// ❌ Bad: tests multiple behaviors
it('should handle agent sprite', () => {
  const sprite = new AgentSprite(mockScene, agent);
  expect(sprite).toBeDefined();
  sprite.walkTo(5, 5);
  expect(mockScene.tweens.add).toHaveBeenCalled();
  sprite.showEmote('heart');
  expect(mockScene.add.circle).toHaveBeenCalled();
});

// ✅ Good: focused tests
describe('AgentSprite', () => {
  it('should create sprite at tile position', () => { /* ... */ });
  it('should tween to target on walkTo', () => { /* ... */ });
  it('should display emote bubble on showEmote', () => { /* ... */ });
});
```

### 3. Use Descriptive Test Names
```typescript
// ❌ Bad: vague
it('works', () => { /* ... */ });

// ✅ Good: describes exact behavior
it('should center camera on position without animation when snapTo is called', () => { /* ... */ });
```

### 4. Avoid Implementation Details
```typescript
// ❌ Bad: tests internal state
it('should set followingAgent private field', () => {
  controller.panTo(800, 600, 'agent-1');
  expect(controller['followingAgent']).toBe('agent-1'); // accessing private
});

// ✅ Good: tests public behavior
it('should track followed agent through public API', () => {
  controller.panTo(800, 600, 'agent-1');
  expect(controller.isFollowing('agent-1')).toBe(true);
});
```

### 5. Mock External Dependencies
```typescript
// ✅ Mock Phaser scene, not the real game engine
const mockScene = createMockScene();

// ✅ Mock WebSocket, not actual network calls
const mockWs = createMockWebSocket();

// ✅ Mock timers for deterministic tests
vi.useFakeTimers();
```

---

## 📈 Success Metrics

### Coverage Targets (per vite.config.ts)
- **Lines:** 80%
- **Functions:** 80%
- **Branches:** 80%
- **Statements:** 80%

### Quality Metrics
- **Test Speed:** All tests < 5s total
- **Flakiness:** 0 flaky tests (deterministic)
- **Maintainability:** Tests survive refactoring
- **Documentation:** Every complex system has usage examples in tests

### CI Integration
- ✅ Tests run on every commit
- ✅ Coverage reports to Codecov
- ✅ Failing tests block merges
- ✅ Coverage trends tracked over time

---

## 🚀 Quick Start for Contributors

### Running Tests
```bash
# Run all tests once
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# UI mode (visual test runner)
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Creating a New Test File
1. Create file matching pattern: `src/__tests__/<category>/<FileName>.test.ts`
2. Import from `vitest`: `import { describe, it, expect, beforeEach, vi } from 'vitest'`
3. Use mock factories: `import { createMockScene } from '../helpers/mockFactory'`
4. Follow AAA pattern: Arrange → Act → Assert
5. Run tests: `npm run test:watch`

### Example Test Template
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YourClass } from '../../path/to/YourClass';
import { createMockScene } from '../helpers/mockFactory';

describe('YourClass', () => {
  let instance: YourClass;
  let mockScene: any;

  beforeEach(() => {
    mockScene = createMockScene();
    instance = new YourClass(mockScene);
  });

  describe('methodName', () => {
    it('should do something specific when condition is met', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = instance.methodName(input);

      // Assert
      expect(result).toBe('expected');
      expect(mockScene.someMethod).toHaveBeenCalled();
    });
  });
});
```

---

## 📚 References

- [Vitest Documentation](https://vitest.dev/)
- [Phaser 3 Testing Guide](https://phaser.io/tutorials/testing-with-jest)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Mock Strategy Guide](https://martinfowler.com/articles/mocksArentStubs.html)

---

**Last Updated:** 2026-02-21
**Owner:** Test Guardian (AI Agent)
**Status:** 🟡 Strategy Document (Implementation Pending)
