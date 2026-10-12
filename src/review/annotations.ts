import type { SavedRecording, Interval } from '../capture/recording';
import { ReviewError } from './ReviewError';

// Identity is the ordinal in the immutable capture list, scoped by recording.
export type EditedInterval = Interval & Readonly<{ id: number }>;
export type Annotations = Readonly<{ recordingId: string; revision: number; intervals: readonly EditedInterval[] }>;
export type IntervalForm = Readonly<{ id: number; labelId: string; start: string; end: string;
  startPositionMs?: number; endPositionMs?: number }>;

export function annotations(record: SavedRecording, revision: number, intervals: readonly EditedInterval[]): Annotations {
  if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(intervals)) throw new ReviewError('invalid-interval');
  const ids = new Set<number>();
  const checked = intervals.map((interval) => {
    if (!Number.isSafeInteger(interval.id) || interval.id < 0 || interval.id >= record.intervals.length || ids.has(interval.id) ||
        !record.labels.some((label) => label.id === interval.labelId) || !Number.isFinite(interval.startMs) || !Number.isFinite(interval.endMs) ||
        interval.startMs < 0 || interval.endMs < interval.startMs || interval.endMs > record.durationMs) throw new ReviewError('invalid-interval');
    ids.add(interval.id);
    return Object.freeze({ id: interval.id, labelId: interval.labelId, startMs: interval.startMs, endMs: interval.endMs });
  });
  return Object.freeze({ recordingId: record.id, revision, intervals: Object.freeze(checked.sort((a, b) => a.id - b.id)) });
}
export function originalAnnotations(record: SavedRecording): Annotations {
  return annotations(record, 0, record.intervals.map((interval, id) => ({ ...interval, id })));
}
export function decodeAnnotations(record: SavedRecording, body: string): Annotations {
  try {
    const value = JSON.parse(body) as Annotations;
    if (value.recordingId !== record.id) throw new ReviewError('invalid-interval');
    return annotations(record, value.revision, value.intervals);
  } catch { throw new ReviewError('invalid-interval'); }
}
export function sameIntervals(a: Annotations, b: Annotations): boolean {
  return JSON.stringify(a.intervals) === JSON.stringify(b.intervals);
}
export function editInterval(record: SavedRecording, document: Annotations, next: EditedInterval): Annotations {
  if (!document.intervals.some((interval) => interval.id === next.id)) throw new ReviewError('invalid-interval');
  const changed = annotations(record, document.revision, document.intervals.map((interval) => interval.id === next.id ? next : interval));
  return sameIntervals(document, changed) ? document : changed;
}
export function deleteInterval(record: SavedRecording, document: Annotations, id: number): Annotations {
  if (!document.intervals.some((interval) => interval.id === id)) return document;
  return annotations(record, document.revision, document.intervals.filter((interval) => interval.id !== id));
}
export function secondsText(mediaMs: number): string { return String(mediaMs / 1000); }
export function parseSeconds(text: string): number {
  const value = text.trim();
  const parts = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:e([+-]?\d+))?$/i.exec(value);
  if (!parts) throw new ReviewError('invalid-input');
  // Shift decimal units before parsing once. E.g. 2.007 seconds is exactly
  // 2007 ms, rather than a multiplied double just beyond the video endpoint.
  const mediaMs = Number(`${parts[1]}e${Number(parts[2] ?? 0) + 3}`);
  if (!Number.isFinite(mediaMs)) throw new ReviewError('invalid-input');
  return mediaMs;
}
export function intervalForm(interval: EditedInterval): IntervalForm {
  return { id: interval.id, labelId: interval.labelId, start: secondsText(interval.startMs), end: secondsText(interval.endMs) };
}
export function applyForm(record: SavedRecording, document: Annotations, form: IntervalForm): Annotations {
  const original = document.intervals.find((interval) => interval.id === form.id);
  if (!original) throw new ReviewError('invalid-interval');
  // Playback-filled fields retain the exact numeric report, not a text round trip.
  // Otherwise preserve untouched stored doubles or parse intentional manual text.
  const startMs = form.startPositionMs ?? (form.start === secondsText(original.startMs) ? original.startMs : parseSeconds(form.start));
  const endMs = form.endPositionMs ?? (form.end === secondsText(original.endMs) ? original.endMs : parseSeconds(form.end));
  return editInterval(record, document, { id: form.id, labelId: form.labelId, startMs, endMs });
}
