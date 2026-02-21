import { describe, it, expect } from 'vitest';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';

describe('execFileNoThrow', () => {
  it('returns stdout and exit code 0 on success', async () => {
    const result = await execFileNoThrow('echo', ['hello']);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.status).toBe(0);
  });

  it('returns non-zero status on process failure', async () => {
    // `false` is a portable command that always exits with code 1
    const result = await execFileNoThrow('bash', ['-c', 'exit 1']);
    expect(result.status).toBe(1);
  });

  it('returns status 1 for a non-existent command (ENOENT)', async () => {
    const result = await execFileNoThrow('nonexistent-command-xyz-abc', []);
    expect(result.status).toBe(1);
  });

  it('returns stderr content from a failing command', async () => {
    const result = await execFileNoThrow('bash', ['-c', 'echo "error msg" >&2; exit 1']);
    expect(result.stderr).toContain('error msg');
    expect(result.status).toBe(1);
  });

  it('respects cwd option', async () => {
    const result = await execFileNoThrow('pwd', [], { cwd: '/tmp' });
    // On macOS /tmp is a symlink to /private/tmp; use toContain for portability
    expect(result.stdout.trim()).toContain('tmp');
    expect(result.status).toBe(0);
  });
});
