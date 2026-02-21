import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZoomControls } from '../../ui/ZoomControls';

describe('ZoomControls', () => {
  let onZoomIn: ReturnType<typeof vi.fn>;
  let onZoomOut: ReturnType<typeof vi.fn>;
  let onFit: ReturnType<typeof vi.fn>;
  let onPanUp: ReturnType<typeof vi.fn>;
  let onPanDown: ReturnType<typeof vi.fn>;
  let onPanLeft: ReturnType<typeof vi.fn>;
  let onPanRight: ReturnType<typeof vi.fn>;
  let onHome: ReturnType<typeof vi.fn>;
  let controls: ZoomControls;

  beforeEach(() => {
    onZoomIn = vi.fn();
    onZoomOut = vi.fn();
    onFit = vi.fn();
    onPanUp = vi.fn();
    onPanDown = vi.fn();
    onPanLeft = vi.fn();
    onPanRight = vi.fn();
    onHome = vi.fn();
    controls = new ZoomControls({
      onZoomIn, onZoomOut, onFit,
      onPanUp, onPanDown, onPanLeft, onPanRight, onHome,
    });
  });

  afterEach(() => {
    controls.destroy();
  });

  it('creates a container with zoom and d-pad buttons', () => {
    const container = document.getElementById('zoom-controls');
    expect(container).toBeTruthy();
    const buttons = container!.querySelectorAll('button');
    // 3 zoom + 4 d-pad arrows + 1 home = 8 buttons
    expect(buttons.length).toBe(8);
  });

  it('positions container fixed at bottom-left', () => {
    const container = document.getElementById('zoom-controls')!;
    expect(container.style.position).toBe('fixed');
    expect(container.style.bottom).toBe('80px');
    expect(container.style.left).toBe('8px');
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

  it('clicking d-pad up calls onPanUp', () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#zoom-controls button');
    // Button order after zoom row: up(3), left(4), home(5), right(6), down(7)
    buttons[3].click();
    expect(onPanUp).toHaveBeenCalledTimes(1);
  });

  it('clicking d-pad home calls onHome', () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#zoom-controls button');
    buttons[5].click();
    expect(onHome).toHaveBeenCalledTimes(1);
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
