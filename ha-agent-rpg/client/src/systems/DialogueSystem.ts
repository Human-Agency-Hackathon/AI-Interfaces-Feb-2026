export interface DialogueData {
  agent_id: string;
  name: string;
  text: string;
  color: number;
}

const BOX_WIDTH = 600;
const PADDING = 20;
const TEXT_WIDTH = BOX_WIDTH - PADDING * 2;
const SCREEN_HEIGHT = 480;
const SCREEN_CENTER_X = 320;
const NAME_FONT_SIZE = 16;
const BODY_FONT_SIZE = 14;
const GAP = 6;

export class DialogueSystem {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private dialogueText: Phaser.GameObjects.Text;
  private typewriterTimer?: Phaser.Time.TimerEvent;
  private autoDismissTimer?: Phaser.Time.TimerEvent;
  private fullText = '';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.bg = scene.add.rectangle(0, 0, BOX_WIDTH, 0, 0x000000, 0.85);
    this.bg.setStrokeStyle(2, 0xffffff);
    this.bg.setOrigin(0.5, 0);

    this.nameText = scene.add.text(0, 0, '', {
      fontSize: `${NAME_FONT_SIZE}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
    });

    this.dialogueText = scene.add.text(0, 0, '', {
      fontSize: `${BODY_FONT_SIZE}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
      wordWrap: { width: TEXT_WIDTH },
    });

    this.container = scene.add.container(0, 0, [this.bg, this.nameText, this.dialogueText]);
    this.container.setDepth(100);
    this.container.setVisible(false);
  }

  /** Recalculate box height and position so it sits at the bottom of the screen */
  private layout(): void {
    const nameH = this.nameText.height;
    const bodyH = this.dialogueText.height;
    const boxH = PADDING + nameH + GAP + bodyH + PADDING;

    const boxTop = SCREEN_HEIGHT - boxH;

    this.container.setPosition(SCREEN_CENTER_X, boxTop);
    this.bg.setPosition(0, 0);
    this.bg.height = boxH;

    const left = -TEXT_WIDTH / 2;
    this.nameText.setPosition(left, PADDING);
    this.dialogueText.setPosition(left, PADDING + nameH + GAP);
  }

  show(data: DialogueData): void {
    this.container.setVisible(true);

    // Set name with agent's color
    this.nameText.setText(data.name);
    const hex = '#' + data.color.toString(16).padStart(6, '0');
    this.nameText.setColor(hex);

    // Pre-compute full text height so layout is correct from the start
    this.fullText = data.text;
    this.dialogueText.setText(this.fullText);
    this.layout();
    this.dialogueText.setText('');

    this.typewriterTimer?.destroy();
    this.autoDismissTimer?.destroy();

    let charIndex = 0;
    this.typewriterTimer = this.scene.time.addEvent({
      delay: 30,
      repeat: this.fullText.length - 1,
      callback: () => {
        charIndex++;
        this.dialogueText.setText(this.fullText.substring(0, charIndex));
      },
    });

    // Auto-hide after text finishes + 2 seconds
    const totalDuration = this.fullText.length * 30 + 2000;
    this.autoDismissTimer = this.scene.time.delayedCall(totalDuration, () => {
      this.container.setVisible(false);
    });
  }
}
