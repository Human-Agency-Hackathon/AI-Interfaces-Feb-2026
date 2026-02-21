import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock RedisClient ─────────────────────────────────────────────────────────

const store = new Map<string, string>();
const lists = new Map<string, string[]>();

vi.mock('../RedisClient.js', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    exists: vi.fn(async (key: string) => store.has(key) ? 1 : 0),
    rpush: vi.fn(async (key: string, value: string) => {
      const list = lists.get(key) ?? [];
      list.push(value);
      lists.set(key, list);
      return list.length;
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      const len = list.length;
      const s = start < 0 ? Math.max(0, len + start) : start;
      const e = stop < 0 ? len + stop + 1 : Math.min(stop + 1, len);
      return list.slice(s, e);
    }),
  })),
  isRedisAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../RedisPubSub.js', () => ({
  redisPubSub: { publish: vi.fn().mockResolvedValue(undefined) },
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { RedisKnowledgeVault } from '../RedisKnowledgeVault.js';
import { RedisFindingsBoard } from '../RedisFindingsBoard.js';
import { RedisWorldStatePersistence } from '../RedisWorldStatePersistence.js';
import { RedisRealmRegistry } from '../RedisRealmRegistry.js';
import { WorldState } from '../WorldState.js';
import type { RealmEntry } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  lists.clear();
});

const sampleRealm: RealmEntry = {
  id: 'abc123',
  path: '/tmp/repo',
  name: 'repo',
  displayName: 'repo',
  lastExplored: new Date().toISOString(),
  gitInfo: { lastCommitSha: '', branch: 'main', remoteUrl: null },
  stats: { totalFiles: 1, languages: [], agentsUsed: 1, findingsCount: 0, questsTotal: 0, questsCompleted: 0 },
  mapSnapshot: { rooms: 1, tileWidth: 20, tileHeight: 15 },
};

// ── RedisKnowledgeVault ──────────────────────────────────────────────────────

describe('RedisKnowledgeVault', () => {
  it('save() writes JSON to Redis and load() reads it back', async () => {
    const vault = new RedisKnowledgeVault('agent_1', { agent_name: 'Oracle', role: 'scout', realm: '/' });
    vault.addInsight('TypeScript is used throughout');
    vault.incrementExpertise('TypeScript', 3);
    await vault.save();

    const vault2 = new RedisKnowledgeVault('agent_1', {});
    await vault2.load();
    const k = vault2.getKnowledge();

    expect(k.insights).toContain('TypeScript is used throughout');
    expect(k.expertise['TypeScript']).toBe(3);
  });

  it('load() starts fresh when no data exists', async () => {
    const vault = new RedisKnowledgeVault('new_agent', { role: 'analyst' });
    await vault.load();
    expect(vault.getKnowledge().insights).toHaveLength(0);
  });

  it('getExpertiseSummary() returns top 5 areas', () => {
    const vault = new RedisKnowledgeVault('a', {});
    vault.incrementExpertise('TS', 5);
    vault.incrementExpertise('Go', 3);
    expect(vault.getExpertiseSummary()).toContain('TS: 5');
  });

  it('recordFileAnalyzed() tracks files and realm knowledge', () => {
    const vault = new RedisKnowledgeVault('a', {});
    vault.recordFileAnalyzed('/src/index.ts');
    vault.recordFileAnalyzed('/src/index.ts'); // duplicate — should not double-count files
    const k = vault.getKnowledge();
    expect(k.files_analyzed).toHaveLength(1);
    expect(k.realm_knowledge['/src']).toBe(2); // realm count increments each call
  });
});

// ── RedisFindingsBoard ───────────────────────────────────────────────────────

