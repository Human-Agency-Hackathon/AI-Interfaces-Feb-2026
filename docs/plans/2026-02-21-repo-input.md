# Repo/Folder Input on SetupScreen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional "GitHub URL or local folder path" field to the SetupScreen so either a text problem or a repo input (or both) can kick off a session.

**Architecture:** One new optional field `repoInput` on `StartProcessMessage`. The server detects GitHub URLs vs local paths, clones if needed using the `execFileNoThrow` utility, then uses the resulting path as `this.repoPath`. The client adds a single text input and relaxes validation to require at least one of the two fields.

**Tech Stack:** TypeScript (client + server), Vitest (tests), Node.js `execFile` via a safe wrapper + `fs.stat` for clone/path resolution.

---

### Task 1: Extend the protocol

**Files:**
- Modify: `ha-agent-rpg/shared/protocol.ts:404-410`

**Step 1: Add `repoInput` to `StartProcessMessage`**

In `shared/protocol.ts`, change the interface at line 404:

```ts
export interface StartProcessMessage {
  type: 'player:start-process';
  /** The brainstorming problem. Optional if repoInput is provided. */
  problem: string;
  /** Optional template ID; defaults to "standard_brainstorm" */
  processId?: string;
  /** GitHub HTTPS URL or absolute local path to a codebase (optional). */
  repoInput?: string;
}
```

**Step 2: Verify TypeScript still compiles**

```bash
cd ha-agent-rpg && npm run build -w server
```
Expected: no errors.

**Step 3: Commit**

```bash
git add ha-agent-rpg/shared/protocol.ts
git commit -m "feat(protocol): add optional repoInput to StartProcessMessage"
```

---

### Task 2: Create `execFileNoThrow` utility

This utility wraps Node's `child_process.execFile` to ensure args are always passed as an array (preventing shell injection) and to provide structured output.

**Files:**
- Create: `ha-agent-rpg/server/src/utils/execFileNoThrow.ts`
- Create: `ha-agent-rpg/server/src/__tests__/utils/execFileNoThrow.test.ts`

**Step 1: Write failing test**

Create `ha-agent-rpg/server/src/__tests__/utils/execFileNoThrow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';

describe('execFileNoThrow', () => {
  it('returns stdout and exit code 0 on success', async () => {
    const result = await execFileNoThrow('echo', ['hello']);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.status).toBe(0);
  });

  it('returns stderr and non-zero status on failure', async () => {
    const result = await execFileNoThrow('git', ['invalid-command-xyz']);
    expect(result.status).not.toBe(0);
  });

  it('returns non-zero status for a non-existent command', async () => {
    const result = await execFileNoThrow('nonexistent-command-xyz-abc', []);
    expect(result.status).not.toBe(0);
  });
});
```

**Step 2: Run to confirm it fails**

```bash
cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/utils/execFileNoThrow.test.ts
```
Expected: FAIL — module not found.

**Step 3: Create `execFileNoThrow.ts`**

Create `ha-agent-rpg/server/src/utils/execFileNoThrow.ts`:

```ts
import { execFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * Safe wrapper around child_process.execFile.
 * Args are always passed as an array — no shell interpolation, no injection risk.
 * Never throws; returns structured output with status code.
 */
export async function execFileNoThrow(command: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        status: error?.code != null ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}
```

**Step 4: Run tests to confirm they pass**

```bash
cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/utils/execFileNoThrow.test.ts
```
Expected: all 3 tests PASS.

**Step 5: Commit**

```bash
git add ha-agent-rpg/server/src/utils/execFileNoThrow.ts ha-agent-rpg/server/src/__tests__/utils/execFileNoThrow.test.ts
git commit -m "feat(server): add execFileNoThrow utility"
```

---

### Task 3: Update the client — SetupScreen

**Files:**
- Modify: `ha-agent-rpg/client/src/screens/SetupScreen.ts`
- Create: `ha-agent-rpg/client/src/__tests__/ui/SetupScreen.test.ts`

**Step 1: Write failing test**

Create `ha-agent-rpg/client/src/__tests__/ui/SetupScreen.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupScreen } from '../../screens/SetupScreen';

function makeScreen(onSubmit = vi.fn(), onBack = vi.fn()) {
  document.body.innerHTML = '<div id="setup-screen"></div>';
  return new SetupScreen(onSubmit, onBack);
}

describe('SetupScreen', () => {
  it('does not submit when both problem and repoInput are empty', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits when only problem is filled', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const textarea = document.querySelector<HTMLTextAreaElement>('.setup-textarea')!;
    textarea.value = 'How do we improve onboarding?';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).toHaveBeenCalledWith('How do we improve onboarding?', undefined);
  });

  it('submits when only repoInput is filled', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const repoInput = document.querySelector<HTMLInputElement>('.setup-repo-input')!;
    repoInput.value = '/tmp/myproject';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).toHaveBeenCalledWith('', '/tmp/myproject');
  });

  it('submits with both fields when both are filled', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const textarea = document.querySelector<HTMLTextAreaElement>('.setup-textarea')!;
    textarea.value = 'Improve the architecture';
    const repoInput = document.querySelector<HTMLInputElement>('.setup-repo-input')!;
    repoInput.value = 'https://github.com/owner/repo';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).toHaveBeenCalledWith('Improve the architecture', 'https://github.com/owner/repo');
  });
});
```

