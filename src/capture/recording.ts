import { decodeProject, type Project, validateId } from '../projects/project';
import { CaptureError } from './CaptureError';

export type Facing = 'front' | 'back';
export type PositionSource = 'avcapture-recorded-duration' | 'camerax-recording-stats';
export type MediaPosition = Readonly<{ recordingId: string; mediaMs: number; source: PositionSource }>;
export type ToggleEvent = Readonly<{ labelId: string; mediaMs: number; source: PositionSource }>;
export type Interval = Readonly<{ labelId: string; startMs: number; endMs: number }>;
export type RecordingDraft = Readonly<{
  id: string;
  projectId: string;
  projectName: string;
  facing: Facing;
  extension: 'mov' | 'mp4';
  labels: readonly Readonly<{ id: string; name: string }>[];
  events: readonly ToggleEvent[];
  termination: 'stopped' | 'interrupted' | null;
}>;
export type SavedRecording = RecordingDraft &
  Readonly<{
    termination: 'stopped' | 'interrupted';
    durationMs: number;
    byteSize: number;
    intervals: readonly Interval[];
    timing: 'native-reported-position';
    lagBoundMs: null;
  }>;

export function createRecordingDraft(
  id: string,
  project: Project,
  facing: Facing,
  extension: RecordingDraft['extension'],
): RecordingDraft {
  const snapshot = decodeProject(JSON.stringify(project));
  validateId(id);
  return decodeDraft(JSON.stringify({
    id, projectId: snapshot.id, projectName: snapshot.name, facing, extension,
    labels: snapshot.labels.filter((label) => !label.archived).map(({ id, name }) => ({ id, name })),
    events: [], termination: null,
  }));
}

function source(value: unknown): value is PositionSource {
  return value === 'avcapture-recorded-duration' || value === 'camerax-recording-stats';
}

export function checkPosition(draft: RecordingDraft, position: MediaPosition): void {
  const previous = draft.events.at(-1)?.mediaMs ?? 0;
  if (position.recordingId !== draft.id || !source(position.source) ||
      !Number.isFinite(position.mediaMs) || position.mediaMs <= 0 || position.mediaMs < previous) {
    throw new CaptureError('invalid-timing');
  }
}

export function toggleLabel(draft: RecordingDraft, labelId: string, position: MediaPosition): RecordingDraft {
  if (draft.termination || !draft.labels.some((label) => label.id === labelId)) {
    throw new CaptureError('invalid-data');
  }
  checkPosition(draft, position);
  return { ...draft, events: [...draft.events, Object.freeze({ labelId, mediaMs: position.mediaMs, source: position.source })] };
}

export function activeLabels(events: readonly ToggleEvent[]): ReadonlySet<string> {
  const active = new Set<string>();
  for (const event of events) {
    if (active.has(event.labelId)) active.delete(event.labelId);
    else active.add(event.labelId);
  }
  return active;
}

export function finalizeRecording(
  draft: RecordingDraft,
  media: Readonly<{ durationMs: number; byteSize: number }>,
): SavedRecording {
  if (!draft.termination || !Number.isFinite(media.durationMs) || media.durationMs <= 0 ||
      !Number.isSafeInteger(media.byteSize) || media.byteSize <= 0) throw new CaptureError('media-unavailable');
  const starts = new Map<string, number>();
  const intervals: Interval[] = [];
  for (const event of draft.events) {
    if (event.mediaMs > media.durationMs) throw new CaptureError('invalid-timing');
    const start = starts.get(event.labelId);
    if (start === undefined) starts.set(event.labelId, event.mediaMs);
    else {
      intervals.push({ labelId: event.labelId, startMs: start, endMs: event.mediaMs });
      starts.delete(event.labelId);
    }
  }
  for (const [labelId, startMs] of starts) intervals.push({ labelId, startMs, endMs: media.durationMs });
  // Half-open [start, end) intervals. Equal positions remain ordered in events;
  // zero-length intervals are retained, with no invented minimum or expansion.
  return { ...draft, ...media, termination: draft.termination, intervals, timing: 'native-reported-position', lagBoundMs: null };
}

export function decodeDraft(body: string): RecordingDraft {
  try {
    const value = JSON.parse(body) as RecordingDraft;
    validateId(value.id);
    const project = decodeProject(JSON.stringify({
      id: value.projectId, name: value.projectName, revision: 1,
      labels: value.labels.map((label) => ({ ...label, archived: false })),
    }));
    if ((value.facing !== 'front' && value.facing !== 'back') ||
        (value.extension !== 'mov' && value.extension !== 'mp4') ||
        ![null, 'stopped', 'interrupted'].includes(value.termination) || !Array.isArray(value.events)) {
      throw new CaptureError('invalid-data');
    }
    let draft: RecordingDraft = {
      id: value.id, projectId: project.id, projectName: project.name, facing: value.facing,
      extension: value.extension, labels: project.labels.map(({ id, name }) => Object.freeze({ id, name })),
      events: [], termination: null,
    };
    for (const event of value.events) draft = toggleLabel(draft, event.labelId, { ...event, recordingId: draft.id });
    return Object.freeze({ ...draft, labels: Object.freeze(draft.labels), events: Object.freeze(draft.events), termination: value.termination });
  } catch {
    throw new CaptureError('invalid-data');
  }
}

export function decodeRecording(body: string): SavedRecording {
  try {
    const value = JSON.parse(body) as SavedRecording;
    const record = finalizeRecording(decodeDraft(body), { durationMs: value.durationMs, byteSize: value.byteSize });
    if (value.timing !== record.timing || value.lagBoundMs !== null ||
        JSON.stringify(value.intervals) !== JSON.stringify(record.intervals)) throw new CaptureError('invalid-data');
    return record;
  } catch {
    throw new CaptureError('invalid-data');
  }
}
