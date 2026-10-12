import { AnnotationDatabase } from '../../test/annotationDatabase';
import { deferred } from '../../test/captureFixture';
import { id } from '../../test/ids';
import { savedRecord } from '../../test/reviewFixture';
import { editInterval, originalAnnotations } from './annotations';
import { SqliteAnnotationRepository } from './SqliteAnnotationRepository';

function fixture() {
  const db = new AnnotationDatabase(); const open = jest.fn(async () => db);
  const record = savedRecord(); const original = originalAnnotations(record);
  const changed = editInterval(record, original, { ...original.intervals[0]!, startMs: 0 });
  return { db, open, record, original, changed, repository: new SqliteAnnotationRepository(open) };
}
test('absent sidecar uses original capture; an explicitly saved empty list persists as all deleted', async () => {
  const f = fixture(); const capture = JSON.stringify(f.record);
  expect(await f.repository.load(f.record)).toEqual(f.original);
  const saved = await f.repository.save(f.record, 0, { ...f.original, intervals: [] });
  expect(saved).toMatchObject({ revision: 1, intervals: [] });
  expect(await f.repository.load(f.record)).toEqual(saved);
  expect(JSON.stringify(f.record)).toBe(capture);
  expect(f.db.writes[0]).toEqual([f.record.id, 1, JSON.stringify(saved)]);
  expect(await f.repository.load(savedRecord(id(11)))).toMatchObject({ revision: 0, intervals: f.original.intervals });
});
test('coalesces opening, uses supported schema without migration and freezes input before awaiting storage', async () => {
  const f = fixture(); f.db.version = 1;
  const opening = deferred<AnnotationDatabase>(); f.open.mockReturnValueOnce(opening.promise);
  const input = { ...f.changed, intervals: [...f.changed.intervals] };
  const saving = f.repository.save(f.record, 0, input); input.intervals.length = 0;
  const loading = f.repository.load(f.record);
  expect(f.open).toHaveBeenCalledTimes(1);
  const exec = jest.spyOn(f.db, 'execAsync'); opening.resolve(f.db);
  const result = await saving; await loading;
  expect(result.intervals).toEqual(f.changed.intervals);
  expect(exec.mock.calls).toEqual([['PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;']]);
});
test('rollback preserves last good annotations; retry and commit-before-rejection do not apply twice', async () => {
  const f = fixture(); const saved = await f.repository.save(f.record, 0, f.original);
  f.db.fault = 'write'; await expect(f.repository.save(f.record, 1, f.changed)).rejects.toThrow();
  f.db.fault = null; expect(await f.repository.load(f.record)).toEqual(saved);
  f.db.fault = 'after-commit'; await expect(f.repository.save(f.record, 1, f.changed)).rejects.toThrow();
  f.db.fault = null; const result = await f.repository.save(f.record, 1, f.changed);
  expect(result).toMatchObject({ revision: 2, intervals: f.changed.intervals });
  expect(f.db.rows.size).toBe(1); expect(f.db.writes).toHaveLength(2);
  await expect(f.repository.save(f.record, 1, f.original)).rejects.toThrow('conflict');
  expect(await f.repository.load(f.record)).toEqual(result);
});
test.each([null, -1, 0.5, 2])('rejects invalid/newer schema %s and retries initialization without resetting records', async (version) => {
  const f = fixture(); f.db.version = version;
  await expect(f.repository.load(f.record)).rejects.toThrow(version === 2 ? 'unsupported-schema' : 'corrupt');
  expect(f.db.version).toBe(version);
  f.db.version = 0; await f.repository.load(f.record);
  expect(f.open).toHaveBeenCalledTimes(2);
});
test('open/migration/read failures remain explicit; failed migration is retried and a read never falls back', async () => {
  const f = fixture(); f.open.mockRejectedValueOnce(new Error('secret native error'));
  await expect(f.repository.load(f.record)).rejects.toThrow('unavailable');
  f.db.fault = 'schema'; await expect(f.repository.load(f.record)).rejects.toThrow('unavailable');
  expect(f.db.version).toBe(0);
  f.db.fault = null; await f.repository.save(f.record, 0, f.changed);
  f.db.fault = 'read'; await expect(f.repository.load(f.record)).rejects.toThrow();
  expect(f.db.rows.size).toBe(1);
});
test('corrupt bodies, identity/revision mismatches and invalid submissions never overwrite committed data', async () => {
  const f = fixture(); await f.repository.save(f.record, 0, f.changed);
  const row = f.db.rows.get(f.record.id)!;
  for (const patch of [{ body: 'secret invalid JSON' }, { recording_id: id(11) }, { revision: 0 }, { body: JSON.stringify({ ...f.changed, revision: 0 }) }]) {
    f.db.rows.set(f.record.id, { ...row, ...patch });
    await expect(f.repository.load(f.record)).rejects.toThrow('corrupt');
    await expect(f.repository.save(f.record, 1, f.changed)).rejects.toThrow('corrupt');
  }
  f.db.rows.set(f.record.id, row);
  for (const expected of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await expect(f.repository.save(f.record, expected, f.original)).rejects.toThrow('corrupt');
  await expect(f.repository.save(f.record, 1, { ...f.original, recordingId: id(11) })).rejects.toThrow('corrupt');
  await expect(f.repository.save(f.record, 3, f.original)).rejects.toThrow('conflict');
  expect(f.db.rows.get(f.record.id)).toBe(row);
});
