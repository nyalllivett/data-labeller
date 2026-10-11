import { requireNativeModule } from 'expo';
import { openDatabaseAsync } from 'expo-sqlite';

import { SqliteProjectRepository, type DatabasePort } from './SqliteProjectRepository';
import { StorageError } from './StorageError';

type Preparation = { prepareDatabaseDirectory(): Promise<string> };
type NativeDatabase = DatabasePort & { closeAsync(): Promise<void> };

export function createNativeRepository(
  prepare: () => Promise<string> = () =>
    requireNativeModule<Preparation>('PrivateStorage').prepareDatabaseDirectory(),
  open: (name: string, directory: string) => Promise<NativeDatabase> = (name, directory) =>
    openDatabaseAsync(name, { useNewConnection: true }, directory),
) {
  let current: NativeDatabase | undefined;
  return new SqliteProjectRepository(async () => {
    try {
      // Retry releases a prior connection after failed schema/initialization.
      if (current) {
        await current.closeAsync();
        current = undefined;
      }
      const directory = await prepare();
      if (typeof directory !== 'string' || !directory.startsWith('file:///'))
        throw new StorageError('unavailable');
      current = await open('projects.db', directory);
      return current;
    } catch {
      throw new StorageError('unavailable');
    }
  });
}
