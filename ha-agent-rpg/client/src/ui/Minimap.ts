const MINIMAP_SIZE = 160;

const BIOME_COLORS = [
  '#3a7d2c', // 0: forest (green)
  '#4488cc', // 1: coastal (blue)
  '#5a8f3c', // 2: plains (light green)
  '#7a6648', // 3: hills (brown)
  '#aa3300', // 4: volcanic (red)
  '#6688aa', // 5: crystalline (steel blue)
];

const FOG_COLOR = '#0a0a14';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapWidth: number;
  private mapHeight: number;
  private biomeMap: number[][] = [];
  private explored: boolean[][] = [];
  private fortDots: Map<string, { x: number; y: number; color: string }> = new Map();
  private agentDots: Map<string, { x: number; y: number; color: string }> = new Map();
  private onClickCallback: ((tileX: number, tileY: number) => void) | null = null;

  constructor(mapWidth: number, mapHeight: number) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    this.canvas = document.createElement('canvas');
    this.canvas.width = MINIMAP_SIZE;
    this.canvas.height = MINIMAP_SIZE;
    this.canvas.style.cssText = `
      position: fixed;
      top: 8px;
      left: 8px;
      width: ${MINIMAP_SIZE}px;
      height: ${MINIMAP_SIZE}px;
      border: 2px solid #c8a84a;
      border-radius: 4px;
      background: ${FOG_COLOR};
      z-index: 100;
      image-rendering: pixelated;
      cursor: pointer;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.canvas.addEventListener('click', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const tileX = Math.floor(clickX * (this.mapWidth / MINIMAP_SIZE));
      const tileY = Math.floor(clickY * (this.mapHeight / MINIMAP_SIZE));
      if (this.onClickCallback) {
        this.onClickCallback(tileX, tileY);
      }
    });
  }

  onClick(callback: (tileX: number, tileY: number) => void): void {
    this.onClickCallback = callback;
  }

  setBiomeMap(biomeMap: number[][]): void {
    this.biomeMap = biomeMap;
    this.redraw();
  }

  setExplored(explored: boolean[][]): void {
    this.explored = explored;
    this.redraw();
  }

  revealTiles(tiles: { x: number; y: number }[]): void {
    for (const t of tiles) {
      if (this.explored[t.y]) {
        this.explored[t.y][t.x] = true;
      }
    }
    this.redraw();
  }

  setFort(agentId: string, x: number, y: number, color: string): void {
    this.fortDots.set(agentId, { x, y, color });
    this.redraw();
  }

  setAgentPosition(agentId: string, x: number, y: number, color: string): void {
    this.agentDots.set(agentId, { x, y, color });
    this.redraw();
  }

  removeAgent(agentId: string): void {
    this.agentDots.delete(agentId);
    this.fortDots.delete(agentId);
    this.redraw();
  }

  private redraw(): void {
    const ctx = this.ctx;
    const scaleX = MINIMAP_SIZE / this.mapWidth;
    const scaleY = MINIMAP_SIZE / this.mapHeight;

    ctx.fillStyle = FOG_COLOR;
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (this.explored[y]?.[x]) {
          const biomeIdx = this.biomeMap[y]?.[x] ?? 2;
          ctx.fillStyle = BIOME_COLORS[biomeIdx] ?? BIOME_COLORS[2];
          ctx.fillRect(
            Math.floor(x * scaleX),
            Math.floor(y * scaleY),
            Math.ceil(scaleX),
            Math.ceil(scaleY)
          );
        }
      }
    }

    for (const [, dot] of this.fortDots) {
      ctx.fillStyle = dot.color;
      ctx.fillRect(
        Math.floor(dot.x * scaleX) - 1,
        Math.floor(dot.y * scaleY) - 1,
        3, 3
      );
    }

    for (const [, dot] of this.agentDots) {
      ctx.fillStyle = dot.color;
      ctx.fillRect(
        Math.floor(dot.x * scaleX),
        Math.floor(dot.y * scaleY),
        2, 2
      );
    }
  }

  destroy(): void {
    this.canvas.remove();
  }
}
