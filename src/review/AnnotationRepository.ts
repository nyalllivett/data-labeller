import type { SavedRecording } from '../capture/recording';
import type { Annotations } from './annotations';

export interface AnnotationRepository {
  load(record: SavedRecording): Promise<Annotations>;
  save(record: SavedRecording, expectedRevision: number, document: Annotations): Promise<Annotations>;
}
