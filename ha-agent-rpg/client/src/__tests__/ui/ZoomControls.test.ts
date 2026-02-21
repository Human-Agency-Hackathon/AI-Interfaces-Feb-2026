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
