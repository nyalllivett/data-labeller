import { id } from '../../test/ids';
import { TransactionDatabase, type Fault } from '../../test/transactionDatabase';
import { createProject, renameProject } from '../projects/project';
import { decodeOperation, type ProjectOperation, validateOperation } from './ProjectRepository';
import { SqliteProjectRepository } from './SqliteProjectRepository';
import { StorageError, storageError } from './StorageError';

const operation = (): ProjectOperation => ({
  id: id(2),
  expectedRevision: 0,
  project: createProject(id(1), 'Private project'),
});
function setup() {
  const db = new TransactionDatabase();
  const open = jest.fn(async () => db);
  return { db, open, repo: new SqliteProjectRepository(open) };
}
test('initializes, binds values, persists/relaunches and reuses completed requests', async () => {
  const { db, open, repo } = setup();
  expect(await repo.load()).toEqual({ projects: [], pending: [] });
  const op = operation();
  expect(await repo.save(op)).toEqual({ projects: [op.project], pending: [] });
  expect(await repo.save(op)).toEqual({ projects: [op.project], pending: [] });
  expect(db.operations.size).toBe(1);
  expect(db.projects.size).toBe(1);
  expect(open).toHaveBeenCalledTimes(1);
  expect(await new SqliteProjectRepository(async () => db).load()).toEqual({
    projects: [op.project],
    pending: [],
  });
  expect(
    db.calls
      .filter((call) => call.sql.startsWith('INSERT') || call.sql.startsWith('UPDATE'))
      .every((call) => call.transaction),
  ).toBe(true);
  expect(db.calls.every((call) => !call.sql.includes(op.project.name))).toBe(true);
  expect(db.calls.some((call) => call.sql.includes('synchronous = FULL'))).toBe(true);
});
test.each<Fault>(['stage', 'project', 'complete', 'stage-commit'])(
  'retains data and retries after %s',
  async (fault) => {
    const { db, repo } = setup();
    await repo.load();
    db.faults = [fault];
    await expect(repo.save(operation())).rejects.toEqual(new StorageError('unavailable'));
    expect(db.projects.size).toBe(0);
    if (fault !== 'stage') expect(db.operations.get(id(2))?.completed).toBe(0);
    expect((await repo.save(operation())).projects).toEqual([operation().project]);
    expect(db.projects.size).toBe(1);
  },
);
test('reconciles commit-then-rejection without duplication', async () => {
  const { db, repo } = setup();
  db.faults = ['apply-commit'];
  expect((await repo.save(operation())).projects).toEqual([operation().project]);
  expect(db.operations.get(id(2))?.completed).toBe(1);
  expect(db.projects.size).toBe(1);
});
test('keeps unknown outcome retryable when reconciliation cannot read', async () => {
  const { db, repo } = setup();
  db.faults = ['apply-commit', 'outcome'];
  await expect(repo.save(operation())).rejects.toEqual(new StorageError('unavailable'));
  expect(db.projects.size).toBe(1);
  expect((await repo.save(operation())).projects).toEqual([operation().project]);
});
test('recovers successful commit followed by snapshot failure', async () => {
  const { db, repo } = setup();
  db.faults = ['snapshot'];
  await expect(repo.save(operation())).rejects.toEqual(new StorageError('unavailable'));
  expect(db.operations.get(id(2))?.completed).toBe(1);
  expect((await repo.save(operation())).projects).toEqual([operation().project]);
});
test('relaunch resumes staged intent and reconciliation is idempotent', async () => {
  const { db, repo } = setup();
  db.faults = ['project'];
  await expect(repo.save(operation())).rejects.toThrow('unavailable');
  const relaunched = new SqliteProjectRepository(async () => db);
  expect((await relaunched.load()).projects).toEqual([operation().project]);
  expect(await relaunched.load()).toEqual({ projects: [operation().project], pending: [] });
});
test('rejects ID collisions and retains conflicts until explicit resolution', async () => {
  const { db, repo } = setup();
  const initial = operation();
  await repo.save(initial);
  await expect(
    repo.save({ ...initial, project: { ...initial.project, name: 'Other' } }),
  ).rejects.toThrow('operation-collision');
  const updated = renameProject(initial.project, 'Latest');
  await repo.save({ id: id(3), expectedRevision: 1, project: updated });
  const stale = {
    id: id(4),
    expectedRevision: 1,
    project: renameProject(initial.project, 'Stale'),
  };
  await expect(repo.save(stale)).rejects.toThrow('conflict');
  expect(await repo.load()).toEqual({ projects: [updated], pending: [stale] });
  expect((await repo.save(initial)).projects).toEqual([updated]);
  expect(await repo.discard(stale.id)).toEqual({ projects: [updated], pending: [] });
  await repo.discard(initial.id);
  expect(db.operations.get(initial.id)?.completed).toBe(1);
  expect(db.projects.size).toBe(1);
});
test('serializes writes and does not poison the queue after failure', async () => {
  const { db, repo } = setup();
  const second = { id: id(5), expectedRevision: 0, project: createProject(id(6), 'Second') };
  db.faults = ['stage'];
  const results = await Promise.allSettled([repo.save(operation()), repo.save(second)]);
  expect(results[0]?.status).toBe('rejected');
  expect(results[1]?.status).toBe('fulfilled');
  expect((await repo.load()).projects).toEqual([second.project]);
});
test('retries migration without reset and never modifies future schemas', async () => {
  const { db, repo, open } = setup();
  db.faults = ['schema'];
  await expect(repo.load()).rejects.toThrow('unavailable');
  expect(db.version).toBe(0);
  await repo.load();
  expect(open).toHaveBeenCalledTimes(2);
  const newer = new TransactionDatabase();
  newer.version = 2;
  await expect(new SqliteProjectRepository(async () => newer).load()).rejects.toThrow(
    'unsupported-schema',
  );
  expect(newer.calls).toHaveLength(1);
});
test('rejects corrupt rows/operations/revisions instead of presenting an empty database', async () => {
  const { db, repo } = setup();
  db.projects.set(id(1), { id: id(1), revision: 1, body: 'private invalid JSON' });
  await expect(repo.load()).rejects.toThrow('corrupt');
  db.projects.set(id(1), { id: id(1), revision: 2, body: JSON.stringify(operation().project) });
  await expect(repo.load()).rejects.toThrow('corrupt');
  db.projects.clear();
  db.operations.set(id(2), { id: id(2), payload: 'bad JSON', completed: 0 });
  await expect(repo.load()).rejects.toThrow('corrupt');
  expect(() => decodeOperation('null')).toThrow('corrupt');
  expect(() => validateOperation({ ...operation(), expectedRevision: 2 })).toThrow('corrupt');
  expect(() => validateOperation({ ...operation(), id: 'bad' })).toThrow('corrupt');
  expect(storageError(new Error('private'))).toEqual(new StorageError('unavailable'));
  const safe = new StorageError('conflict');
  expect(storageError(safe)).toBe(safe);
});

