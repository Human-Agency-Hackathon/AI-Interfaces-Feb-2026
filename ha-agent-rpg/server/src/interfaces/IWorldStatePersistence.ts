import type { WorldState } from '../WorldState.js';

export interface IWorldStatePersistence {
  save(realmId: string, worldState: WorldState): Promise<void>;
  load(realmId: string): Promise<WorldState | null>;
  exists(realmId: string): Promise<boolean>;
  remove(realmId: string): Promise<void>;
}
