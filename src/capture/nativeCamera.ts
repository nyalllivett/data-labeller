import { Camera, type CameraRecordingOptions } from 'expo-camera';

import { CaptureError } from './CaptureError';
import type { CameraPort } from './CameraPort';
import type { PositionSource } from './recording';

export type CameraHandle = Readonly<{
  recordAsync(options: CameraRecordingOptions): Promise<unknown>;
  sampleRecordingPosition(id: string): Promise<number | undefined>;
  stopRecordingAsync(id: string): Promise<void>;
}>;

export type CameraPermission = Readonly<{ granted: boolean; canAskAgain: boolean }>;
export type CameraPermissions = Readonly<{
  get(): Promise<CameraPermission>;
  request(): Promise<CameraPermission>;
}>;
export const cameraPermissions: CameraPermissions = {
  get: Camera.getCameraPermissionsAsync,
  request: Camera.requestCameraPermissionsAsync,
};

export class NativeCamera implements CameraPort {
  private camera: CameraHandle | null = null;
  constructor(private readonly source: PositionSource) {}
  attach(camera: CameraHandle | null): void { this.camera = camera; }

  async record(recordingId: string, destination: string) {
    if (!this.camera) throw new CaptureError('unavailable');
    const options = { dataLabellerRecordingId: recordingId, dataLabellerOutputUri: destination };
    let result: { uri?: unknown; dataLabellerInterrupted?: unknown; dataLabellerFinalized?: unknown } | undefined;
    try { result = await this.camera.recordAsync(options as CameraRecordingOptions) as typeof result; }
    catch { throw new CaptureError('capture-unfinalized'); }
    if (result?.uri !== destination || typeof result.dataLabellerInterrupted !== 'boolean' || result.dataLabellerFinalized !== true) throw new CaptureError('unavailable');
    return { uri: destination, interrupted: result.dataLabellerInterrupted };
  }

  async position(recordingId: string) {
    try {
      if (!this.camera) throw new CaptureError('clock-unavailable');
      const mediaMs = await this.camera.sampleRecordingPosition(recordingId);
      if (typeof mediaMs !== 'number' || !Number.isFinite(mediaMs) || mediaMs <= 0) throw new CaptureError('clock-unavailable');
      return { recordingId, mediaMs, source: this.source };
    } catch { throw new CaptureError('clock-unavailable'); }
  }

  async stop(recordingId: string): Promise<void> {
    try {
      if (!this.camera) throw new CaptureError('stop-failed');
      await this.camera.stopRecordingAsync(recordingId);
    } catch { throw new CaptureError('stop-failed'); }
  }
}
