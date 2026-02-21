import { Octokit } from 'octokit';

// ---------- Public data types ----------

export interface RepoTreeEntry {
  path: string;
  type: 'blob' | 'tree'; // file or directory
  size?: number;
}

export interface RepoIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
}

export interface RepoData {
  owner: string;
  repo: string;
  tree: RepoTreeEntry[];
  issues: RepoIssue[];
  languages: Record<string, number>;
  totalFiles: number;
  defaultBranch: string;
}

// ---------- Filtering ----------

/** Paths (or prefixes) that should be excluded from the tree. */
const EXCLUDED_PATHS = [
  '.git',
  'node_modules',
  '__pycache__',
  '.DS_Store',
  'dist',
  'build',
];

function shouldExclude(path: string): boolean {
  for (const excluded of EXCLUDED_PATHS) {
    if (path === excluded || path.startsWith(excluded + '/')) {
      return true;
    }
    // Also match nested occurrences, e.g. "src/node_modules/foo"
    if (path.includes('/' + excluded + '/') || path.endsWith('/' + excluded)) {
      return true;
    }
  }
  return false;
}

// ---------- URL parsing ----------

const GITHUB_URL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\/.*)?$/;

function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.trim().match(GITHUB_URL_RE);
  if (!match) {
    throw new Error(
      `Invalid GitHub repository URL: "${url}". Expected format: https://github.com/owner/repo`,
    );
  }
  // Strip a possible trailing ".git"
  const repo = match[2].replace(/\.git$/, '');
  return { owner: match[1], repo };
}

// ---------- Main class ----------

export class RepoAnalyzer {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit();
  }

  /**
   * Analyze a public GitHub repository and return structured metadata.
   *
   * @param repoUrl  A URL of the form `https://github.com/owner/repo`.
   */
  async analyze(repoUrl: string): Promise<RepoData> {
    const { owner, repo } = parseGitHubUrl(repoUrl);

    // Fetch repo metadata first so we know the default branch.
    let defaultBranch: string;
    try {
      const { data: repoMeta } = await this.octokit.rest.repos.get({
        owner,
        repo,
      });
      defaultBranch = repoMeta.default_branch;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to fetch repository "${owner}/${repo}": ${message}. ` +
          'Make sure the repository exists and is public.',
      );
    }

    // Run the remaining fetches in parallel.
    const [treeResult, issuesResult, languagesResult] = await Promise.all([
      this.fetchTree(owner, repo, defaultBranch),
      this.fetchIssues(owner, repo),
      this.fetchLanguages(owner, repo),
    ]);

    const filteredTree = treeResult.filter((e) => !shouldExclude(e.path));
    const totalFiles = filteredTree.filter((e) => e.type === 'blob').length;

    return {
      owner,
      repo,
      tree: filteredTree,
      issues: issuesResult,
      languages: languagesResult,
      totalFiles,
      defaultBranch,
    };
  }

  // ---- Private helpers ----

  private async fetchTree(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<RepoTreeEntry[]> {
    const { data } = await this.octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: 'true',
    });

    return (data.tree ?? [])
      .filter(
        (entry): entry is typeof entry & { path: string; type: 'blob' | 'tree' } =>
          entry.path !== undefined &&
          (entry.type === 'blob' || entry.type === 'tree'),
      )
      .map((entry) => {
        const result: RepoTreeEntry = {
          path: entry.path,
          type: entry.type as 'blob' | 'tree',
        };
        if (entry.size !== undefined) {
          result.size = entry.size;
        }
        return result;
      });
  }

  private async fetchIssues(
    owner: string,
    repo: string,
  ): Promise<RepoIssue[]> {
    try {
      const { data } = await this.octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 20,
        sort: 'updated',
        direction: 'desc',
      });

      return data
        .filter((issue) => !issue.pull_request) // Exclude pull requests
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body ?? '',
          labels: issue.labels
            .map((label) => (typeof label === 'string' ? label : label.name ?? ''))
            .filter(Boolean),
          url: issue.html_url,
        }));
    } catch {
      // Non-fatal: some repos may have issues disabled.
      return [];
    }
  }

  private async fetchLanguages(
    owner: string,
    repo: string,
  ): Promise<Record<string, number>> {
    try {
      const { data } = await this.octokit.rest.repos.listLanguages({
        owner,
        repo,
      });
      return data;
    } catch {
      return {};
    }
  }
}
