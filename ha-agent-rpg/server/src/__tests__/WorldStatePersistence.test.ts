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

  describe('S3: expanded serialisation round-trips', () => {
    it('round-trips navigationState through save/load', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      const ws = new WorldState();
      ws.navigationState = {
        agentNavStacks: {
          'agent_1': [{ path: '/src', returnPosition: { x: 3, y: 5 } }],
        },
        agentCurrentPath: { 'agent_1': '/src/components' },
      };
      await persistence.save('realm_nav', ws);
      const loaded = await persistence.load('realm_nav');
      expect(loaded!.navigationState).not.toBeNull();
      expect(loaded!.navigationState!.agentCurrentPath['agent_1']).toBe('/src/components');
      expect(loaded!.navigationState!.agentNavStacks['agent_1']).toHaveLength(1);
      expect(loaded!.navigationState!.agentNavStacks['agent_1'][0].path).toBe('/src');
    });

    it('round-trips fog-of-war explored state through save/load', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      const ws = new WorldState();
      ws.initFogMap(10, 8);
      ws.revealTiles(2, 2, 1);
      await persistence.save('realm_fog', ws);
      const loaded = await persistence.load('realm_fog');
      expect(loaded!.isExplored(2, 2)).toBe(true);
      expect(loaded!.isExplored(0, 0)).toBe(false);
    });

    it('round-trips fort stages and positions through save/load', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      const ws = new WorldState();
      ws.setFortStage('agent_1', 3);
      ws.setFortPosition('agent_1', 10, 15);
      await persistence.save('realm_fort', ws);
      const loaded = await persistence.load('realm_fort');
      expect(loaded!.getFortStage('agent_1')).toBe(3);
      expect(loaded!.getFortPosition('agent_1')).toEqual({ x: 10, y: 15 });
    });

    it('loads cleanly when navigationState is absent (backward compat)', async () => {
      const persistence = new WorldStatePersistence(tempDir);
      const ws = new WorldState();
      // Simulate an old save without navigationState (it will be null)
      await persistence.save('realm_old', ws);
      const loaded = await persistence.load('realm_old');
      expect(loaded!.navigationState).toBeNull();
    });
  });
});
