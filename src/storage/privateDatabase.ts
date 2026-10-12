import { requireNativeModule } from 'expo';
import { openDatabaseAsync } from 'expo-sqlite';

import type { DatabasePort } from './SqliteProjectRepository';
import { StorageError } from './StorageError';

type Preparation = { prepareDatabaseDirectory(): Promise<string> };
export type NativeDatabase = DatabasePort & { closeAsync(): Promise<void> };

export function privateDatabaseOpener(
  name: string,
  prepare: () => Promise<string> = () => requireNativeModule<Preparation>('PrivateStorage').prepareDatabaseDirectory(),
  open: (name: string, directory: string) => Promise<NativeDatabase> = (name, directory) =>
    openDatabaseAsync(name, { useNewConnection: true }, directory),
): () => Promise<DatabasePort> {
  let current: NativeDatabase | undefined;
  return async () => {
    try {
      if (current) { await current.closeAsync(); current = undefined; }
      const directory = await prepare();
      if (typeof directory !== 'string' || !directory.startsWith('file:///')) throw new StorageError('unavailable');
      current = await open(name, directory);
      return current;
    } catch {
      throw new StorageError('unavailable');
    }
  };
}
