# Map Zoom Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add visible +, -, and FIT zoom buttons to the fog-of-war map so users can zoom in/out and fit the entire 120x120 tile map in the viewport.

**Architecture:** A new `ZoomControls` DOM panel creates three buttons (bottom-right corner) that call zoom methods on an extended `CameraController`. GameScene wires them together and manages lifecycle (show in fog mode, hide in diorama mode).

**Tech Stack:** TypeScript, Phaser 3, DOM elements, Vitest

---

### Task 1: Extend CameraController with zoom methods

**Files:**
- Modify: `ha-agent-rpg/client/src/systems/CameraController.ts`
- Test: `ha-agent-rpg/client/src/__tests__/systems/CameraController.test.ts` (create)

**Step 1: Write the failing tests**

Create `ha-agent-rpg/client/src/__tests__/systems/CameraController.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraController } from '../../systems/CameraController';

// Minimal Phaser camera mock
function makeMockScene(camWidth = 640, camHeight = 480) {
  const cam = {
    width: camWidth,
    height: camHeight,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    setZoom: vi.fn((z: number) => { cam.zoom = z; }),
    setBounds: vi.fn(),
    removeBounds: vi.fn(),
    centerOn: vi.fn(),
  };
  const scene = {
    cameras: { main: cam },
    tweens: {
      add: vi.fn((config: any) => {
        // Immediately apply the tween target value
        if (config.targets && config.props) {
          for (const [key, val] of Object.entries(config.props)) {
            config.targets[key] = (val as any).value ?? val;
          }
        }
        if (config.onComplete) config.onComplete();
      }),
    },
  } as unknown as Phaser.Scene;
  return { scene, cam };
}

describe('CameraController zoom', () => {
  let ctrl: CameraController;
  let cam: ReturnType<typeof makeMockScene>['cam'];

  beforeEach(() => {
    const mock = makeMockScene();
    cam = mock.cam;
    ctrl = new CameraController(mock.scene, 120, 120, 32);
    ctrl.setMode('follow');
  });

  it('zoomIn increases zoom by 0.25', () => {
    ctrl.zoomIn();
    expect(ctrl.getZoom()).toBe(1.25);
  });

  it('zoomOut decreases zoom by 0.25', () => {
    ctrl.zoomOut();
    expect(ctrl.getZoom()).toBe(0.75);
  });

  it('zoomIn clamps at MAX_ZOOM (2.0)', () => {
    for (let i = 0; i < 10; i++) ctrl.zoomIn();
    expect(ctrl.getZoom()).toBe(2.0);
  });

  it('zoomOut clamps at MIN_ZOOM (0.25)', () => {
    for (let i = 0; i < 10; i++) ctrl.zoomOut();
    expect(ctrl.getZoom()).toBe(0.25);
  });

  it('fitToMap calculates zoom to fit full map and updates bounds', () => {
    ctrl.fitToMap(120, 120, 32);
    // min(640 / 3840, 480 / 3840) = min(0.1667, 0.125) = 0.125
    expect(ctrl.getZoom()).toBeCloseTo(0.125, 3);
  });

  it('setZoom updates currentZoom and calls scene.tweens.add', () => {
    const mock = makeMockScene();
    const c = new CameraController(mock.scene, 120, 120, 32);
    c.setMode('follow');
    c.setZoom(1.5);
    expect(c.getZoom()).toBe(1.5);
    expect(mock.scene.tweens.add).toHaveBeenCalled();
  });

  it('setZoom clamps value to valid range', () => {
    ctrl.setZoom(5.0);
    expect(ctrl.getZoom()).toBe(2.0);
    ctrl.setZoom(0.01);
    expect(ctrl.getZoom()).toBe(0.25);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npx vitest run client/src/__tests__/systems/CameraController.test.ts`
Expected: FAIL — `zoomIn`, `zoomOut`, `fitToMap`, `getZoom`, `setZoom` don't exist yet.

**Step 3: Implement zoom methods in CameraController**

Replace `ha-agent-rpg/client/src/systems/CameraController.ts` with:

