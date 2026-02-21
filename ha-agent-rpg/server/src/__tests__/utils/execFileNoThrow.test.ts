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
