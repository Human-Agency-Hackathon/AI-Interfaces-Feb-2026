/**
 * SpeechBubbleManager — renders per-agent speech/thought/activity bubbles
 * above their sprites in the Phaser game world.
 *
 * Replaces the old ThoughtBubble (ephemeral float-up) and DialogueLog (sidebar panel)
 * with persistent, per-agent bubbles that update in place.
 *
 * Persistence model (hybrid):
 *   - speak: persists until replaced by agent's next message
 *   - think: fades after 4s delay + 2s fade
 *   - activity: fades after 3s delay + 1s fade
 */

const BUBBLE_MAX_WIDTH = 200;
const BUBBLE_PADDING = 8;
const BUBBLE_OFFSET_Y = -45;  // above sprite
const BUBBLE_GAP = 4;
const MAX_TEXT_LENGTH = 100;
const TAIL_SIZE = 6;
const NAME_FONT_SIZE = '8px';
const TEXT_FONT_SIZE = '9px';
const ACTIVITY_FONT_SIZE = '8px';

// Fade timings per type (ms)
const FADE_CONFIG: Record<BubbleType, { delay: number; duration: number } | null> = {
  speak: null,           // no auto-fade
  think: { delay: 4000, duration: 2000 },
  activity: { delay: 3000, duration: 1000 },
};

/** Tool name to emoji icon mapping (matches old DialogueLog) */
const TOOL_ICONS: Record<string, string> = {
  Read: '\uD83D\uDCD6',
  Edit: '\u270F\uFE0F',
  Write: '\u270F\uFE0F',
  Bash: '\u26A1',
  Grep: '\uD83D\uDD0D',
  Glob: '\uD83D\uDD0D',
};

export type BubbleType = 'speak' | 'think' | 'activity';

interface AgentBubbleState {
  agentId: string;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  nameTag: Phaser.GameObjects.Text;
  tail: Phaser.GameObjects.Triangle;
  type: BubbleType;
  fadeTween?: Phaser.Tweens.Tween;
  positionTweens?: Phaser.Tweens.Tween[];
  // Track position so stacking can reference it
  anchorX: number;
  anchorY: number;
  visible: boolean;
}

interface EdgeIndicatorState {
  arrow: Phaser.GameObjects.Triangle;
  label: Phaser.GameObjects.Text;
}

interface FloatingAnnouncementState {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

export class SpeechBubbleManager {
  private scene: Phaser.Scene;
  private bubbles = new Map<string, AgentBubbleState>();
  private edgeIndicators = new Map<string, EdgeIndicatorState>();
  private floatingAnnouncements: FloatingAnnouncementState[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Create or update a bubble for the given agent.
   */
  updateBubble(
    agentId: string,
    type: BubbleType,
    text: string,
    x: number,
    y: number,
    agentColor: number,
    agentName: string,
    toolName?: string,
  ): void {
    const truncated = truncateText(text, MAX_TEXT_LENGTH);
    const displayText = type === 'activity'
      ? `${toolName ? (TOOL_ICONS[toolName] || '\u2699') + ' ' : ''}${truncated}`
      : truncated;

    const existing = this.bubbles.get(agentId);
    if (existing) {
      this.updateExisting(existing, type, displayText, agentColor, agentName, x, y);
    } else {
      this.createBubble(agentId, type, displayText, x, y, agentColor, agentName);
    }

    // Apply stacking to avoid overlaps
    this.resolveOverlaps();
  }

  /**
   * Reposition a bubble to follow its agent sprite.
   */
  repositionBubble(agentId: string, x: number, y: number): void {
    const state = this.bubbles.get(agentId);
    if (!state) return;

    // Cancel any in-flight position tweens to prevent conflicting animations
    if (state.positionTweens) {
      state.positionTweens.forEach(t => t.destroy());
    }

    state.anchorX = x;
    state.anchorY = y;

    const bubbleY = y + BUBBLE_OFFSET_Y;
    const dur = 300;
    const ease = 'Power2';

    state.positionTweens = [
      this.scene.tweens.add({ targets: state.bg, x, y: bubbleY, duration: dur, ease }),
      this.scene.tweens.add({ targets: state.text, x, y: bubbleY, duration: dur, ease }),
      this.scene.tweens.add({
        targets: state.nameTag,
        x,
        y: bubbleY - state.text.height / 2 - BUBBLE_PADDING - 2,
        duration: dur,
        ease,
      }),
      this.scene.tweens.add({
        targets: state.tail,
        x: x - TAIL_SIZE,
        y: bubbleY + state.bg.height / 2,
        duration: dur,
        ease,
      }),
    ];

    this.resolveOverlaps();
  }

  /**
   * Remove a bubble (agent disconnected/removed).
   */
  removeBubble(agentId: string): void {
    const state = this.bubbles.get(agentId);
    if (!state) return;

    if (state.fadeTween) state.fadeTween.destroy();
    if (state.positionTweens) state.positionTweens.forEach(t => t.destroy());
    state.bg.destroy();
    state.text.destroy();
    state.nameTag.destroy();
    state.tail.destroy();
    this.bubbles.delete(agentId);

    // Also remove edge indicator
    this.removeEdgeIndicator(agentId);
  }

  /**
   * Called per-frame from GameScene.update(). Handles off-screen detection
   * and edge indicator rendering.
   */
  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const worldView = camera.worldView;

    for (const [agentId, state] of this.bubbles) {
      const onScreen =
        state.anchorX >= worldView.x &&
        state.anchorX <= worldView.x + worldView.width &&
        state.anchorY >= worldView.y &&
        state.anchorY <= worldView.y + worldView.height;

      if (onScreen && !state.visible) {
        // Coming back on screen
        this.showBubble(state);
        this.removeEdgeIndicator(agentId);
      } else if (!onScreen && state.visible) {
        // Going off screen
        this.hideBubble(state);
      }

      if (!onScreen) {
        this.updateEdgeIndicator(agentId, state, camera);
      }
    }
  }

