import { id } from '../../test/ids';
import { createProject } from './project';
import { ProjectStore } from './ProjectStore';
import type { ProjectOperation, ProjectRepository } from '../storage/ProjectRepository';
import { StorageError } from '../storage/StorageError';
import type { StorageErrorCode } from '../storage/StorageError';

function setup() {
  const repository: jest.Mocked<ProjectRepository> = {
    load: jest.fn().mockResolvedValue({ projects: [], pending: [] }),
    save: jest.fn().mockImplementation(async (op: ProjectOperation) => ({
      projects: [op.project],
      pending: [],
    })),
    discard: jest.fn().mockResolvedValue({ projects: [], pending: [] }),
  };
  const newId = jest.fn(() => id(2));
  return { repository, newId, store: new ProjectStore(repository, newId) };
}
beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
test('notifies, commits after success and retains frozen intent for same-ID retry', async () => {
  const { repository, store, newId } = setup();
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  await store.load();
  const project = createProject(id(1), 'Private');
  repository.save.mockRejectedValueOnce(new Error('private path'));
  expect(await store.submit(project, 0)).toBe(false);
  expect(store.getSnapshot()).toMatchObject({
    status: 'failed',
    error: 'unavailable',
    projects: [],
    attempted: { project, id: id(2) },
  });
  expect(await store.submit(project, 0)).toBe(false);
  expect(newId).toHaveBeenCalledTimes(1);
  expect(await store.retry()).toBe(true);
  expect(repository.save.mock.calls[0]?.[0]).toBe(repository.save.mock.calls[1]?.[0]);
  expect(store.getSnapshot()).toMatchObject({
    status: 'ready',
    error: null,
    attempted: null,
    projects: [project],
  });
  unsubscribe();
  const count = listener.mock.calls.length;
  await store.load();
  expect(listener).toHaveBeenCalledTimes(count);
});
test('guards overlapping calls and retains the last committed view during save', async () => {
  const { repository, store } = setup();
  const project = createProject(id(1), 'P');
  repository.load.mockResolvedValueOnce({ projects: [project], pending: [] });
  await store.load();
  let resolve!: (value: { projects: (typeof project)[]; pending: [] }) => void;
  repository.save.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const save = store.submit({ ...project, name: 'Next', revision: 2 }, 1);
  expect(store.getSnapshot()).toMatchObject({ status: 'saving', projects: [project] });
  expect(await store.load()).toBe(false);
  expect(await store.retry()).toBe(false);
  expect(await store.discard(id(2))).toBe(false);
  expect(await store.submit(project, 0)).toBe(false);
  resolve({ projects: [{ ...project, name: 'Next', revision: 2 }], pending: [] });
  expect(await save).toBe(true);
  expect(repository.save).toHaveBeenCalledTimes(1);
});
test('remount/load retries retained in-memory intent rather than losing an unstaged request', async () => {
  const { repository, store } = setup();
  await store.load();
  repository.save.mockRejectedValueOnce(new StorageError('unavailable'));
  await store.submit(createProject(id(1), 'P'), 0);
  expect(await store.load()).toBe(true);
  expect(repository.load).toHaveBeenCalledTimes(1);
  expect(repository.save.mock.calls[1]?.[0]).toBe(repository.save.mock.calls[0]?.[0]);
});
test('retains load/conflict failures and uses repository outcomes for explicit discard', async () => {
  const { repository, store } = setup();
  repository.load.mockRejectedValueOnce(new StorageError('corrupt'));
  expect(await store.retry()).toBe(false);
  expect(store.getSnapshot()).toMatchObject({ status: 'failed', error: 'corrupt' });
  expect(await store.load()).toBe(true);
  const op: ProjectOperation = {
    id: id(2),
    expectedRevision: 0,
    project: createProject(id(1), 'P'),
  };
  repository.load.mockResolvedValueOnce({ projects: [], pending: [op] });
  await store.load();
  expect(await store.submit(op.project, 0)).toBe(false);
  repository.save.mockRejectedValueOnce(new StorageError('conflict'));
  expect(await store.retry(op)).toBe(false);
  expect(store.getSnapshot().pending).toEqual([op]);
  expect(await store.discard(op.id)).toBe(true);
  expect(repository.discard).toHaveBeenCalledWith(op.id);
  expect(store.getSnapshot()).toMatchObject({ pending: [], attempted: null, status: 'ready' });
});
test('failed ID generation is retryable and diagnostics exclude names/errors', async () => {
  const { store, newId } = setup();
  const consoleLog = jest.spyOn(console, 'info');
  await store.load();
  newId.mockImplementationOnce(() => {
    throw new Error('private secret');
  });
  expect(await store.submit(createProject(id(1), 'PRIVATE NAME'), 0)).toBe(false);
  expect(store.getSnapshot()).toMatchObject({ attempted: null, error: 'unavailable' });
  expect(JSON.stringify(consoleLog.mock.calls)).not.toMatch(/PRIVATE|secret/);
  expect(consoleLog).toHaveBeenCalledWith({
    schemaVersion: 1,
    scope: 'app-shell',
    event: 'storage.failed',
  });
});

