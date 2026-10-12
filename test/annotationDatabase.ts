import type { DatabasePort } from '../src/storage/SqliteProjectRepository';

type Row = { recording_id: string; revision: number; body: string };
// Unit double for statement binding and transaction acknowledgement; not SQLite.
export class AnnotationDatabase implements DatabasePort {
  version: number | null = 0;
  rows = new Map<string, Row>();
  fault: 'schema' | 'read' | 'write' | 'after-commit' | null = null;
  transaction = false;
  writes: unknown[][] = [];
  async execAsync(sql: string): Promise<void> {
    if (sql.includes('CREATE TABLE')) {
      if (this.fault === 'schema') throw new Error('private schema error');
      this.version = 1;
    }
  }
  async getFirstAsync<T>(sql: string, ...values: unknown[]): Promise<T | null> {
    if (sql === 'PRAGMA user_version') return this.version === null ? null : { user_version: this.version } as T;
    if (this.fault === 'read') throw new Error('private read error');
    return this.rows.get(values[0] as string) as T ?? null;
  }
  async getAllAsync<T>(): Promise<T[]> { throw new Error('Unexpected list'); }
  async runAsync(_sql: string, ...values: unknown[]): Promise<{ lastInsertRowId: number; changes: number }> {
    if (!this.transaction) throw new Error('Write outside transaction');
    if (this.fault === 'write') throw new Error('private write error');
    const [recording_id, revision, body] = values as [string, number, string];
    this.writes.push(values); this.rows.set(recording_id, { recording_id, revision, body });
    return { lastInsertRowId: 1, changes: 1 };
  }
  async withExclusiveTransactionAsync(action: Parameters<DatabasePort['withExclusiveTransactionAsync']>[0]): Promise<void> {
    const rows = new Map(this.rows), version = this.version;
    this.transaction = true;
    try { await action(this as unknown as Parameters<typeof action>[0]); }
    catch (error) { this.rows = rows; this.version = version; throw error; }
    finally { this.transaction = false; }
    if (this.fault === 'after-commit') throw new Error('Commit applied before acknowledgement failed');
  }
}
