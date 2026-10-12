import { captureFixture } from '../../test/captureFixture';
import { id } from '../../test/ids';
import { RecordingDatabase } from '../../test/recordingDatabase';
import { createRecordingDraft, finalizeRecording } from './recording';
import { SqliteRecordingRepository } from './SqliteRecordingRepository';

function fixture() {
  const db = new RecordingDatabase();
  const open = jest.fn().mockResolvedValue(db);
  const repository = new SqliteRecordingRepository(open);
  const draft = createRecordingDraft(id(10), captureFixture().project, 'back', 'mov');
  const ended = { ...draft, termination: 'stopped' as const };
  const recording = finalizeRecording(ended, { durationMs: 1000, byteSize: 123 });
  return { db, open, repository, draft, ended, recording };
}
test('initializes once, persists private values as parameters, and commits recording plus pending deletion together', async () => {
  const f = fixture();
  expect(await f.repository.load(f.draft.projectId)).toEqual({ pending: [], saved: [] });
  expect(f.db.version).toBe(1);
  await f.repository.checkpoint(f.ended);
  expect((await f.repository.load(f.draft.projectId)).pending).toEqual([f.ended]);
  expect(await f.repository.commit(f.recording)).toEqual(f.recording);
  expect(await f.repository.load(f.draft.projectId)).toEqual({ pending: [], saved: [f.recording] });
  expect(f.open).toHaveBeenCalledTimes(1);
  expect(f.db.calls.every((call) => call.transactional && !call.sql.includes('Private project'))).toBe(true);
  expect(f.db.calls[0]?.values).toEqual([f.draft.id, f.draft.projectId, JSON.stringify(f.ended)]);
  await f.repository.checkpoint(f.ended);
  expect(f.db.drafts.size).toBe(0);
  expect(await f.repository.commit(f.recording)).toEqual(f.recording);
  expect(f.db.recordings.size).toBe(1);
});
test('checkpoint replaces the same draft, snapshots input before asynchronous opening and preserves project filtering', async () => {
  const f = fixture();
  const editable = { ...f.draft, labels: f.draft.labels.map((label) => ({ ...label })) };
  const checkpoint = f.repository.checkpoint(editable);
  editable.labels[0]!.name = 'Later';
  await checkpoint;
  expect((await f.repository.load(f.draft.projectId)).pending[0]?.labels[0]?.name).toBe('A');
  await f.repository.checkpoint(f.ended);
  expect(f.db.drafts.size).toBe(1);
  expect((await f.repository.load(f.draft.projectId)).pending[0]?.termination).toBe('stopped');
  expect(await f.repository.load(id(99))).toEqual({ pending: [], saved: [] });
});
test.each(['insert', 'delete'] as const)('failed %s rolls back without losing the pending draft or committing partial metadata', async (fault) => {
  const f = fixture(); await f.repository.checkpoint(f.ended);
  f.db.fault = fault;
  await expect(f.repository.commit(f.recording)).rejects.toThrow();
  expect(f.db.recordings.size).toBe(0);
  expect(f.db.drafts.size).toBe(1);
  f.db.fault = null;
  expect(await f.repository.commit(f.recording)).toEqual(f.recording);
});
test('ambiguous transaction completion is same-ID retryable without resurrecting the draft or duplicating a recording', async () => {
  const f = fixture(); await f.repository.checkpoint(f.ended);
  f.db.fault = 'after-commit';
  await expect(f.repository.commit(f.recording)).rejects.toThrow();
  expect(f.db.recordings.size).toBe(1);
  expect(f.db.drafts.size).toBe(0);
  f.db.fault = null;
  await f.repository.checkpoint(f.ended);
  expect(f.db.drafts.size).toBe(0);
  expect(await f.repository.commit(f.recording)).toEqual(f.recording);
});
test('failed checkpoint preserves the earlier draft and does not poison later operations', async () => {
  const f = fixture(); await f.repository.checkpoint(f.draft);
  f.db.fault = 'checkpoint';
  await expect(f.repository.checkpoint(f.ended)).rejects.toThrow();
  f.db.fault = null;
  expect((await f.repository.load(f.draft.projectId)).pending).toEqual([f.draft]);
  await f.repository.checkpoint(f.ended);
  expect((await f.repository.load(f.draft.projectId)).pending).toEqual([f.ended]);
});
test.each([null, -1, 0.5, 2])('missing/invalid/newer schema %s is rejected before changing data', async (version) => {
  const f = fixture(); f.db.version = version;
  await expect(f.repository.load(f.draft.projectId)).rejects.toThrow(version === 2 ? 'unsupported-schema' : 'corrupt');
  expect(f.db.version).toBe(version);
  expect(f.db.calls).toEqual([]);
  f.db.version = 0;
  await f.repository.load(f.draft.projectId);
  expect(f.open).toHaveBeenCalledTimes(2);
});
test('initial open/schema failure retries; schema migration rollback and read failure do not reset data', async () => {
  const f = fixture(); f.open.mockRejectedValueOnce(new Error('secret native error'));
  await expect(f.repository.load(f.draft.projectId)).rejects.toThrow('unavailable');
  f.db.fault = 'schema';
  await expect(f.repository.load(f.draft.projectId)).rejects.toThrow('unavailable');
  expect(f.db.version).toBe(0);
  f.db.fault = null;
  await f.repository.checkpoint(f.ended);
  f.db.fault = 'snapshot';
  await expect(f.repository.load(f.draft.projectId)).rejects.toThrow();
  expect(f.db.drafts.size).toBe(1);
});
test('corrupt rows and identity/body mismatches are surfaced without replacing data', async () => {
  const f = fixture(); await f.repository.checkpoint(f.ended);
  const row = f.db.drafts.get(f.draft.id)!;
  for (const patch of [{ body: 'secret invalid JSON' }, { id: id(11) }, { body: JSON.stringify({ ...f.ended, projectId: id(99) }) }]) {
    f.db.drafts.set(f.draft.id, { ...row, ...patch });
    await expect(f.repository.load(f.draft.projectId)).rejects.toThrow('invalid-data');
  }
  f.db.drafts.set(f.draft.id, row);
  await f.repository.commit(f.recording);
  f.db.recordings.set(f.draft.id, { ...f.db.recordings.get(f.draft.id)!, id: id(11) });
  await expect(f.repository.checkpoint(f.ended)).rejects.toThrow('invalid-data');
  await expect(f.repository.commit(f.recording)).rejects.toThrow('invalid-data');
});
test('commit requires a matching staged payload and never overwrites a different completed result', async () => {
  const f = fixture();
  await expect(f.repository.commit(f.recording)).rejects.toThrow('invalid-data');
  await f.repository.checkpoint(f.draft);
  await expect(f.repository.commit(f.recording)).rejects.toThrow('invalid-data');
  await f.repository.checkpoint(f.ended); await f.repository.commit(f.recording);
  await expect(f.repository.commit({ ...f.recording, durationMs: 2000 })).rejects.toThrow('invalid-data');
  expect((await f.repository.load(f.draft.projectId)).saved).toEqual([f.recording]);
  await expect(f.repository.load('bad')).rejects.toThrow('invalid-id');
});
test('cancellation deletes only its empty unstarted draft; missing/previously cancelled is idempotent and annotations remain protected', async () => {
  const f = fixture(); await f.repository.checkpoint(f.draft);
  await f.repository.cancelUnstarted(f.draft.id);
  await f.repository.cancelUnstarted(f.draft.id);
  expect(f.db.drafts.size).toBe(0);
  await f.repository.checkpoint({ ...f.draft, events: [{ labelId: id(2), mediaMs: 100, source: 'avcapture-recorded-duration' }] });
  await expect(f.repository.cancelUnstarted(f.draft.id)).rejects.toThrow('invalid-data');
  expect(f.db.drafts.size).toBe(1);
  await f.repository.checkpoint({ ...f.draft, annotationFailures: [{ labelId: id(2), afterEvent: 0, reason: 'clock-unavailable' }] });
  await expect(f.repository.cancelUnstarted(f.draft.id)).rejects.toThrow('invalid-data');
  expect((await f.repository.load(f.draft.projectId)).pending[0]?.annotationFailures).toHaveLength(1);
});

test('an existing supported schema is read without rerunning its migration or replacing saved records', async () => {
  const f = fixture(); f.db.version = 1;
  f.db.recordings.set(f.recording.id, { id: f.recording.id, project_id: f.recording.projectId, body: JSON.stringify(f.recording) });
  const exec = jest.spyOn(f.db, 'execAsync');
  expect(await f.repository.load(f.draft.projectId)).toEqual({ pending: [], saved: [f.recording] });
  expect(exec.mock.calls).toEqual([['PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;']]);
});