**Step 2: Run to confirm it fails**

```bash
cd ha-agent-rpg && npm run test -w client -- --run src/__tests__/ui/SetupScreen.test.ts
```
Expected: FAIL — `.setup-repo-input` not found / wrong onSubmit signature.

**Step 3: Implement changes in `SetupScreen.ts`**

a) Widen the `onSubmit` callback type (line 27):
```ts
private onSubmit: (problem: string, repoInput?: string) => void;
```

b) Add `private repoInput: HTMLInputElement | null = null;` after line 33.

c) Add two entries to `LOADING_MESSAGES` (lines 17–22):
```ts
  'Cloning the repository\u2026',
  'Exploring the codebase\u2026',
```

d) In `render()`, add the repo section after the `problemSection` block (after `this.formEl.appendChild(problemSection)`):
```ts
// ── Repo Section ──
const repoSection = document.createElement('div');
repoSection.className = 'setup-section';

const repoLabel = document.createElement('label');
repoLabel.className = 'setup-label';
repoLabel.textContent = 'GitHub URL or Local Folder Path (optional)';
repoSection.appendChild(repoLabel);

this.repoInput = document.createElement('input');
this.repoInput.type = 'text';
this.repoInput.className = 'rpg-input setup-repo-input';
this.repoInput.placeholder = 'e.g. https://github.com/owner/repo or /Users/alice/myproject';
this.repoInput.spellcheck = false;
repoSection.appendChild(this.repoInput);

this.formEl.appendChild(repoSection);
```

e) Replace `handleSubmit()` with:
```ts
private handleSubmit(): void {
  if (!this.nameInput || !this.problemTextarea) return;

  const name = this.nameInput.value.trim();
  const problem = this.problemTextarea.value.trim();
  const repoInput = this.repoInput?.value.trim() || undefined;

  if (!name) {
    this.nameInput.focus();
    return;
  }
  if (!problem && !repoInput) {
    this.problemTextarea.focus();
    return;
  }

  this.clearError();
  this.onSubmit(problem, repoInput);
}
```

**Step 4: Run tests to confirm they pass**

```bash
cd ha-agent-rpg && npm run test -w client -- --run src/__tests__/ui/SetupScreen.test.ts
```
Expected: all 4 tests PASS.

**Step 5: Build**

```bash
cd ha-agent-rpg && npm run build -w client
```

**Step 6: Commit**

```bash
git add ha-agent-rpg/client/src/screens/SetupScreen.ts ha-agent-rpg/client/src/__tests__/ui/SetupScreen.test.ts
git commit -m "feat(client): add optional repo/folder input to SetupScreen"
```

---

### Task 4: Update main.ts to pass repoInput

**Files:**
- Modify: `ha-agent-rpg/client/src/main.ts:80-90`

**Step 1: Update the SetupScreen callback**

Change lines 80–90 in `main.ts`:
```ts
setupScreen = new SetupScreen(
  (problem: string, repoInput?: string) => {
    pendingIdentity = setupScreen.getIdentity();
    setupScreen.showLoading();
    ws.send({ type: 'player:start-process', problem, repoInput });
  },
  () => {
    setupScreen.hide();
    splashScreen.show();
  },
);
```

**Step 2: Build**

```bash
cd ha-agent-rpg && npm run build -w client
```
Expected: no errors.

**Step 3: Commit**

```bash
git add ha-agent-rpg/client/src/main.ts
git commit -m "feat(client): forward repoInput from SetupScreen to start-process message"
```

---

### Task 5: Server — add `resolveRepoPath` + wire into `handleStartProcess`

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts`
- Modify: `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts`

**Step 1: Write failing tests**

Add to `BridgeServer.e2e.test.ts`. First, add to the imports at the top:
```ts
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRepoPath } from '../BridgeServer.js';
```

Then add two new `describe` blocks:

```ts
describe('resolveRepoPath', () => {
  it('returns an existing local path as-is', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
    const result = await resolveRepoPath(dir);
    expect(result).toBe(dir);
    await fs.rm(dir, { recursive: true });
  });

  it('throws for a non-existent local path', async () => {
    await expect(resolveRepoPath('/tmp/nonexistent-path-xyz-123')).rejects.toThrow('not found');
  });
});