test.each([-1, NaN, 1.5])('rejects invalid schema version %s before writing', async (version) => {
  const db = new TransactionDatabase();
  db.version = version;
  await expect(new SqliteProjectRepository(async () => db).load()).rejects.toThrow('corrupt');
  expect(db.calls).toHaveLength(1);
});

test('rejects missing schema information and corrupt journal identities/status', async () => {
  const missing = new TransactionDatabase();
  jest.spyOn(missing, 'getFirstAsync').mockResolvedValueOnce(null);
  await expect(new SqliteProjectRepository(async () => missing).load()).rejects.toThrow('corrupt');
  const { db, repo } = setup();
  db.operations.set(id(9), { id: id(9), payload: JSON.stringify(operation()), completed: 0 });
  await expect(repo.load()).rejects.toThrow('corrupt');
  db.operations.clear();
  db.operations.set(id(2), { id: id(2), payload: JSON.stringify(operation()), completed: 2 });
  await expect(repo.save(operation())).rejects.toThrow('corrupt');
});

test('a missing staged operation fails safely without fabricating a project', async () => {
  const { db, repo } = setup();
  await repo.load();
  const transaction = db.withExclusiveTransactionAsync.bind(db);
  let calls = 0;
  jest.spyOn(db, 'withExclusiveTransactionAsync').mockImplementation(async (task) => {
    await transaction(task);
    if (++calls === 1) db.operations.clear();
  });
  await expect(repo.save(operation())).rejects.toThrow('corrupt');
  expect(db.projects.size).toBe(0);
});

test('a modified staged payload is a collision, and failed relaunch reconciliation stays recoverable', async () => {
  const { db, repo } = setup();
  db.faults = ['project'];
  await expect(repo.save(operation())).rejects.toThrow('unavailable');
  db.faults = ['apply-commit'];
  await expect(repo.load()).rejects.toThrow('unavailable');
  expect((await repo.load()).projects).toEqual([operation().project]);
  const next = {
    id: id(4),
    expectedRevision: 1,
    project: renameProject(operation().project, 'Next'),
  };
  const transaction = db.withExclusiveTransactionAsync.bind(db);
  let calls = 0;
  jest.spyOn(db, 'withExclusiveTransactionAsync').mockImplementation(async (task) => {
    await transaction(task);
    if (++calls === 1)
      db.operations.set(next.id, {
        id: next.id,
        payload: JSON.stringify({ ...next, project: { ...next.project, name: 'Other' } }),
        completed: 0,
      });
  });
  await expect(repo.save(next)).rejects.toThrow('operation-collision');
  expect(db.projects.get(id(1))?.revision).toBe(1);
});

test('freezes submitted values before asynchronous initialization and rejects invalid input without opening', async () => {
  const { db, repo, open } = setup();
  const input = operation();
  const save = repo.save(input);
  (input.project as { name: string }).name = 'Changed after submission';
  expect((await save).projects[0]?.name).toBe('Private project');
  const frozen = validateOperation(operation());
  expect(Object.isFrozen(frozen)).toBe(true);
  expect(Object.isFrozen(frozen.project)).toBe(true);
  expect(Object.isFrozen(frozen.project.labels)).toBe(true);
  const fresh = new SqliteProjectRepository(open);
  const count = open.mock.calls.length;
  await expect(fresh.save({ ...operation(), expectedRevision: -1 })).rejects.toThrow('corrupt');
  expect(open).toHaveBeenCalledTimes(count);
  expect(db.projects.size).toBe(1);
});