```typescript
const ROOM_PADDING = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followTarget: { x: number; y: number } | null = null;
  private followingAgent: string | null = null;
  private mode: 'diorama' | 'follow' = 'diorama';
  private currentZoom = 1.0;
  private mapWidthPx = 0;
  private mapHeightPx = 0;

  constructor(
    scene: Phaser.Scene,
    mapWidth: number,
    mapHeight: number,
    tileSize: number
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.mapWidthPx = mapWidth * tileSize;
    this.mapHeightPx = mapHeight * tileSize;
    this.fitRoom(mapWidth, mapHeight, tileSize);
  }

  setMode(mode: 'diorama' | 'follow'): void {
    this.mode = mode;
    if (mode === 'follow') {
      this.currentZoom = 1.0;
      this.camera.setZoom(1);
    }
  }

  getZoom(): number {
    return this.currentZoom;
  }

  setZoom(level: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
    this.currentZoom = clamped;
    this.scene.tweens.add({
      targets: this.camera,
      props: { zoom: { value: clamped } },
      duration: 200,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.updateBoundsForZoom();
      },
    });
  }

  zoomIn(): void {
    this.setZoom(this.currentZoom + ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.currentZoom - ZOOM_STEP);
  }

  fitToMap(mapWidth: number, mapHeight: number, tileSize: number): void {
    const mapPxW = mapWidth * tileSize;
    const mapPxH = mapHeight * tileSize;
    const zoom = Math.min(this.camera.width / mapPxW, this.camera.height / mapPxH);
    this.mapWidthPx = mapPxW;
    this.mapHeightPx = mapPxH;
    this.currentZoom = zoom;
    this.scene.tweens.add({
      targets: this.camera,
      props: { zoom: { value: zoom } },
      duration: 200,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.camera.centerOn(mapPxW / 2, mapPxH / 2);
        this.updateBoundsForZoom();
      },
    });
  }

  private updateBoundsForZoom(): void {
    if (this.mode === 'follow' && this.mapWidthPx > 0) {
      this.camera.setBounds(0, 0, this.mapWidthPx, this.mapHeightPx);
    }
  }

  update(): void {
    if (this.mode === 'follow' && this.followTarget) {
      const cam = this.camera;
      const targetX = this.followTarget.x * 32 + 16;
      const targetY = this.followTarget.y * 32 + 16;
      cam.scrollX += (targetX - cam.scrollX - cam.width / 2) * 0.08;
      cam.scrollY += (targetY - cam.scrollY - cam.height / 2) * 0.08;
    }
  }

  panTo(x: number, y: number, agentId?: string): void {
    this.followTarget = { x, y };
    if (agentId) this.followingAgent = agentId;
  }

  snapTo(x: number, y: number): void {
    if (this.mode === 'follow') {
      const cam = this.camera;
      cam.scrollX = x * 32 + 16 - cam.width / 2;
      cam.scrollY = y * 32 + 16 - cam.height / 2;
      this.followTarget = { x, y };
    }
  }

  isFollowing(agentId: string): boolean {
    return this.followingAgent === agentId;
  }

  clearFollow(): void {
    this.followingAgent = null;
    this.followTarget = null;
  }

  updateBounds(mapWidth: number, mapHeight: number, tileSize: number): void {
    this.mapWidthPx = mapWidth * tileSize;
    this.mapHeightPx = mapHeight * tileSize;
    if (this.mode === 'diorama') {
      this.fitRoom(mapWidth, mapHeight, tileSize);
    } else {
      this.camera.setBounds(0, 0, this.mapWidthPx, this.mapHeightPx);
    }
  }

  private fitRoom(mapWidth: number, mapHeight: number, tileSize: number): void {
    const cam = this.camera;
    const roomPxW = mapWidth * tileSize;
    const roomPxH = mapHeight * tileSize;
    const availW = cam.width - ROOM_PADDING * 2;
    const availH = cam.height - ROOM_PADDING * 2;
    const zoom = Math.min(availW / roomPxW, availH / roomPxH, 1);
    cam.setZoom(zoom);
    cam.removeBounds();
    cam.centerOn(roomPxW / 2, roomPxH / 2);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npx vitest run client/src/__tests__/systems/CameraController.test.ts`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add ha-agent-rpg/client/src/systems/CameraController.ts ha-agent-rpg/client/src/__tests__/systems/CameraController.test.ts
git commit -m "feat(client): add zoom methods to CameraController"
```

---

### Task 2: Create ZoomControls DOM panel

**Files:**
- Create: `ha-agent-rpg/client/src/ui/ZoomControls.ts`
- Test: `ha-agent-rpg/client/src/__tests__/ui/ZoomControls.test.ts` (create)

**Step 1: Write the failing tests**

Create `ha-agent-rpg/client/src/__tests__/ui/ZoomControls.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZoomControls } from '../../ui/ZoomControls';

