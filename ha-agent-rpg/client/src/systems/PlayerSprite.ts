const TILE_SIZE = 32;

export class PlayerSprite {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private nameLabel: Phaser.GameObjects.Text;
  private logicalX: number;
  private logicalY: number;
  private currentAnimation: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, name: string = 'Oracle') {
    this.scene = scene;

    // Generate Oracle character texture (blue-themed)
    const textureKey = 'player-oracle';
    const oracleColor = 0x4488ff; // Blue color for Oracle

    if (!scene.textures.exists(textureKey)) {
      this.generateOracleTexture(scene, textureKey, oracleColor);
    }

    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;
    this.logicalX = px;
    this.logicalY = py;

    // Shadow ellipse under feet
    this.shadow = scene.add.ellipse(px, py + 10, 16, 6, 0x000000, 0.3)
      .setDepth(9);

    // Character sprite (shifted up slightly from tile center)
    this.sprite = scene.add.image(px, py - 2, textureKey)
      .setDepth(10);

    // Name label with stroke for readability
    this.nameLabel = scene.add.text(px, py - 18, name, {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5).setDepth(11);

    // Subtle idle animation
    this.playIdleAnimation();
  }

  private generateOracleTexture(
    scene: Phaser.Scene,
    key: string,
    color: number,
  ): void {
    const g = scene.add.graphics();

    // Color helpers
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const darken = (c: number, f: number) => {
      const r = clamp(((c >> 16) & 0xff) * f);
      const gv = clamp(((c >> 8) & 0xff) * f);
      const b = clamp((c & 0xff) * f);
      return ((r | 0) << 16) | ((gv | 0) << 8) | (b | 0);
    };
    const lighten = (c: number, f: number) => darken(c, f);

    const body = color;
    const bodyDark = darken(color, 0.6);
    const bodyLight = lighten(color, 1.4);
    const hair = darken(color, 0.4);
    const skin = 0xf0c8a0;
    const skinDark = 0xd0a880;
    const boot = 0x2a2a4a; // Darker blue boots

    // ── Hair ──
    g.fillStyle(hair, 1);
    g.fillRect(6, 0, 8, 3);
    g.fillRect(5, 1, 10, 2);

    // ── Head / Face ──
    g.fillStyle(skin, 1);
    g.fillRect(5, 3, 10, 5);
    // Sideburns
    g.fillStyle(hair, 1);
    g.fillRect(5, 3, 1, 3);
    g.fillRect(14, 3, 1, 3);

    // Eyes (distinctive Oracle eyes)
    g.fillStyle(0xffffff, 1);
    g.fillRect(7, 4, 2, 2);
    g.fillRect(11, 4, 2, 2);
    g.fillStyle(0x4488ff, 1); // Blue eyes
    g.fillRect(8, 5, 1, 1);
    g.fillRect(12, 5, 1, 1);

    // Mouth
    g.fillStyle(skinDark, 1);
    g.fillRect(8, 7, 4, 1);

    // ── Neck ──
    g.fillStyle(skin, 1);
    g.fillRect(8, 8, 4, 1);

    // ── Body / Robe ──
    g.fillStyle(body, 1);
    g.fillRect(4, 9, 12, 8);

    // Shoulder pauldrons
    g.fillStyle(bodyDark, 1);
    g.fillRect(3, 9, 2, 3);
    g.fillRect(15, 9, 2, 3);

    // Body shading (dark edges)
    g.fillStyle(bodyDark, 0.4);
    g.fillRect(4, 9, 2, 8);
    g.fillRect(14, 9, 2, 8);

    // Chest highlight
    g.fillStyle(bodyLight, 0.3);
    g.fillRect(8, 10, 4, 3);

    // Belt with Oracle symbol
    g.fillStyle(bodyDark, 1);
    g.fillRect(4, 15, 12, 2);
    // Belt buckle (star symbol)
    g.fillStyle(0xffd700, 1); // Gold
    g.fillRect(9, 15, 2, 2);

    // ── Arms ──
    g.fillStyle(body, 1);
    g.fillRect(2, 10, 2, 6);
    g.fillRect(16, 10, 2, 6);
    // Hands
    g.fillStyle(skin, 1);
    g.fillRect(2, 16, 2, 1);
    g.fillRect(16, 16, 2, 1);

    // ── Legs ──
    g.fillStyle(bodyDark, 1);
    g.fillRect(5, 17, 4, 4);
    g.fillRect(11, 17, 4, 4);

    // ── Boots ──
    g.fillStyle(boot, 1);
    g.fillRect(4, 21, 5, 3);
    g.fillRect(11, 21, 5, 3);
    // Boot highlights
    g.fillStyle(0x3a3a5a, 1);
    g.fillRect(5, 21, 3, 1);
    g.fillRect(12, 21, 3, 1);

    g.generateTexture(key, 20, 24);
    g.destroy();
  }

  private playIdleAnimation(): void {
    // Cancel any existing animation
    if (this.currentAnimation) {
      this.currentAnimation.stop();
    }

    // Subtle breathing animation
    this.currentAnimation = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.98,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Shadow pulse
    this.scene.tweens.add({
      targets: this.shadow,
      scaleX: 1.1,
      scaleY: 0.9,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  walkTo(tileX: number, tileY: number, onComplete?: () => void): void {
    const targetX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = tileY * TILE_SIZE + TILE_SIZE / 2;

    // Stop idle animation during walk
    if (this.currentAnimation) {
      this.currentAnimation.stop();
      this.sprite.setScale(1);
    }

    this.logicalX = targetX;
    this.logicalY = targetY;

    const dur = 300;
    const ease = 'Power2';

    // Character sprite
    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY - 2,
      duration: dur,
      ease,
      onComplete: () => {
        this.playIdleAnimation();
        if (onComplete) onComplete();
      }
    });

    // Walk squash-bounce
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: { from: 1, to: 0.88 },
      duration: dur / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });

    // Shadow
    this.scene.tweens.add({
      targets: this.shadow,
      x: targetX,
      y: targetY + 10,
      duration: dur,
      ease,
    });

    // Name label
    this.scene.tweens.add({
      targets: this.nameLabel,
      x: targetX,
      y: targetY - 18,
      duration: dur,
      ease,
    });
  }

  getTileX(): number {
    return Math.round((this.logicalX - TILE_SIZE / 2) / TILE_SIZE);
  }

  getTileY(): number {
    return Math.round((this.logicalY - TILE_SIZE / 2) / TILE_SIZE);
  }

  getX(): number {
    return this.logicalX;
  }

  getY(): number {
    return this.logicalY;
  }

  setPosition(tileX: number, tileY: number): void {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.logicalX = px;
    this.logicalY = py;

    this.sprite.setPosition(px, py - 2);
    this.shadow.setPosition(px, py + 10);
    this.nameLabel.setPosition(px, py - 18);
  }

  destroy(): void {
    if (this.currentAnimation) {
      this.currentAnimation.stop();
    }
    this.sprite.destroy();
    this.shadow.destroy();
    this.nameLabel.destroy();
  }
}
