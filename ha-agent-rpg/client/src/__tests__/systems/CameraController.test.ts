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
