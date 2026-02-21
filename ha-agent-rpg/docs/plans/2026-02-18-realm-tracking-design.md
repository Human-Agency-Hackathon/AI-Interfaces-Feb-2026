# Realm Tracking & History Design

**Date:** 2026-02-18
**Status:** Approved

## Problem

1. Once a realm (repo) has been explored, there's no way to return to it without re-scanning from scratch.
2. After the first game session, entering a different repo path on the RepoScreen is ignored because `gameStarted` is never reset and there's no navigation back.

## Goals

- Track previously explored realms so users can resume without re-exploration.
- Show past realms on the RepoScreen with rich previews and resume/re-scan options.
- Fix the bug where input is ignored after the first game session.
- Show git change information so users can decide whether to resume or re-scan.

## Approach: File-Based Realm Registry

A `realms.json` file in `.agent-rpg/` stores metadata for each explored realm. The RepoScreen reads this on load and renders a list of past realms.

## Data Model

### Realm Registry (`.agent-rpg/realms.json`)

```json
{
  "realms": [
    {
      "id": "abc123",
      "path": "/Users/you/project",
      "name": "project",
      "displayName": "project",
      "lastExplored": "2026-02-18T10:30:00Z",
      "gitInfo": {
        "lastCommitSha": "a1b2c3d",
        "branch": "main",
        "remoteUrl": "https://github.com/org/project"
      },
      "stats": {
        "totalFiles": 142,
        "languages": ["TypeScript", "Python"],
        "agentsUsed": 3,
        "findingsCount": 7,
        "questsTotal": 5,
        "questsCompleted": 2
      },
      "mapSnapshot": {
        "rooms": 8,
        "tileWidth": 120,
        "tileHeight": 80
      }
    }
  ]
}
```

- `id`: Short hash of the absolute path for stable lookups.
- `gitInfo.lastCommitSha`: Used to detect changes since last exploration.
- `stats`: Updated each time a session ends or findings/quests change.
- `mapSnapshot`: Enough metadata to render a mini-preview.

### WorldState Persistence (`.agent-rpg/worlds/{realm_id}/state.json`)

Full serialized WorldState (map tiles, objects, quests) saved per realm for instant resume.

## UI: RepoScreen with Realm History

```
┌─────────────────────────────────────────────┐
│           LINK REPOSITORY                    │
│  Enter a local repo path or GitHub URL       │
│                                              │
│  [________________________] [Scan Realm]     │
│                                              │
│  ─── Previously Explored Realms ───          │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │ project-alpha          Feb 18, 2026 │     │
│  │ TypeScript, Python · 142 files      │     │
│  │ 3 agents · 7 findings · 2/5 quests  │     │
│  │ 12 commits since last scan          │     │
│  │                                     │     │
│  │   [Resume]  [Re-scan]  [Remove]     │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │ api-service             Feb 15, 2026│     │
│  │ Go · 87 files                       │     │
│  │ 2 agents · 3 findings · 1/3 quests  │     │
│  │ Up to date                          │     │
│  │                                     │     │
│  │   [Resume]  [Re-scan]  [Remove]     │     │
│  └─────────────────────────────────────┘     │
│                                              │
│                  ← Back                      │
└─────────────────────────────────────────────┘
```

### Behaviors

- **Resume**: Load cached world state instantly, restart oracle with existing context.
- **Re-scan**: Re-analyze repo fresh, update registry entry, preserve findings/knowledge.
- **Remove**: Delete realm entry with confirmation.
- Git change indicator shows commits since last scan (or "Up to date").
- List sorted by most recently explored first.

## Server Changes

### New Service: RealmRegistry (`server/src/RealmRegistry.ts`)

- Reads/writes `.agent-rpg/realms.json`
- `listRealms()` — returns all realm entries
- `saveRealm(entry)` — upserts a realm by path-based ID
- `removeRealm(id)` — deletes a realm entry
- `checkChanges(id)` — runs `git rev-parse HEAD` and compares to stored `lastCommitSha`; returns commit count diff

### New Protocol Messages

- `player:list-realms` → client requests realm list
- `realm:list` → server responds with realm entries + change status
- `player:resume-realm { realm_id }` → load cached world state instead of re-analyzing
- `player:remove-realm { realm_id }` → delete a realm entry

### BridgeServer Changes

- Handle new message types
- On `player:link-repo` completion, auto-save/update realm registry
- On realm switch, clean up existing agent sessions

### WorldState Persistence

- After `handleLinkRepo`, serialize WorldState to `.agent-rpg/worlds/{realm_id}/state.json`
- On `player:resume-realm`, deserialize from that file

## Bug Fix: Input Ignored After First Game

**Root cause:** `gameStarted = true` in `main.ts` blocks subsequent game starts. No navigation back to RepoScreen exists.

**Fix:**
1. Add ability to return to RepoScreen from the game (e.g., `/quit` command or exit button).
2. Reset `gameStarted = false` when returning to RepoScreen.
3. On RepoScreen show, send `player:list-realms` to fetch realm history.
4. On realm switch, clean up Phaser game instance and agent sessions.
5. Server reinitializes state properly on new `link-repo` or `resume-realm`.

## Protocol Types

Add to `shared/protocol.ts`:

```typescript
interface RealmEntry {
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

interface ListRealmsMessage {
  type: 'player:list-realms';
}

interface RealmListMessage {
  type: 'realm:list';
  realms: (RealmEntry & { changesSinceLastScan: number | null })[];
}

interface ResumeRealmMessage {
  type: 'player:resume-realm';
  realm_id: string;
}

interface RemoveRealmMessage {
  type: 'player:remove-realm';
  realm_id: string;
}
```
