import type { MapObject } from '../types';

const TILE_SIZE = 32;

const TEXTURE_MAP: Record<string, string> = {
  file: 'obj-file',
  config: 'obj-config',
  doc: 'obj-doc',
  quest_marker: 'obj-quest',
  sign: 'obj-sign',
};

export class MapObjectSprite {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, obj: MapObject) {
    this.scene = scene;

    const px = obj.x * TILE_SIZE + TILE_SIZE / 2;
    const py = obj.y * TILE_SIZE + TILE_SIZE / 2;

    const icon = this.createIcon(obj.type, px, py);

    // Nav types get directional labels
    const labelText = (obj.type === 'nav_door' || obj.type === 'nav_back')
      ? (obj.type === 'nav_back' ? '\u2190 back' : `\u2192 ${obj.label}`)
      : obj.label;

    const label = scene.add.text(px, py + 14, labelText, {
      fontSize: '7px',
      fontFamily: 'monospace',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 1,
      align: 'center',
    }).setOrigin(0.5).setDepth(6);

    this.sprite = scene.add.container(0, 0, [icon, label]).setDepth(5);

    // Quest markers float gently
    if (obj.type === 'quest_marker') {
      scene.tweens.add({
        targets: icon,
        y: py - 4,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Make nav doors and nav_back clickable
    if (obj.type === 'nav_door' || obj.type === 'nav_back') {
      icon.setInteractive();
      icon.on('pointerdown', () => {
        scene.events.emit('nav-click', obj);
      });
      icon.on('pointerover', () => {
        scene.input.setDefaultCursor('pointer');
      });
      icon.on('pointerout', () => {
        scene.input.setDefaultCursor('default');
      });
    }
  }

  private createIcon(
    type: string,
    px: number,
    py: number,
  ): Phaser.GameObjects.Image | Phaser.GameObjects.Shape {
    const key = TEXTURE_MAP[type];
    if (key && this.scene.textures.exists(key)) {
      return this.scene.add.image(px, py, key).setDepth(5);
    }

    // Nav doors: yellow triangle pointing right; nav_back: blue triangle pointing left
    if (type === 'nav_door') {
      return this.scene.add.triangle(px, py, 0, 6, 10, 0, 10, 12, 0xf4c542, 1).setDepth(5);
    }
    if (type === 'nav_back') {
      return this.scene.add.triangle(px, py, 10, 6, 0, 0, 0, 12, 0x8ab4f8, 1).setDepth(5);
    }

    // Fallback for unknown types
    return this.scene.add.rectangle(px, py, 8, 8, 0x888888, 0.5).setDepth(5);
  }

  destroy(): void {
    this.sprite.destroy(true);
  }
}
