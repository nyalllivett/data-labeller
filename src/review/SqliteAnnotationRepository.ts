import type { SavedRecording } from '../capture/recording';
import type { DatabasePort } from '../storage/SqliteProjectRepository';
import { StorageError, storageError } from '../storage/StorageError';
import { annotations, decodeAnnotations, originalAnnotations, sameIntervals, type Annotations } from './annotations';
import type { AnnotationRepository } from './AnnotationRepository';

type Row = { recording_id: string; revision: number; body: string };
export class SqliteAnnotationRepository implements AnnotationRepository {
  private database: Promise<DatabasePort> | undefined;
  constructor(private readonly open: () => Promise<DatabasePort>) {}
  private ready(): Promise<DatabasePort> {
    if (!this.database) this.database = this.open().then(async (db) => {
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0) throw new StorageError('corrupt');
      if (version.user_version > 1) throw new StorageError('unsupported-schema');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
      if (version.user_version === 0) await db.withExclusiveTransactionAsync((txn) => txn.execAsync('CREATE TABLE annotations (recording_id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL); PRAGMA user_version = 1;'));
      return db;
    }).catch((error: unknown) => { this.database = undefined; throw storageError(error); });
    return this.database;
  }
  private decode(record: SavedRecording, row: Row): Annotations {
    try {
      const value = decodeAnnotations(record, row.body);
      if (row.recording_id !== record.id || row.revision !== value.revision || value.revision < 1) throw new StorageError('corrupt');
      return value;
    } catch { throw new StorageError('corrupt'); }
  }
  async load(record: SavedRecording): Promise<Annotations> {
    const db = await this.ready();
    const row = await db.getFirstAsync<Row>('SELECT recording_id, revision, body FROM annotations WHERE recording_id = ?', record.id);
    return row ? this.decode(record, row) : originalAnnotations(record);
  }
  async save(record: SavedRecording, expectedRevision: number, input: Annotations): Promise<Annotations> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || input.recordingId !== record.id) throw new StorageError('corrupt');
    const target = annotations(record, expectedRevision + 1, input.intervals);
    const db = await this.ready();
    await db.withExclusiveTransactionAsync(async (txn) => {
      const row = await txn.getFirstAsync<Row>('SELECT recording_id, revision, body FROM annotations WHERE recording_id = ?', record.id);
      const current = row ? this.decode(record, row) : originalAnnotations(record);
      if (current.revision === target.revision && sameIntervals(current, target)) return;
      if (current.revision !== expectedRevision) throw new StorageError('conflict');
      await txn.runAsync('INSERT INTO annotations (recording_id, revision, body) VALUES (?, ?, ?) ON CONFLICT(recording_id) DO UPDATE SET revision = excluded.revision, body = excluded.body', record.id, target.revision, JSON.stringify(target));
    });
    return target;
  }
}
