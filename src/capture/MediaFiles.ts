import type { RecordingDraft } from './recording';

export type MediaDetails = Readonly<{ durationMs: number; byteSize: number }>;
export interface MediaFiles {
  prepare(draft: RecordingDraft): Promise<string>;
  promote(draft: RecordingDraft): Promise<MediaDetails>;
}