test('an unconfirmed discard stays a discard across retry/remount, never resurrecting its save intent', async () => {
  const { repository, store } = setup();
  await store.load();
  repository.save.mockRejectedValueOnce(new StorageError('unavailable'));
  await store.submit(createProject(id(1), 'Draft'), 0);
  repository.discard.mockRejectedValueOnce(new StorageError('unavailable'));
  expect(await store.discard(id(2))).toBe(false);
  expect(store.getSnapshot().discarding).toBe(id(2));
  expect(await store.load()).toBe(true);
  expect(repository.discard).toHaveBeenCalledTimes(2);
  expect(repository.save).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().discarding).toBeNull();
});

test('two pending requests cannot replace an unconfirmed discard, including across load retries', async () => {
  const { repository, store } = setup();
  const a = { id: id(2), expectedRevision: 0, project: createProject(id(1), 'A') };
  const b = { id: id(4), expectedRevision: 0, project: createProject(id(3), 'B') };
  repository.load.mockResolvedValueOnce({ projects: [], pending: [a, b] });
  await store.load();
  repository.discard
    .mockRejectedValueOnce(new StorageError('unavailable'))
    .mockRejectedValueOnce(new StorageError('unavailable'))
    .mockRejectedValueOnce(new StorageError('unavailable'))
    .mockResolvedValueOnce({ projects: [], pending: [b] });
  expect(await store.discard(a.id)).toBe(false);
  const unconfirmed = store.getSnapshot();
  expect(await store.discard(b.id)).toBe(false);
  expect(await store.retry(b)).toBe(false);
  expect(await store.submit(b.project, 0)).toBe(false);
  expect(store.getSnapshot()).toBe(unconfirmed);
  expect(repository.discard).toHaveBeenCalledTimes(1);
  expect(repository.save).not.toHaveBeenCalled();

  expect(await store.load()).toBe(false);
  expect(store.getSnapshot()).toMatchObject({ discarding: a.id, pending: [a, b] });
  expect(await store.retry(a)).toBe(false);
  expect(await store.retry(null)).toBe(true);
  expect(repository.discard.mock.calls).toEqual([[a.id], [a.id], [a.id], [a.id]]);
  expect(repository.load).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toMatchObject({ discarding: null, pending: [b], status: 'ready' });
  expect(await store.discard(b.id)).toBe(true);
  expect(repository.discard).toHaveBeenLastCalledWith(b.id);
  expect(store.getSnapshot().pending).toEqual([]);
});

test.each<[StorageErrorCode, string]>([
  ['unavailable', 'storage.unavailable'],
  ['corrupt', 'storage.corrupt'],
  ['unsupported-schema', 'storage.unsupported_schema'],
  ['conflict', 'storage.conflict'],
  ['operation-collision', 'storage.operation_collision'],
])('reports fixed %s diagnostic context without native error contents', async (code, event) => {
  const { repository, store } = setup();
  repository.load.mockRejectedValueOnce(new StorageError(code));
  await store.load();
  expect(console.info).toHaveBeenCalledWith({ schemaVersion: 1, scope: 'app-shell', event });
});
