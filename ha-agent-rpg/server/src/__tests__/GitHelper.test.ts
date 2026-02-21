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
    execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tempDir, stdio: 'pipe' });
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
