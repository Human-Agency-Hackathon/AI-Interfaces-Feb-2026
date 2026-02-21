import type { RealmEntry } from '../types.js';

export interface IRealmRegistry {
  load(): Promise<void>;
  save(): Promise<void>;
  listRealms(): RealmEntry[];
  getRealm(id: string): RealmEntry | undefined;
  saveRealm(entry: RealmEntry): void;
  removeRealm(id: string): void;
  generateRealmId(repoPath: string): string;
}
