import type { AgentInfo } from '../types';

const TILE_SIZE = 32;

export class AgentSprite {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private glow: Phaser.GameObjects.Arc;
  private nameLabel: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Arc;
  private roleLabel: Phaser.GameObjects.Text;
  private logicalX: number;
  private logicalY: number;

  public agentName: string;
  public agentColor: number;
  public agentId: string;

  constructor(scene: Phaser.Scene, agent: AgentInfo) {
    this.scene = scene;
    this.agentId = agent.agent_id;
    this.agentName = agent.name;
    this.agentColor = agent.color;

    // Generate character texture on demand (cached by color)
    const textureKey = `agent-char-${agent.color.toString(16)}`;
    if (!scene.textures.exists(textureKey)) {
      AgentSprite.generateCharacterTexture(scene, textureKey, agent.color);
    }

    const px = agent.x * TILE_SIZE + TILE_SIZE / 2;
    const py = agent.y * TILE_SIZE + TILE_SIZE / 2;
    this.logicalX = px;
    this.logicalY = py;

    // Glow aura for fog-of-war visibility and larger click target
    this.glow = scene.add.circle(px, py, 24, agent.color, 0.3)
      .setDepth(8);
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.3, to: 0.12 },
      scale: { from: 1, to: 1.4 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Shadow ellipse under feet (enlarged to match scaled sprite)
    this.shadow = scene.add.ellipse(px, py + 14, 28, 10, 0x000000, 0.3)
      .setDepth(9);

    // Character sprite (shifted up slightly from tile center, scaled 2.5× for visibility)
    this.sprite = scene.add.image(px, py - 6, textureKey)
      .setDepth(10)
      .setScale(2.5);

    // Name label with stroke for readability
    this.nameLabel = scene.add.text(px, py - 28, agent.name, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5).setDepth(11);

    // Status dot
    this.statusDot = scene.add.circle(
      px + this.nameLabel.width / 2 + 6, py - 28, 3, 0x888888,
    ).setDepth(12);

    // Role label
    this.roleLabel = scene.add.text(px, py + 20, agent.role || '', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#aaaacc',
      stroke: '#000000',
      strokeThickness: 1,
      align: 'center',
    }).setOrigin(0.5).setDepth(11);

    if (agent.status) {
      this.updateStatus(agent.status);
    }

    // Subtle idle shadow pulse
    scene.tweens.add({
      targets: this.shadow,
      scaleX: 1.1,
      scaleY: 0.9,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ─── Character Texture Generator ────────────────────────
  // Draws a 20×24 pixel-art RPG character, cached by color

  static generateCharacterTexture(
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
    const lighten = (c: number, f: number) => darken(c, f); // same math, f > 1

    const body = color;
    const bodyDark = darken(color, 0.6);
    const bodyLight = lighten(color, 1.4);
    const hair = darken(color, 0.4);
    const skin = 0xf0c8a0;
    const skinDark = 0xd0a880;
    const boot = 0x4a3a2a;

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

    // Eyes
    g.fillStyle(0xffffff, 1);
    g.fillRect(7, 4, 2, 2);
    g.fillRect(11, 4, 2, 2);
    g.fillStyle(0x222244, 1);
    g.fillRect(8, 5, 1, 1);
    g.fillRect(12, 5, 1, 1);

    // Mouth
    g.fillStyle(skinDark, 1);
    g.fillRect(8, 7, 4, 1);

    // ── Neck ──
    g.fillStyle(skin, 1);
    g.fillRect(8, 8, 4, 1);

    // ── Body / Tunic ──
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

    // Belt
    g.fillStyle(bodyDark, 1);
    g.fillRect(4, 15, 12, 2);
    // Belt buckle
    g.fillStyle(0xd8a83a, 1);
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
    g.fillStyle(0x5a4a3a, 1);
    g.fillRect(5, 21, 3, 1);
    g.fillRect(12, 21, 3, 1);

    g.generateTexture(key, 20, 24);
    g.destroy();
  }

  // ─── Public API (unchanged contract) ────────────────────

  setInteractive(): this {
    this.sprite.setInteractive({ useHandCursor: true });
    this.glow.setInteractive({ useHandCursor: true });
    return this;
  }

  on(event: string, fn: () => void): this {
    this.sprite.on(event, fn);
    this.glow.on(event, fn);
    return this;
  }

  walkTo(tileX: number, tileY: number): void {
    const targetX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.logicalX = targetX;
    this.logicalY = targetY;

    const dur = 300;
    const ease = 'Power2';

    // Character sprite
    this.scene.tweens.add({
      targets: this.sprite, x: targetX, y: targetY - 6, duration: dur, ease,
    });

    // Walk squash-bounce (relative to the 2.5× base scale)
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: { from: 2.5, to: 2.2 },
      duration: dur / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });

    // Glow
    this.scene.tweens.add({
      targets: this.glow, x: targetX, y: targetY, duration: dur, ease,
    });

    // Shadow
    this.scene.tweens.add({
      targets: this.shadow, x: targetX, y: targetY + 14, duration: dur, ease,
    });

    // Name label
    this.scene.tweens.add({
      targets: this.nameLabel, x: targetX, y: targetY - 28, duration: dur, ease,
    });

    // Status dot
    this.scene.tweens.add({
      targets: this.statusDot,
      x: targetX + this.nameLabel.width / 2 + 6,
      y: targetY - 28,
      duration: dur,
      ease,
    });

    // Role label
    this.scene.tweens.add({
      targets: this.roleLabel, x: targetX, y: targetY + 20, duration: dur, ease,
    });
  }

