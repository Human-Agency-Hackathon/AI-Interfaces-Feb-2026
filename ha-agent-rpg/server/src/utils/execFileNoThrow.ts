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
