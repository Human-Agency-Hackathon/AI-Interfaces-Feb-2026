export interface ZoomControlsCallbacks {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onPanUp?: () => void;
  onPanDown?: () => void;
  onPanLeft?: () => void;
  onPanRight?: () => void;
  onHome?: () => void;
}

export class ZoomControls {
  private container: HTMLDivElement;

  constructor(callbacks: ZoomControlsCallbacks) {
    this.container = document.createElement('div');
    this.container.id = 'zoom-controls';
    this.container.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 100;
    `;

    const btnStyle = `
      width: 36px;
      height: 36px;
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
      padding: 0;
    `;

    // --- Zoom buttons ---
    const zoomRow = document.createElement('div');
    zoomRow.style.cssText = 'display: flex; gap: 4px; justify-content: center;';

    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+';
    plusBtn.title = 'Zoom in';
    plusBtn.style.cssText = btnStyle + 'font-size: 20px;';
    plusBtn.addEventListener('click', callbacks.onZoomIn);

    const minusBtn = document.createElement('button');
    minusBtn.textContent = '\u2212';
    minusBtn.title = 'Zoom out';
    minusBtn.style.cssText = btnStyle + 'font-size: 20px;';
    minusBtn.addEventListener('click', callbacks.onZoomOut);

    const fitBtn = document.createElement('button');
    fitBtn.textContent = 'FIT';
    fitBtn.title = 'Fit map to screen';
    fitBtn.style.cssText = btnStyle + 'font-size: 11px;';
    fitBtn.addEventListener('click', callbacks.onFit);

    zoomRow.appendChild(plusBtn);
    zoomRow.appendChild(minusBtn);
    zoomRow.appendChild(fitBtn);
    this.container.appendChild(zoomRow);

    // --- D-pad navigation ---
    const dpad = document.createElement('div');
    dpad.style.cssText = `
      display: grid;
      grid-template-columns: 36px 36px 36px;
      grid-template-rows: 36px 36px 36px;
      gap: 2px;
      margin-top: 6px;
    `;

    const dirs: [string, string, number, () => void][] = [
      ['\u25B2', 'Pan up (W)', 1, callbacks.onPanUp ?? (() => {})],
      ['\u25C0', 'Pan left (A)', 3, callbacks.onPanLeft ?? (() => {})],
      ['\u25B6', 'Pan right (D)', 5, callbacks.onPanRight ?? (() => {})],
      ['\u25BC', 'Pan down (S)', 7, callbacks.onPanDown ?? (() => {})],
    ];

    // Grid positions: 0=TL, 1=TC, 2=TR, 3=ML, 4=MC, 5=MR, 6=BL, 7=BC, 8=BR
    const cells: (HTMLElement | null)[] = Array(9).fill(null);

    for (const [label, title, pos, handler] of dirs) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = title;
      btn.style.cssText = btnStyle + 'font-size: 14px;';
      btn.addEventListener('click', handler);
      cells[pos] = btn;
    }

    // Center cell: HOME button
    const homeBtn = document.createElement('button');
    homeBtn.textContent = '\u2302';
    homeBtn.title = 'Reset view (Home)';
    homeBtn.style.cssText = btnStyle + 'font-size: 18px;';
    homeBtn.addEventListener('click', callbacks.onHome ?? callbacks.onFit);
    cells[4] = homeBtn;

    for (let i = 0; i < 9; i++) {
      if (cells[i]) {
        dpad.appendChild(cells[i]!);
      } else {
        const spacer = document.createElement('div');
        dpad.appendChild(spacer);
      }
    }

    this.container.appendChild(dpad);
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
