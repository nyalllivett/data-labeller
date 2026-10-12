import type { DatabasePort } from '../src/storage/SqliteProjectRepository';

type Row = { id: string; project_id: string; body: string };
// Controlled transactional double. It models rollback/commit acknowledgement,
// not SQLite, filesystem behavior or an integration with either platform.
export class RecordingDatabase implements DatabasePort {
  version: number | null = 0;
  drafts = new Map<string, Row>();
  recordings = new Map<string, Row>();
  inTransaction = false;
  fault: 'schema' | 'checkpoint' | 'insert' | 'delete' | 'after-commit' | 'snapshot' | null = null;
  calls: { sql: string; values: unknown[]; transactional: boolean }[] = [];

  async execAsync(sql: string): Promise<void> {
    if (sql.includes('CREATE TABLE')) {
      if (this.fault === 'schema') throw new Error('private schema failure');
      this.version = 1;
    }
  }
  async getFirstAsync<T>(sql: string, ...values: unknown[]): Promise<T | null> {
    if (sql === 'PRAGMA user_version') return this.version === null ? null : { user_version: this.version } as T;
    if (sql.includes('FROM recordings')) return this.recordings.get(values[0] as string) as T ?? null;
    if (sql.includes('FROM drafts')) return this.drafts.get(values[0] as string) as T ?? null;
    throw new Error('Unexpected SELECT');
  }
  async getAllAsync<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    if (this.fault === 'snapshot') throw new Error('private snapshot failure');
    const rows = sql.includes('FROM drafts') ? this.drafts : this.recordings;
    return [...rows.values()].filter((row) => row.project_id === values[0]) as T[];
  }
  async runAsync(sql: string, ...values: unknown[]): Promise<{ lastInsertRowId: number; changes: number }> {
    if (!this.inTransaction) throw new Error('Write outside supplied transaction');
    this.calls.push({ sql, values, transactional: true });
    const [id, project_id, body] = values as string[];
    if (sql.startsWith('INSERT INTO drafts')) {
      if (this.fault === 'checkpoint') throw new Error('private checkpoint failure');
      this.drafts.set(id!, { id: id!, project_id: project_id!, body: body! });
    } else if (sql.startsWith('INSERT INTO recordings')) {
      if (this.fault === 'insert') throw new Error('private insert failure');
      this.recordings.set(id!, { id: id!, project_id: project_id!, body: body! });
    } else if (sql.startsWith('DELETE FROM drafts')) {
      if (this.fault === 'delete') throw new Error('private delete failure');
      this.drafts.delete(id!);
    } else throw new Error('Unexpected write');
    return { lastInsertRowId: 1, changes: 1 };
  }
  async withExclusiveTransactionAsync(action: Parameters<DatabasePort['withExclusiveTransactionAsync']>[0]): Promise<void> {
    const drafts = new Map(this.drafts), recordings = new Map(this.recordings), version = this.version;
    this.inTransaction = true;
    try { await action(this as unknown as Parameters<typeof action>[0]); }
    catch (error) { this.drafts = drafts; this.recordings = recordings; this.version = version; throw error; }
    finally { this.inTransaction = false; }
    if (this.fault === 'after-commit') throw new Error('Commit applied before promise rejected');
  }
}
