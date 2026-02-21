import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LocalTreeReader } from '../LocalTreeReader.js';

const execFileAsync = promisify(execFile);

describe('LocalTreeReader', () => {
  let tempDir: string;
  let reader: LocalTreeReader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'localtree-test-'));
    reader = new LocalTreeReader();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('analyze()', () => {
    it('returns basic repo info for an empty directory', async () => {
      const result = await reader.analyze(tempDir);
      expect(result.repoPath).toBe(tempDir);
      expect(result.repoName).toBeTruthy();
      expect(result.tree).toEqual([]);
      expect(result.totalFiles).toBe(0);
      expect(result.languages).toEqual({});
      expect(result.hasRemote).toBe(false);
    });

    it('counts files correctly', async () => {
      await mkdir(join(tempDir, 'src'));
      await writeFile(join(tempDir, 'src', 'index.ts'), 'console.log("hello")');
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export {}');
      await writeFile(join(tempDir, 'README.md'), '# Hello');

      const result = await reader.analyze(tempDir);
      expect(result.totalFiles).toBe(3);
    });

    it('detects directories as tree entries', async () => {
      await mkdir(join(tempDir, 'src'));
      await writeFile(join(tempDir, 'src', 'app.ts'), 'export {}');

      const result = await reader.analyze(tempDir);
      const dirs = result.tree.filter(e => e.type === 'tree');
      expect(dirs.length).toBeGreaterThanOrEqual(1);
      expect(dirs.some(d => d.path === 'src')).toBe(true);
    });

    it('detects files as blob entries with size', async () => {
      const content = 'const x = 42;';
      await writeFile(join(tempDir, 'app.ts'), content);

      const result = await reader.analyze(tempDir);
      const files = result.tree.filter(e => e.type === 'blob');
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('app.ts');
      expect(files[0].size).toBe(content.length);
    });

    it('detects TypeScript language from .ts files', async () => {
      await writeFile(join(tempDir, 'index.ts'), 'export {}');

      const result = await reader.analyze(tempDir);
      expect(result.languages.TypeScript).toBeGreaterThan(0);
    });

    it('detects Python language from .py files', async () => {
      await writeFile(join(tempDir, 'main.py'), 'print("hi")');

      const result = await reader.analyze(tempDir);
      expect(result.languages.Python).toBeGreaterThan(0);
    });

    it('detects multiple languages', async () => {
      await writeFile(join(tempDir, 'app.ts'), 'export {}');
      await writeFile(join(tempDir, 'main.py'), 'print()');
      await writeFile(join(tempDir, 'style.css'), 'body {}');

      const result = await reader.analyze(tempDir);
      expect(Object.keys(result.languages).length).toBeGreaterThanOrEqual(3);
    });

    it('ignores .git directories', async () => {
      await mkdir(join(tempDir, '.git'));
      await writeFile(join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main');

      const result = await reader.analyze(tempDir);
      const gitEntry = result.tree.find(e => e.path.includes('.git'));
      expect(gitEntry).toBeUndefined();
    });

    it('ignores node_modules', async () => {
      await mkdir(join(tempDir, 'node_modules'));
      await mkdir(join(tempDir, 'node_modules', 'some-pkg'));
      await writeFile(join(tempDir, 'node_modules', 'some-pkg', 'index.js'), '');

      const result = await reader.analyze(tempDir);
      const nmEntry = result.tree.find(e => e.path.includes('node_modules'));
      expect(nmEntry).toBeUndefined();
    });

    it('ignores __pycache__', async () => {
      await mkdir(join(tempDir, '__pycache__'));
      await writeFile(join(tempDir, '__pycache__', 'module.pyc'), '');

      const result = await reader.analyze(tempDir);
      const pcEntry = result.tree.find(e => e.path.includes('__pycache__'));
      expect(pcEntry).toBeUndefined();
    });

    it('ignores hidden files (starting with .)', async () => {
      await writeFile(join(tempDir, '.hidden'), 'secret');
      await writeFile(join(tempDir, 'visible.ts'), 'export {}');

      const result = await reader.analyze(tempDir);
      const hidden = result.tree.find(e => e.path === '.hidden');
      expect(hidden).toBeUndefined();
      expect(result.totalFiles).toBe(1); // only visible.ts
    });

    it('recursively walks subdirectories', async () => {
      await mkdir(join(tempDir, 'src'));
      await mkdir(join(tempDir, 'src', 'utils'));
      await writeFile(join(tempDir, 'src', 'utils', 'helper.ts'), 'export {}');

      const result = await reader.analyze(tempDir);
      const helper = result.tree.find(e => e.path === 'src/utils/helper.ts');
      expect(helper).toBeDefined();
      expect(helper!.type).toBe('blob');
    });

    it('detects git remote when present', async () => {
      // Initialize a git repo with a remote
      await execFileAsync('git', ['init'], { cwd: tempDir });
      await execFileAsync('git', ['remote', 'add', 'origin', 'https://github.com/test/repo.git'], { cwd: tempDir });

      const result = await reader.analyze(tempDir);
      expect(result.hasRemote).toBe(true);
      expect(result.remoteUrl).toBe('https://github.com/test/repo.git');
    });

    it('reports no remote when git is not initialized', async () => {
      const result = await reader.analyze(tempDir);
      expect(result.hasRemote).toBe(false);
      expect(result.remoteUrl).toBeUndefined();
    });
  });
});
