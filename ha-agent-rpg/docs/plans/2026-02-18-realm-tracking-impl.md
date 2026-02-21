# Realm Tracking & History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent realm tracking so explored repos are remembered, shown on RepoScreen with rich previews, and can be resumed or re-scanned. Also fix the bug where input is ignored after the first game session.

**Architecture:** File-based realm registry (`.agent-rpg/realms.json`) stores metadata per explored repo. WorldState is serialized per realm for instant resume. RepoScreen renders past realms with Resume/Re-scan/Remove buttons. Git change detection compares stored commit SHA to current HEAD.

**Tech Stack:** TypeScript, Vitest, Node.js fs/promises, WebSocket, Phaser 3 (client), `execFile` for git commands (NOT `exec` — avoids shell injection)

---

**IMPORTANT:** The project has three copies of protocol types that must stay in sync:
- `shared/protocol.ts` (canonical)
- `server/src/types.ts` (server copy)
- `client/src/types.ts` (client copy)

All three must be updated identically when adding new types.

**IMPORTANT:** Never use `child_process.exec()`. Always use `execFile()` (or `promisify(execFile)`) to avoid command injection vulnerabilities.

---

### Task 1: Add Realm Protocol Types

**Files:**
- Modify: `shared/protocol.ts:196-231`
- Modify: `server/src/types.ts:192-227`
- Modify: `client/src/types.ts:192-227`

**Step 1: Add RealmEntry interface and new message types to `shared/protocol.ts`**

Insert after the `SessionSettings` interface (after line 203) and before `ErrorMessage`:

```typescript
// ── Realm Tracking ──
export interface RealmEntry {
  id: string;
  path: string;
  name: string;
  displayName: string;
  lastExplored: string;
  gitInfo: {
    lastCommitSha: string;
    branch: string;
    remoteUrl: string | null;
  };
  stats: {
    totalFiles: number;
    languages: string[];
    agentsUsed: number;
    findingsCount: number;
    questsTotal: number;
    questsCompleted: number;
  };
  mapSnapshot: {
    rooms: number;
    tileWidth: number;
    tileHeight: number;
  };
}

export interface RealmEntryWithChanges extends RealmEntry {
  changesSinceLastScan: number | null;
}

// ── Messages: Player → Server (Realm) ──
export interface ListRealmsMessage {
  type: 'player:list-realms';
}

export interface ResumeRealmMessage {
  type: 'player:resume-realm';
  realm_id: string;
}

export interface RemoveRealmMessage {
  type: 'player:remove-realm';
  realm_id: string;
}

// ── Messages: Server → All (Realm) ──
export interface RealmListMessage {
  type: 'realm:list';
  realms: RealmEntryWithChanges[];
}

export interface RealmRemovedMessage {
  type: 'realm:removed';
  realm_id: string;
}
```

Then add the new message types to the union types:

```typescript
export type ClientMessage =
  | AgentRegisterMessage
  | AgentActionMessage
  | LinkRepoMessage
  | PlayerCommandMessage
  | UpdateSettingsMessage
  | DismissAgentMessage
  | ListRealmsMessage
  | ResumeRealmMessage
  | RemoveRealmMessage;

export type ServerMessage =
  | WorldStateMessage
  | ActionResultMessage
  | AgentJoinedMessage
  | AgentLeftMessage
  | RepoReadyMessage
  | QuestUpdateMessage
  | AgentThoughtMessage
  | AgentActivityMessage
  | SpawnRequestMessage
  | FindingsPostedMessage
  | KnowledgeLevelUpMessage
  | ErrorMessage
  | RealmListMessage
  | RealmRemovedMessage;
```

**Step 2: Copy the identical changes to `server/src/types.ts` and `client/src/types.ts`**

Both files have the same structure — insert the same interfaces and update the same union types.

**Step 3: Commit**

```bash
git add shared/protocol.ts server/src/types.ts client/src/types.ts
git commit -m "feat: add realm tracking protocol types"
```

---

### Task 2: Create RealmRegistry Service

**Files:**
- Create: `server/src/RealmRegistry.ts`
- Test: `server/src/__tests__/RealmRegistry.test.ts`

**Step 1: Write the failing tests**

Create `server/src/__tests__/RealmRegistry.test.ts`:

```typescript
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
    gitInfo: {
      lastCommitSha: 'abc1234',
      branch: 'main',
      remoteUrl: null,
    },
    stats: {
      totalFiles: 42,
      languages: ['TypeScript'],
      agentsUsed: 1,
      findingsCount: 3,
      questsTotal: 2,
      questsCompleted: 1,
    },
    mapSnapshot: {
      rooms: 5,
      tileWidth: 80,
      tileHeight: 60,
    },
    ...overrides,
  };
}

describe('RealmRegistry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'realm-registry-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/__tests__/RealmRegistry.test.ts`
Expected: FAIL — cannot resolve `../RealmRegistry.js`