  /**
   * Destroy all bubbles and indicators.
   */
  destroy(): void {
    for (const [agentId] of this.bubbles) {
      this.removeBubble(agentId);
    }
    for (const [agentId] of this.edgeIndicators) {
      this.removeEdgeIndicator(agentId);
    }
    // Clean up any active floating announcements
    for (const ann of this.floatingAnnouncements) {
      ann.bg.destroy();
      ann.text.destroy();
    }
    this.floatingAnnouncements = [];
  }

  // ── Private: creation ──

  private createBubble(
    agentId: string,
    type: BubbleType,
    displayText: string,
    x: number,
    y: number,
    agentColor: number,
    agentName: string,
  ): void {
    const bubbleY = y + BUBBLE_OFFSET_Y;
    const style = getBubbleStyle(type);

    // Text (created first to measure)
    const textObj = this.scene.add.text(x, bubbleY, displayText, {
      fontSize: type === 'activity' ? ACTIVITY_FONT_SIZE : TEXT_FONT_SIZE,
      fontFamily: 'monospace',
      fontStyle: type === 'think' ? 'italic' : 'normal',
      color: style.textColor,
      wordWrap: { width: BUBBLE_MAX_WIDTH - BUBBLE_PADDING * 2 },
      align: 'left',
    }).setOrigin(0.5).setDepth(26);

    // Background
    const bgW = Math.min(textObj.width + BUBBLE_PADDING * 2, BUBBLE_MAX_WIDTH);
    const bgH = textObj.height + BUBBLE_PADDING * 2 + 10; // +10 for name tag space
    const bg = this.scene.add.rectangle(x, bubbleY, bgW, bgH, style.bgColor, style.bgAlpha)
      .setStrokeStyle(1, style.strokeColor)
      .setDepth(25);

    // Name tag (above the text, inside the bubble)
    const nameTag = this.scene.add.text(
      x,
      bubbleY - textObj.height / 2 - BUBBLE_PADDING - 2,
      agentName.toUpperCase(),
      {
        fontSize: NAME_FONT_SIZE,
        fontFamily: 'monospace',
        fontStyle: 'bold',
        color: '#' + agentColor.toString(16).padStart(6, '0'),
      },
    ).setOrigin(0.5).setDepth(27);

    // Tail (small triangle pointing down toward the sprite)
    const tailY = bubbleY + bgH / 2;
    const tail = this.scene.add.triangle(
      x - TAIL_SIZE, tailY,
      0, 0,
      TAIL_SIZE * 2, 0,
      TAIL_SIZE, TAIL_SIZE,
      style.bgColor, style.bgAlpha,
    ).setDepth(25);

    // Hide tail for think/activity (only speech gets the pointer)
    if (type !== 'speak') {
      tail.setAlpha(0);
    }

    const state: AgentBubbleState = {
      agentId,
      bg,
      text: textObj,
      nameTag,
      tail,
      type,
      anchorX: x,
      anchorY: y,
      visible: true,
    };

    this.bubbles.set(agentId, state);

    // Pop-in animation
    const targets = [bg, textObj, nameTag, tail];
    targets.forEach(t => t.setScale(0));
    this.scene.tweens.add({
      targets,
      scale: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });

    // Start fade if needed
    this.startFade(state);
  }

  // ── Private: update existing ──

