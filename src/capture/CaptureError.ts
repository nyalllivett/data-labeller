export type CaptureErrorCode =
  | 'unavailable'
  | 'clock-unavailable'
  | 'invalid-timing'
  | 'checkpoint-failed'
  | 'stop-failed'
  | 'media-unavailable'
  | 'capture-unfinalized'
  | 'annotation-incomplete'
  | 'invalid-data';

export class CaptureError extends Error {
  constructor(readonly code: CaptureErrorCode) {
    super(code);
    this.name = 'CaptureError';
  }
}

export const captureError = (error: unknown): CaptureError =>
  error instanceof CaptureError ? error : new CaptureError('unavailable');