describe('player:start-process with repoInput', () => {
  it('uses provided local path and synthesizes problem', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
    const messages: unknown[] = [];
    client.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString())));

    client.send(JSON.stringify({
      type: 'player:start-process',
      problem: '',
      repoInput: dir,
    }));

    await vi.waitFor(() => {
      expect(messages.some((m: any) => m.type === 'process:started')).toBe(true);
    }, { timeout: 5000 });

    const started = messages.find((m: any) => m.type === 'process:started') as any;
    expect(started.problem).toBe(`Explore the codebase at: ${dir}`);
    await fs.rm(dir, { recursive: true });
  });

  it('sends process:error when neither problem nor repoInput provided', async () => {
    const messages: unknown[] = [];
    client.on('message', (raw: Buffer) => messages.push(JSON.parse(raw.toString())));

    client.send(JSON.stringify({
      type: 'player:start-process',
      problem: '',
    }));

    await vi.waitFor(() => {
      expect(messages.some((m: any) => m.type === 'process:error')).toBe(true);
    }, { timeout: 3000 });
  });
});
```

**Step 2: Run to confirm it fails**

```bash
cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/BridgeServer.e2e.test.ts
```
Expected: FAIL — `resolveRepoPath` not exported.

**Step 3: Add imports to `BridgeServer.ts`**

At the top of `BridgeServer.ts`, add alongside existing imports:
```ts
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileNoThrow } from './utils/execFileNoThrow.js';
```

Note: `path` is already imported. If not, add `import path from 'node:path';`.

**Step 4: Add `resolveRepoPath` export just before the `BridgeServer` class**

```ts
/**
 * Resolves a GitHub HTTPS URL or local absolute path to a local directory.
 * - GitHub HTTPS URL: clones to a deterministic temp dir (skips if already cloned).
 * - Local path: checks existence; throws if not found.
 */
export async function resolveRepoPath(repoInput: string): Promise<string> {
  if (repoInput.startsWith('https://github.com/')) {
    const hash = crypto.createHash('sha1').update(repoInput).digest('hex').slice(0, 8);
    const cloneDir = path.join(os.tmpdir(), `agent-rpg-${hash}`);
    try {
      await fsPromises.stat(cloneDir);
      // Already cloned — reuse
    } catch {
      const result = await execFileNoThrow('git', ['clone', '--depth', '1', repoInput, cloneDir]);
      if (result.status !== 0) {
        throw new Error(`git clone failed: ${result.stderr}`);
      }
    }
    return cloneDir;
  }

  try {
    await fsPromises.stat(repoInput);
  } catch {
    throw new Error(`Repo path not found: ${repoInput}`);
  }
  return repoInput;
}
```

**Step 5: Update `handleStartProcess` in `BridgeServer.ts`**

In the `handleStartProcess` method body (line ~406), make these targeted changes:

a) Add validation at the very start of the `try` block (after `this.gamePhase = 'analyzing'`):
```ts
if (!msg.problem?.trim() && !msg.repoInput?.trim()) {
  ws.send(JSON.stringify({ type: 'process:error', message: 'Provide a problem or a repo/folder path.' }));
  this.gamePhase = 'idle';
  return;
}
```

b) After the validation, resolve repo path and synthesize problem:
```ts
let resolvedRepoDir: string | null = null;
if (msg.repoInput?.trim()) {
  resolvedRepoDir = await resolveRepoPath(msg.repoInput.trim());
}
const problem = msg.problem?.trim() || `Explore the codebase at: ${msg.repoInput}`;
```

c) Replace `problem: msg.problem` in `processState` with `problem`.

d) Replace `const workDir = process.env.HOME ?? '/tmp'; this.repoPath = workDir;` with:
```ts
const workDir = resolvedRepoDir ?? process.env.HOME ?? '/tmp';
this.repoPath = workDir;
```

e) Replace `problem: msg.problem` in the `broadcast` call with `problem`.

**Step 6: Run all server tests**

```bash
cd ha-agent-rpg && npm run test -w server
```
Expected: all tests PASS.

**Step 7: Build**

```bash
cd ha-agent-rpg && npm run build -w server
```

**Step 8: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts
git commit -m "feat(server): wire repoInput into handleStartProcess with resolveRepoPath"
```

---

### Task 6: Full suite + push

**Step 1: Run all tests**

```bash
cd ha-agent-rpg && npm run test -w server && npm run test -w client
```
Expected: all PASS.

**Step 2: Push**

```bash
git push origin main
```

**Step 3: Smoke test (optional)**

```bash
cd ha-agent-rpg && ./scripts/start-all.sh
```
Open `http://localhost:5173`:
- Submit with only a local folder path → session starts
- Submit with only a brainstorm problem → works as before
- Submit with neither → form stays, no submit fires