  private updateExisting(
    state: AgentBubbleState,
    type: BubbleType,
    displayText: string,
    agentColor: number,
    agentName: string,
    x: number,
    y: number,
  ): void {
    // Cancel any in-progress fade
    if (state.fadeTween) {
      state.fadeTween.destroy();
      state.fadeTween = undefined;
    }

    // Restore full visibility
    const objects = [state.bg, state.text, state.nameTag, state.tail];
    objects.forEach(o => o.setAlpha(1));

    // Update type + style
    const style = getBubbleStyle(type);
    state.type = type;
    state.anchorX = x;
    state.anchorY = y;

    const bubbleY = y + BUBBLE_OFFSET_Y;

    // Update text
    state.text.setText(displayText);
    state.text.setFontStyle(type === 'think' ? 'italic' : 'normal');
    state.text.setFontSize(type === 'activity' ? ACTIVITY_FONT_SIZE : TEXT_FONT_SIZE);
    state.text.setColor(style.textColor);
    state.text.setPosition(x, bubbleY);

    // Resize bg
    const bgW = Math.min(state.text.width + BUBBLE_PADDING * 2, BUBBLE_MAX_WIDTH);
    const bgH = state.text.height + BUBBLE_PADDING * 2 + 10;
    state.bg.setSize(bgW, bgH);
    state.bg.setPosition(x, bubbleY);
    state.bg.setFillStyle(style.bgColor, style.bgAlpha);
    state.bg.setStrokeStyle(1, style.strokeColor);

    // Update name tag
    state.nameTag.setText(agentName.toUpperCase());
    state.nameTag.setColor('#' + agentColor.toString(16).padStart(6, '0'));
    state.nameTag.setPosition(x, bubbleY - state.text.height / 2 - BUBBLE_PADDING - 2);

    // Update tail
    const tailY = bubbleY + bgH / 2;
    state.tail.setPosition(x - TAIL_SIZE, tailY);
    state.tail.setAlpha(type === 'speak' ? 1 : 0);

    // Brief scale pulse to signal content update
    this.scene.tweens.add({
      targets: objects,
      scaleX: { from: 0.95, to: 1 },
      scaleY: { from: 0.95, to: 1 },
      duration: 100,
      ease: 'Sine.easeOut',
    });

    // Start fade if needed
    this.startFade(state);
  }

  // ── Private: fade ──

  private startFade(state: AgentBubbleState): void {
    const config = FADE_CONFIG[state.type];
    if (!config) return;

    const targets = [state.bg, state.text, state.nameTag, state.tail];
    state.fadeTween = this.scene.tweens.add({
      targets,
      alpha: 0,
      duration: config.duration,
      delay: config.delay,
      ease: 'Power1',
    });
  }

  // ── Private: overlap/stacking ──

  private resolveOverlaps(): void {
    const entries = Array.from(this.bubbles.values())
      .filter(s => s.visible)
      .sort((a, b) => b.bg.y - a.bg.y);  // bottom to top (highest Y first)

    // Process bottom-to-top: for each bubble, check if it overlaps
    // with the one below it and push it upward. This cascades correctly
    // because we process in order from bottom to top.
    for (let i = 1; i < entries.length; i++) {
      const below = entries[i - 1];
      const above = entries[i];

      const dx = Math.abs(above.bg.x - below.bg.x);
      const overlapX = dx < (above.bg.width / 2 + below.bg.width / 2);
      if (!overlapX) continue;

      const dy = below.bg.y - above.bg.y; // positive when above is actually above
      const minGap = above.bg.height / 2 + below.bg.height / 2 + BUBBLE_GAP;

      if (dy < minGap) {
        const offset = minGap - dy;
        this.offsetBubbleY(above, -offset);
      }
    }
  }

  private offsetBubbleY(state: AgentBubbleState, offsetY: number): void {
    state.bg.y += offsetY;
    state.text.y += offsetY;
    state.nameTag.y += offsetY;
    state.tail.y += offsetY;
  }

  // ── Private: visibility (off-screen handling) ──

  private showBubble(state: AgentBubbleState): void {
    state.visible = true;
    state.bg.setVisible(true);
    state.text.setVisible(true);
    state.nameTag.setVisible(true);
    state.tail.setVisible(true);
  }

  private hideBubble(state: AgentBubbleState): void {
    state.visible = false;
    state.bg.setVisible(false);
    state.text.setVisible(false);
    state.nameTag.setVisible(false);
    state.tail.setVisible(false);
  }

  // ── Private: edge indicators ──

