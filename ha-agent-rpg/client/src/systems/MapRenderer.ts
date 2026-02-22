import type { TileMapData } from '../types';

export class MapRenderer {
  private scene: Phaser.Scene;
  private mapData: TileMapData;
  private tileImages: Phaser.GameObjects.Image[] = [];
  private waterTiles: Phaser.GameObjects.Image[] = [];
  private waterFrame = 0;
  private waterTimer: Phaser.Time.TimerEvent | null = null;
  private backgroundMode = false;
  private fogTiles: Phaser.GameObjects.Image[] = [];
  private exploredState: boolean[][] = [];

  constructor(scene: Phaser.Scene, mapData: TileMapData) {
    this.scene = scene;
    this.mapData = mapData;
  }

  /** When true, render() is a no-op — a RoomBackground image handles visuals. */
  setBackgroundMode(enabled: boolean): void {
    this.backgroundMode = enabled;
  }

  render(): void {
    if (this.backgroundMode) return;
    const { width, height, tile_size, tiles } = this.mapData;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileType = tiles[y][x];
        const key = this.getTileKey(tileType, x, y);
        const img = this.scene.add.image(
          x * tile_size + tile_size / 2,
          y * tile_size + tile_size / 2,
          key,
        );
        this.tileImages.push(img);

        // Track water tiles for animation
        if (tileType === 2) {
          this.waterTiles.push(img);
        }
      }
    }

    // Animate water tiles by cycling through 3 frames
    if (this.waterTiles.length > 0) {
      this.waterTimer = this.scene.time.addEvent({
        delay: 600,
        loop: true,
        callback: () => {
          this.waterFrame = (this.waterFrame + 1) % 3;
          const key = `tile-water-${this.waterFrame}`;
          for (const tile of this.waterTiles) {
            tile.setTexture(key);
          }
        },
      });
    }
  }

  /** Hide or show all terrain tiles and fog (used during fort interior views). */
  setVisible(visible: boolean): void {
    for (const img of this.tileImages) {
      img.setVisible(visible);
    }
    for (const fog of this.fogTiles) {
      fog.setVisible(visible);
    }
  }

  getMap(): TileMapData {
    return this.mapData;
  }

  loadMap(mapData: TileMapData): void {
    // Destroy all existing tile images (water tiles are included in tileImages)
    for (const img of this.tileImages) {
      img.destroy();
    }
    this.tileImages = [];

    // Clear water tile references (they were already destroyed above)
    this.waterTiles = [];

    // Cancel the pending water animation timer so the old event does not
    // run against the freshly created tiles from the next render() call
    if (this.waterTimer !== null) {
      this.waterTimer.remove(false);
      this.waterTimer = null;
    }

    // Replace map data and re-render
    this.mapData = mapData;
    this.render();
  }

  setExplored(explored: boolean[][]): void {
    this.exploredState = explored;
    this.renderFog();
  }

  revealTiles(tiles: { x: number; y: number }[]): void {
    for (const t of tiles) {
      if (this.exploredState[t.y]) {
        this.exploredState[t.y][t.x] = true;
      }
    }
    // Remove fog images for revealed tiles
    this.fogTiles = this.fogTiles.filter(fogImg => {
      const tx = Math.floor((fogImg.x - 16) / 32);
      const ty = Math.floor((fogImg.y - 16) / 32);
      if (tiles.some(t => t.x === tx && t.y === ty)) {
        this.scene.tweens.add({
          targets: fogImg,
          alpha: 0,
          duration: 500,
          onComplete: () => fogImg.destroy(),
        });
        return false;
      }
      return true;
    });
  }

  private renderFog(): void {
    this.fogTiles.forEach(f => f.destroy());
    this.fogTiles = [];

    if (this.exploredState.length === 0) return;

    const map = this.mapData;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!this.exploredState[y]?.[x]) {
          const fog = this.scene.add.image(
            x * 32 + 16, y * 32 + 16, 'tile-fog'
          );
          fog.setDepth(5);
          this.fogTiles.push(fog);
        }
      }
    }
  }

  private getTileKey(tileType: number, x: number, y: number): string {
    switch (tileType) {
      case 0: {
        // Grass — deterministic variant based on position
        const variant = (x * 7 + y * 13) % 3;
        return `tile-grass-${variant}`;
      }
      case 1: return 'tile-wall';
      case 2: return 'tile-water-0';
      case 3: return 'tile-door';
      case 4: return 'tile-floor';
      case 5: return 'tile-tree';
      case 6: return 'tile-hill';
      case 7: return 'tile-sand';
      case 8: return 'tile-path';
      case 9: return 'tile-lava';
      case 10: return 'tile-crystal';
      default: return 'tile-grass-0';
    }
  }
}
