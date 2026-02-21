import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { WorldState } from './WorldState.js';

export class WorldStatePersistence {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = join(baseDir, '.agent-rpg', 'worlds');
  }

  async save(realmId: string, worldState: WorldState): Promise<void> {
    const dir = join(this.baseDir, realmId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), worldState.toJSON());
  }

  async load(realmId: string): Promise<WorldState | null> {
    try {
      const data = await readFile(join(this.baseDir, realmId, 'state.json'), 'utf-8');
      return WorldState.fromJSON(data);
    } catch {
      return null;
    }
  }

  async exists(realmId: string): Promise<boolean> {
    try {
      await access(join(this.baseDir, realmId, 'state.json'));
      return true;
    } catch {
      return false;
    }
  }

  async remove(realmId: string): Promise<void> {
    try {
      await rm(join(this.baseDir, realmId), { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}
