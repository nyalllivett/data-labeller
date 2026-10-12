import type { RecordingWorkspace } from '../capture/RecordingRepository';
import type { SavedRecording } from '../capture/recording';
import type { Project } from '../projects/project';
import type { AnnotationRepository } from '../review/AnnotationRepository';
import { encodeExport, exportDocument, videoFilename, type ExportScope } from './document';
import { ExportError } from './ExportError';
import type { PackageMedia } from './PackagePort';

export function checkCancellation(cancelled: boolean): void { if (cancelled) throw new ExportError('cancelled'); }
export async function snapshotExport(project: Project, scope: ExportScope, workspace: RecordingWorkspace,
  annotations: Pick<AnnotationRepository, 'load'>, resolve: (record: SavedRecording) => Promise<string>, cancelled: () => boolean) {
  try {
    const records = scope.kind === 'project' ? workspace.saved : workspace.saved.filter((record) => record.id === scope.recordingId);
    const entries = [];
    for (const record of records) {
      checkCancellation(cancelled());
      const effective = await annotations.load(record); checkCancellation(cancelled());
      entries.push({ videoFile: videoFilename(record), originalCapture: record, effective });
    }
    const document = exportDocument(project, scope, entries, scope.kind === 'project' ? workspace.pending : []);
    const media: PackageMedia[] = [];
    for (const entry of document.recordings) {
      const uri = await resolve(entry.originalCapture); checkCancellation(cancelled());
      media.push(Object.freeze({ uri, filename: entry.videoFile, byteSize: entry.originalCapture.byteSize }));
    }
    return Object.freeze({ document, json: encodeExport(document), media: Object.freeze(media) });
  } catch (error) { throw error instanceof ExportError ? error : new ExportError('source-unavailable'); }
}
