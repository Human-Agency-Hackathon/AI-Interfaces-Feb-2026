import type { TileMapData } from '../types';

export class MapRenderer {
  private scene: Phaser.Scene;
  private mapData: TileMapData;
  private tileImages: Phaser.GameObjects.Image[] = [];
  private waterTiles: Phaser.GameObjects.Image[] = [];
  private waterFrame = 0;
  private waterTimer: Phaser.Time.TimerEvent | null = null;
  private backgroundMode = false;

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
      default: return 'tile-grass-0';
    }
  }
}
