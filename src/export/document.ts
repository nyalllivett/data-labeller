import { decodeDraft, decodeRecording, type RecordingDraft, type SavedRecording } from '../capture/recording';
import { decodeProject, validateId, type Project } from '../projects/project';
import { decodeAnnotations, originalAnnotations, sameIntervals, type Annotations } from '../review/annotations';
import { ExportError } from './ExportError';

const header = { format: 'data-labeller', schemaVersion: 1, timeUnit: 'milliseconds', timeBasis: 'recorded-media',
  intervalConvention: 'half-open', unlabelled: 'not-negative' } as const;
export type ExportScope = Readonly<{ kind: 'project' } | { kind: 'recording'; recordingId: string }>;
export type ExportRecording = Readonly<{ videoFile: string; originalCapture: SavedRecording; effective: Annotations }>;
export type ExportDocument = typeof header & Readonly<{
  scope: ExportScope; project: Project; recordings: readonly ExportRecording[];
  pendingRecordings: readonly Readonly<{ videoIncluded: false; originalCapture: RecordingDraft }>[];
}>;
export const videoFilename = (record: SavedRecording): string => `${record.id}.${record.extension}`;

export function exportDocument(project: Project, scope: ExportScope, recordings: readonly ExportRecording[], pending: readonly RecordingDraft[]): ExportDocument {
  try {
    const checkedProject = decodeProject(JSON.stringify(project));
    if (scope.kind !== 'project' && scope.kind !== 'recording') throw new ExportError('invalid-export');
    if (scope.kind === 'recording') validateId(scope.recordingId);
    if (!Array.isArray(recordings) || !recordings.length || !Array.isArray(pending)) throw new ExportError('invalid-export');
    const ids = new Set<string>();
    const acceptIdentity = (value: RecordingDraft) => {
      if (value.projectId !== checkedProject.id || ids.has(value.id)) throw new ExportError('invalid-export');
      ids.add(value.id);
    };
    const checked = recordings.map((value: ExportRecording) => {
      if (!Array.isArray(value.originalCapture.annotationFailures)) throw new ExportError('invalid-export');
      // JSON object key order is not part of the portable contract. The capture
      // decoder compares its derived interval array, so normalize known keys.
      const originalCapture = decodeRecording(JSON.stringify({ ...value.originalCapture,
        intervals: value.originalCapture.intervals.map(({ labelId, startMs, endMs }) => ({ labelId, startMs, endMs })) }));
      acceptIdentity(originalCapture);
      const effective = decodeAnnotations(originalCapture, JSON.stringify(value.effective));
      if (value.videoFile !== videoFilename(originalCapture) ||
          (effective.revision === 0 && !sameIntervals(effective, originalAnnotations(originalCapture)))) throw new ExportError('invalid-export');
      return Object.freeze({ videoFile: value.videoFile, originalCapture, effective });
    });
    const checkedPending = pending.map((value) => {
      if (!Array.isArray(value.annotationFailures)) throw new ExportError('invalid-export');
      const originalCapture = decodeDraft(JSON.stringify(value)); acceptIdentity(originalCapture);
      return Object.freeze({ videoIncluded: false as const, originalCapture });
    });
    if (scope.kind === 'recording' && (checked.length !== 1 || checked[0]!.originalCapture.id !== scope.recordingId || checkedPending.length)) throw new ExportError('invalid-export');
    const checkedScope: ExportScope = scope.kind === 'project' ? { kind: 'project' } : { kind: 'recording', recordingId: scope.recordingId };
    return Object.freeze({ ...header, scope: Object.freeze(checkedScope), project: checkedProject,
      recordings: Object.freeze(checked), pendingRecordings: Object.freeze(checkedPending) });
  } catch { throw new ExportError('invalid-export'); }
}
export function encodeExport(document: ExportDocument): string { return `${JSON.stringify(document, null, 2)}\n`; }
export function decodeExport(json: string): ExportDocument {
  try {
    const value = JSON.parse(json) as ExportDocument;
    for (const key of Object.keys(header) as (keyof typeof header)[]) if (value[key] !== header[key]) throw new ExportError('invalid-export');
    if (!Array.isArray(value.pendingRecordings) || value.pendingRecordings.some((entry) => entry.videoIncluded !== false)) throw new ExportError('invalid-export');
    return exportDocument(value.project, value.scope, value.recordings, value.pendingRecordings.map((entry) => entry.originalCapture));
  } catch { throw new ExportError('invalid-export'); }
}
