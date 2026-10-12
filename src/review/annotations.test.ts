import { savedRecord } from '../../test/reviewFixture';
import { id } from '../../test/ids';
import { StorageError } from '../storage/StorageError';
import { annotations, applyForm, decodeAnnotations, deleteInterval, editInterval, intervalForm, originalAnnotations, parseSeconds, sameIntervals } from './annotations';
import { ReviewError, reviewError } from './ReviewError';

test('creates stable capture ordinal IDs, freezes canonical overlays and preserves immutable evidence', () => {
  const record = savedRecord(); const before = JSON.stringify(record);
  const original = originalAnnotations(record);
  expect(original.intervals.map((interval) => interval.id)).toEqual([0, 1]);
  expect(Object.isFrozen(original.intervals[0])).toBe(true);
  expect(Object.isFrozen(original.intervals)).toBe(true);
  const edited = editInterval(record, original, { id: 1, labelId: id(2), startMs: 0, endMs: 1000 });
  expect(edited.intervals).toEqual([original.intervals[0], { id: 1, labelId: id(2), startMs: 0, endMs: 1000 }]);
  expect(JSON.stringify(record)).toBe(before);
  expect(decodeAnnotations(record, JSON.stringify(edited))).toEqual(edited);
  expect(annotations(record, 2, [...edited.intervals].reverse()).intervals).toEqual(edited.intervals);
});
test('allows overlapping labels and zero-length/end markers without snapping or merging', () => {
  const record = savedRecord(); const original = originalAnnotations(record);
  const edited = editInterval(record, original, { id: 0, labelId: id(3), startMs: 1000, endMs: 1000 });
  expect(edited.intervals[0]).toMatchObject({ startMs: 1000, endMs: 1000 });
  expect(editInterval(record, original, original.intervals[0]!)).toBe(original);
  expect(deleteInterval(record, original, 99)).toBe(original);
  const removed = deleteInterval(record, original, 0);
  expect(removed.intervals[0]?.id).toBe(1);
  expect(deleteInterval(record, removed, 1).intervals).toEqual([]);
  expect(sameIntervals(original, { ...original, revision: 3 })).toBe(true);
});
test.each([
  { id: -1 }, { id: 0.5 }, { id: 2 }, { labelId: id(4) }, { startMs: -1 },
  { startMs: NaN }, { endMs: Infinity }, { startMs: 601 }, { endMs: 1001 },
])('rejects invalid interval %j', (patch) => {
  const record = savedRecord(); const original = originalAnnotations(record);
  expect(() => editInterval(record, original, { ...original.intervals[0]!, ...patch })).toThrow('invalid-interval');
});
test('decoding rejects wrong identity/revision, malformed or duplicate intervals without a capture fallback', () => {
  const record = savedRecord(); const original = originalAnnotations(record);
  for (const patch of [{ recordingId: id(11) }, { revision: -1 }, { revision: 1.5 }, { revision: Infinity }, { intervals: null }, { intervals: [null] }, { intervals: [original.intervals[0], original.intervals[0]] }]) {
    expect(() => decodeAnnotations(record, JSON.stringify({ ...original, ...patch }))).toThrow('invalid-interval');
  }
  expect(() => decodeAnnotations(record, 'secret invalid JSON')).toThrow('invalid-interval');
});
test('unchanged form/relabel preserves exact doubles; valid seconds are converted only at the form boundary', () => {
  const record = savedRecord();
  const document = annotations(record, 1, [{ id: 0, labelId: id(2), startMs: 0.0000001, endMs: 99.00000000000001 }]);
  expect(applyForm(record, document, intervalForm(document.intervals[0]!))).toBe(document);
  expect(applyForm(record, document, { ...intervalForm(document.intervals[0]!), labelId: id(3) }).intervals[0]?.endMs).toBe(99.00000000000001);
  expect(parseSeconds(' .025 ')).toBe(25);
  expect(parseSeconds('1e-6')).toBe(0.001);
  expect(() => applyForm(record, document, { id: 99, labelId: id(2), start: '0', end: '1' })).toThrow('invalid-interval');
});
test.each(['', ' ', 'NaN', 'Infinity', '0x10', '1,2', '1e309', '1e308'])('rejects ambiguous/nonfinite seconds %s', (value) => {
  expect(() => parseSeconds(value)).toThrow('invalid-input');
});
test('fixed errors preserve actionable storage codes and discard raw underlying data', () => {
  const own = new ReviewError('invalid-input'); expect(reviewError(own)).toBe(own);
  expect(reviewError(new StorageError('conflict')).code).toBe('conflict');
  expect(reviewError(new StorageError('corrupt')).code).toBe('invalid-data');
  expect(reviewError(new StorageError('unsupported-schema')).code).toBe('unsupported-schema');
  expect(reviewError(new StorageError('unavailable')).code).toBe('storage-failed');
  expect(reviewError(new Error('/private/path')).message).toBe('storage-failed');
});
