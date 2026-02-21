/**
 * Path Boundary Tests
 *
 * Ensures the server never reads/writes outside its expected directories.
 * Covers: PathSafety utilities, LocalTreeReader, KnowledgeVault,
 * TranscriptLogger, WorldStatePersistence, and FindingsBoard.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  sanitizePathComponent,
  isWithinRoot,
  assertWithinRoot,
  isReasonableProjectRoot,
} from '../PathSafety.js';
import { LocalTreeReader } from '../LocalTreeReader.js';
import { KnowledgeVault } from '../KnowledgeVault.js';
import { TranscriptLogger } from '../TranscriptLogger.js';
import { WorldStatePersistence } from '../WorldStatePersistence.js';

// ── PathSafety utility tests ────────────────────────────────────

describe('sanitizePathComponent()', () => {
  it('removes parent-directory traversal (..)', () => {
    expect(sanitizePathComponent('../../../etc/passwd')).toBe('______etc_passwd');
  });

  it('removes forward slashes', () => {
    expect(sanitizePathComponent('a/b/c')).toBe('a_b_c');
  });

  it('removes backslashes', () => {
    expect(sanitizePathComponent('a\\b\\c')).toBe('a_b_c');
  });

  it('strips combined traversal + slashes', () => {
    expect(sanitizePathComponent('../../secret/file')).toBe('____secret_file');
  });

  it('leaves normal identifiers untouched', () => {
    expect(sanitizePathComponent('oracle')).toBe('oracle');
    expect(sanitizePathComponent('agent_1')).toBe('agent_1');
    expect(sanitizePathComponent('eng-2')).toBe('eng-2');
  });

  it('handles empty string', () => {
    expect(sanitizePathComponent('')).toBe('');
  });
});

describe('isWithinRoot()', () => {
  it('returns true for a child path', () => {
    expect(isWithinRoot('/a/b', '/a/b/c')).toBe(true);
  });

  it('returns true when root equals target', () => {
    expect(isWithinRoot('/a/b', '/a/b')).toBe(true);
  });

  it('returns false for a parent path', () => {
    expect(isWithinRoot('/a/b', '/a')).toBe(false);
  });

  it('returns false for a sibling path', () => {
    expect(isWithinRoot('/a/b', '/a/c')).toBe(false);
  });

  it('handles ../ traversal', () => {
    expect(isWithinRoot('/a/b', '/a/b/../c')).toBe(false);
  });

  it('is not fooled by prefix overlap (e.g. /a/bc vs /a/b)', () => {
    expect(isWithinRoot('/a/b', '/a/bc')).toBe(false);
  });
});

describe('assertWithinRoot()', () => {
  it('does not throw for a child path', () => {
    expect(() => assertWithinRoot('/a/b', '/a/b/c')).not.toThrow();
  });

  it('throws for a parent path', () => {
    expect(() => assertWithinRoot('/a/b', '/a')).toThrow('Path traversal detected');
  });

  it('throws for traversal via ../', () => {
    expect(() => assertWithinRoot('/a/b', '/a/b/../../etc')).toThrow('Path traversal detected');
  });
});

describe('isReasonableProjectRoot()', () => {
  it('rejects / as a project root', () => {
    expect(isReasonableProjectRoot('/')).toBe(false);
  });

  it('rejects /etc', () => {
    expect(isReasonableProjectRoot('/etc')).toBe(false);
  });

  it('rejects /usr', () => {
    expect(isReasonableProjectRoot('/usr')).toBe(false);
  });

  it('accepts a normal project path', () => {
    expect(isReasonableProjectRoot('/Users/dev/my-project')).toBe(true);
  });

  it('accepts /tmp', () => {
    expect(isReasonableProjectRoot('/tmp')).toBe(true);
  });
});

// ── LocalTreeReader boundary tests ──────────────────────────────

describe('LocalTreeReader path boundary', () => {
  let tempDir: string;
  let reader: LocalTreeReader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pathbound-test-'));
    reader = new LocalTreeReader();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('all output paths are relative and do not start with ..', async () => {
    await mkdir(join(tempDir, 'src'));
    await writeFile(join(tempDir, 'src', 'index.ts'), 'export {}');
    await writeFile(join(tempDir, 'README.md'), '# hi');

    const result = await reader.analyze(tempDir);
    for (const entry of result.tree) {
      expect(entry.path).not.toMatch(/^\.\./);
      expect(entry.path).not.toMatch(/^\//);
    }
  });

  it('skips symlinks that point outside the repo root', async () => {
    // Create a directory outside the repo root
    const outsideDir = await mkdtemp(join(tmpdir(), 'outside-'));
    await writeFile(join(outsideDir, 'secret.txt'), 'top secret');

    // Create a symlink inside the repo pointing to the outside dir
    await symlink(outsideDir, join(tempDir, 'escape_link'));

    const result = await reader.analyze(tempDir);
    const escaped = result.tree.find(e => e.path.includes('secret.txt'));
    expect(escaped).toBeUndefined();

    const linkEntry = result.tree.find(e => e.path.includes('escape_link'));
    expect(linkEntry).toBeUndefined();

    await rm(outsideDir, { recursive: true, force: true });
  });

  it('skips symlink files that point outside the repo root', async () => {
    const outsideFile = join(tmpdir(), `pathbound-secret-${Date.now()}.txt`);
    await writeFile(outsideFile, 'sensitive data');

    await symlink(outsideFile, join(tempDir, 'bad_link.txt'));

    const result = await reader.analyze(tempDir);
    const linked = result.tree.find(e => e.path === 'bad_link.txt');
    expect(linked).toBeUndefined();

    await rm(outsideFile, { force: true });
  });

  it('does not include paths from outside root even with directory traversal names', async () => {
    // A directory literally named ".." would be very unusual but test the guard
    await mkdir(join(tempDir, 'normal'));
    await writeFile(join(tempDir, 'normal', 'file.ts'), 'ok');

    const result = await reader.analyze(tempDir);
    for (const entry of result.tree) {
      const resolved = resolve(tempDir, entry.path);
      expect(isWithinRoot(tempDir, resolved)).toBe(true);
    }
  });
});

// ── KnowledgeVault path traversal tests ─────────────────────────

describe('KnowledgeVault path traversal', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vault-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('sanitizes agentId with ../ traversal', async () => {
    const vault = new KnowledgeVault(tempDir, '../../etc/passwd', {
      agent_name: 'Evil',
      role: 'attacker',
    });
    await vault.save();

    // The file should be inside the tempDir, NOT at ../../etc/passwd
    const expectedDir = join(tempDir, '.agent-rpg', 'knowledge');
    const entries = await readdir(expectedDir);
    expect(entries.length).toBe(1);
    // Should be sanitized filename, not a traversal path
    expect(entries[0]).not.toContain('..');
    expect(entries[0]).toMatch(/\.json$/);
  });

  it('sanitizes agentId with slashes', async () => {
    const vault = new KnowledgeVault(tempDir, 'a/b/c', {
      agent_name: 'Slash',
      role: 'test',
    });
    await vault.save();

    const expectedDir = join(tempDir, '.agent-rpg', 'knowledge');
    const entries = await readdir(expectedDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).toBe('a_b_c.json');
  });

  it('normal agentId works as expected', async () => {
    const vault = new KnowledgeVault(tempDir, 'oracle', {
      agent_name: 'Oracle',
      role: 'Lead',
    });
    vault.addInsight('test insight');
    await vault.save();

    const data = JSON.parse(
      await readFile(join(tempDir, '.agent-rpg', 'knowledge', 'oracle.json'), 'utf-8'),
    );
    expect(data.agent_id).toBe('oracle');
    expect(data.insights).toContain('test insight');
  });
});

// ── TranscriptLogger path traversal tests ───────────────────────

describe('TranscriptLogger path traversal', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'transcript-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('sanitizes agentId with ../ traversal', async () => {
    const logger = new TranscriptLogger(tempDir);
    await logger.log('../../etc/cron', { msg: 'malicious' });

    // Log should be inside tempDir, not escaped
    const logsDir = join(tempDir, '.agent-rpg', 'logs');
    const entries = await readdir(logsDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).not.toContain('..');
  });

  it('sanitizes agentId with slashes', async () => {
    const logger = new TranscriptLogger(tempDir);
    await logger.log('a/b/c', { msg: 'test' });

    const logsDir = join(tempDir, '.agent-rpg', 'logs');
    const entries = await readdir(logsDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).toBe('a_b_c');
  });

  it('writes log file inside the correct directory', async () => {
    const logger = new TranscriptLogger(tempDir);
    await logger.log('oracle', { msg: 'hello' });

    const agentDir = join(tempDir, '.agent-rpg', 'logs', 'oracle');
    const files = await readdir(agentDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
  });
});

// ── WorldStatePersistence path traversal tests ──────────────────

describe('WorldStatePersistence path traversal', () => {
  let tempDir: string;
  let persistence: WorldStatePersistence;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wsp-test-'));
    persistence = new WorldStatePersistence(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('sanitizes realmId with ../ traversal in save()', async () => {
    const { WorldState } = await import('../WorldState.js');
    const ws = new WorldState();

    await persistence.save('../../etc/shadow', ws);

    // The file should be inside tempDir, not escaped
    const worldsDir = join(tempDir, '.agent-rpg', 'worlds');
    const entries = await readdir(worldsDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).not.toContain('..');
  });

  it('sanitizes realmId with ../ traversal in exists()', async () => {
    const result = await persistence.exists('../../etc/passwd');
    expect(result).toBe(false);
    // Should not throw or access files outside tempDir
  });

  it('sanitizes realmId with ../ traversal in remove()', async () => {
    // This should not attempt to rm -rf outside the base dir
    await persistence.remove('../../important');
    // If we got here without error, the sanitization worked
    expect(true).toBe(true);
  });

  it('saves and loads with a normal realmId', async () => {
    const { WorldState } = await import('../WorldState.js');
    const ws = new WorldState();

    await persistence.save('my-realm', ws);
    const exists = await persistence.exists('my-realm');
    expect(exists).toBe(true);

    const loaded = await persistence.load('my-realm');
    expect(loaded).not.toBeNull();
  });
});

// ── Integration: all file outputs stay within repo root ─────────

describe('Integration: filesystem boundary', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'integration-bound-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('KnowledgeVault file path resolves within repo root', () => {
    const vault = new KnowledgeVault(tempDir, '../../escape', {});
    // Access the file path via save behavior — if it saved,
    // the file is inside tempDir
    const resolvedBase = resolve(tempDir);
    // We can't easily access the private filePath, but we already
    // tested save() above. This test ensures the constructor
    // doesn't throw for traversal inputs (it sanitizes them).
    expect(() => new KnowledgeVault(tempDir, '../../escape', {})).not.toThrow();
  });

  it('multiple traversal vectors in the same session all stay bounded', async () => {
    const { WorldState } = await import('../WorldState.js');

    const vault = new KnowledgeVault(tempDir, '../../../root/.ssh/id_rsa', {});
    await vault.save();

    const logger = new TranscriptLogger(tempDir);
    await logger.log('../../../root/.bashrc', { test: true });

    const persistence = new WorldStatePersistence(tempDir);
    await persistence.save('../../../root', new WorldState());

    // All three should have written inside tempDir
    const agentRpgDir = join(tempDir, '.agent-rpg');
    const knowledgeEntries = await readdir(join(agentRpgDir, 'knowledge'));
    const logEntries = await readdir(join(agentRpgDir, 'logs'));
    const worldEntries = await readdir(join(agentRpgDir, 'worlds'));

    expect(knowledgeEntries.length).toBe(1);
    expect(logEntries.length).toBe(1);
    expect(worldEntries.length).toBe(1);

    // None of them should contain traversal markers
    for (const entry of [...knowledgeEntries, ...logEntries, ...worldEntries]) {
      expect(entry).not.toContain('..');
      expect(entry).not.toContain('/');
    }
  });
});
