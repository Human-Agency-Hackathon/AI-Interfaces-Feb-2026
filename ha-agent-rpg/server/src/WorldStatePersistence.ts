import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { WorldState } from './WorldState.js';
import { sanitizePathComponent } from './PathSafety.js';
import type { IWorldStatePersistence } from './interfaces/index.js';

export class WorldStatePersistence implements IWorldStatePersistence {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = join(baseDir, '.agent-rpg', 'worlds');
  }

  async save(realmId: string, worldState: WorldState): Promise<void> {
    const safeRealmId = sanitizePathComponent(realmId);
    const dir = join(this.baseDir, safeRealmId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), worldState.toJSON());
  }

  async load(realmId: string): Promise<WorldState | null> {
    try {
      const safeRealmId = sanitizePathComponent(realmId);
      const data = await readFile(join(this.baseDir, safeRealmId, 'state.json'), 'utf-8');
      return WorldState.fromJSON(data);
    } catch {
      return null;
    }
  }

  async exists(realmId: string): Promise<boolean> {
    try {
      const safeRealmId = sanitizePathComponent(realmId);
      await access(join(this.baseDir, safeRealmId, 'state.json'));
      return true;
    } catch {
      return false;
    }
  }

  async remove(realmId: string): Promise<void> {
    try {
      const safeRealmId = sanitizePathComponent(realmId);
      await rm(join(this.baseDir, safeRealmId), { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}
