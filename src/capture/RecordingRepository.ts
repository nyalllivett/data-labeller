import type { RecordingDraft, SavedRecording } from './recording';

export type RecordingWorkspace = Readonly<{
  pending: readonly RecordingDraft[];
  saved: readonly SavedRecording[];
}>;

export interface RecordingRepository {
  load(projectId: string): Promise<RecordingWorkspace>;
  checkpoint(draft: RecordingDraft): Promise<void>;
  commit(recording: SavedRecording): Promise<SavedRecording>;
  cancelUnstarted(id: string): Promise<void>;
}
