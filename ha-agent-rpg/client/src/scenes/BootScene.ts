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

    // Load dungeon visual images for fort interior views
    const dungeonRooms = [
      'room-throne', 'room-forge', 'room-library', 'room-armory',
      'room-dungeon-cell', 'room-greenhouse', 'room-alchemy-lab', 'room-summoning-chamber',
    ];
    for (const name of dungeonRooms) {
      this.load.image(`dv-${name}`, `dungeon_visuals/${name}.jpg`);
    }
  }

  create(): void {
    // ─── Tile Textures ───
    this.generateGrassTiles();
    this.generateWallTile();
    this.generateWaterTiles();
    this.generateDoorTile();
    this.generateFloorTile();
    this.generateTreeTile();
    this.generateHillTile();
    this.generateSandTile();
    this.generatePathTile();
    this.generateLavaTile();
    this.generateCrystalTile();
    this.generateFogTile();
    this.generateFortTextures();

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

  // ═══════════════════════════════════════════════════════════
  //  FOG-OF-WAR TERRAIN TILES
  // ═══════════════════════════════════════════════════════════

  private generateTreeTile(): void {
    const g = this.add.graphics();
    // Grass base
    g.fillStyle(0x3a7d2c); g.fillRect(0, 0, 32, 32);
    // Tree trunk
    g.fillStyle(0x5c3a1e); g.fillRect(13, 16, 6, 12);
    // Canopy (dark green circle)
    g.fillStyle(0x2d6b1f); g.fillCircle(16, 12, 10);
    // Canopy highlight
    g.fillStyle(0x4a9e3a); g.fillCircle(14, 9, 5);
    // Leaf detail
    g.fillStyle(0x3d8c2e); g.fillCircle(19, 13, 4);
    g.generateTexture('tile-tree', 32, 32);
    g.destroy();
  }

  private generateHillTile(): void {
    const g = this.add.graphics();
    // Grass base
    g.fillStyle(0x5a8f3c); g.fillRect(0, 0, 32, 32);
    // Hill mound
    g.fillStyle(0x7aaa55);
    g.fillTriangle(0, 28, 16, 8, 32, 28);
    // Hill highlight
    g.fillStyle(0x8dbe66);
    g.fillTriangle(4, 26, 14, 12, 20, 26);
    // Grass tufts on hill
    g.fillStyle(0x4a7d30);
    g.fillRect(10, 22, 2, 4); g.fillRect(20, 20, 2, 5);
    g.generateTexture('tile-hill', 32, 32);
    g.destroy();
  }

  private generateSandTile(): void {
    const g = this.add.graphics();
    g.fillStyle(0xd4b96a); g.fillRect(0, 0, 32, 32);
    // Sand texture dots
    g.fillStyle(0xc4a85a);
    for (let i = 0; i < 8; i++) {
      g.fillRect((i * 7 + 3) % 30, (i * 11 + 5) % 30, 2, 2);
    }
    // Light sand patches
    g.fillStyle(0xe0c878);
    g.fillRect(5, 12, 6, 3); g.fillRect(20, 22, 5, 3);
    g.generateTexture('tile-sand', 32, 32);
    g.destroy();
  }

  private generatePathTile(): void {
    const g = this.add.graphics();
    // Dirt base
    g.fillStyle(0x8b7355); g.fillRect(0, 0, 32, 32);
    // Worn center (lighter)
    g.fillStyle(0x9e866a); g.fillRect(4, 0, 24, 32);
    // Gravel dots
    g.fillStyle(0x7a6548);
    g.fillRect(8, 5, 2, 2); g.fillRect(18, 15, 3, 2);
    g.fillRect(12, 25, 2, 2); g.fillRect(22, 8, 2, 3);
    // Edge grass tufts
    g.fillStyle(0x5a8f3c);
    g.fillRect(0, 10, 3, 4); g.fillRect(29, 20, 3, 4);
    g.generateTexture('tile-path', 32, 32);
    g.destroy();
  }

  private generateLavaTile(): void {
    const g = this.add.graphics();
    // Dark rock base
    g.fillStyle(0x2a1a0e); g.fillRect(0, 0, 32, 32);
    // Lava glow
    g.fillStyle(0xff4400); g.fillRect(4, 4, 24, 24);
    // Hot center
    g.fillStyle(0xff8800); g.fillRect(8, 8, 16, 16);
    // Brightest core
    g.fillStyle(0xffcc00); g.fillRect(12, 12, 8, 8);
    // Dark crust patches
    g.fillStyle(0x3a1a0a);
    g.fillRect(6, 6, 4, 3); g.fillRect(20, 18, 5, 4);
    g.generateTexture('tile-lava', 32, 32);
    g.destroy();
  }

  private generateCrystalTile(): void {
    const g = this.add.graphics();
    // Stone base
    g.fillStyle(0x3a3a4a); g.fillRect(0, 0, 32, 32);
    // Crystal shard 1
    g.fillStyle(0x88ccff);
    g.fillTriangle(8, 28, 12, 8, 16, 28);
    // Crystal shard 2
    g.fillStyle(0x66aadd);
    g.fillTriangle(18, 28, 22, 12, 26, 28);
    // Highlight
    g.fillStyle(0xaaddff);
    g.fillTriangle(10, 24, 12, 12, 14, 24);
    // Sparkle
    g.fillStyle(0xffffff);
    g.fillRect(11, 10, 2, 2); g.fillRect(21, 14, 2, 2);
    g.generateTexture('tile-crystal', 32, 32);
    g.destroy();
  }

  private generateFogTile(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0a0a14, 0.92);
    g.fillRect(0, 0, 32, 32);
    // Subtle noise
    g.fillStyle(0x0d0d18, 0.5);
    g.fillRect(4, 4, 8, 8); g.fillRect(20, 16, 8, 8);
    g.generateTexture('tile-fog', 32, 32);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════
  //  FORT STAGE TEXTURES (5 stages, growing in size)
  // ═══════════════════════════════════════════════════════════

  private generateFortTextures(): void {
    // Stage 1: Campfire (2x2 = 64x64)
    const g1 = this.add.graphics();
    g1.fillStyle(0x3a3a3a); g1.fillRect(0, 0, 64, 64);
    g1.fillStyle(0x5c3a1e); // logs
    g1.fillRect(16, 40, 32, 8);
    g1.fillRect(22, 36, 20, 8);
    g1.fillStyle(0xff6600); // fire
    g1.fillTriangle(32, 16, 24, 44, 40, 44);
    g1.fillStyle(0xffcc00); // fire core
    g1.fillTriangle(32, 24, 28, 40, 36, 40);
    g1.generateTexture('fort-stage-1', 64, 64);
    g1.destroy();

    // Stage 2: Tent (3x3 = 96x96)
    const g2 = this.add.graphics();
    g2.fillStyle(0x3a7d2c); g2.fillRect(0, 0, 96, 96);
    g2.fillStyle(0x8b6e4e); // tent body
    g2.fillTriangle(48, 12, 12, 80, 84, 80);
    g2.fillStyle(0x7a5e3e); // tent shadow
    g2.fillTriangle(48, 12, 48, 80, 84, 80);
    g2.fillStyle(0x3a2a1a); // door opening
    g2.fillRect(40, 56, 16, 24);
    g2.generateTexture('fort-stage-2', 96, 96);
    g2.destroy();

    // Stage 3: Hut (4x4 = 128x128)
    const g3 = this.add.graphics();
    g3.fillStyle(0x3a7d2c); g3.fillRect(0, 0, 128, 128);
    g3.fillStyle(0x6b5030); // walls
    g3.fillRect(24, 48, 80, 56);
    g3.fillStyle(0x8b4513); // roof
    g3.fillTriangle(64, 16, 16, 52, 112, 52);
    g3.fillStyle(0x3a2a1a); // door
    g3.fillRect(52, 72, 24, 32);
    g3.fillStyle(0x88ccff); // windows
    g3.fillRect(32, 64, 12, 12); g3.fillRect(84, 64, 12, 12);
    g3.generateTexture('fort-stage-3', 128, 128);
    g3.destroy();

    // Stage 4: Tower (5x5 = 160x160)
    const g4 = this.add.graphics();
    g4.fillStyle(0x3a7d2c); g4.fillRect(0, 0, 160, 160);
    g4.fillStyle(0x666677); // stone tower
    g4.fillRect(48, 24, 64, 112);
    // Battlements
    g4.fillStyle(0x777788);
    for (let i = 0; i < 4; i++) {
      g4.fillRect(48 + i * 20, 16, 12, 16);
    }
    g4.fillStyle(0x3a2a1a); // door
    g4.fillRect(64, 104, 32, 32);
    g4.fillStyle(0x88ccff); // windows
    g4.fillRect(60, 48, 12, 16); g4.fillRect(88, 48, 12, 16);
    g4.fillRect(60, 76, 12, 16); g4.fillRect(88, 76, 12, 16);
    g4.generateTexture('fort-stage-4', 160, 160);
    g4.destroy();

    // Stage 5: Fort (6x6 = 192x192)
    const g5 = this.add.graphics();
    g5.fillStyle(0x3a7d2c); g5.fillRect(0, 0, 192, 192);
    // Outer wall
    g5.fillStyle(0x555566); g5.fillRect(16, 16, 160, 160);
    // Interior
    g5.fillStyle(0x444455); g5.fillRect(32, 32, 128, 128);
    // Corner towers
    g5.fillStyle(0x666677);
    g5.fillRect(8, 8, 28, 28);    g5.fillRect(156, 8, 28, 28);
    g5.fillRect(8, 156, 28, 28);  g5.fillRect(156, 156, 28, 28);
    // Keep (central building)
    g5.fillStyle(0x777788); g5.fillRect(64, 48, 64, 80);
    // Gate
    g5.fillStyle(0x3a2a1a); g5.fillRect(80, 136, 32, 40);
    // Banner pole
    g5.fillStyle(0x8b4513); g5.fillRect(94, 24, 4, 32);
    g5.fillStyle(0xff3333); g5.fillRect(98, 24, 16, 12); // flag
    g5.generateTexture('fort-stage-5', 192, 192);
    g5.destroy();
  }
}
