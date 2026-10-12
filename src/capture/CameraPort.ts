import type { MediaPosition } from './recording';

export interface CameraPort {
  record(recordingId: string, destination: string): Promise<Readonly<{ uri: string; interrupted: boolean }>>;
  position(recordingId: string): Promise<MediaPosition>;
  stop(recordingId: string): Promise<void>;
}
