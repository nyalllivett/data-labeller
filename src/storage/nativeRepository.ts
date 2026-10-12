import { SqliteProjectRepository } from './SqliteProjectRepository';
import { privateDatabaseOpener, type NativeDatabase } from './privateDatabase';

export function createNativeRepository(
  prepare?: () => Promise<string>,
  open?: (name: string, directory: string) => Promise<NativeDatabase>,
) {
  return new SqliteProjectRepository(privateDatabaseOpener('projects.db', prepare, open));
}