  showEmote(type: string): void {
    const px = this.logicalX;
    const py = this.logicalY - 30;

    const symbols: Record<string, string> = {
      exclamation: '!',
      question: '?',
      heart: '\u2665',
      sweat: ';;',
      music: '\u266A',
    };

    const colors: Record<string, string> = {
      exclamation: '#ff6600',
      question: '#4488ff',
      heart: '#ff4466',
      sweat: '#4488cc',
      music: '#44cc88',
    };

    const bg = this.scene.add.circle(px, py, 11, 0xffffff, 0.95)
      .setStrokeStyle(1.5, 0x444444)
      .setDepth(20);

    const text = this.scene.add.text(px, py, symbols[type] || '?', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: colors[type] || '#000000',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);

    // Pop-in
    bg.setScale(0);
    text.setScale(0);
    this.scene.tweens.add({
      targets: [bg, text],
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Float up and fade
    this.scene.tweens.add({
      targets: [bg, text],
      y: py - 15,
      alpha: 0,
      duration: 1500,
      delay: 1200,
      ease: 'Power1',
      onComplete: () => {
        bg.destroy();
        text.destroy();
      },
    });
  }

  playIdle(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 2.3,  // relative to 2.5× base scale
      duration: 200,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  playInteract(): void {
    // Blink
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.6,
      duration: 100,
      yoyo: true,
      repeat: 2,
    });

    // Sparkle
    const sparkle = this.scene.add.circle(
      this.logicalX + 8, this.logicalY - 6, 3, 0xffffaa, 1,
    ).setDepth(15);
    this.scene.tweens.add({
      targets: sparkle,
      alpha: 0,
      scale: 2,
      duration: 400,
      onComplete: () => sparkle.destroy(),
    });
  }

  updateStatus(status: string): void {
    const colorMap: Record<string, number> = {
      starting: 0xffff00,
      running: 0x00ff00,
      idle: 0x888888,
      stopped: 0xff0000,
    };
    this.statusDot.setFillStyle(colorMap[status] || 0x888888);
  }

  updateRole(role: string): void {
    this.roleLabel.setText(role);
  }

  getX(): number {
    return this.logicalX;
  }

  getY(): number {
    return this.logicalY;
  }

  destroy(): void {
    this.sprite.destroy();
    this.glow.destroy();
    this.shadow.destroy();
    this.nameLabel.destroy();
    this.statusDot.destroy();
    this.roleLabel.destroy();
  }
}
