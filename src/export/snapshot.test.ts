import { exportFixture } from '../../test/exportFixture';
import { deferred } from '../../test/captureFixture';
import { annotations, originalAnnotations } from '../review/annotations';
import { snapshotExport } from './snapshot';
import { ExportError } from './ExportError';

test('loads only selected committed annotations/media; project snapshot preserves pending inventory and all saved videos', async () => {
  const f = exportFixture(); f.documents.set(f.record.id, annotations(f.record, 1, []));
  const selected = await snapshotExport(f.project, { kind: 'recording', recordingId: f.record.id }, f.workspace, f.repository, f.resolve, () => false);
  expect(selected.document.recordings[0]?.effective).toMatchObject({ revision: 1, intervals: [] });
  expect(selected.document.pendingRecordings).toEqual([]); expect(f.repository.load).toHaveBeenCalledTimes(1); expect(f.resolve).toHaveBeenCalledTimes(1);
  const all = await snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => false);
  expect(all.document.recordings).toHaveLength(2); expect(all.document.pendingRecordings).toHaveLength(1);
  expect(all.media.map((media) => [media.filename, media.byteSize])).toEqual(f.workspace.saved.map((record) => [`${record.id}.mov`, record.byteSize]));
  expect(Object.isFrozen(all.media)).toBe(true); expect(all.json).not.toContain('file:///');
});
test('a failed annotation/media read rejects the entire package, never falls back or silently skips a saved video', async () => {
  const f = exportFixture(); f.repository.load.mockRejectedValueOnce(new Error('/private/data'));
  await expect(snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => false)).rejects.toThrow('source-unavailable');
  expect(f.resolve).not.toHaveBeenCalled(); f.resolve.mockRejectedValueOnce(new Error('/private/media'));
  await expect(snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => false)).rejects.toThrow('source-unavailable');
  f.repository.load.mockRejectedValueOnce(new ExportError('invalid-export'));
  await expect(snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => false)).rejects.toThrow('invalid-export');
});
test('accepted cancellation between source awaits does not continue to media or the next recording', async () => {
  const f = exportFixture(); let cancelled = true;
  await expect(snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => cancelled)).rejects.toThrow('cancelled');
  expect(f.repository.load).not.toHaveBeenCalled(); cancelled = false;
  const reading = deferred<ReturnType<typeof originalAnnotations>>(); f.repository.load.mockReturnValueOnce(reading.promise);
  const work = snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => cancelled);
  cancelled = true; reading.resolve(originalAnnotations(f.record)); await expect(work).rejects.toThrow('cancelled'); expect(f.resolve).not.toHaveBeenCalled();
  cancelled = false; const uri = deferred<string>(); f.resolve.mockReturnValueOnce(uri.promise);
  const media = snapshotExport(f.project, { kind: 'project' }, f.workspace, f.repository, f.resolve, () => cancelled);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); cancelled = true; uri.resolve('file:///private/video.mov');
  await expect(media).rejects.toThrow('cancelled');
});
