import { id } from '../../test/ids';
import { captureFixture } from '../../test/captureFixture';
import { CaptureError, captureError } from './CaptureError';
import { activeLabels, checkPosition, createRecordingDraft, decodeDraft, decodeRecording, finalizeRecording, toggleLabel, type MediaPosition } from './recording';

const position = (mediaMs: number): MediaPosition => ({ recordingId: id(10), mediaMs, source: 'avcapture-recorded-duration' });
const draft = () => createRecordingDraft(id(10), captureFixture().project, 'front', 'mov');

test('snapshots current project and active label names, preserving identity through later rename/archive', () => {
  const { project } = captureFixture();
  const record = createRecordingDraft(id(10), project, 'front', 'mov');
  project.name = 'Later';
  project.labels[0]!.name = 'Renamed';
  project.labels[0]!.archived = true;
  expect(record).toMatchObject({ projectName: 'Private project', facing: 'front', labels: [{ id: id(2), name: 'A' }, { id: id(3), name: 'B' }], events: [], termination: null });
  expect(Object.isFrozen(record)).toBe(true);
  expect(Object.isFrozen(record.labels[0])).toBe(true);
});

test('toggles independently with overlaps, unlabelled gaps and media-relative half-open intervals', () => {
  let record = draft();
  record = toggleLabel(record, id(2), position(100));
  record = toggleLabel(record, id(3), position(200));
  expect([...activeLabels(record.events)]).toEqual([id(2), id(3)]);
  record = toggleLabel(record, id(2), position(400));
  expect([...activeLabels(record.events)]).toEqual([id(3)]);
  record = toggleLabel(record, id(3), position(500));
  expect(activeLabels(record.events).size).toBe(0);
  record = toggleLabel(record, id(2), position(750));
  const saved = finalizeRecording({ ...record, termination: 'stopped' }, { durationMs: 1000, byteSize: 123 });
  expect(saved.intervals).toEqual([
    { labelId: id(2), startMs: 100, endMs: 400 }, { labelId: id(3), startMs: 200, endMs: 500 }, { labelId: id(2), startMs: 750, endMs: 1000 },
  ]);
  expect(saved).toMatchObject({ timing: 'native-reported-position', lagBoundMs: null });
  expect(decodeRecording(JSON.stringify(saved))).toEqual(saved);
});

test('equal samples keep event order and zero-length intervals without expansion; no toggles means unlabelled', () => {
  let record = toggleLabel(draft(), id(2), position(200));
  record = toggleLabel(record, id(2), position(200));
  const saved = finalizeRecording({ ...record, termination: 'interrupted' }, { durationMs: 200, byteSize: 1 });
  expect(saved.events).toHaveLength(2);
  expect(saved.intervals).toEqual([{ labelId: id(2), startMs: 200, endMs: 200 }]);
  expect(finalizeRecording({ ...draft(), termination: 'stopped' }, { durationMs: 1, byteSize: 1 }).intervals).toEqual([]);
  expect(decodeDraft(JSON.stringify(record))).toEqual(record);
});

test.each([0, -1, NaN, Infinity])('rejects unavailable/invalid native position %s', (mediaMs) => {
  expect(() => checkPosition(draft(), position(mediaMs))).toThrow('invalid-timing');
});
test('rejects wrong recording, source, regression, archived labels and toggles after termination', () => {
  const record = toggleLabel(draft(), id(2), position(200));
  expect(() => toggleLabel(record, id(2), position(199))).toThrow('invalid-timing');
  expect(() => checkPosition(record, { ...position(300), recordingId: id(11) })).toThrow('invalid-timing');
  expect(() => checkPosition(record, { ...position(300), source: 'fake' as MediaPosition['source'] })).toThrow('invalid-timing');
  expect(() => toggleLabel(record, id(4), position(300))).toThrow('invalid-data');
  expect(() => toggleLabel({ ...record, termination: 'stopped' }, id(2), position(300))).toThrow('invalid-data');
  expect(toggleLabel(record, id(3), { ...position(300), source: 'camerax-recording-stats' }).events.at(-1)?.source).toBe('camerax-recording-stats');
});

test.each([{ durationMs: 0, byteSize: 1 }, { durationMs: NaN, byteSize: 1 }, { durationMs: -1, byteSize: 1 }, { durationMs: 1, byteSize: 0 }, { durationMs: 1, byteSize: 1.5 }])('requires actual usable media: %j', (media) => {
  expect(() => finalizeRecording({ ...draft(), termination: 'stopped' }, media)).toThrow('media-unavailable');
});
test('unfinalized and out-of-video positions are recovery issues, never silently clamped', () => {
  expect(() => finalizeRecording(draft(), { durationMs: 1000, byteSize: 1 })).toThrow('media-unavailable');
  const record = toggleLabel(draft(), id(2), position(1001));
  expect(() => finalizeRecording({ ...record, termination: 'interrupted' }, { durationMs: 1000, byteSize: 1 })).toThrow('invalid-timing');
  expect(record.events[0]?.mediaMs).toBe(1001);
});
test('validates persisted structure, label identity and derived intervals without retaining raw errors', () => {
  const valid = draft();
  for (const patch of [ { id: 'bad' }, { projectId: 'bad' }, { labels: null }, { facing: 'other' }, { extension: 'other' }, { termination: 'other' }, { events: null }, { events: [{ labelId: id(4), mediaMs: 1, source: 'avcapture-recorded-duration' }] } ]) {
    expect(() => decodeDraft(JSON.stringify({ ...valid, ...patch }))).toThrow('invalid-data');
  }
  expect(() => decodeDraft('secret invalid JSON')).toThrow('invalid-data');
  expect(() => createRecordingDraft('bad', captureFixture().project, 'back', 'mp4')).toThrow('invalid-id');
  const saved = finalizeRecording({ ...valid, termination: 'stopped' }, { durationMs: 1000, byteSize: 1 });
  for (const patch of [{ intervals: [{ labelId: id(2), startMs: 0, endMs: 1 }] }, { lagBoundMs: 1 }, { timing: 'js-start' }, { termination: null }]) {
    expect(() => decodeRecording(JSON.stringify({ ...saved, ...patch }))).toThrow('invalid-data');
  }
  expect(() => decodeRecording('secret invalid JSON')).toThrow('invalid-data');
  const fixed = new CaptureError('media-unavailable');
  expect(captureError(fixed)).toBe(fixed);
  expect(captureError(new Error('/private/secret'))).toMatchObject({ code: 'unavailable', message: 'unavailable' });
});
