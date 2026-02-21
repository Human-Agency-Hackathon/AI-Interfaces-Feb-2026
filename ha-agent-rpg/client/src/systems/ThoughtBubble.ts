export class ThoughtBubble {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(x: number, y: number, text: string): void {
    // Position above the agent sprite
    const bubbleY = y - 40;

    // Semi-transparent dark bubble (different from white emote bubbles)
    const bg = this.scene.add.rectangle(x, bubbleY, 0, 0, 0x222244, 0.85)
      .setStrokeStyle(1, 0x4a4a8a)
      .setDepth(25);

    // Italic text
    const textObj = this.scene.add.text(x, bubbleY, text, {
      fontSize: '9px',
      fontFamily: 'monospace',
      fontStyle: 'italic',
      color: '#a0a0d0',
      wordWrap: { width: 150 },
      align: 'center',
    }).setOrigin(0.5).setDepth(26);

    // Size the bg to fit text
    const padding = 8;
    bg.setSize(textObj.width + padding * 2, textObj.height + padding * 2);

    // Float up and fade
    this.scene.tweens.add({
      targets: [bg, textObj],
      y: bubbleY - 20,
      alpha: 0,
      duration: 3000,
      delay: 1000,  // stay visible for 1s first
      ease: 'Power1',
      onComplete: () => {
        bg.destroy();
        textObj.destroy();
      },
    });
  }
}
