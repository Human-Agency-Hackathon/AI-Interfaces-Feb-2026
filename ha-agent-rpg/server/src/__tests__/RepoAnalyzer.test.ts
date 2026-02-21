import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Octokit ──────────────────────────────────────────────────

const mockReposGet = vi.fn();
const mockGetTree = vi.fn();
const mockListForRepo = vi.fn();
const mockListLanguages = vi.fn();

vi.mock('octokit', () => {
  return {
    Octokit: class MockOctokit {
      rest = {
        repos: {
          get: mockReposGet,
          listLanguages: mockListLanguages,
        },
        git: {
          getTree: mockGetTree,
        },
        issues: {
          listForRepo: mockListForRepo,
        },
      };
    },
  };
});

import { RepoAnalyzer } from '../RepoAnalyzer.js';

// ── Tests ──────────────────────────────────────────────────────────

describe('RepoAnalyzer', () => {
  let analyzer: RepoAnalyzer;

  beforeEach(() => {
    analyzer = new RepoAnalyzer();
    vi.clearAllMocks();
  });

  describe('analyze() - URL parsing', () => {
    it('rejects invalid GitHub URLs', async () => {
      await expect(analyzer.analyze('https://gitlab.com/owner/repo')).rejects.toThrow(
        'Invalid GitHub repository URL',
      );
    });

    it('rejects empty URLs', async () => {
      await expect(analyzer.analyze('')).rejects.toThrow(
        'Invalid GitHub repository URL',
      );
    });

    it('rejects non-URL strings', async () => {
      await expect(analyzer.analyze('not-a-url')).rejects.toThrow(
        'Invalid GitHub repository URL',
      );
    });
  });

  describe('analyze() - successful fetch', () => {
    beforeEach(() => {
      mockReposGet.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockGetTree.mockResolvedValue({
        data: {
          tree: [
            { path: 'src', type: 'tree' },
            { path: 'src/index.ts', type: 'blob', size: 500 },
            { path: 'src/utils.ts', type: 'blob', size: 300 },
            { path: 'node_modules', type: 'tree' },
            { path: 'node_modules/pkg/index.js', type: 'blob', size: 100 },
            { path: 'README.md', type: 'blob', size: 200 },
            { path: '.git/HEAD', type: 'blob', size: 10 },
          ],
        },
      });

      mockListForRepo.mockResolvedValue({
        data: [
          {
            number: 1,
            title: 'Bug report',
            body: 'Something is broken',
            labels: [{ name: 'bug' }],
            html_url: 'https://github.com/test/repo/issues/1',
          },
          {
            number: 2,
            title: 'Feature request',
            body: 'Add a thing',
            labels: ['enhancement'],
            html_url: 'https://github.com/test/repo/issues/2',
            pull_request: { url: 'https://github.com/test/repo/pulls/2' },
          },
        ],
      });

      mockListLanguages.mockResolvedValue({
        data: { TypeScript: 800, JavaScript: 100 },
      });
    });

    it('parses owner and repo from URL', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      expect(result.owner).toBe('testowner');
      expect(result.repo).toBe('testrepo');
    });

    it('strips .git suffix from repo name', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo.git');
      expect(result.repo).toBe('testrepo');
    });

    it('handles URL with trailing path', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo/tree/main');
      expect(result.owner).toBe('testowner');
      expect(result.repo).toBe('testrepo');
    });

    it('returns the default branch', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      expect(result.defaultBranch).toBe('main');
    });

    it('filters out excluded paths (node_modules, .git)', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      const paths = result.tree.map(e => e.path);
      expect(paths).not.toContain('node_modules');
      expect(paths).not.toContain('node_modules/pkg/index.js');
      expect(paths).not.toContain('.git/HEAD');
    });

    it('keeps non-excluded paths', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      const paths = result.tree.map(e => e.path);
      expect(paths).toContain('src');
      expect(paths).toContain('src/index.ts');
      expect(paths).toContain('README.md');
    });

    it('counts only blob entries as totalFiles', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      // After filtering: src (tree), src/index.ts (blob), src/utils.ts (blob), README.md (blob)
      expect(result.totalFiles).toBe(3);
    });

    it('returns languages from the API', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      expect(result.languages).toEqual({ TypeScript: 800, JavaScript: 100 });
    });

    it('excludes pull requests from issues', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      // Issue #2 has pull_request field, so it should be excluded
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].number).toBe(1);
      expect(result.issues[0].title).toBe('Bug report');
    });

    it('extracts issue labels as strings', async () => {
      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      expect(result.issues[0].labels).toEqual(['bug']);
    });
  });

  describe('analyze() - error handling', () => {
    it('throws descriptive error when repo fetch fails', async () => {
      mockReposGet.mockRejectedValue(new Error('Not Found'));

      await expect(
        analyzer.analyze('https://github.com/testowner/nonexistent'),
      ).rejects.toThrow('Failed to fetch repository');
    });

    it('returns empty issues when issues API fails', async () => {
      mockReposGet.mockResolvedValue({
        data: { default_branch: 'main' },
      });
      mockGetTree.mockResolvedValue({ data: { tree: [] } });
      mockListForRepo.mockRejectedValue(new Error('Forbidden'));
      mockListLanguages.mockResolvedValue({ data: {} });

      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      expect(result.issues).toEqual([]);
    });

    it('returns empty languages when languages API fails', async () => {
      mockReposGet.mockResolvedValue({
        data: { default_branch: 'main' },
      });
      mockGetTree.mockResolvedValue({ data: { tree: [] } });
      mockListForRepo.mockResolvedValue({ data: [] });
      mockListLanguages.mockRejectedValue(new Error('Forbidden'));

      const result = await analyzer.analyze('https://github.com/testowner/testrepo');
      expect(result.languages).toEqual({});
    });
  });
});
