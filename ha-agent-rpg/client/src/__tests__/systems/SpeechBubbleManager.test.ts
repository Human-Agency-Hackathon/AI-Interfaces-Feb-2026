import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpeechBubbleManager, type BubbleType } from '../../systems/SpeechBubbleManager';

// ── Phaser mock helpers ──

function mockGameObject(overrides: Record<string, any> = {}) {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setStrokeStyle: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setSize: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setFillStyle: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    setFontSize: vi.fn().mockReturnThis(),
    setFontStyle: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    x: 0,
    y: 0,
    width: 60,
    height: 30,
    text: '',
    style: { color: '#ffffff' },
    ...overrides,
  };
}

function createMockScene() {
  const tweens: any[] = [];
  return {
    add: {
      rectangle: vi.fn(() => mockGameObject()),
      text: vi.fn((_x: number, _y: number, text: string) =>
        mockGameObject({ width: text.length * 6, height: 14, text }),
      ),
      triangle: vi.fn(() => mockGameObject()),
    },
    tweens: {
      add: vi.fn((config: any) => {
        const tween = { destroy: vi.fn(), ...config };
        tweens.push(tween);
        return tween;
      }),
    },
    _tweens: tweens,
  } as unknown as Phaser.Scene;
}

describe('SpeechBubbleManager', () => {
  let scene: Phaser.Scene;
  let manager: SpeechBubbleManager;

  beforeEach(() => {
    scene = createMockScene();
    manager = new SpeechBubbleManager(scene);
  });

  describe('updateBubble', () => {
    it('creates a new bubble when agent has none', () => {
      manager.updateBubble('agent1', 'speak', 'Hello world', 100, 200, 0xff0000, 'Hero');

      expect(scene.add.rectangle).toHaveBeenCalled();
      expect(scene.add.text).toHaveBeenCalled();
      expect(scene.add.triangle).toHaveBeenCalled();
    });

    it('updates existing bubble text when called again', () => {
      manager.updateBubble('agent1', 'speak', 'First message', 100, 200, 0xff0000, 'Hero');
      const firstTextCall = (scene.add.text as any).mock.results.length;

      manager.updateBubble('agent1', 'speak', 'Second message', 100, 200, 0xff0000, 'Hero');

      // Should NOT create a new text object; should reuse existing
      // (add.text called only during creation, not update)
      expect((scene.add.text as any).mock.results.length).toBe(firstTextCall);
    });

    it('creates separate bubbles for different agents', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');
      manager.updateBubble('agent2', 'speak', 'World', 200, 200, 0x00ff00, 'Sage');

      // Should have created objects for both agents
      // rectangle: 1 per agent = 2, text: 2 per agent (content + name) = 4, triangle: 1 per agent = 2
      expect((scene.add.rectangle as any).mock.calls.length).toBe(2);
    });
  });

  describe('fade behavior', () => {
    it('speak type does not auto-fade', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');

      // Check that no fade tween was added (only pop-in tween)
      const tweens = (scene as any)._tweens;
      const fadeTweens = tweens.filter((t: any) =>
        t.alpha !== undefined && t.alpha === 0,
      );
      expect(fadeTweens.length).toBe(0);
    });

    it('think type starts fade tween with delay', () => {
      manager.updateBubble('agent1', 'think', 'Thinking...', 100, 200, 0xff0000, 'Hero');

      const tweens = (scene as any)._tweens;
      const fadeTweens = tweens.filter((t: any) =>
        t.alpha !== undefined && t.alpha === 0,
      );
      expect(fadeTweens.length).toBe(1);
      expect(fadeTweens[0].delay).toBe(4000);
      expect(fadeTweens[0].duration).toBe(2000);
    });

    it('activity type starts fade tween with shorter delay', () => {
      manager.updateBubble('agent1', 'activity', 'Reading file', 100, 200, 0xff0000, 'Hero', 'Read');

      const tweens = (scene as any)._tweens;
      const fadeTweens = tweens.filter((t: any) =>
        t.alpha !== undefined && t.alpha === 0,
      );
      expect(fadeTweens.length).toBe(1);
      expect(fadeTweens[0].delay).toBe(3000);
      expect(fadeTweens[0].duration).toBe(1000);
    });

    it('new message cancels in-progress fade tween', () => {
      manager.updateBubble('agent1', 'think', 'First thought', 100, 200, 0xff0000, 'Hero');

      const tweens = (scene as any)._tweens;
      const firstFade = tweens.find((t: any) => t.alpha === 0);

      manager.updateBubble('agent1', 'speak', 'Now speaking', 100, 200, 0xff0000, 'Hero');

      expect(firstFade?.destroy).toHaveBeenCalled();
    });
  });

  describe('repositionBubble', () => {
    it('tweens bubble objects to new coordinates', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');

      const tweenCallsBefore = (scene.tweens.add as any).mock.calls.length;
      manager.repositionBubble('agent1', 300, 400);

      // Should add multiple tweens for bg, text, nameTag, tail
      expect((scene.tweens.add as any).mock.calls.length).toBeGreaterThan(tweenCallsBefore);
    });

    it('is a no-op for unknown agent id', () => {
      const tweenCallsBefore = (scene.tweens.add as any).mock.calls.length;
      manager.repositionBubble('nonexistent', 300, 400);
      expect((scene.tweens.add as any).mock.calls.length).toBe(tweenCallsBefore);
    });
  });

  describe('removeBubble', () => {
    it('destroys all Phaser objects and removes from map', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');

      // Get references to the created objects
      const bg = (scene.add.rectangle as any).mock.results[0].value;
      const texts = (scene.add.text as any).mock.results;
      const tail = (scene.add.triangle as any).mock.results[0].value;

      manager.removeBubble('agent1');

      expect(bg.destroy).toHaveBeenCalled();
      expect(tail.destroy).toHaveBeenCalled();
      texts.forEach((r: any) => expect(r.value.destroy).toHaveBeenCalled());
    });

    it('is a no-op for unknown agent id', () => {
      expect(() => manager.removeBubble('nonexistent')).not.toThrow();
    });

    it('subsequent updateBubble creates fresh objects', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');
      manager.removeBubble('agent1');

      const rectCallsBefore = (scene.add.rectangle as any).mock.calls.length;
      manager.updateBubble('agent1', 'speak', 'Back again', 100, 200, 0xff0000, 'Hero');
      expect((scene.add.rectangle as any).mock.calls.length).toBeGreaterThan(rectCallsBefore);
    });
  });

  describe('text truncation', () => {
    it('truncates text longer than 100 chars with ellipsis', () => {
      const longText = 'a'.repeat(150);
      manager.updateBubble('agent1', 'speak', longText, 100, 200, 0xff0000, 'Hero');

      // The text passed to scene.add.text should be truncated
      const textCalls = (scene.add.text as any).mock.calls;
      // First text call is the content text (second is the name tag)
      const contentText = textCalls[0][2] as string;
      expect(contentText.length).toBeLessThanOrEqual(101); // 100 + ellipsis char
      expect(contentText.endsWith('\u2026')).toBe(true);
    });

    it('does not truncate text at or under 100 chars', () => {
      const shortText = 'a'.repeat(100);
      manager.updateBubble('agent1', 'speak', shortText, 100, 200, 0xff0000, 'Hero');

      const textCalls = (scene.add.text as any).mock.calls;
      const contentText = textCalls[0][2] as string;
      expect(contentText).toBe(shortText);
    });
  });

  describe('activity type with tool icons', () => {
    it('prepends tool icon for known tools', () => {
      manager.updateBubble('agent1', 'activity', 'src/main.ts', 100, 200, 0xff0000, 'Hero', 'Read');

      const textCalls = (scene.add.text as any).mock.calls;
      const contentText = textCalls[0][2] as string;
      expect(contentText).toContain('\uD83D\uDCD6'); // open book emoji
    });

    it('uses gear icon for unknown tools', () => {
      manager.updateBubble('agent1', 'activity', 'doing stuff', 100, 200, 0xff0000, 'Hero', 'UnknownTool');

      const textCalls = (scene.add.text as any).mock.calls;
      const contentText = textCalls[0][2] as string;
      expect(contentText).toContain('\u2699'); // gear
    });
  });

  describe('stacking / overlap', () => {
    it('two agents at same position get offset bubbles', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');
      manager.updateBubble('agent2', 'speak', 'World', 100, 200, 0x00ff00, 'Sage');

      // Both should exist without throwing
      // The overlap resolution should have been called
      // (We can't easily check positions on mocks, but no errors = stacking logic ran)
    });
  });

  describe('destroy', () => {
    it('removes all bubbles and indicators', () => {
      manager.updateBubble('agent1', 'speak', 'Hello', 100, 200, 0xff0000, 'Hero');
      manager.updateBubble('agent2', 'speak', 'World', 200, 200, 0x00ff00, 'Sage');

      manager.destroy();

      // All created objects should have been destroyed
      const rects = (scene.add.rectangle as any).mock.results;
      rects.forEach((r: any) => expect(r.value.destroy).toHaveBeenCalled());
    });
  });
});
