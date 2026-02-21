const TILE_SIZE = 32;

const FORT_STAGES: Record<number, { key: string; tileSize: number }> = {
  1: { key: 'fort-stage-1', tileSize: 2 },
  2: { key: 'fort-stage-2', tileSize: 3 },
  3: { key: 'fort-stage-3', tileSize: 4 },
  4: { key: 'fort-stage-4', tileSize: 5 },
  5: { key: 'fort-stage-5', tileSize: 6 },
};

export class FortSprite {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private nameLabel: Phaser.GameObjects.Text;
  private tileX: number;
  private tileY: number;
  private stage: number;
  private agentId: string;
  private color: number;

  constructor(
    scene: Phaser.Scene,
    agentId: string,
    name: string,
    color: number,
    tileX: number,
    tileY: number,
    stage: number = 1
  ) {
    this.scene = scene;
    this.agentId = agentId;
    this.color = color;
    this.tileX = tileX;
    this.tileY = tileY;
    this.stage = stage;

    const fortDef = FORT_STAGES[stage] ?? FORT_STAGES[1];
    const px = tileX * TILE_SIZE + 16;
    const py = tileY * TILE_SIZE + 16;

    this.sprite = scene.add.image(px, py, fortDef.key);
    this.sprite.setDepth(3);
    this.sprite.setTint(color);

    this.nameLabel = scene.add.text(px, py + fortDef.tileSize * 16 + 8, name, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.nameLabel.setOrigin(0.5);
    this.nameLabel.setDepth(4);

    this.sprite.setInteractive({ useHandCursor: true });
  }

  setStage(newStage: number): void {
    const fortDef = FORT_STAGES[newStage] ?? FORT_STAGES[1];
    this.stage = newStage;
    this.sprite.setTexture(fortDef.key);
    this.sprite.setTint(this.color);

    const particles = this.scene.add.particles(
      this.sprite.x, this.sprite.y, 'tile-crystal', {
        speed: { min: 20, max: 60 },
        scale: { start: 0.5, end: 0 },
        lifespan: 800,
        quantity: 12,
        tint: this.color,
        emitting: false,
      }
    );
    particles.explode(12);
    this.scene.time.delayedCall(1000, () => particles.destroy());

    const py = this.tileY * TILE_SIZE + 16;
    this.nameLabel.setY(py + fortDef.tileSize * 16 + 8);
  }

  getAgentId(): string {
    return this.agentId;
  }

  getSprite(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  on(event: string, fn: () => void): this {
    this.sprite.on(event, fn);
    return this;
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
