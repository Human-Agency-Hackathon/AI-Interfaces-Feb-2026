export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load room background images from public/rooms/
    const rooms = [
      'room-throne', 'room-lab', 'room-library', 'room-armory',
      'room-greenhouse', 'room-forge', 'room-test-chamber', 'room-dungeon-cell',
    ];
    for (const name of rooms) {
      this.load.image(name, `rooms/${name}.jpg`);
    }
  }

  create(): void {
    // ─── Tile Textures ───
    this.generateGrassTiles();
    this.generateWallTile();
    this.generateWaterTiles();
    this.generateDoorTile();
    this.generateFloorTile();

    // ─── Map Object Textures ───
    this.generateFileTexture();
    this.generateConfigTexture();
    this.generateDocTexture();
    this.generateQuestMarkerTexture();
    this.generateSignTexture();

    this.scene.start('GameScene');
  }

  // ═══════════════════════════════════════════════════════════
  //  GRASS — 3 variants for visual variety
  // ═══════════════════════════════════════════════════════════

  private generateGrassTiles(): void {
    const variants: {
      dark: number[][];
      light: number[][];
      blades: number[][];
      flowers: Array<[number, number, number]>;
    }[] = [
      {
        dark: [[2, 3, 5, 4], [18, 14, 6, 5], [8, 22, 4, 3], [26, 6, 4, 4]],
        light: [[10, 1, 4, 3], [22, 18, 3, 4], [4, 12, 3, 5], [28, 26, 4, 3]],
        blades: [[5, 6], [11, 2], [19, 10], [27, 4], [3, 18], [15, 24], [23, 16], [9, 28]],
        flowers: [[10, 8, 0xffee66], [24, 22, 0xff8866]],
      },
      {
        dark: [[6, 5, 5, 4], [20, 2, 4, 5], [12, 18, 5, 3], [0, 26, 6, 4]],
        light: [[14, 8, 3, 4], [26, 14, 4, 3], [2, 20, 5, 4], [18, 28, 3, 3]],
        blades: [[3, 4], [13, 10], [21, 6], [29, 14], [7, 20], [17, 26], [25, 2], [11, 16]],
        flowers: [[6, 20, 0xee88ff], [22, 6, 0xffee66]],
      },
      {
        dark: [[4, 8, 4, 5], [16, 0, 5, 4], [24, 16, 6, 3], [10, 24, 4, 4]],
        light: [[0, 4, 3, 4], [20, 10, 4, 3], [8, 18, 5, 4], [28, 24, 3, 3]],
        blades: [[7, 2], [15, 8], [23, 12], [1, 16], [9, 22], [19, 28], [27, 6], [13, 14]],
        flowers: [[18, 14, 0x88bbff]],
      },
    ];

    for (let v = 0; v < 3; v++) {
      const g = this.add.graphics();
      const d = variants[v];

      // Base green
      g.fillStyle(0x4a8a5a, 1);
      g.fillRect(0, 0, 32, 32);

      // Darker patches
      g.fillStyle(0x3a7a49, 1);
      for (const [x, y, w, h] of d.dark) g.fillRect(x, y, w, h);

      // Lighter patches
      g.fillStyle(0x5a9a6a, 1);
      for (const [x, y, w, h] of d.light) g.fillRect(x, y, w, h);

      // Grass blades — dark 1px stems
      g.fillStyle(0x2a6a39, 1);
      for (const [x, y] of d.blades) {
        g.fillRect(x, y, 1, 2);
        g.fillRect(x + 1, y + 1, 1, 1);
      }

      // Tiny flowers
      for (const [fx, fy, fc] of d.flowers) {
        g.fillStyle(fc, 1);
        g.fillRect(fx, fy, 2, 2);
        // Flower center dot
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(fx, fy, 1, 1);
      }

      // Dirt specks
      g.fillStyle(0x7a6a4a, 0.35);
      g.fillRect((8 + v * 9) % 30, (20 + v * 5) % 30, 2, 1);
      g.fillRect((22 + v * 4) % 30, (10 + v * 7) % 30, 1, 2);

      // Subtle tile edge
      g.lineStyle(1, 0x000000, 0.06);
      g.strokeRect(0, 0, 32, 32);

      g.generateTexture(`tile-grass-${v}`, 32, 32);
      g.destroy();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  WALL — stone brick pattern
  // ═══════════════════════════════════════════════════════════

  private generateWallTile(): void {
    const g = this.add.graphics();
    const S = 32;

    // Base stone
    g.fillStyle(0x6a6a7a, 1);
    g.fillRect(0, 0, S, S);

    const brickH = 8;
    const brickW = 16;
    const mortar = 1;
    const brickColors = [0x6e6e7e, 0x626272, 0x747484];

    for (let row = 0; row < 4; row++) {
      const offX = (row % 2) * (brickW / 2);
      const ry = row * brickH;

      for (let col = -1; col < 3; col++) {
        const bx = col * brickW + offX + mortar;
        const by = ry + mortar;
        const bw = brickW - mortar * 2;
        const bh = brickH - mortar * 2;

        const cx = Math.max(0, bx);
        const cw = Math.min(bx + bw, S) - cx;
        if (cw <= 0) continue;

        // Brick fill
        g.fillStyle(brickColors[(row * 3 + col * 7 + 10) % 3], 1);
        g.fillRect(cx, by, cw, bh);

        // Light edge (top + left)
        g.fillStyle(0x8a8a9a, 0.5);
        g.fillRect(cx, by, cw, 1);
        g.fillRect(cx, by, 1, bh);

        // Dark edge (bottom + right)
        g.fillStyle(0x4a4a5a, 0.5);
        g.fillRect(cx, by + bh - 1, cw, 1);
        const right = bx + bw - 1;
        if (right >= 0 && right < S) {
          g.fillRect(right, by, 1, bh);
        }
      }

      // Horizontal mortar
      g.fillStyle(0x3a3a4a, 1);
      g.fillRect(0, ry, S, mortar);
    }

    // Cracks
    g.fillStyle(0x4a4a5a, 0.6);
    g.fillRect(12, 5, 1, 3);
    g.fillRect(26, 18, 2, 1);
    g.fillRect(5, 25, 1, 2);

    // Top shadow
    g.fillStyle(0x2a2a3a, 0.3);
    g.fillRect(0, 0, S, 2);

    g.generateTexture('tile-wall', S, S);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════
  //  WATER — 3 frames for animation
  // ═══════════════════════════════════════════════════════════

  private generateWaterTiles(): void {
    for (let frame = 0; frame < 3; frame++) {
      const g = this.add.graphics();
      const S = 32;

      // Deep water base
      g.fillStyle(0x2a5a9a, 1);
      g.fillRect(0, 0, S, S);

      // Mid-tone wave bands
      g.fillStyle(0x3a6aaa, 0.6);
      for (let y = 0; y < S; y += 4) {
        const waveOff = Math.sin((y + frame * 4) * 0.3) * 3;
        g.fillRect(Math.floor(waveOff) + 2, y, S - 4, 2);
      }

      // Wave crests
      g.fillStyle(0x5a8acc, 0.55);
      const crests = [
        [4 + frame * 3, 6], [18 - frame * 2, 14],
        [8 + frame, 22], [24 + frame * 2, 28],
      ];
      for (const [wx, wy] of crests) {
        const x = ((wx % S) + S) % S;
        g.fillRect(x, wy % S, 6, 1);
        g.fillRect(x + 1, (wy + 1) % S, 4, 1);
      }

      // Specular highlights
      g.fillStyle(0x8abaee, 0.5);
      g.fillRect((10 + frame * 8) % 30, 4, 2, 1);
      g.fillRect((22 - frame * 4 + 32) % 30, 18, 2, 1);
      g.fillRect((6 + frame * 6) % 30, 26, 3, 1);

      // Foam
      g.fillStyle(0xaaccee, 0.3);
      g.fillRect((14 + frame * 5) % 28, 10, 4, 1);
      g.fillRect((26 - frame * 3 + 32) % 28, 24, 3, 1);

      // Depth at bottom
      g.fillStyle(0x1a4a8a, 0.3);
      g.fillRect(0, S - 2, S, 2);

      g.generateTexture(`tile-water-${frame}`, S, S);
      g.destroy();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  DOOR — wooden door with metal hardware
  // ═══════════════════════════════════════════════════════════

  private generateDoorTile(): void {
    const g = this.add.graphics();
    const S = 32;

    // Stone frame
    g.fillStyle(0x5a5a6a, 1);
    g.fillRect(0, 0, S, S);

    // Wooden panel
    g.fillStyle(0x8a6a3a, 1);
    g.fillRect(4, 2, 24, 30);

    // Plank dividers
    g.fillStyle(0x7a5a2a, 1);
    g.fillRect(4, 2, 1, 30);
    g.fillRect(11, 2, 1, 30);
    g.fillRect(19, 2, 1, 30);
    g.fillRect(27, 2, 1, 30);

    // Wood grain highlights
    g.fillStyle(0x9a7a4a, 0.45);
    g.fillRect(6, 4, 4, 1);
    g.fillRect(7, 12, 3, 1);
    g.fillRect(13, 8, 5, 1);
    g.fillRect(14, 20, 4, 1);
    g.fillRect(21, 6, 5, 1);
    g.fillRect(22, 16, 4, 1);
    g.fillRect(6, 24, 3, 1);
    g.fillRect(21, 26, 4, 1);

    // Metal bands
    g.fillStyle(0x4a4a5a, 1);
    g.fillRect(4, 8, 24, 2);
    g.fillRect(4, 22, 24, 2);

    // Rivets
    g.fillStyle(0x8a8a9a, 1);
    g.fillRect(7, 8, 2, 2);
    g.fillRect(15, 8, 2, 2);
    g.fillRect(23, 8, 2, 2);
    g.fillRect(7, 22, 2, 2);
    g.fillRect(15, 22, 2, 2);
    g.fillRect(23, 22, 2, 2);

    // Handle
    g.fillStyle(0xaaaabc, 1);
    g.fillRect(22, 14, 3, 4);
    g.fillStyle(0xccccdd, 1);
    g.fillRect(23, 15, 1, 2);

    // Keyhole
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(23, 19, 1, 1);

    // Frame highlight
    g.fillStyle(0x7a7a8a, 0.4);
    g.fillRect(0, 0, S, 1);
    g.fillRect(0, 0, 1, S);

    g.generateTexture('tile-door', S, S);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════
  //  FLOOR — stone slab pattern
  // ═══════════════════════════════════════════════════════════

  private generateFloorTile(): void {
    const g = this.add.graphics();
    const S = 32;

    // Base
    g.fillStyle(0x5a7a6a, 1);
    g.fillRect(0, 0, S, S);

    // Four slabs with slight color variation
    g.fillStyle(0x5e7e6e, 1);
    g.fillRect(1, 1, 13, 13);
    g.fillStyle(0x567466, 1);
    g.fillRect(18, 1, 13, 13);
    g.fillStyle(0x5a7868, 1);
    g.fillRect(1, 18, 13, 13);
    g.fillStyle(0x5c7c6c, 1);
    g.fillRect(18, 18, 13, 13);

    // Grout cross
    g.fillStyle(0x4a6a5a, 1);
    g.fillRect(0, 15, S, 2);
    g.fillRect(15, 0, 2, S);

    // Cracks
    g.fillStyle(0x4a6a5a, 0.5);
    g.fillRect(4, 6, 5, 1);
    g.fillRect(22, 10, 1, 4);
    g.fillRect(8, 22, 3, 1);
    g.fillRect(24, 24, 4, 1);

    // Speckles
    g.fillStyle(0x6a8a7a, 0.4);
    g.fillRect(3, 3, 1, 1);
    g.fillRect(10, 9, 1, 1);
    g.fillRect(20, 5, 1, 1);
    g.fillRect(26, 20, 1, 1);
    g.fillRect(7, 24, 1, 1);

    // Edge highlights
    g.fillStyle(0x6a8a7a, 0.3);
    g.fillRect(1, 1, 13, 1);
    g.fillRect(18, 1, 13, 1);
    g.fillRect(1, 18, 13, 1);
    g.fillRect(18, 18, 13, 1);

    g.generateTexture('tile-floor', S, S);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════
  //  MAP OBJECT TEXTURES (16×16)
  // ═══════════════════════════════════════════════════════════

  private generateFileTexture(): void {
    const g = this.add.graphics();

    // Page body
    g.fillStyle(0xd8d0c0, 1);
    g.fillRect(3, 2, 10, 12);

    // Folded corner
    g.fillStyle(0xb8b0a0, 1);
    g.fillRect(10, 2, 3, 3);
    g.fillStyle(0xc8c0b0, 1);
    g.fillRect(10, 2, 2, 2);

    // Page outline
    g.lineStyle(1, 0x6a6a5a, 0.8);
    g.strokeRect(3, 2, 10, 12);

    // Text lines
    g.fillStyle(0x6a8aaa, 0.7);
    g.fillRect(5, 5, 6, 1);
    g.fillRect(5, 7, 7, 1);
    g.fillRect(5, 9, 5, 1);
    g.fillRect(5, 11, 6, 1);

    g.generateTexture('obj-file', 16, 16);
    g.destroy();
  }

  private generateConfigTexture(): void {
    const g = this.add.graphics();

    // Gear body
    g.fillStyle(0xe8c85a, 1);
    g.fillRect(5, 5, 6, 6);
    g.fillRect(6, 2, 4, 3);
    g.fillRect(6, 11, 4, 3);
    g.fillRect(2, 6, 3, 4);
    g.fillRect(11, 6, 3, 4);
    g.fillRect(3, 3, 3, 3);
    g.fillRect(10, 3, 3, 3);
    g.fillRect(3, 10, 3, 3);
    g.fillRect(10, 10, 3, 3);

    // Inner ring
    g.fillStyle(0xc8a83a, 1);
    g.fillRect(6, 6, 4, 4);

    // Center hole
    g.fillStyle(0x5a4a2a, 1);
    g.fillRect(7, 7, 2, 2);

    g.generateTexture('obj-config', 16, 16);
    g.destroy();
  }

  private generateDocTexture(): void {
    const g = this.add.graphics();

    // Book cover
    g.fillStyle(0x8a4a4a, 1);
    g.fillRect(3, 2, 11, 12);

    // Spine
    g.fillStyle(0x6a2a2a, 1);
    g.fillRect(3, 2, 2, 12);

    // Pages
    g.fillStyle(0xe8e0d0, 1);
    g.fillRect(5, 3, 8, 10);

    // Page lines
    g.fillStyle(0xc8c0b0, 0.5);
    g.fillRect(5, 4, 8, 1);
    g.fillRect(5, 6, 8, 1);
    g.fillRect(5, 8, 8, 1);
    g.fillRect(5, 10, 8, 1);

    // Title bar
    g.fillStyle(0xd8a83a, 1);
    g.fillRect(6, 3, 6, 1);

    // Spine decoration
    g.fillStyle(0xd8a83a, 0.6);
    g.fillRect(3, 4, 2, 1);
    g.fillRect(3, 8, 2, 1);
    g.fillRect(3, 12, 2, 1);

    g.generateTexture('obj-doc', 16, 16);
    g.destroy();
  }

  private generateQuestMarkerTexture(): void {
    const g = this.add.graphics();

    // Outer glow
    g.fillStyle(0xff4444, 0.2);
    g.fillCircle(8, 8, 7);

    // Red circle
    g.fillStyle(0xe85a5a, 0.9);
    g.fillCircle(8, 8, 5);

    // Inner highlight
    g.fillStyle(0xff7a7a, 0.5);
    g.fillCircle(8, 7, 3);

    // White exclamation
    g.fillStyle(0xffffff, 1);
    g.fillRect(7, 4, 2, 5);
    g.fillRect(7, 10, 2, 2);

    g.generateTexture('obj-quest', 16, 16);
    g.destroy();
  }

  private generateSignTexture(): void {
    const g = this.add.graphics();

    // Post
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(7, 6, 2, 10);

    // Sign board
    g.fillStyle(0x8a6a3a, 1);
    g.fillRect(1, 2, 14, 6);

    // Board edges
    g.fillStyle(0x7a5a2a, 1);
    g.fillRect(1, 2, 14, 1);
    g.fillRect(1, 7, 14, 1);

    // Board highlight
    g.fillStyle(0x9a7a4a, 0.5);
    g.fillRect(2, 3, 12, 1);

    // Arrow
    g.fillStyle(0x8a6a3a, 1);
    g.fillRect(14, 3, 1, 4);
    g.fillRect(15, 4, 1, 2);

    // Text lines
    g.fillStyle(0x4a3a1a, 0.7);
    g.fillRect(3, 4, 8, 1);
    g.fillRect(3, 6, 6, 1);

    g.generateTexture('obj-sign', 16, 16);
    g.destroy();
  }
}
