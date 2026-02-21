# S7: Auto-Load Last Realm — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the server starts, automatically resume the last active realm so clients connect to a live session instead of an empty onboarding screen.

**Architecture:** Add `lastActiveRealmId` to RealmRegistry's persisted data. Set it when a realm activates (link-repo, resume-realm). Clear it on clean shutdown. On startup, BridgeServer reads this field and runs the same resume logic as `handleResumeRealm` but without a WebSocket. Failures fall back silently to normal onboarding.

**Tech Stack:** TypeScript (strict mode), Vitest

---

### Task 1: Add `lastActiveRealmId` to RealmRegistry

**Files:**
- Modify: `ha-agent-rpg/server/src/RealmRegistry.ts`
- Modify: `ha-agent-rpg/server/src/interfaces/IRealmRegistry.ts`
- Modify: `ha-agent-rpg/server/src/__tests__/RealmRegistry.test.ts`

**Step 1: Add 3 new methods to the IRealmRegistry interface**

In `ha-agent-rpg/server/src/interfaces/IRealmRegistry.ts`, add these to the interface body:

```typescript
  getLastActiveRealmId(): string | undefined;
  setLastActiveRealmId(id: string): void;
  clearLastActiveRealmId(): void;
```

**Step 2: Add `lastActiveRealmId` field and methods to RealmRegistry**

In `ha-agent-rpg/server/src/RealmRegistry.ts`:

1. Add `lastActiveRealmId` to the `RealmRegistryData` interface:
```typescript
interface RealmRegistryData {
  realms: RealmEntry[];
  lastActiveRealmId?: string;
}
```

2. Add a private field:
```typescript
  private lastActiveRealmId: string | undefined = undefined;
```

3. In `load()`, restore it from parsed data:
```typescript
      this.lastActiveRealmId = parsed.lastActiveRealmId;
```

4. In `save()`, include it in the serialized data:
```typescript
    const data: RealmRegistryData = { realms: this.realms, lastActiveRealmId: this.lastActiveRealmId };
```

5. Add the 3 public methods:
```typescript
  getLastActiveRealmId(): string | undefined {
    return this.lastActiveRealmId;
  }

  setLastActiveRealmId(id: string): void {
    this.lastActiveRealmId = id;
  }

  clearLastActiveRealmId(): void {
    this.lastActiveRealmId = undefined;
  }
```

**Step 3: Add tests**

In `ha-agent-rpg/server/src/__tests__/RealmRegistry.test.ts`, add a new describe block:

```typescript
  describe('lastActiveRealmId', () => {
    it('returns undefined when not set', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      expect(registry.getLastActiveRealmId()).toBeUndefined();
    });

    it('set and get round-trip', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.setLastActiveRealmId('realm_abc');
      expect(registry.getLastActiveRealmId()).toBe('realm_abc');
    });

    it('clear removes the value', async () => {
      const registry = new RealmRegistry(tempDir);
      await registry.load();
      registry.setLastActiveRealmId('realm_abc');
      registry.clearLastActiveRealmId();
      expect(registry.getLastActiveRealmId()).toBeUndefined();
    });

    it('persists across save/load', async () => {
      const reg1 = new RealmRegistry(tempDir);
      await reg1.load();
      reg1.setLastActiveRealmId('realm_xyz');
      await reg1.save();

      const reg2 = new RealmRegistry(tempDir);
      await reg2.load();
      expect(reg2.getLastActiveRealmId()).toBe('realm_xyz');
    });

    it('cleared value persists as undefined across save/load', async () => {
      const reg1 = new RealmRegistry(tempDir);
      await reg1.load();
      reg1.setLastActiveRealmId('realm_xyz');
      reg1.clearLastActiveRealmId();
      await reg1.save();

      const reg2 = new RealmRegistry(tempDir);
      await reg2.load();
      expect(reg2.getLastActiveRealmId()).toBeUndefined();
    });
  });
```

**Step 4: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 5: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/RealmRegistry.ts ha-agent-rpg/server/src/interfaces/IRealmRegistry.ts ha-agent-rpg/server/src/__tests__/RealmRegistry.test.ts
git commit -m "feat(S7): add lastActiveRealmId to RealmRegistry"
```

---

### Task 2: Set and clear `lastActiveRealmId` in BridgeServer handlers

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts`

**Step 1: Set in handleResumeRealm**

In `handleResumeRealm`, after the line `this.realmRegistry.saveRealm(realm);` and before `await this.realmRegistry.save();` (around line 1059), also set `activeRealmId` on both the server instance AND the registry:

