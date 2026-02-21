import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RealmRegistry } from '../RealmRegistry.js';
import type { RealmEntry } from '../types.js';

function makeRealm(overrides: Partial<RealmEntry> = {}): RealmEntry {
  return {
    id: 'test_realm',
    path: '/tmp/test-project',
    name: 'test-project',
    displayName: 'test-project',
    lastExplored: '2026-02-18T10:00:00Z',
    gitInfo: { lastCommitSha: 'abc1234', branch: 'main', remoteUrl: null },
    stats: { totalFiles: 42, languages: ['TypeScript'], agentsUsed: 1, findingsCount: 3, questsTotal: 2, questsCompleted: 1 },
    mapSnapshot: { rooms: 5, tileWidth: 80, tileHeight: 60 },
    ...overrides,
  };
}

describe('RealmRegistry', () => {
  let tempDir: string;
  beforeEach(async () => { tempDir = await mkdtemp(join(tmpdir(), 'realm-registry-test-')); });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  describe('listRealms()', () => {
    it('returns empty array when no realms file exists', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      expect(registry.listRealms()).toEqual([]);
    });
    it('returns saved realms sorted by lastExplored descending', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm({ id: 'old', lastExplored: '2026-02-10T00:00:00Z' }));
      registry.saveRealm(makeRealm({ id: 'new', lastExplored: '2026-02-18T00:00:00Z' }));
      const realms = registry.listRealms();
      expect(realms).toHaveLength(2);
      expect(realms[0].id).toBe('new');
      expect(realms[1].id).toBe('old');
    });
  });

  describe('saveRealm()', () => {
    it('adds a new realm entry', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm());
      expect(registry.listRealms()).toHaveLength(1);
    });
    it('upserts an existing realm by id', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm({ id: 'r1', displayName: 'v1' }));
      registry.saveRealm(makeRealm({ id: 'r1', displayName: 'v2' }));
      const realms = registry.listRealms();
      expect(realms).toHaveLength(1);
      expect(realms[0].displayName).toBe('v2');
    });
  });

  describe('removeRealm()', () => {
    it('removes a realm by id', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm({ id: 'r1' }));
      registry.removeRealm('r1');
      expect(registry.listRealms()).toHaveLength(0);
    });
    it('does nothing when removing a non-existent id', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm({ id: 'r1' }));
      registry.removeRealm('nonexistent');
      expect(registry.listRealms()).toHaveLength(1);
    });
  });

  describe('getRealm()', () => {
    it('returns a realm by id', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm({ id: 'r1', name: 'proj' }));
      expect(registry.getRealm('r1')?.name).toBe('proj');
    });
    it('returns undefined for unknown id', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      expect(registry.getRealm('nope')).toBeUndefined();
    });
  });

  describe('save() and load()', () => {
    it('persists realms to disk and loads them back', async () => {
      const reg1 = new RealmRegistry(tempDir);
      await reg1.load();
      reg1.saveRealm(makeRealm({ id: 'r1', name: 'saved' }));
      await reg1.save();
      const reg2 = new RealmRegistry(tempDir);
      await reg2.load();
      expect(reg2.listRealms()).toHaveLength(1);
      expect(reg2.listRealms()[0].name).toBe('saved');
    });
    it('writes valid JSON to .agent-rpg/realms.json', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.saveRealm(makeRealm());
      await registry.save();
      const filePath = join(tempDir, '.agent-rpg', 'realms.json');
      const data = JSON.parse(await readFile(filePath, 'utf-8'));
      expect(data.realms).toHaveLength(1);
    });
  });

  describe('generateRealmId()', () => {
    it('produces a stable id from a given path', () => {
      const registry = new RealmRegistry(tempDir);
      const id1 = registry.generateRealmId('/Users/you/project');
      const id2 = registry.generateRealmId('/Users/you/project');
      expect(id1).toBe(id2);
    });
    it('produces different ids for different paths', () => {
      const registry = new RealmRegistry(tempDir);
      const id1 = registry.generateRealmId('/a');
      const id2 = registry.generateRealmId('/b');
      expect(id1).not.toBe(id2);
    });
  });
});
