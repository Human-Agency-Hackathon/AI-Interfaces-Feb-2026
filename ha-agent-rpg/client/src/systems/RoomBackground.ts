/**
 * RoomBackground — displays a full room illustration as the backdrop
 * instead of rendering individual 32×32 tiles.
 *
 * Selects one of 8 room images based on the folder path, center-crops
 * the square source to match the room's aspect ratio, and scales to fill.
 */

const ROOM_KEYS = [
  'room-throne',
  'room-lab',
  'room-library',
  'room-armory',
  'room-greenhouse',
  'room-forge',
  'room-test-chamber',
  'room-dungeon-cell',
] as const;

/** FNV-1a hash (same algorithm the server uses for seeded RNG). */
function hashPath(path: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/** Pick a room image key for a given folder path. Root always gets the throne. */
function getRoomKey(path: string): string {
  if (path === '' || path === '/') return 'room-throne';
  return ROOM_KEYS[hashPath(path) % ROOM_KEYS.length];
}

export class RoomBackground {
  private scene: Phaser.Scene;
  private bgImage: Phaser.GameObjects.Image | null = null;
  private frame: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Display a room background image sized to cover the tile grid area,
   * with a decorative gold frame around it.
   *
   * @param path      Folder path ('' for root)
   * @param widthTiles   Room width in tiles
   * @param heightTiles  Room height in tiles
   * @param tileSize     Pixels per tile (32)
   */
  show(path: string, widthTiles: number, heightTiles: number, tileSize: number): void {
    this.destroy();

    const roomKey = getRoomKey(path);
    const roomPxW = widthTiles * tileSize;
    const roomPxH = heightTiles * tileSize;

    // Place image centered on the room area
    this.bgImage = this.scene.add.image(roomPxW / 2, roomPxH / 2, roomKey);

    // Source images are square (1024×1024). Use a "cover" crop strategy:
    // crop to match the room's aspect ratio, then scale to fill exactly.
    const source = this.bgImage.texture.getSourceImage();
    const srcW = source.width;
    const srcH = source.height;
    const roomAspect = roomPxW / roomPxH;

    let cropW: number;
    let cropH: number;

    if (roomAspect >= 1) {
      // Room is wider than tall — use full width, crop top/bottom
      cropW = srcW;
      cropH = Math.floor(srcW / roomAspect);
    } else {
      // Room is taller than wide — use full height, crop left/right
      cropW = Math.floor(srcH * roomAspect);
      cropH = srcH;
    }

    const cropX = Math.floor((srcW - cropW) / 2);
    const cropY = Math.floor((srcH - cropH) / 2);

    this.bgImage.setCrop(cropX, cropY, cropW, cropH);
    this.bgImage.setDisplaySize(roomPxW, roomPxH);
    this.bgImage.setDepth(-1);

    // Use bilinear filtering for smooth downscaling (overrides pixelArt: true
    // for this image only, so the detailed room art doesn't alias).
    this.bgImage.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // ── Decorative frame around the room ──
    this.frame = this.scene.add.graphics();
    const border = 3;

    // Outer gold border
    this.frame.lineStyle(border, 0xc8a84a, 0.8);
    this.frame.strokeRect(
      -border, -border,
      roomPxW + border * 2, roomPxH + border * 2,
    );

    // Inner dark inset
    this.frame.lineStyle(1, 0x2a2020, 0.9);
    this.frame.strokeRect(0, 0, roomPxW, roomPxH);

    this.frame.setDepth(0);
  }

  destroy(): void {
    if (this.bgImage) {
      this.bgImage.destroy();
      this.bgImage = null;
    }
    if (this.frame) {
      this.frame.destroy();
      this.frame = null;
    }
  }
}
