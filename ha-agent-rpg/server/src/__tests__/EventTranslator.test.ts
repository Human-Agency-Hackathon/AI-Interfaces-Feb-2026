import { describe, it, expect, beforeEach } from 'vitest';
import { EventTranslator } from '../EventTranslator.js';
import { makeMapObject } from './helpers/fixtures.js';

describe('EventTranslator', () => {
  let translator: EventTranslator;
  const agentId = 'oracle';

  beforeEach(() => {
    translator = new EventTranslator();
  });

  describe('translate()', () => {
    it('returns empty array for null/undefined messages', () => {
      expect(translator.translate(agentId, null)).toEqual([]);
      expect(translator.translate(agentId, undefined)).toEqual([]);
    });

    it('returns empty array for non-object messages', () => {
      expect(translator.translate(agentId, 'string')).toEqual([]);
      expect(translator.translate(agentId, 42)).toEqual([]);
    });

    it('returns empty array for unknown message types', () => {
      expect(translator.translate(agentId, { type: 'unknown' })).toEqual([]);
    });
  });

  describe('stream_event: content_block_start (tool_use)', () => {
    function toolStartMsg(name: string) {
      return {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name },
        },
      };
    }

    it('maps Read tool to a think event', () => {
      const events = translator.translate(agentId, toolStartMsg('Read'));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('think');
      expect(events[0].agent_id).toBe(agentId);
      expect(events[0].data.text).toBe('Reading file...');
    });

    it('maps Edit tool to a skill_effect event', () => {
      const events = translator.translate(agentId, toolStartMsg('Edit'));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('skill_effect');
    });

    it('maps Write tool to a skill_effect event', () => {
      const events = translator.translate(agentId, toolStartMsg('Write'));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('skill_effect');
    });

    it('maps Bash tool to emote + activity (two events)', () => {
      const events = translator.translate(agentId, toolStartMsg('Bash'));
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('emote');
      expect(events[0].data.emote).toBe('exclamation');
      expect(events[1].type).toBe('activity');
    });

    it('maps Grep to a think event', () => {
      const events = translator.translate(agentId, toolStartMsg('Grep'));
      expect(events[0].type).toBe('think');
      expect(events[0].data.text).toBe('Searching codebase...');
    });

    it('maps Glob to a think event', () => {
      const events = translator.translate(agentId, toolStartMsg('Glob'));
      expect(events[0].type).toBe('think');
      expect(events[0].data.text).toBe('Searching codebase...');
    });

    it('maps SummonAgent to a speak event', () => {
      const events = translator.translate(agentId, toolStartMsg('SummonAgent'));
      expect(events[0].type).toBe('speak');
      expect((events[0].data.text as string).toLowerCase()).toContain('summon');
    });

    it('maps PostFindings to a speak event', () => {
      const events = translator.translate(agentId, toolStartMsg('PostFindings'));
      expect(events[0].type).toBe('speak');
    });

    it('maps unknown tools to an activity event', () => {
      const events = translator.translate(agentId, toolStartMsg('CustomTool'));
      expect(events[0].type).toBe('activity');
      expect(events[0].data.text).toContain('CustomTool');
    });
  });

  describe('stream_event: content_block_delta (text accumulation)', () => {
    it('accumulates text deltas without emitting events', () => {
      const events = translator.translate(agentId, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello ' },
        },
      });
      expect(events).toEqual([]);
    });

    it('ignores non-text deltas', () => {
      const events = translator.translate(agentId, {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{}' },
        },
      });
      expect(events).toEqual([]);
    });
  });

  describe('stream_event: content_block_stop (flush)', () => {
    it('flushes accumulated text as a speak event', () => {
      translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
      });
      translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'World' } },
      });
      const events = translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('speak');
      expect(events[0].data.text).toBe('Hello World');
    });

    it('does not emit speak event when buffer is whitespace only', () => {
      translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '   ' } },
      });
      const events = translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      expect(events).toHaveLength(0);
    });

    it('clears the tool state on stop', () => {
      translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read' } },
      });
      translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      const events = translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      expect(events).toHaveLength(0);
    });

    it('emits no events when buffer is empty', () => {
      const events = translator.translate(agentId, {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      expect(events).toHaveLength(0);
    });
  });

  describe('assistant message handling', () => {
    it('extracts text blocks as speak events', () => {
      const events = translator.translate(agentId, {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'I found an issue' }],
        },
      });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('speak');
      expect(events[0].data.text).toBe('I found an issue');
    });

    it('extracts tool_use blocks as RPG events', () => {
      const events = translator.translate(agentId, {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read' },
            { type: 'tool_use', name: 'Bash' },
          ],
        },
      });
      // Read → 1 think, Bash → 2 (emote + activity)
      expect(events).toHaveLength(3);
    });

    it('skips empty text blocks', () => {
      const events = translator.translate(agentId, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '' }] },
      });
      expect(events).toHaveLength(0);
    });

    it('handles missing content gracefully', () => {
      expect(translator.translate(agentId, { type: 'assistant', message: {} })).toEqual([]);
      expect(translator.translate(agentId, { type: 'assistant' })).toEqual([]);
    });
  });

  describe('findObjectForFile()', () => {
    it('matches by exact label (basename)', () => {
      translator.setObjects([
        makeMapObject({ label: 'utils.ts', metadata: { fullPath: 'src/utils.ts' } }),
      ]);
      const obj = translator.findObjectForFile('src/utils.ts');
      expect(obj?.label).toBe('utils.ts');
    });

    it('matches by metadata.fullPath partial match', () => {
      translator.setObjects([
        makeMapObject({ label: 'x.ts', metadata: { fullPath: 'src/deep/nested/x.ts' } }),
      ]);
      const obj = translator.findObjectForFile('deep/nested/x.ts');
      expect(obj?.label).toBe('x.ts');
    });

    it('returns null when no match found', () => {
      translator.setObjects([]);
      expect(translator.findObjectForFile('nonexistent.ts')).toBeNull();
    });

    it('returns null for empty file path', () => {
      expect(translator.findObjectForFile('')).toBeNull();
    });
  });

  describe('multi-agent text buffer isolation', () => {
    it('maintains separate text buffers per agent', () => {
      translator.translate('agentA', {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'From A' } },
      });
      translator.translate('agentB', {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'From B' } },
      });

      const eventsA = translator.translate('agentA', {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      expect(eventsA[0].data.text).toBe('From A');

      const eventsB = translator.translate('agentB', {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      });
      expect(eventsB[0].data.text).toBe('From B');
    });
  });
});
