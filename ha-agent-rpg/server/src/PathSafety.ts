/**
 * Path safety utilities to prevent directory traversal attacks.
 * All filesystem-touching code should use these helpers to
 * ensure paths stay within their expected boundaries.
 */

import { resolve } from 'node:path';

/**
 * Sanitize a single path component (agentId, realmId, sessionId, etc.).
 * Strips parent-directory traversal sequences and path separators
 * so the value is safe to use in `path.join()`.
 */
export function sanitizePathComponent(component: string): string {
  return component
    .replace(/\.\./g, '_')
    .replace(/[\/\\]/g, '_');
}

/**
 * Returns true when `targetPath` resolves to a location inside (or equal to) `rootPath`.
 */
export function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + '/');
}

/**
 * Throws if `targetPath` resolves to a location outside `rootPath`.
 */
export function assertWithinRoot(rootPath: string, targetPath: string): void {
  if (!isWithinRoot(rootPath, targetPath)) {
    throw new Error(
      `Path traversal detected: "${targetPath}" escapes root "${rootPath}"`,
    );
  }
}

/**
 * A set of system/sensitive directories that should never be used as repo roots.
 */
const FORBIDDEN_ROOTS = new Set(['/', '/etc', '/usr', '/var', '/bin', '/sbin', '/lib', '/System', '/Library']);

/**
 * Validate that a path is a reasonable project root (not a sensitive system directory).
 */
export function isReasonableProjectRoot(dirPath: string): boolean {
  const resolved = resolve(dirPath);
  return !FORBIDDEN_ROOTS.has(resolved);
}