**Step 3: Write the RealmRegistry implementation**

Create `server/src/RealmRegistry.ts`:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { RealmEntry } from './types.js';

interface RealmRegistryData {
  realms: RealmEntry[];
}

export class RealmRegistry {
  private realms: RealmEntry[] = [];
  private filePath: string;

  constructor(baseDir: string) {
    this.filePath = join(baseDir, '.agent-rpg', 'realms.json');
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed: RealmRegistryData = JSON.parse(data);
      this.realms = parsed.realms ?? [];
    } catch {
      this.realms = [];
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const data: RealmRegistryData = { realms: this.realms };
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  listRealms(): RealmEntry[] {
    return [...this.realms].sort(
      (a, b) => new Date(b.lastExplored).getTime() - new Date(a.lastExplored).getTime(),
    );
  }

  getRealm(id: string): RealmEntry | undefined {
    return this.realms.find((r) => r.id === id);
  }

  saveRealm(entry: RealmEntry): void {
    const idx = this.realms.findIndex((r) => r.id === entry.id);
    if (idx >= 0) {
      this.realms[idx] = entry;
    } else {
      this.realms.push(entry);
    }
  }

  removeRealm(id: string): void {
    this.realms = this.realms.filter((r) => r.id !== id);
  }

  generateRealmId(repoPath: string): string {
    return createHash('sha256').update(repoPath).digest('hex').slice(0, 12);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/__tests__/RealmRegistry.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add server/src/RealmRegistry.ts server/src/__tests__/RealmRegistry.test.ts
git commit -m "feat: add RealmRegistry service with file-based persistence"
```

---

### Task 3: Add WorldState Serialization

**Files:**
- Modify: `server/src/WorldState.ts:174-185`
- Test: `server/src/__tests__/WorldState.test.ts` (add new describe block)

**Step 1: Write the failing tests**

Append to existing `server/src/__tests__/WorldState.test.ts`:

```typescript
describe('toJSON() and fromJSON()', () => {
  it('serializes and deserializes the world state', () => {
    const ws = new WorldState();
    ws.addAgent('a1', 'Oracle', 0x6a8aff, 'Oracle', '/');
    ws.setQuests([{ quest_id: 'q1', title: 'Test', body: '', labels: [], priority: 'low', source_url: '', related_files: [] }]);

    const json = ws.toJSON();
    const ws2 = WorldState.fromJSON(json);

    expect(ws2.agents.size).toBe(1);
    expect(ws2.agents.get('a1')?.name).toBe('Oracle');
    expect(ws2.getQuests()).toHaveLength(1);
    expect(ws2.map.width).toBe(ws.map.width);
  });

  it('round-trips objects correctly', () => {
    const ws = new WorldState();
    ws.setObjects([{ id: 'o1', type: 'file', x: 5, y: 5, label: 'test.ts', metadata: {} }]);

    const ws2 = WorldState.fromJSON(ws.toJSON());
    expect(ws2.getObjects()).toHaveLength(1);
    expect(ws2.getObjects()[0].label).toBe('test.ts');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/__tests__/WorldState.test.ts -t "toJSON"`
Expected: FAIL — `toJSON` is not a function

**Step 3: Add `toJSON()` and `fromJSON()` to WorldState**

In `server/src/WorldState.ts`, change `private tick = 0;` (line 13) to `tick = 0;` (remove `private`).

Then add these methods at the end of the `WorldState` class, after the `getSnapshot()` method:

```typescript
  toJSON(): string {
    return JSON.stringify({
      agents: Array.from(this.agents.entries()),
      map: this.map,
      objects: this.objects,
      quests: this.quests,
      tick: this.tick,
    });
  }

  static fromJSON(json: string): WorldState {
    const data = JSON.parse(json);
    const ws = new WorldState();
    ws.map = data.map;
    ws.agents = new Map(data.agents);
    ws.setObjects(data.objects ?? []);
    ws.setQuests(data.quests ?? []);
    ws.tick = data.tick ?? 0;
    return ws;
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/__tests__/WorldState.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add server/src/WorldState.ts server/src/__tests__/WorldState.test.ts
git commit -m "feat: add WorldState serialization (toJSON/fromJSON)"
```

---

### Task 4: Add Git Change Detection

**Files:**
- Create: `server/src/GitHelper.ts`
- Test: `server/src/__tests__/GitHelper.test.ts`

**Step 1: Write the failing tests**

Create `server/src/__tests__/GitHelper.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitHelper } from '../GitHelper.js';

describe('GitHelper', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'git-helper-test-'));
    // Initialize a git repo with one commit
    execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], {
      cwd: tempDir,
      stdio: 'pipe',
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getHeadSha()', () => {
    it('returns the current HEAD sha', async () => {
      const sha = await GitHelper.getHeadSha(tempDir);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe('getBranch()', () => {
    it('returns the current branch name', async () => {
      const branch = await GitHelper.getBranch(tempDir);
      // git init defaults to "main" or "master" depending on config
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe('getRemoteUrl()', () => {
    it('returns null when no remote is configured', async () => {
      const url = await GitHelper.getRemoteUrl(tempDir);
      expect(url).toBeNull();
    });
  });

  describe('countCommitsSince()', () => {
    it('returns 0 when sha matches HEAD', async () => {
      const sha = await GitHelper.getHeadSha(tempDir);
      const count = await GitHelper.countCommitsSince(tempDir, sha);
      expect(count).toBe(0);
    });

    it('counts new commits since a given sha', async () => {
      const sha = await GitHelper.getHeadSha(tempDir);
      execFileSync('git', ['commit', '--allow-empty', '-m', 'second'], { cwd: tempDir, stdio: 'pipe' });
      execFileSync('git', ['commit', '--allow-empty', '-m', 'third'], { cwd: tempDir, stdio: 'pipe' });
      const count = await GitHelper.countCommitsSince(tempDir, sha);
      expect(count).toBe(2);
    });

    it('returns null when sha is not found in history', async () => {
      const count = await GitHelper.countCommitsSince(tempDir, 'deadbeef00000000000000000000000000000000');
      expect(count).toBeNull();
    });
  });

  describe('getGitInfo()', () => {
    it('returns complete git info for a repo', async () => {
      const info = await GitHelper.getGitInfo(tempDir);
      expect(info.lastCommitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(info.branch.length).toBeGreaterThan(0);
      expect(info.remoteUrl).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/__tests__/GitHelper.test.ts`
Expected: FAIL — cannot resolve `../GitHelper.js`

**Step 3: Write the GitHelper implementation**

Create `server/src/GitHelper.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitHelper {
  static async getHeadSha(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
    return stdout.trim();
  }

  static async getBranch(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
    return stdout.trim();
  }

  static async getRemoteUrl(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  static async countCommitsSince(repoPath: string, sinceCommitSha: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-list', '--count', `${sinceCommitSha}..HEAD`],
        { cwd: repoPath },
      );
      return parseInt(stdout.trim(), 10);
    } catch {
      return null;
    }
  }

  static async getGitInfo(repoPath: string): Promise<{
    lastCommitSha: string;
    branch: string;
    remoteUrl: string | null;
  }> {
    const [lastCommitSha, branch, remoteUrl] = await Promise.all([
      this.getHeadSha(repoPath),
      this.getBranch(repoPath),
      this.getRemoteUrl(repoPath),
    ]);
    return { lastCommitSha, branch, remoteUrl };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/__tests__/GitHelper.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add server/src/GitHelper.ts server/src/__tests__/GitHelper.test.ts
git commit -m "feat: add GitHelper for git change detection"
```

---

### Task 5: Add WorldState Persistence to Disk

**Files:**
- Create: `server/src/WorldStatePersistence.ts`
- Test: `server/src/__tests__/WorldStatePersistence.test.ts`

**Step 1: Write the failing tests**

Create `server/src/__tests__/WorldStatePersistence.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/__tests__/WorldStatePersistence.test.ts`
Expected: FAIL — cannot resolve `../WorldStatePersistence.js`

**Step 3: Write the implementation**

Create `server/src/WorldStatePersistence.ts`:

```typescript
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { WorldState } from './WorldState.js';

export class WorldStatePersistence {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = join(baseDir, '.agent-rpg', 'worlds');
  }

  async save(realmId: string, worldState: WorldState): Promise<void> {
    const dir = join(this.baseDir, realmId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), worldState.toJSON());
  }

  async load(realmId: string): Promise<WorldState | null> {
    try {
      const data = await readFile(join(this.baseDir, realmId, 'state.json'), 'utf-8');
      return WorldState.fromJSON(data);
    } catch {
      return null;
    }
  }

  async exists(realmId: string): Promise<boolean> {
    try {
      await access(join(this.baseDir, realmId, 'state.json'));
      return true;
    } catch {
      return false;
    }
  }

  async remove(realmId: string): Promise<void> {
    try {
      await rm(join(this.baseDir, realmId), { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/__tests__/WorldStatePersistence.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add server/src/WorldStatePersistence.ts server/src/__tests__/WorldStatePersistence.test.ts
git commit -m "feat: add WorldStatePersistence for saving/loading realm state"
```

---

### Task 6: Integrate RealmRegistry and WorldStatePersistence into BridgeServer

**Files:**
- Modify: `server/src/BridgeServer.ts`

**Step 1: Add imports and new fields**

Replace the existing type import at the top of `server/src/BridgeServer.ts` (lines 2-10) with:

```typescript
import type {
  ServerMessage,
  AgentRegisterMessage,
  LinkRepoMessage,
  PlayerCommandMessage,
  UpdateSettingsMessage,
  DismissAgentMessage,
  ListRealmsMessage,
  ResumeRealmMessage,
  RemoveRealmMessage,
  SessionSettings,
  RealmEntry,
} from './types.js';
```

Add new imports after the existing imports (after line 20):

```typescript
import { join } from 'node:path';
import { RealmRegistry } from './RealmRegistry.js';
import { WorldStatePersistence } from './WorldStatePersistence.js';
import { GitHelper } from './GitHelper.js';
```

Add fields after `private gamePhase` (around line 48):

```typescript
  private realmRegistry: RealmRegistry;
  private worldStatePersistence: WorldStatePersistence;
```

In the constructor, after `this.worldState = new WorldState();`, initialize these:

```typescript
    // Realm tracking — uses home directory for global registry
    const agentRpgHome = join(process.env.HOME ?? '/tmp', '.agent-rpg-global');
    this.realmRegistry = new RealmRegistry(agentRpgHome);
    this.worldStatePersistence = new WorldStatePersistence(agentRpgHome);

    // Load realm registry on startup
    this.realmRegistry.load().catch((err) => {
      console.error('[Bridge] Failed to load realm registry:', err);
    });
```

**Step 2: Add new message handlers to the switch statement**

In `handleMessage()`, add three new cases before the `default` case (before line 109):

```typescript
      case 'player:list-realms':
        this.handleListRealms(ws);
        break;
      case 'player:resume-realm':
        this.handleResumeRealm(ws, msg as unknown as ResumeRealmMessage);
        break;
      case 'player:remove-realm':
        this.handleRemoveRealm(ws, msg as unknown as RemoveRealmMessage);
        break;
```

**Step 3: Add handler implementations**

Add these methods after `handleDismissAgent()` (after line 399):

```typescript
  // ── Realm Tracking ──

  private async handleListRealms(ws: WebSocket): Promise<void> {
    const realms = this.realmRegistry.listRealms();
    const realmsWithChanges = await Promise.all(
      realms.map(async (realm) => {
        let changesSinceLastScan: number | null = null;
        try {
          if (realm.gitInfo.lastCommitSha) {
            changesSinceLastScan = await GitHelper.countCommitsSince(
              realm.path,
              realm.gitInfo.lastCommitSha,
            );
          }
        } catch {
          // Repo may no longer exist or not be a git repo
        }
        return { ...realm, changesSinceLastScan };
      }),
    );

    this.send(ws, { type: 'realm:list', realms: realmsWithChanges });
  }

  private async handleResumeRealm(ws: WebSocket, msg: ResumeRealmMessage): Promise<void> {
    try {
      const realm = this.realmRegistry.getRealm(msg.realm_id);
      if (!realm) {
        this.send(ws, { type: 'error', message: `Realm "${msg.realm_id}" not found` });
        return;
      }

      this.gamePhase = 'analyzing';

      // Clean up existing sessions if any
      await this.cleanupCurrentRealm();

      // Load saved world state
      const savedState = await this.worldStatePersistence.load(msg.realm_id);
      if (!savedState) {
        this.send(ws, { type: 'error', message: 'No saved state for this realm. Try re-scanning.' });
        this.gamePhase = 'onboarding';
        return;
      }

      this.repoPath = realm.path;
      this.worldState = savedState;

      // Reload quests
      this.questManager.loadQuests(savedState.getQuests());

      // Initialize findings board
      this.findingsBoard = new FindingsBoard(realm.path);
      await this.findingsBoard.load();

      // Initialize transcript logger
      this.transcriptLogger = new TranscriptLogger(realm.path);

      // Initialize session manager
      this.sessionManager = new AgentSessionManager(this.findingsBoard);
      this.wireSessionManagerEvents();

      // Initialize custom tool handler
      this.toolHandler = new CustomToolHandler(
        this.findingsBoard,
        this.questManager,
        (agentId: string) => this.sessionManager.getVault(agentId),
        (agentId: string) => {
          const session = this.sessionManager.getSession(agentId);
          return session?.config.agentName ?? agentId;
        },
      );
      this.wireToolHandlerEvents();

      // Set objects on event translator
      this.eventTranslator.setObjects(savedState.getObjects());

      // Update lastExplored timestamp
      realm.lastExplored = new Date().toISOString();
      this.realmRegistry.saveRealm(realm);
      await this.realmRegistry.save();

      // Broadcast repo:ready with saved state
      this.broadcast({
        type: 'repo:ready',
        repo_name: realm.displayName,
        map: savedState.map,
        quests: savedState.getQuests(),
        objects: savedState.getObjects(),
        stats: {
          total_files: realm.stats.totalFiles,
          total_lines: 0,
          languages: realm.stats.languages.reduce(
            (acc, lang) => ({ ...acc, [lang]: 1 }),
            {} as Record<string, number>,
          ),
          open_issues: realm.stats.questsTotal - realm.stats.questsCompleted,
          last_commit: realm.gitInfo.lastCommitSha,
        },
      });

      this.gamePhase = 'playing';

      // Respawn oracle
      await this.spawnOracle(realm.path);

      console.log(`[Bridge] Realm resumed: ${realm.displayName}`);
    } catch (err) {
      this.gamePhase = 'onboarding';
      const message = err instanceof Error ? err.message : 'Failed to resume realm';
      this.send(ws, { type: 'error', message });
    }
  }

  private async handleRemoveRealm(ws: WebSocket, msg: RemoveRealmMessage): Promise<void> {
    this.realmRegistry.removeRealm(msg.realm_id);
    await this.realmRegistry.save();
    await this.worldStatePersistence.remove(msg.realm_id);
    this.send(ws, { type: 'realm:removed', realm_id: msg.realm_id });
  }

  private async cleanupCurrentRealm(): Promise<void> {
    if (this.sessionManager) {
      const activeIds = this.sessionManager.getActiveAgentIds();
      for (const id of activeIds) {
        await this.sessionManager.dismissAgent(id);
        this.worldState.removeAgent(id);
      }
    }
    this.agentColorIndex = 0;
  }
```

**Step 4: Save realm data after `handleLinkRepo` succeeds**

In `handleLinkRepo()`, add a cleanup call right after `this.gamePhase = 'analyzing';` (line 140):

```typescript
      // Clean up any existing sessions from a previous realm
      await this.cleanupCurrentRealm();
```

At the end of `handleLinkRepo()`, just before `this.gamePhase = 'playing';` (around line 232), add:

```typescript
      // Save realm to registry
      const realmId = this.realmRegistry.generateRealmId(localRepoPath);
      let gitInfo = { lastCommitSha: '', branch: 'main', remoteUrl: null as string | null };
      try {
        gitInfo = await GitHelper.getGitInfo(localRepoPath);
      } catch {
        // Not a git repo — use defaults
      }

      const roomCount = Math.max(1, objects.filter((o) => o.type === 'sign').length);

      const realmEntry: RealmEntry = {
        id: realmId,
        path: localRepoPath,
        name: repoData.repo,
        displayName: repoData.owner === 'local'
          ? repoData.repo
          : `${repoData.owner}/${repoData.repo}`,
        lastExplored: new Date().toISOString(),
        gitInfo,
        stats: {
          totalFiles: repoData.totalFiles,
          languages: Object.keys(repoData.languages),
          agentsUsed: 1,
          findingsCount: 0,
          questsTotal: quests.length,
          questsCompleted: 0,
        },
        mapSnapshot: {
          rooms: roomCount,
          tileWidth: map.width,
          tileHeight: map.height,
        },
      };

      this.realmRegistry.saveRealm(realmEntry);
      await this.realmRegistry.save();

      // Persist world state for resume
      await this.worldStatePersistence.save(realmId, this.worldState);
```

**Step 5: Commit**

```bash
git add server/src/BridgeServer.ts
git commit -m "feat: integrate realm registry and persistence into BridgeServer"
```

---

### Task 7: Update RepoScreen with Realm History UI

**Files:**
- Modify: `client/src/screens/RepoScreen.ts`
- Modify: `client/index.html` (add CSS for realm cards)

**Step 1: Verify the types are present in `client/src/types.ts`**

The `RealmEntryWithChanges` type was added in Task 1. Verify it's there before proceeding.

**Step 2: Update `RepoScreen.ts` with realm list rendering**

Replace the entire `client/src/screens/RepoScreen.ts` with the updated version. Key changes:
- Constructor takes two new callbacks: `onResume` and `onRemove`
- `render()` adds a `realmListContainer` element
- New `updateRealmList()` method renders realm cards
- New `createRealmCard()` private method builds each card with Resume/Re-scan/Remove buttons

See the full replacement code:

```typescript
import type { RealmEntryWithChanges } from '../types.js';

export class RepoScreen {
  private container: HTMLElement;
  private onAnalyze: (repoUrl: string) => void;
  private onBack: () => void;
  private onResume: (realmId: string) => void;
  private onRemove: (realmId: string) => void;

  private inputEl: HTMLInputElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private loadingArea: HTMLElement | null = null;
  private errorArea: HTMLElement | null = null;
  private realmListContainer: HTMLElement | null = null;

  constructor(
    onAnalyze: (repoUrl: string) => void,
    onBack: () => void,
    onResume: (realmId: string) => void,
    onRemove: (realmId: string) => void,
  ) {
    this.container = document.getElementById('repo-screen')!;
    this.onAnalyze = onAnalyze;
    this.onBack = onBack;
    this.onResume = onResume;
    this.onRemove = onRemove;
    this.render();
  }

  private render(): void {
    this.container.textContent = '';

    const panel = document.createElement('div');
    panel.className = 'rpg-panel';

    // Header
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'Link Repository';
    panel.appendChild(title);

    // Subtext
    const subtitle = document.createElement('div');
    subtitle.className = 'screen-subtitle';
    subtitle.textContent = 'Enter a local repo path or GitHub URL to generate your quest world';
    panel.appendChild(subtitle);

    // Form row
    const form = document.createElement('div');
    form.className = 'repo-form';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'rpg-input';
    this.inputEl.placeholder = 'Local path or GitHub URL (e.g. /Users/you/project)';
    this.inputEl.spellcheck = false;
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.handleSubmit();
    });
    form.appendChild(this.inputEl);

    this.submitBtn = document.createElement('button');
    this.submitBtn.className = 'rpg-btn';
    this.submitBtn.textContent = 'Scan Realm';
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    form.appendChild(this.submitBtn);

    panel.appendChild(form);

    // Loading area (hidden by default)
    this.loadingArea = document.createElement('div');
    this.loadingArea.className = 'loading-area';
    this.loadingArea.style.display = 'none';

    const loadingText = document.createElement('div');
    loadingText.className = 'loading-dots';
    loadingText.textContent = '';

    const textNode = document.createTextNode('Scanning realm');
    loadingText.appendChild(textNode);

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.textContent = '.';
      loadingText.appendChild(dot);
    }

    this.loadingArea.appendChild(loadingText);
    panel.appendChild(this.loadingArea);

    // Error area (hidden by default)
    this.errorArea = document.createElement('div');
    this.errorArea.className = 'error-text';
    this.errorArea.style.display = 'none';
    panel.appendChild(this.errorArea);

    // Realm history list (hidden by default)
    this.realmListContainer = document.createElement('div');
    this.realmListContainer.className = 'realm-list';
    this.realmListContainer.style.display = 'none';
    panel.appendChild(this.realmListContainer);

    // Back link
    const backLink = document.createElement('div');
    backLink.className = 'back-link';
    backLink.textContent = '\u2190 Back';
    backLink.addEventListener('click', () => this.onBack());
    panel.appendChild(backLink);

    this.container.appendChild(panel);
  }

  private handleSubmit(): void {
    if (!this.inputEl) return;
    const url = this.inputEl.value.trim();
    if (!url) return;
    this.clearError();
    this.onAnalyze(url);
  }

  updateRealmList(realms: RealmEntryWithChanges[]): void {
    if (!this.realmListContainer) return;

    this.realmListContainer.textContent = '';

    if (realms.length === 0) {
      this.realmListContainer.style.display = 'none';
      return;
    }

    // Section title
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'realm-list-title';
    sectionTitle.textContent = 'Previously Explored Realms';
    this.realmListContainer.appendChild(sectionTitle);

    for (const realm of realms) {
      const card = this.createRealmCard(realm);
      this.realmListContainer.appendChild(card);
    }

    this.realmListContainer.style.display = 'block';
  }

  private createRealmCard(realm: RealmEntryWithChanges): HTMLElement {
    const card = document.createElement('div');
    card.className = 'realm-card';

    // Header row: name + date
    const header = document.createElement('div');
    header.className = 'realm-card-header';

    const name = document.createElement('span');
    name.className = 'realm-card-name';
    name.textContent = realm.displayName;
    header.appendChild(name);

    const date = document.createElement('span');
    date.className = 'realm-card-date';
    date.textContent = this.formatDate(realm.lastExplored);
    header.appendChild(date);

    card.appendChild(header);

    // Stats line: languages, files
    const statsLine = document.createElement('div');
    statsLine.className = 'realm-card-stats';
    const langs = realm.stats.languages.join(', ') || 'Unknown';
    statsLine.textContent = `${langs} \u00B7 ${realm.stats.totalFiles} files`;
    card.appendChild(statsLine);

    // Details line: agents, findings, quests
    const details = document.createElement('div');
    details.className = 'realm-card-stats';
    details.textContent = [
      `${realm.stats.agentsUsed} agent${realm.stats.agentsUsed !== 1 ? 's' : ''}`,
      `${realm.stats.findingsCount} finding${realm.stats.findingsCount !== 1 ? 's' : ''}`,
      `${realm.stats.questsCompleted}/${realm.stats.questsTotal} quests`,
    ].join(' \u00B7 ');
    card.appendChild(details);

    // Git changes line
    const changes = document.createElement('div');
    changes.className = 'realm-card-changes';
    if (realm.changesSinceLastScan === null) {
      changes.textContent = 'Change status unknown';
      changes.classList.add('realm-card-changes-unknown');
    } else if (realm.changesSinceLastScan === 0) {
      changes.textContent = 'Up to date';
      changes.classList.add('realm-card-changes-ok');
    } else {
      changes.textContent = `${realm.changesSinceLastScan} commit${realm.changesSinceLastScan !== 1 ? 's' : ''} since last scan`;
      changes.classList.add('realm-card-changes-stale');
    }
    card.appendChild(changes);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'realm-card-actions';

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'rpg-btn realm-btn';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => {
      this.showLoading();
      this.onResume(realm.id);
    });
    actions.appendChild(resumeBtn);

    const rescanBtn = document.createElement('button');
    rescanBtn.className = 'rpg-btn realm-btn';
    rescanBtn.textContent = 'Re-scan';
    rescanBtn.addEventListener('click', () => {
      if (this.inputEl) this.inputEl.value = realm.path;
      this.handleSubmit();
    });
    actions.appendChild(rescanBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'rpg-btn realm-btn realm-btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (confirm(`Remove "${realm.displayName}" from history?`)) {
        this.onRemove(realm.id);
        card.remove();
      }
    });
    actions.appendChild(removeBtn);

    card.appendChild(actions);

    return card;
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  showLoading(): void {
    if (this.loadingArea) this.loadingArea.style.display = 'block';
    if (this.inputEl) this.inputEl.disabled = true;
    if (this.submitBtn) this.submitBtn.disabled = true;
  }

  hideLoading(): void {
    if (this.loadingArea) this.loadingArea.style.display = 'none';
    if (this.inputEl) this.inputEl.disabled = false;
    if (this.submitBtn) this.submitBtn.disabled = false;
  }

  showError(message: string): void {
    this.hideLoading();
    if (this.errorArea) {
      this.errorArea.textContent = message;
      this.errorArea.style.display = 'block';
    }
  }

  clearError(): void {
    if (this.errorArea) {
      this.errorArea.textContent = '';
      this.errorArea.style.display = 'none';
    }
  }

  show(): void {
    this.container.style.display = 'flex';
    this.container.classList.remove('screen-hidden');
    setTimeout(() => this.inputEl?.focus(), 50);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.container.classList.add('screen-hidden');
    this.hideLoading();
    this.clearError();
  }
}
```

**Step 3: Add CSS for realm cards to `client/index.html`**

Insert before the closing `</style>` tag (before line 739):

```css
    /* ── Realm List ── */
    .realm-list {
      margin-top: 1.5rem;
      border-top: 1px solid #1a1a3a;
      padding-top: 1.5rem;
    }

    .realm-list-title {
      font-size: 0.75rem;
      color: #555577;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      text-align: center;
      margin-bottom: 1rem;
    }

    .realm-card {
      background: #0d0d22;
      border: 2px solid #2a2a5a;
      padding: 1rem;
      margin-bottom: 0.75rem;
      transition: border-color 0.15s ease;
    }

    .realm-card:hover {
      border-color: #4a4a7a;
    }

    .realm-card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.4rem;
    }

    .realm-card-name {
      font-size: 0.9rem;
      color: #e8e8ff;
      font-weight: bold;
      letter-spacing: 0.05em;
    }

    .realm-card-date {
      font-size: 0.65rem;
      color: #555577;
    }

    .realm-card-stats {
      font-size: 0.7rem;
      color: #8888aa;
      margin-bottom: 0.2rem;
    }

    .realm-card-changes {
      font-size: 0.65rem;
      margin-bottom: 0.6rem;
    }

    .realm-card-changes-ok { color: #44cc66; }
    .realm-card-changes-stale { color: #ccaa44; }
    .realm-card-changes-unknown { color: #555577; }

    .realm-card-actions {
      display: flex;
      gap: 0.5rem;
    }

    .realm-btn {
      font-size: 0.65rem;
      padding: 0.3rem 0.8rem;
      letter-spacing: 0.08em;
    }

    .realm-btn-danger {
      border-color: #553333;
      color: #aa5555;
    }

    .realm-btn-danger:hover {
      background: #553333;
      color: #ff8888;
      box-shadow: none;
    }
```

**Step 4: Commit**

```bash
git add client/src/screens/RepoScreen.ts client/index.html
git commit -m "feat: add realm history UI to RepoScreen"
```

---

### Task 8: Update Client main.ts — Wire Realm Messages and Fix Bug

**Files:**
- Modify: `client/src/main.ts`

**Step 1: Update imports**

Add the new message type imports:

```typescript
import type {
  RepoReadyMessage,
  AgentJoinedMessage,
  AgentActivityMessage,
  FindingsPostedMessage,
  ErrorMessage,
  RealmListMessage,
  RealmRemovedMessage,
} from './types';
```

**Step 2: Update RepoScreen constructor to pass the new callbacks**

Replace the RepoScreen construction (lines 31-40) with:

```typescript
repoScreen = new RepoScreen(
  (repoUrl: string) => {
    repoScreen.showLoading();
    ws.send({ type: 'player:link-repo', repo_url: repoUrl });
  },
  () => {
    repoScreen.hide();
    titleScreen.show();
  },
  (realmId: string) => {
    ws.send({ type: 'player:resume-realm', realm_id: realmId });
  },
  (realmId: string) => {
    ws.send({ type: 'player:remove-realm', realm_id: realmId });
  },
);
```

**Step 3: Add realm-related WebSocket handlers**

After the existing `ws.on('error', ...)` handler (after line 72), add:

```typescript
// Realm list received
ws.on('realm:list', (msg) => {
  const data = msg as unknown as RealmListMessage;
  repoScreen.updateRealmList(data.realms);
});

// Realm removed confirmation
ws.on('realm:removed', (_msg) => {
  // Request updated list
  ws.send({ type: 'player:list-realms' });
});
```

**Step 4: Fix the gameStarted bug and add game teardown**

Add a variable before `startGame()`:

```typescript
let phaserGame: Phaser.Game | null = null;
```

In `startGame()`, replace `new Phaser.Game(gameConfig);` (line 89) with:

```typescript
  if (!phaserGame) {
    phaserGame = new Phaser.Game(gameConfig);
  }
```

Add a `stopGame()` function after `startGame()`:

```typescript
function stopGame(): void {
  gameStarted = false;

  // Hide game viewport
  const viewport = document.getElementById('game-viewport')!;
  viewport.style.display = 'none';
  viewport.classList.add('screen-hidden');

  // Destroy Phaser game
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
}
```

**Step 5: Request realm list when RepoScreen is shown**

Update the TitleScreen callback to request realms when navigating to RepoScreen:

```typescript
titleScreen = new TitleScreen(() => {
  titleScreen.hide();
  repoScreen.show();
  ws.send({ type: 'player:list-realms' });
});
```

**Step 6: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: wire realm messages in client and fix gameStarted bug"
```

---

### Task 9: Add `/quit` Command to Return to RepoScreen

**Files:**
- Modify: `client/src/panels/PromptBar.ts`
- Modify: `client/src/main.ts`

**Step 1: Read `PromptBar.ts` to understand the command structure**

The PromptBar has a `COMMANDS` array that defines slash commands. Find the array and add a new entry.

**Step 2: Add `/quit` to the PromptBar commands**

In the `COMMANDS` array in `PromptBar.ts`, add an entry:

```typescript
{ name: 'quit', icon: '\u{1F6AA}', description: 'Return to realm selection', handler: 'quit' },
```

In the command handler logic (wherever other commands like `summon`, `dismiss` are handled), add a case for `quit`:

```typescript
case 'quit':
  window.dispatchEvent(new CustomEvent('prompt-quit-game'));
  break;
```

**Step 3: Listen for the quit event in `main.ts`**

Add this listener after the `stopGame()` function definition:

```typescript
// Listen for quit request from PromptBar
window.addEventListener('prompt-quit-game', () => {
  stopGame();
  repoScreen.show();
  ws.send({ type: 'player:list-realms' });
});
```

**Step 4: Commit**

```bash
git add client/src/panels/PromptBar.ts client/src/main.ts
git commit -m "feat: add /quit command to return to realm selection"
```

---

### Task 10: Run All Tests and Manual Integration Testing

**Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Test the full flow manually**

1. Start the server and client
2. Navigate to RepoScreen — should show empty realm list
3. Enter a local repo path and click "Scan Realm"
4. Verify the game loads and the oracle spawns
5. Use `/quit` to return to RepoScreen
6. Verify the realm now appears in the history list with correct stats
7. Click "Resume" on the realm card — should load instantly
8. Enter a different repo path — should load the new repo
9. Return to RepoScreen — should now show two realms
10. Click "Remove" on one — should remove it after confirmation
11. Verify the git change indicator shows "Up to date" or commit count

**Step 3: Fix any issues found during testing**

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration test fixes for realm tracking"
```
