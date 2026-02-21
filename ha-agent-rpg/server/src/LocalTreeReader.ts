import { readdir, stat } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LocalTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface LocalRepoData {
  repoPath: string;
  repoName: string;
  tree: LocalTreeEntry[];
  totalFiles: number;
  languages: Record<string, number>;
  hasRemote: boolean;
  remoteUrl?: string;
}

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.DS_Store',
  'dist', 'build', '.next', '.cache', 'coverage',
  '.agent-rpg',
]);

const LANG_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript',
  '.jsx': 'JavaScript', '.py': 'Python', '.rs': 'Rust',
  '.go': 'Go', '.java': 'Java', '.rb': 'Ruby', '.c': 'C',
  '.cpp': 'C++', '.h': 'C', '.cs': 'C#', '.swift': 'Swift',
  '.kt': 'Kotlin', '.vue': 'Vue', '.svelte': 'Svelte',
  '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML',
  '.md': 'Markdown', '.json': 'JSON', '.yaml': 'YAML',
  '.yml': 'YAML', '.toml': 'TOML', '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell',
};

export class LocalTreeReader {
  async analyze(repoPath: string): Promise<LocalRepoData> {
    const tree: LocalTreeEntry[] = [];
    const languages: Record<string, number> = {};

    await this.walkDir(repoPath, repoPath, tree, languages);
    const totalFiles = tree.filter(e => e.type === 'blob').length;

    const hasRemote = await this.checkGitRemote(repoPath);
    const remoteUrl = hasRemote ? await this.getRemoteUrl(repoPath) : undefined;

    return {
      repoPath,
      repoName: basename(repoPath),
      tree,
      totalFiles,
      languages,
      hasRemote,
      remoteUrl,
    };
  }

  private async walkDir(
    rootPath: string,
    currentPath: string,
    tree: LocalTreeEntry[],
    languages: Record<string, number>,
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

      const fullPath = join(currentPath, entry.name);
      const relPath = relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        tree.push({ path: relPath, type: 'tree' });
        await this.walkDir(rootPath, fullPath, tree, languages);
      } else if (entry.isFile()) {
        const fileStat = await stat(fullPath);
        tree.push({ path: relPath, type: 'blob', size: fileStat.size });

        const ext = '.' + entry.name.split('.').pop()?.toLowerCase();
        const lang = LANG_EXTENSIONS[ext];
        if (lang) {
          languages[lang] = (languages[lang] ?? 0) + fileStat.size;
        }
      }
    }
  }

  private async checkGitRemote(repoPath: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  private async getRemoteUrl(repoPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
      return stdout.trim();
    } catch {
      return undefined;
    }
  }
}
