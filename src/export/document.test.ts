import { createRecordingDraft, finalizeRecording, toggleLabel } from '../capture/recording';
import { changeLabel, renameProject } from '../projects/project';
import { annotations, originalAnnotations } from '../review/annotations';
import { exportFixture } from '../../test/exportFixture';
import { id } from '../../test/ids';
import { decodeExport, encodeExport, exportDocument } from './document';

function fixture() {
  const f = exportFixture();
  const entries = f.workspace.saved.map((record) => ({ videoFile: `${record.id}.mov`, originalCapture: record, effective: originalAnnotations(record) }));
  const make = () => exportDocument(f.project, { kind: 'project' }, entries, [f.pending]);
  return { ...f, entries, make };
}
test('JSON explicitly links media, source identities, committed edits and original evidence without mutating sources', () => {
  const f = fixture(); const before = JSON.stringify(f.workspace);
  const project = changeLabel(renameProject(f.project, 'Current name'), id(2), { name: 'Renamed', archived: true });
  f.entries[0]!.effective = annotations(f.record, 2, [{ id: 0, labelId: id(3), startMs: 0, endMs: 1000 }, { id: 1, labelId: id(3), startMs: 500, endMs: 500 }]);
  f.entries[1]!.effective = annotations(f.second, 1, []);
  const document = exportDocument(project, { kind: 'project' }, f.entries, [f.pending]);
  const text = encodeExport(document);
  expect(decodeExport(text)).toEqual(document);
  expect(document).toMatchObject({ format: 'data-labeller', schemaVersion: 1, timeUnit: 'milliseconds', timeBasis: 'recorded-media', intervalConvention: 'half-open', unlabelled: 'not-negative' });
  expect(document.project.name).toBe('Current name');
  expect(document.recordings[0]).toMatchObject({ videoFile: `${f.record.id}.mov`, originalCapture: { projectName: f.record.projectName, labels: f.record.labels, events: f.record.events, annotationFailures: f.record.annotationFailures, lagBoundMs: null }, effective: { revision: 2 } });
  expect(document.recordings[1]?.effective.intervals).toEqual([]);
  expect(document.pendingRecordings[0]).toEqual({ videoIncluded: false, originalCapture: f.pending });
  expect(document.pendingRecordings[0]?.originalCapture).not.toHaveProperty('durationMs');
  expect(text).not.toContain('file:///'); expect(JSON.stringify(f.workspace)).toBe(before);
});
test('selected scope excludes other recordings/pending inventory, and revision zero means original ordinal intervals', () => {
  const f = fixture(); const entry = f.entries[0]!;
  expect(exportDocument(f.project, { kind: 'recording', recordingId: f.record.id }, [entry], []).recordings).toEqual([entry]);
  expect(entry.effective).toMatchObject({ revision: 0, intervals: [{ id: 0 }, { id: 1 }] });
  for (const [entries, pending] of [[f.entries, []], [[entry], [f.pending]]] as const) {
    expect(() => exportDocument(f.project, { kind: 'recording', recordingId: f.record.id }, entries, pending)).toThrow('invalid-export');
  }
  expect(() => exportDocument(f.project, { kind: 'recording', recordingId: id(99) }, [entry], [])).toThrow('invalid-export');
  expect(() => exportDocument(f.project, { kind: 'project' }, [], [f.pending])).toThrow('invalid-export');
});
test('preserves equal event ordering, zero-length intervals and fractional endpoints; JSON object property order is irrelevant', () => {
  const f = fixture(); const durationMs = 254_000 / 30;
  let draft = createRecordingDraft(id(10), f.project, 'back', 'mov');
  for (const labelId of [id(2), id(3), id(2)]) draft = toggleLabel(draft, labelId, { recordingId: draft.id, mediaMs: 100, source: 'avcapture-recorded-duration' });
  const record = finalizeRecording({ ...draft, termination: 'interrupted' }, { durationMs, byteSize: 100 });
  const document = exportDocument(f.project, { kind: 'project' }, [{ videoFile: `${record.id}.mov`, originalCapture: record, effective: originalAnnotations(record) }], []);
  const reordered = JSON.parse(encodeExport(document));
  reordered.recordings[0].originalCapture.intervals = record.intervals.map(({ labelId, startMs, endMs }) => ({ endMs, startMs, labelId }));
  expect(decodeExport(JSON.stringify(reordered))).toEqual(document);
  expect(document.recordings[0]?.originalCapture.intervals[0]).toMatchObject({ startMs: 100, endMs: 100 });
  expect(document.recordings[0]?.effective.intervals[1]?.endMs).toBe(durationMs);
});
test('Android MP4 linkage preserves CameraX position provenance without converting the media time basis', () => {
  const f = fixture();
  const draft = toggleLabel(createRecordingDraft(id(10), f.project, 'front', 'mp4'), id(2),
    { recordingId: id(10), mediaMs: 125.5, source: 'camerax-recording-stats' });
  const record = finalizeRecording({ ...draft, termination: 'stopped' }, { durationMs: 500.25, byteSize: 256 });
  const document = exportDocument(f.project, { kind: 'recording', recordingId: record.id },
    [{ videoFile: `${record.id}.mp4`, originalCapture: record, effective: originalAnnotations(record) }], []);
  expect(decodeExport(encodeExport(document)).recordings[0]).toMatchObject({ videoFile: `${record.id}.mp4`,
    originalCapture: { facing: 'front', extension: 'mp4', events: [{ mediaMs: 125.5, source: 'camerax-recording-stats' }], lagBoundMs: null },
    effective: { intervals: [{ startMs: 125.5, endMs: 500.25 }] } });
});
test.each([
  (value: any) => { value.format = 'other'; }, (value: any) => { value.schemaVersion = 2; },
  (value: any) => { value.timeUnit = 'seconds'; }, (value: any) => { value.scope = { kind: 'other' }; },
  (value: any) => { value.recordings = null; }, (value: any) => { value.pendingRecordings = null; },
  (value: any) => { value.pendingRecordings[0].videoIncluded = true; },
  (value: any) => { value.recordings[0].videoFile = '../wrong.mov'; },
  (value: any) => { value.recordings[0].originalCapture.projectId = id(99); },
  (value: any) => { value.recordings[0].originalCapture.annotationFailures = undefined; },
  (value: any) => { value.recordings[0].originalCapture.lagBoundMs = 1; },
  (value: any) => { value.recordings[0].effective.recordingId = id(99); },
  (value: any) => { value.recordings[0].effective.intervals = []; },
  (value: any) => { value.recordings[0].effective.intervals[0].endMs = 1001; },
  (value: any) => { value.recordings.push(value.recordings[0]); },
  (value: any) => { value.pendingRecordings[0].originalCapture.id = value.recordings[0].originalCapture.id; },
  (value: any) => { value.pendingRecordings[0].originalCapture.annotationFailures = undefined; },
])('rejects malformed versions/identity/timing/scope and data without fallback (%#)', (mutate) => {
  const f = fixture(); const value = JSON.parse(encodeExport(f.make())); mutate(value);
  expect(() => decodeExport(JSON.stringify(value))).toThrow('invalid-export');
});
test('malformed JSON or missing required values give a fixed error without embedding names/paths', () => {
  for (const value of ['private invalid JSON', 'null', '{}']) expect(() => decodeExport(value)).toThrow('invalid-export');
});
