import { StorageError } from '../storage/StorageError';

export type ReviewErrorCode = 'invalid-interval' | 'invalid-input' | 'unapplied-fields' | 'storage-failed' | 'conflict' | 'invalid-data' | 'unsupported-schema' | 'media-unavailable' | 'playback-failed';
export class ReviewError extends Error {
  constructor(public readonly code: ReviewErrorCode) { super(code); this.name = 'ReviewError'; }
}
export function reviewError(error: unknown): ReviewError {
  if (error instanceof ReviewError) return error;
  if (error instanceof StorageError) {
    if (error.code === 'conflict') return new ReviewError('conflict');
    if (error.code === 'corrupt') return new ReviewError('invalid-data');
    if (error.code === 'unsupported-schema') return new ReviewError('unsupported-schema');
  }
  return new ReviewError('storage-failed');
}