  private updateEdgeIndicator(
    agentId: string,
    state: AgentBubbleState,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): void {
    const worldView = camera.worldView;
    const margin = 20;

    // Clamp agent position to screen edges (in world coords)
    const edgeX = Phaser.Math.Clamp(
      state.anchorX,
      worldView.x + margin,
      worldView.x + worldView.width - margin,
    );
    const edgeY = Phaser.Math.Clamp(
      state.anchorY,
      worldView.y + margin,
      worldView.y + worldView.height - margin,
    );

    // Determine arrow direction
    const angle = Phaser.Math.Angle.Between(edgeX, edgeY, state.anchorX, state.anchorY);
    const rawColor = state.nameTag?.style?.color;
    const colorStr = typeof rawColor === 'string' ? rawColor : '';
    const colorNum = colorStr
      ? parseInt(colorStr.replace('#', '') || 'ffffff', 16)
      : 0xffffff;

    const existing = this.edgeIndicators.get(agentId);
    if (existing) {
      existing.arrow.setPosition(edgeX, edgeY);
      existing.arrow.setRotation(angle);
      existing.label.setPosition(edgeX, edgeY - 10);
    } else {
      const arrow = this.scene.add.triangle(
        edgeX, edgeY,
        0, -5, 10, 0, 0, 5,
        colorNum, 0.9,
      ).setDepth(30).setRotation(angle);

      const label = this.scene.add.text(edgeX, edgeY - 10, state.nameTag?.text || agentId, {
        fontSize: '7px',
        fontFamily: 'monospace',
        color: '#' + colorNum.toString(16).padStart(6, '0'),
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(30);

      this.edgeIndicators.set(agentId, { arrow, label });
    }
  }

  private removeEdgeIndicator(agentId: string): void {
    const indicator = this.edgeIndicators.get(agentId);
    if (!indicator) return;
    indicator.arrow.destroy();
    indicator.label.destroy();
    this.edgeIndicators.delete(agentId);
  }

  // ── Floating announcements (system messages, findings, stage transitions) ──

  /**
   * Show a centered floating text announcement in the game world.
   * Used for stage transitions, findings, and system messages.
   * Text appears centered in the camera viewport and fades after the given duration.
   */
  showFloatingAnnouncement(
    text: string,
    camera: Phaser.Cameras.Scene2D.Camera,
    duration = 5000,
    color = '#ffdd44',
  ): void {
    const worldView = camera.worldView;
    const centerX = worldView.x + worldView.width / 2;
    const centerY = worldView.y + worldView.height * 0.2; // upper portion of screen

    // Semi-transparent banner background
    const bannerText = this.scene.add.text(centerX, centerY, text, {
      fontSize: '11px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color,
      align: 'center',
      wordWrap: { width: worldView.width * 0.8 },
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(35);

    const bannerBg = this.scene.add.rectangle(
      centerX, centerY,
      bannerText.width + 24, bannerText.height + 12,
      0x0a0a1e, 0.85,
    ).setStrokeStyle(1, 0x4a4a8a).setDepth(34);

    // Track for cleanup on destroy
    const entry: FloatingAnnouncementState = { bg: bannerBg, text: bannerText };
    this.floatingAnnouncements.push(entry);

    // Pop-in
    const targets = [bannerBg, bannerText];
    targets.forEach(t => t.setScale(0.8).setAlpha(0));
    this.scene.tweens.add({
      targets,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Fade out and destroy
    this.scene.tweens.add({
      targets,
      alpha: 0,
      y: centerY - 10,
      duration: 1500,
      delay: duration - 1500,
      ease: 'Power1',
      onComplete: () => {
        const idx = this.floatingAnnouncements.indexOf(entry);
        if (idx >= 0) this.floatingAnnouncements.splice(idx, 1);
        bannerBg.destroy();
        bannerText.destroy();
      },
    });
  }
}

// ── Helpers ──

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  let cutoff = text.lastIndexOf(' ', maxLength);
  if (cutoff < maxLength * 0.5) cutoff = maxLength;
  return text.slice(0, cutoff) + '\u2026';
}

interface BubbleStyle {
  bgColor: number;
  bgAlpha: number;
  strokeColor: number;
  textColor: string;
}

function getBubbleStyle(type: BubbleType): BubbleStyle {
  switch (type) {
    case 'speak':
      return { bgColor: 0x1a1a3a, bgAlpha: 0.92, strokeColor: 0x4a4a8a, textColor: '#e0e0ff' };
    case 'think':
      return { bgColor: 0x111128, bgAlpha: 0.8, strokeColor: 0x333366, textColor: '#a0a0d0' };
    case 'activity':
      return { bgColor: 0x111128, bgAlpha: 0.7, strokeColor: 0x2a2a5a, textColor: '#777799' };
  }
}
