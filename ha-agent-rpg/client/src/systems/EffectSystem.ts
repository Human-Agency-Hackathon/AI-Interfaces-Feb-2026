import type { AgentSprite } from './AgentSprite';

export class EffectSystem {
  private scene: Phaser.Scene;
  private agentSprites: Map<string, AgentSprite>;

  constructor(scene: Phaser.Scene, agentSprites: Map<string, AgentSprite>) {
    this.scene = scene;
    this.agentSprites = agentSprites;
  }

  playSkillEffect(casterId: string, params: Record<string, unknown>): void {
    const caster = this.agentSprites.get(casterId);
    if (!caster) return;

    const cx = caster.getX();
    const cy = caster.getY();

    // ── Caster: staggered expanding rings ──
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 100, () => {
        const ring = this.scene.add
          .circle(cx, cy, 5, 0xffff00, 0.8 - i * 0.2)
          .setStrokeStyle(2, 0xffaa00)
          .setDepth(30);

        this.scene.tweens.add({
          targets: ring,
          scaleX: 4 + i,
          scaleY: 4 + i,
          alpha: 0,
          duration: 500,
          onComplete: () => ring.destroy(),
        });
      });
    }

    // ── Caster: sparkle particles radiating outward ──
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const sparkle = this.scene.add
        .rectangle(cx, cy, 3, 3, 0xffffaa, 1)
        .setDepth(31);

      this.scene.tweens.add({
        targets: sparkle,
        x: cx + Math.cos(angle) * 25,
        y: cy + Math.sin(angle) * 25,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 400,
        delay: 50,
        onComplete: () => sparkle.destroy(),
      });
    }

    // ── Target: impact effects ──
    const targetId = params.target_id as string;
    const target = this.agentSprites.get(targetId);
    if (target) {
      const tx = target.getX();
      const ty = target.getY();

      this.scene.time.delayedCall(300, () => {
        // Impact flash
        const flash = this.scene.add
          .circle(tx, ty, 4, 0xff4444, 0.9)
          .setDepth(30);
        this.scene.tweens.add({
          targets: flash,
          scaleX: 4,
          scaleY: 4,
          alpha: 0,
          duration: 300,
          onComplete: () => flash.destroy(),
        });

        // Impact cross
        const h = this.scene.add
          .rectangle(tx, ty, 24, 2, 0xff8844, 0.8)
          .setDepth(30);
        const v = this.scene.add
          .rectangle(tx, ty, 2, 24, 0xff8844, 0.8)
          .setDepth(30);
        this.scene.tweens.add({
          targets: [h, v],
          alpha: 0,
          scaleX: 2,
          scaleY: 2,
          duration: 400,
          onComplete: () => {
            h.destroy();
            v.destroy();
          },
        });

        // Damage particles floating upward
        for (let i = 0; i < 4; i++) {
          const px = tx + (Math.random() - 0.5) * 20;
          const py = ty + (Math.random() - 0.5) * 20;
          const particle = this.scene.add
            .rectangle(px, py, 2, 2, 0xff6644, 1)
            .setDepth(31);
          this.scene.tweens.add({
            targets: particle,
            y: py - 15 - Math.random() * 10,
            alpha: 0,
            duration: 500 + Math.random() * 200,
            onComplete: () => particle.destroy(),
          });
        }
      });
    }
  }
}
