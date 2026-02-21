import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranscriptLogger } from '../TranscriptLogger.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('TranscriptLogger', () => {
  let tempDir: string;
  let logger: TranscriptLogger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'transcript-test-'));
    logger = new TranscriptLogger(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readTranscript', () => {
    it('returns empty array when no logs exist', async () => {
      const entries = await logger.readTranscript('nonexistent-agent');
      expect(entries).toEqual([]);
    });

    it('returns logged entries in order', async () => {
      await logger.log('agent-1', { type: 'assistant', text: 'hello' });
      await logger.log('agent-1', { type: 'stream_event', data: 'chunk' });

      const entries = await logger.readTranscript('agent-1');
      expect(entries).toHaveLength(2);
      expect(entries[0].agent_id).toBe('agent-1');
      expect(entries[0].message).toEqual({ type: 'assistant', text: 'hello' });
      expect(entries[1].message).toEqual({ type: 'stream_event', data: 'chunk' });
      expect(entries[0].timestamp).toBeDefined();
    });

    it('only returns entries for the requested agent', async () => {
      await logger.log('agent-1', { type: 'assistant', text: 'from agent 1' });
      await logger.log('agent-2', { type: 'assistant', text: 'from agent 2' });

      const entries = await logger.readTranscript('agent-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toEqual({ type: 'assistant', text: 'from agent 1' });
    });

    it('handles malformed JSONL lines gracefully', async () => {
      await logger.log('agent-1', { type: 'assistant', text: 'valid' });

      const { appendFile } = await import('node:fs/promises');
      const dateStr = new Date().toISOString().split('T')[0];
      const filePath = join(tempDir, '.agent-rpg', 'logs', 'agent-1', `${dateStr}.jsonl`);
      await appendFile(filePath, 'not valid json\n', 'utf-8');
      await logger.log('agent-1', { type: 'assistant', text: 'also valid' });

      const entries = await logger.readTranscript('agent-1');
      expect(entries).toHaveLength(2);
    });
  });
});
