import type { SQLiteDatabase } from 'expo-sqlite';
import type { DatabasePort } from '../src/storage/SqliteProjectRepository';

type ProjectRow = { id: string; revision: number; body: string };
type OperationRow = { id: string; payload: string; completed: number };
export type Fault =
  | 'stage'
  | 'project'
  | 'complete'
  | 'stage-commit'
  | 'apply-commit'
  | 'snapshot'
  | 'outcome'
  | 'schema';

// Controlled unit double, not SQLite. Copies model rollback; a committed state
// followed by rejection models an ambiguous native result.
export class TransactionDatabase implements DatabasePort {
  projects = new Map<string, ProjectRow>();
  operations = new Map<string, OperationRow>();
  version = 0;
  faults: Fault[] = [];
  calls: { sql: string; params: unknown[]; transaction: boolean }[] = [];
  private inTransaction = false;
  private fail(fault: Fault): void {
    if (this.faults[0] === fault) {
      this.faults.shift();
      throw new Error('private native failure /path/to/data');
    }
  }
  private record(sql: string, params: unknown[]) {
    this.calls.push({ sql, params, transaction: this.inTransaction });
  }
  async execAsync(sql: string): Promise<void> {
    this.record(sql, []);
    if (sql.includes('CREATE TABLE')) {
      this.fail('schema');
      this.version = 1;
    }
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    this.record(sql, params);
    if (sql === 'PRAGMA user_version') return { user_version: this.version } as T;
    if (!this.inTransaction) this.fail('outcome');
    const key = String(params[0]);
    if (sql.includes('FROM operations WHERE id'))
      return (this.operations.get(key) ?? null) as T | null;
    if (sql.includes('FROM projects WHERE id')) return (this.projects.get(key) ?? null) as T | null;
    throw new Error('Unrecognized unit query');
  }
  async getAllAsync<T>(sql: string): Promise<T[]> {
    this.record(sql, []);
    this.fail('snapshot');
    if (sql.includes('FROM projects ORDER BY rowid')) return [...this.projects.values()] as T[];
    if (sql.includes('FROM operations WHERE completed = 0 ORDER BY rowid'))
      return [...this.operations.values()].filter((row) => row.completed === 0) as T[];
    throw new Error('Unrecognized unit query');
  }
  async runAsync(sql: string, ...params: unknown[]) {
    this.record(sql, params);
    if (!this.inTransaction) throw new Error('Writes require the supplied transaction');
    const key = String(params[0]);
    if (sql.startsWith('INSERT INTO operations')) {
      this.fail('stage');
      if (this.operations.has(key)) throw new Error('duplicate key');
      this.operations.set(key, { id: key, payload: String(params[1]), completed: 0 });
    } else if (sql.startsWith('INSERT INTO projects')) {
      this.fail('project');
      this.projects.set(key, { id: key, revision: Number(params[1]), body: String(params[2]) });
    } else if (sql.startsWith('UPDATE operations SET completed = 1')) {
      this.fail('complete');
      const operation = this.operations.get(key);
      if (!operation) throw new Error('missing operation');
      this.operations.set(key, { ...operation, completed: 1 });
    } else if (sql.startsWith('DELETE FROM operations WHERE id = ? AND completed = 0')) {
      if (this.operations.get(key)?.completed === 0) this.operations.delete(key);
    } else throw new Error('Unrecognized unit mutation');
    return { lastInsertRowId: 1, changes: 1 };
  }
  async withExclusiveTransactionAsync(task: (txn: SQLiteDatabase) => Promise<void>): Promise<void> {
    const projects = new Map(this.projects);
    const operations = new Map(this.operations);
    const version = this.version;
    this.inTransaction = true;
    try {
      await task(this as unknown as SQLiteDatabase);
    } catch (error) {
      this.projects = projects;
      this.operations = operations;
      this.version = version;
      throw error;
    } finally {
      this.inTransaction = false;
    }
    if ([...this.projects.values()].some((row) => projects.get(row.id)?.revision !== row.revision))
      this.fail('apply-commit');
    if (this.operations.size > operations.size) this.fail('stage-commit');
  }
}
