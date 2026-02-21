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
