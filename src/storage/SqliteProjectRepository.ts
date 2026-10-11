import type { SQLiteDatabase } from 'expo-sqlite';

import { decodeProject } from '../projects/project';
import {
  decodeOperation,
  type ProjectOperation,
  type ProjectRepository,
  validateOperation,
  type Workspace,
} from './ProjectRepository';
import { StorageError, storageError } from './StorageError';

export type DatabasePort = Pick<
  SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withExclusiveTransactionAsync'
>;
type OperationRow = { id: string; payload: string; completed: number };
type ProjectRow = { id: string; revision: number; body: string };

const schema = `
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)));
PRAGMA user_version = 1;`;

export class SqliteProjectRepository implements ProjectRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private database: Promise<DatabasePort> | undefined;

  constructor(private readonly open: () => Promise<DatabasePort>) {}

  private serial<T>(action: (db: DatabasePort) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      try {
        return await action(await this.ready());
      } catch (error) {
        throw storageError(error);
      }
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private ready(): Promise<DatabasePort> {
    if (!this.database) {
      this.database = this.open()
        .then(async (db) => {
          const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
          if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0)
            throw new StorageError('corrupt');
          if (version.user_version > 1) throw new StorageError('unsupported-schema');
          await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
          if (version.user_version === 0)
            await db.withExclusiveTransactionAsync((txn) => txn.execAsync(schema));
          return db;
        })
        .catch((error: unknown) => {
          this.database = undefined;
          throw storageError(error);
        });
    }
    return this.database;
  }

  private operation(row: OperationRow): ProjectOperation {
    const operation = decodeOperation(row.payload);
    if (operation.id !== row.id || (row.completed !== 0 && row.completed !== 1))
      throw new StorageError('corrupt');
    return operation;
  }

  private async apply(db: DatabasePort, operation: ProjectOperation): Promise<void> {
    await db.withExclusiveTransactionAsync(async (txn) => {
      const row = await txn.getFirstAsync<OperationRow>(
        'SELECT id, payload, completed FROM operations WHERE id = ?',
        operation.id,
      );
      if (!row) throw new StorageError('corrupt');
      this.operation(row);
      if (row.payload !== JSON.stringify(operation)) throw new StorageError('operation-collision');
      if (row.completed === 1) return;
      const current = await txn.getFirstAsync<ProjectRow>(
        'SELECT id, revision, body FROM projects WHERE id = ?',
        operation.project.id,
      );
      if (current) this.project(current);
      if ((current?.revision ?? 0) !== operation.expectedRevision)
        throw new StorageError('conflict');
      await txn.runAsync(
        'INSERT INTO projects (id, revision, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, body = excluded.body',
        operation.project.id,
        operation.project.revision,
        JSON.stringify(operation.project),
      );
      await txn.runAsync('UPDATE operations SET completed = 1 WHERE id = ?', operation.id);
    });
  }

  private project(row: ProjectRow) {
    try {
      const project = decodeProject(row.body);
      if (project.id !== row.id || project.revision !== row.revision)
        throw new StorageError('corrupt');
      return project;
    } catch {
      throw new StorageError('corrupt');
    }
  }

  private async snapshot(db: DatabasePort): Promise<Workspace> {
    const projects = await db.getAllAsync<ProjectRow>(
      'SELECT id, revision, body FROM projects ORDER BY rowid',
    );
    const pending = await db.getAllAsync<OperationRow>(
      'SELECT id, payload, completed FROM operations WHERE completed = 0 ORDER BY rowid',
    );
    return {
      projects: projects.map((row) => this.project(row)),
      pending: pending.map((row) => this.operation(row)),
    };
  }

  load(): Promise<Workspace> {
    return this.serial(async (db) => {
      const pending = await db.getAllAsync<OperationRow>(
        'SELECT id, payload, completed FROM operations WHERE completed = 0 ORDER BY rowid',
      );
      for (const row of pending) {
        try {
          await this.apply(db, this.operation(row));
        } catch (error) {
          if (!(error instanceof StorageError) || error.code !== 'conflict') throw error;
          // Keep conflicting submitted intent and the last committed aggregate.
        }
      }
      return this.snapshot(db);
    });
  }

  save(input: ProjectOperation): Promise<Workspace> {
    let operation: ProjectOperation;
    try {
      operation = validateOperation(input);
    } catch (error) {
      return Promise.reject(storageError(error));
    }
    return this.serial(async (db) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        const existing = await txn.getFirstAsync<OperationRow>(
          'SELECT id, payload, completed FROM operations WHERE id = ?',
          operation.id,
        );
        if (existing) {
          this.operation(existing);
          if (existing.payload !== JSON.stringify(operation))
            throw new StorageError('operation-collision');
        } else {
          await txn.runAsync(
            'INSERT INTO operations (id, payload, completed) VALUES (?, ?, 0)',
            operation.id,
            JSON.stringify(operation),
          );
        }
      });
      try {
        await this.apply(db, operation);
      } catch (error) {
        // A commit may have succeeded before the native promise rejected.
        const outcome = await db.getFirstAsync<OperationRow>(
          'SELECT id, payload, completed FROM operations WHERE id = ?',
          operation.id,
        );
        if (!outcome || outcome.completed !== 1 || outcome.payload !== JSON.stringify(operation))
          throw error;
        this.operation(outcome);
      }
      return this.snapshot(db);
    });
  }

  discard(operationId: string): Promise<Workspace> {
    return this.serial(async (db) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        // Never remove completed outcomes or committed project data.
        await txn.runAsync('DELETE FROM operations WHERE id = ? AND completed = 0', operationId);
      });
      return this.snapshot(db);
    });
  }
}