```typescript
      this.activeRealmId = realm.id;
      this.realmRegistry.setLastActiveRealmId(realm.id);
```

Note: `handleLinkRepo` already sets `this.activeRealmId = realmId` (line 645). Add the registry call right after it:

```typescript
      this.activeRealmId = realmId;
      this.realmRegistry.setLastActiveRealmId(realmId);
```

And in `handleStartProcess`, after `this.activeRealmId = ...` (line 428), also set it in the registry. However, brainstorm processes use a generated `brainstorm_${Date.now()}` ID that isn't a real realm — we should still track it so auto-load can detect a crash during brainstorm:

```typescript
      this.activeRealmId = `brainstorm_${Date.now()}`;
      this.realmRegistry.setLastActiveRealmId(this.activeRealmId);
      await this.realmRegistry.save();
```

**Step 2: Clear in handleRemoveRealm**

In `handleRemoveRealm` (around line 1129), if the removed realm is the active one, clear it:

```typescript
  private async handleRemoveRealm(ws: WebSocket, msg: RemoveRealmMessage): Promise<void> {
    if (this.realmRegistry.getLastActiveRealmId() === msg.realm_id) {
      this.realmRegistry.clearLastActiveRealmId();
    }
    this.realmRegistry.removeRealm(msg.realm_id);
    await this.realmRegistry.save();
    await this.worldStatePersistence.remove(msg.realm_id);
    this.send(ws, { type: 'realm:removed', realm_id: msg.realm_id });
  }
```

**Step 3: Clear on clean shutdown**

In `close()` (around line 1727), add at the beginning, BEFORE dismissing agents:

```typescript
    // Clear active realm on clean shutdown so we don't auto-load on next start
    this.realmRegistry.clearLastActiveRealmId();
    await this.realmRegistry.save().catch((err) => {
      console.error('[Bridge] Failed to save realm registry on shutdown:', err);
    });
```

**Step 4: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 5: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat(S7): set/clear lastActiveRealmId in BridgeServer handlers"
```

---

### Task 3: Add `autoLoadLastRealm()` method to BridgeServer

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts`

**Step 1: Add the public method**

Add `autoLoadLastRealm()` as a public async method on BridgeServer. Place it after the constructor (around line 126, after the constructor closing brace). This method reuses the same resume logic as `handleResumeRealm` but without a WebSocket — errors are logged instead of sent to a client.

```typescript
  /**
   * Auto-load the last active realm on server startup.
   * Called from index.ts after construction. If anything fails,
   * falls back to normal onboarding — never crashes.
   */
  async autoLoadLastRealm(): Promise<void> {
    const lastRealmId = this.realmRegistry.getLastActiveRealmId();
    if (!lastRealmId) return;

    const realm = this.realmRegistry.getRealm(lastRealmId);
    if (!realm) {
      console.warn(`[Bridge] Auto-load: realm "${lastRealmId}" not found in registry, skipping`);
      this.realmRegistry.clearLastActiveRealmId();
      await this.realmRegistry.save().catch(() => {});
      return;
    }

    try {
      const savedState = await this.worldStatePersistence.load(lastRealmId);
      if (!savedState) {
        console.warn(`[Bridge] Auto-load: no saved state for realm "${lastRealmId}", skipping`);
        this.realmRegistry.clearLastActiveRealmId();
        await this.realmRegistry.save().catch(() => {});
        return;
      }

      this.repoPath = realm.path;
      this.worldState = savedState;
      this.activeRealmId = lastRealmId;

      // Restore navigation state
      const navState = this.worldState.navigationState;
      if (navState) {
        for (const [agentId, stack] of Object.entries(navState.agentNavStacks)) {
          this.agentNavStacks.set(agentId, stack);
        }
        for (const [agentId, path] of Object.entries(navState.agentCurrentPath)) {
          this.agentCurrentPath.set(agentId, path);
        }
      }

      // Reload quests
      this.questManager.loadQuests(savedState.getQuests());

      // Initialize subsystems
      this.findingsBoard = new FindingsBoard(realm.path);
      await this.findingsBoard.load();
      this.transcriptLogger = new TranscriptLogger(realm.path);
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
      this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
      this.wireSessionManagerEvents();
      this.eventTranslator.setObjects(savedState.getObjects());

      this.gamePhase = 'playing';

      // Process-aware agent spawn (same as handleResumeRealm)
      const processState = this.worldState.getProcessState();
      if (processState && processState.status === 'running') {
        const template = PROCESS_TEMPLATES[processState.processId];
        if (template) {
          this.processController = ProcessController.fromJSON(
            processState,
            template,
            this.createProcessDelegate(),
          );
          this.wireProcessControllerEvents(this.processController);
          await this.spawnProcessAgents(
            template,
            processState.currentStageIndex,
            processState.problemStatement ?? processState.problem,
            { resumed: true },
          );
          console.log(`[Bridge] Auto-loaded realm with running process: ${realm.displayName} (stage ${processState.currentStageIndex})`);
        } else {
          console.warn(`[Bridge] Auto-load: template "${processState.processId}" not found, falling back to Oracle`);
          await this.spawnOracle(realm.path);
          console.log(`[Bridge] Auto-loaded realm (Oracle fallback): ${realm.displayName}`);
        }
      } else {
        await this.spawnOracle(realm.path);
        console.log(`[Bridge] Auto-loaded realm: ${realm.displayName}`);
      }
    } catch (err) {
      console.error('[Bridge] Auto-load failed, falling back to onboarding:', err);
      this.gamePhase = 'onboarding';
      this.realmRegistry.clearLastActiveRealmId();
      await this.realmRegistry.save().catch(() => {});
    }
  }
```

