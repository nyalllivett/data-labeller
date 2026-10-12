import { validateId } from '../projects/project';
import type { DatabasePort } from '../storage/SqliteProjectRepository';
import { StorageError, storageError } from '../storage/StorageError';
import { CaptureError } from './CaptureError';
import { decodeDraft, decodeRecording, type RecordingDraft, type SavedRecording } from './recording';
import type { RecordingRepository, RecordingWorkspace } from './RecordingRepository';

type Row = { id: string; project_id: string; body: string };
const schema = `
CREATE TABLE drafts (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE recordings (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, body TEXT NOT NULL);
PRAGMA user_version = 1;`;

// A separate recordings.db avoids changing the reviewed project aggregate schema.
// One capture coordinator orders checkpoints; exclusive transactions own commits.
export class SqliteRecordingRepository implements RecordingRepository {
  private database: Promise<DatabasePort> | undefined;
  constructor(private readonly open: () => Promise<DatabasePort>) {}

  private ready(): Promise<DatabasePort> {
    if (!this.database) {
      this.database = this.open().then(async (db) => {
        const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0) throw new StorageError('corrupt');
        if (version.user_version > 1) throw new StorageError('unsupported-schema');
        await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        if (version.user_version === 0) await db.withExclusiveTransactionAsync((txn) => txn.execAsync(schema));
        return db;
      }).catch((error: unknown) => {
        this.database = undefined;
        throw storageError(error);
      });
    }
    return this.database;
  }

  private decode<T extends RecordingDraft>(row: Row, decode: (body: string) => T): T {
    const value = decode(row.body);
    if (row.id !== value.id || row.project_id !== value.projectId) throw new CaptureError('invalid-data');
    return value;
  }

  async load(projectId: string): Promise<RecordingWorkspace> {
    validateId(projectId);
    const db = await this.ready();
    const pending = await db.getAllAsync<Row>('SELECT id, project_id, body FROM drafts WHERE project_id = ? ORDER BY rowid', projectId);
    const saved = await db.getAllAsync<Row>('SELECT id, project_id, body FROM recordings WHERE project_id = ? ORDER BY rowid', projectId);
    return { pending: pending.map((row) => this.decode(row, decodeDraft)), saved: saved.map((row) => this.decode(row, decodeRecording)) };
  }

  async checkpoint(input: RecordingDraft): Promise<void> {
    const draft = decodeDraft(JSON.stringify(input));
    const db = await this.ready();
    await db.withExclusiveTransactionAsync(async (txn) => {
      const saved = await txn.getFirstAsync<Row>('SELECT id, project_id, body FROM recordings WHERE id = ?', draft.id);
      if (saved) {
        this.decode(saved, decodeRecording);
        return; // A retry must not resurrect a committed pending row.
      }
      await txn.runAsync('INSERT INTO drafts (id, project_id, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body', draft.id, draft.projectId, JSON.stringify(draft));
    });
  }

  async commit(input: SavedRecording): Promise<SavedRecording> {
    const recording = decodeRecording(JSON.stringify(input));
    const db = await this.ready();
    let result = recording;
    await db.withExclusiveTransactionAsync(async (txn) => {
      const existing = await txn.getFirstAsync<Row>('SELECT id, project_id, body FROM recordings WHERE id = ?', recording.id);
      if (existing) {
        result = this.decode(existing, decodeRecording);
        if (JSON.stringify(result) !== JSON.stringify(recording)) throw new CaptureError('invalid-data');
        return;
      }
      const pending = await txn.getFirstAsync<Row>('SELECT id, project_id, body FROM drafts WHERE id = ?', recording.id);
      if (!pending || JSON.stringify(this.decode(pending, decodeDraft)) !== JSON.stringify(decodeDraft(JSON.stringify(recording)))) throw new CaptureError('invalid-data');
      await txn.runAsync('INSERT INTO recordings (id, project_id, body) VALUES (?, ?, ?)', recording.id, recording.projectId, JSON.stringify(recording));
      await txn.runAsync('DELETE FROM drafts WHERE id = ?', recording.id);
    });
    return result;
  }

  async cancelUnstarted(id: string): Promise<void> {
    const db = await this.ready();
    await db.withExclusiveTransactionAsync(async (txn) => {
      const row = await txn.getFirstAsync<Row>('SELECT id, project_id, body FROM drafts WHERE id = ?', id);
      if (!row) return;
      const draft = this.decode(row, decodeDraft);
      if (draft.events.length || draft.annotationFailures.length) throw new CaptureError('invalid-data');
      await txn.runAsync('DELETE FROM drafts WHERE id = ?', id);
    });
  }
}
