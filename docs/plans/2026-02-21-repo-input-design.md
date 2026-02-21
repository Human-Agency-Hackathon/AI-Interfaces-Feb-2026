# Design: GitHub URL / Local Folder Input on SetupScreen

**Date:** 2026-02-21
**Author:** Behrang
**Status:** Approved

## Summary

Extend the SetupScreen ("Prepare Your Session") to accept an optional GitHub HTTPS URL or local folder path alongside the existing brainstorm problem textarea. Either field alone is sufficient to start a session — at least one must be non-empty.

## Approach

Approach A — minimal end-to-end. One new optional field on the existing protocol message, ~30 lines of server-side clone logic, one new form field on the client.

## Design

### 1. Protocol (`shared/protocol.ts`)

Add `repoInput?: string` to `StartProcessMessage`:

```ts
export interface StartProcessMessage {
  type: 'player:start-process';
  problem: string;        // optional if repoInput provided
  processId?: string;
  repoInput?: string;     // GitHub HTTPS URL or absolute local path
}
```

Validation rule: at least one of `problem` or `repoInput` must be non-empty.

---

### 2. Client — `SetupScreen.ts`

- Add a new optional section below the problem textarea:
  - Label: `GITHUB URL OR LOCAL FOLDER PATH (optional)`
  - Placeholder: `e.g. https://github.com/owner/repo or /Users/alice/myproject`
- Validation change: require at least one of `problem` or `repoInput`; if neither filled, focus the problem textarea.
- `onSubmit` callback widens to `(problem: string, repoInput?: string) => void`.
- Two new loading flavor strings added to `LOADING_MESSAGES`: `"Cloning the repository…"` and `"Exploring the codebase…"`.

---

### 3. Server — `BridgeServer.ts`

Add private helper `resolveRepoPath(repoInput: string): Promise<string>`:

- **GitHub URL** (matches `https://github.com/`): runs `git clone` via `child_process.execFile` with args as an array (no shell injection risk). Temp dir: `os.tmpdir() + '/agent-rpg-' + hash(url)` — deterministic so repeated submissions skip the clone if the directory already exists.
- **Local path**: stat the path, throw if it doesn't exist, return as-is.

Changes to `handleStartProcess`:
- If `msg.repoInput` is provided, call `resolveRepoPath` and use the result as `this.repoPath` instead of `process.env.HOME ?? '/tmp'`.
- If `msg.problem` is empty (repo-only mode), synthesize: `"Explore the codebase at: <repoInput>"`.
- On clone/stat failure, catch and send a `process:error` message back to the client (already handled by `main.ts` via `showError()`).

**Security note:** `git` is invoked via `execFile(['git', 'clone', url, dir])` — args are always passed as an array, never interpolated into a shell string. The URL is validated to match `https://github.com/` before being passed.

---

### 4. Testing

**Server (`BridgeServer.e2e.test.ts`):**
- `start-process` with `repoInput` set to a local path → `repoPath` uses that path
- `start-process` with neither `problem` nor `repoInput` → error response
- `resolveRepoPath` with a non-existent local path → throws

**Client (SetupScreen tests):**
- Submit blocked when both fields empty
- Submit allowed when only `repoInput` filled
- Submit allowed when only `problem` filled

No new test files needed — extend existing ones.

## Out of Scope

- Injecting repo content into agent system prompts (future work)
- Progress streaming during clone
- Support for non-GitHub git hosts (SSH URLs, GitLab, etc.)
- Repo validation / pre-clone ping before submission