describe('ZoomControls', () => {
  let onZoomIn: ReturnType<typeof vi.fn>;
  let onZoomOut: ReturnType<typeof vi.fn>;
  let onFit: ReturnType<typeof vi.fn>;
  let controls: ZoomControls;

  beforeEach(() => {
    onZoomIn = vi.fn();
    onZoomOut = vi.fn();
    onFit = vi.fn();
    controls = new ZoomControls({ onZoomIn, onZoomOut, onFit });
  });

  afterEach(() => {
    controls.destroy();
  });

  it('creates a container with three buttons', () => {
    const container = document.getElementById('zoom-controls');
    expect(container).toBeTruthy();
    const buttons = container!.querySelectorAll('button');
    expect(buttons.length).toBe(3);
  });

  it('positions container fixed at bottom-right', () => {
    const container = document.getElementById('zoom-controls')!;
    expect(container.style.position).toBe('fixed');
    expect(container.style.bottom).toBe('80px');
    expect(container.style.right).toBe('16px');
  });

  it('clicking + calls onZoomIn', () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#zoom-controls button');
    buttons[0].click();
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('clicking - calls onZoomOut', () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#zoom-controls button');
    buttons[1].click();
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it('clicking FIT calls onFit', () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#zoom-controls button');
    buttons[2].click();
    expect(onFit).toHaveBeenCalledTimes(1);
  });

  it('hide removes container from view', () => {
    controls.hide();
    const container = document.getElementById('zoom-controls')!;
    expect(container.style.display).toBe('none');
  });

  it('show makes container visible', () => {
    controls.hide();
    controls.show();
    const container = document.getElementById('zoom-controls')!;
    expect(container.style.display).toBe('flex');
  });

  it('destroy removes the container from the DOM', () => {
    controls.destroy();
    expect(document.getElementById('zoom-controls')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npx vitest run client/src/__tests__/ui/ZoomControls.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement ZoomControls**

Create `ha-agent-rpg/client/src/ui/ZoomControls.ts`:

```typescript
export interface ZoomControlsCallbacks {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export class ZoomControls {
  private container: HTMLDivElement;

  constructor(callbacks: ZoomControlsCallbacks) {
    this.container = document.createElement('div');
    this.container.id = 'zoom-controls';
    this.container.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 100;
    `;

    const btnStyle = `
      width: 48px;
      height: 48px;
      border: 2px solid #c8a84a;
      border-radius: 6px;
      background: rgba(0,0,0,0.6);
      color: #ffffff;
      font-family: monospace;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+';
    plusBtn.style.cssText = btnStyle + 'font-size: 24px;';
    plusBtn.addEventListener('click', callbacks.onZoomIn);

    const minusBtn = document.createElement('button');
    minusBtn.textContent = '\u2212';
    minusBtn.style.cssText = btnStyle + 'font-size: 24px;';
    minusBtn.addEventListener('click', callbacks.onZoomOut);

    const fitBtn = document.createElement('button');
    fitBtn.textContent = 'FIT';
    fitBtn.style.cssText = btnStyle + 'font-size: 14px;';
    fitBtn.addEventListener('click', callbacks.onFit);

    this.container.appendChild(plusBtn);
    this.container.appendChild(minusBtn);
    this.container.appendChild(fitBtn);
    document.body.appendChild(this.container);
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  destroy(): void {
    this.container.remove();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npx vitest run client/src/__tests__/ui/ZoomControls.test.ts`
Expected: All 8 tests PASS.

**Step 5: Commit**

```bash
git add ha-agent-rpg/client/src/ui/ZoomControls.ts ha-agent-rpg/client/src/__tests__/ui/ZoomControls.test.ts
git commit -m "feat(client): add ZoomControls DOM panel"
```

---

### Task 3: Wire ZoomControls into GameScene

**Files:**
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts:1-44` (imports + properties)
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts:82-112` (fog-mode creation block)
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts:273-303` (fort:view handler)
- Modify: `ha-agent-rpg/client/src/scenes/GameScene.ts:339-373` (shutdown)

**Step 1: Add import and property**

At line 11 of GameScene.ts, after the Minimap import, add:

```typescript
import { ZoomControls } from '../ui/ZoomControls';
```

At line 43 (after `private inFortView = false;`), add:

```typescript
  private zoomControls: ZoomControls | null = null;
```

**Step 2: Create ZoomControls when fog mode starts**

In the `world:state` handler, after the minimap creation block (after line 103 — `this.minimap.setBiomeMap(...)`), add:

```typescript
          // Create zoom controls for fog-of-war mode
          this.zoomControls = new ZoomControls({
            onZoomIn: () => this.cameraController?.zoomIn(),
            onZoomOut: () => this.cameraController?.zoomOut(),
            onFit: () => this.cameraController?.fitToMap(
              state.map.width, state.map.height, state.map.tile_size,
            ),
          });
```

**Step 3: Hide zoom controls when entering fort view**

In the `fort:view` handler (around line 274), after `this.inFortView = true;`, add:

```typescript
      // Hide zoom controls during fort interior view
      this.zoomControls?.hide();
```

In the `backBtn.onclick` handler (around line 298), before `this.inFortView = false;`, add:

```typescript
        this.zoomControls?.show();
```

**Step 4: Clean up in shutdown**

In the `shutdown()` method, after the minimap cleanup block (after line 362), add:

```typescript
    // Clean up zoom controls
    if (this.zoomControls) {
      this.zoomControls.destroy();
      this.zoomControls = null;
    }
```

**Step 5: Run all client tests**

Run: `cd ha-agent-rpg && npm run test -w client`
Expected: All tests PASS.

**Step 6: Run type check**

Run: `cd ha-agent-rpg && npm run build -w client`
Expected: No type errors.

**Step 7: Commit**

```bash
git add ha-agent-rpg/client/src/scenes/GameScene.ts
git commit -m "feat(client): wire ZoomControls into GameScene for fog-of-war mode"
```

---

### Task 4: Manual smoke test and push

**Step 1: Run all tests one more time**

Run: `cd ha-agent-rpg && npm run test -w client && npm run test -w server`
Expected: All tests PASS.

**Step 2: Push**

```bash
git push origin main
```
