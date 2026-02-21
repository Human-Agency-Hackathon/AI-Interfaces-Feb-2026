import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldStatePersistence } from '../WorldStatePersistence.js';
import { WorldState } from '../WorldState.js';

describe('WorldStatePersistence', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ws-persist-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('save() and load()', () => {
    it('persists a WorldState and loads it back', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      const ws = new WorldState();
      ws.addAgent('a1', 'Oracle', 0x6a8aff, 'Oracle', '/');
      ws.setQuests([{ quest_id: 'q1', title: 'Q', body: '', labels: [], priority: 'low', source_url: '', related_files: [] }]);
      await persistence.save('realm_abc', ws);
      const loaded = await persistence.load('realm_abc');
      expect(loaded).not.toBeNull();
      expect(loaded!.agents.size).toBe(1);
      expect(loaded!.getQuests()).toHaveLength(1);
    });

    it('returns null for a realm that was never saved', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      const loaded = await persistence.load('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('exists()', () => {
    it('returns true for a saved realm', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      await persistence.save('r1', new WorldState());
      expect(await persistence.exists('r1')).toBe(true);
    });

    it('returns false for an unsaved realm', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      expect(await persistence.exists('r1')).toBe(false);
    });
  });

  describe('remove()', () => {
    it('deletes saved world state for a realm', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      await persistence.save('r1', new WorldState());
      await persistence.remove('r1');
      expect(await persistence.exists('r1')).toBe(false);
    });
  });
});