describe('RedisFindingsBoard', () => {
  it('addFinding() stores finding and returns it with id + timestamp', async () => {
    const board = new RedisFindingsBoard('session_1');
    const f = await board.addFinding({ agent_id: 'a1', agent_name: 'Oracle', realm: '/', finding: 'Uses ESM', severity: 'low' });
    expect(f.id).toMatch(/^finding_/);
    expect(f.timestamp).toBeTruthy();
    expect(f.finding).toBe('Uses ESM');
  });

  it('getAll() returns all stored findings', async () => {
    const board = new RedisFindingsBoard('session_1');
    await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'f1', severity: 'low' });
    await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: 'f2', severity: 'high' });
    const all = await board.getAll();
    expect(all).toHaveLength(2);
  });

  it('getRecent() returns last N findings', async () => {
    const board = new RedisFindingsBoard('session_1');
    for (let i = 0; i < 25; i++) {
      await board.addFinding({ agent_id: 'a1', agent_name: 'O', realm: '/', finding: `f${i}`, severity: 'low' });
    }
    const recent = await board.getRecent(5);
    expect(recent).toHaveLength(5);
    expect(recent[recent.length - 1].finding).toBe('f24');
  });

  it('getSummary() returns "No findings yet." when empty', async () => {
    const board = new RedisFindingsBoard('empty_session');
    expect(await board.getSummary()).toBe('No findings yet.');
  });

  it('load() and save() are no-ops', async () => {
    const board = new RedisFindingsBoard('session_1');
    await expect(board.load()).resolves.toBeUndefined();
    await expect(board.save()).resolves.toBeUndefined();
  });
});

// ── RedisWorldStatePersistence ───────────────────────────────────────────────

describe('RedisWorldStatePersistence', () => {
  it('save() + load() round-trips WorldState', async () => {
    const persistence = new RedisWorldStatePersistence();
    const ws = new WorldState();
    ws.addAgent('oracle', 'The Oracle', 0x6a8aff, 'Oracle', '/');
    await persistence.save('realm_1', ws);

    const loaded = await persistence.load('realm_1');
    expect(loaded).not.toBeNull();
    expect(loaded!.agents.has('oracle')).toBe(true);
  });

  it('load() returns null when no state exists', async () => {
    const persistence = new RedisWorldStatePersistence();
    expect(await persistence.load('nonexistent')).toBeNull();
  });

  it('exists() returns true after save and false before', async () => {
    const persistence = new RedisWorldStatePersistence();
    expect(await persistence.exists('realm_x')).toBe(false);
    await persistence.save('realm_x', new WorldState());
    expect(await persistence.exists('realm_x')).toBe(true);
  });

  it('remove() deletes the stored state', async () => {
    const persistence = new RedisWorldStatePersistence();
    await persistence.save('realm_y', new WorldState());
    await persistence.remove('realm_y');
    expect(await persistence.exists('realm_y')).toBe(false);
  });
});

// ── RedisRealmRegistry ───────────────────────────────────────────────────────

describe('RedisRealmRegistry', () => {
  it('saveRealm() + listRealms() returns saved entries', async () => {
    const registry = new RedisRealmRegistry();
    registry.saveRealm(sampleRealm);
    expect(registry.listRealms()).toHaveLength(1);
    expect(registry.getRealm('abc123')).toEqual(sampleRealm);
  });

  it('save() + load() round-trips realms via Redis', async () => {
    const registry = new RedisRealmRegistry();
    registry.saveRealm(sampleRealm);
    await registry.save();

    const registry2 = new RedisRealmRegistry();
    await registry2.load();
    expect(registry2.getRealm('abc123')?.name).toBe('repo');
  });

  it('removeRealm() removes by id', async () => {
    const registry = new RedisRealmRegistry();
    registry.saveRealm(sampleRealm);
    registry.removeRealm('abc123');
    expect(registry.getRealm('abc123')).toBeUndefined();
  });

  it('generateRealmId() produces a 12-char hex string', () => {
    const registry = new RedisRealmRegistry();
    const id = registry.generateRealmId('/tmp/repo');
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it('load() starts empty when no data in Redis', async () => {
    const registry = new RedisRealmRegistry();
    await registry.load();
    expect(registry.listRealms()).toHaveLength(0);
  });
});