**Step 2: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 3: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts
git commit -m "feat(S7): add autoLoadLastRealm method to BridgeServer"
```

---

### Task 4: Call `autoLoadLastRealm()` from index.ts

**Files:**
- Modify: `ha-agent-rpg/server/src/index.ts`

**Step 1: Add the auto-load call**

After `const server = new BridgeServer(PORT);`, add:

```typescript
// Auto-load last active realm if server was restarted (S7)
server.autoLoadLastRealm().catch((err) => {
  console.error('[Bridge] Auto-load error (non-fatal):', err);
});
```

Note: We use `.catch()` instead of `await` to avoid blocking server startup. The WebSocket server should be accepting connections immediately; auto-load runs in the background.

**Step 2: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 3: Type-check**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add ha-agent-rpg/server/src/index.ts
git commit -m "feat(S7): call autoLoadLastRealm on server startup"
```

---

### Task 5: Add tests for auto-load

**Files:**
- Modify: `ha-agent-rpg/server/src/__tests__/BridgeServer.resume.test.ts`

**Step 1: Add auto-load tests**

Add a new describe block to the existing `BridgeServer.resume.test.ts` file:

```typescript
  describe('autoLoadLastRealm()', () => {
    it('does nothing when no lastActiveRealmId is set', async () => {
      // gamePhase starts as 'onboarding' — should stay that way
      await (server as any).autoLoadLastRealm();
      expect((server as any).gamePhase).toBe('onboarding');
    });

    it('does nothing when lastActiveRealmId points to a missing realm', async () => {
      (server as any).realmRegistry.setLastActiveRealmId('nonexistent');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (server as any).autoLoadLastRealm();
      expect((server as any).gamePhase).toBe('onboarding');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found in registry'));
      warnSpy.mockRestore();
    });

    it('falls back to onboarding when worldStatePersistence.load returns null', async () => {
      // Add a realm to registry so it's found
      const realm = {
        id: 'test_realm',
        path: '/tmp/test-project',
        name: 'test-project',
        displayName: 'test-project',
        lastExplored: '2026-02-21T10:00:00Z',
        gitInfo: { lastCommitSha: 'abc', branch: 'main', remoteUrl: null },
        stats: { totalFiles: 1, languages: ['TS'], agentsUsed: 1, findingsCount: 0, questsTotal: 0, questsCompleted: 0 },
        mapSnapshot: { rooms: 1, tileWidth: 60, tileHeight: 50 },
      };
      (server as any).realmRegistry.saveRealm(realm);
      (server as any).realmRegistry.setLastActiveRealmId('test_realm');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (server as any).autoLoadLastRealm();
      expect((server as any).gamePhase).toBe('onboarding');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no saved state'));
      warnSpy.mockRestore();
    });
  });
```

**Step 2: Run tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add ha-agent-rpg/server/src/__tests__/BridgeServer.resume.test.ts
git commit -m "test(S7): add auto-load tests for realm auto-resume on startup"
```

---

### Task 6: Final verification and push

**Step 1: Run all server tests**

Run: `npm run test -w server` from `ha-agent-rpg/`
Expected: ALL PASS

**Step 2: Type-check server**

Run: `npm run build -w server` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 3: Type-check client**

Run: `npm run build -w client` from `ha-agent-rpg/`
Expected: SUCCESS

**Step 4: Push**

```bash
git push origin main
```
