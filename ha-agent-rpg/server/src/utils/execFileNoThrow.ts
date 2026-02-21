import { execFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  /**
   * Process exit code on success (0), process exit code on failure (>0),
   * or 1 for OS-level spawn errors (ENOENT, EACCES, etc.).
   */
  status: number;
}

export interface ExecOptions {
  /** Working directory for the command. */
  cwd?: string;
}

/**
 * Safe wrapper around child_process.execFile.
 * Args are always passed as an array — no shell interpolation, no injection risk.
 * Never throws; returns structured output with status code.
 *
 * Note: OS-level spawn errors (ENOENT, EACCES) map to status 1 since they
 * have no numeric exit code. Use stderr to distinguish error categories.
 */
export async function execFileNoThrow(
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024, cwd: options.cwd }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        // error.code is a number for process exit codes, a string for OS errors (ENOENT, etc.)
        status: error?.code != null ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}
