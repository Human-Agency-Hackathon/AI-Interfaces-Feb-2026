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
