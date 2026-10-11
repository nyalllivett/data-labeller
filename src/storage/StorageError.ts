export type StorageErrorCode =
  'unavailable' | 'corrupt' | 'unsupported-schema' | 'conflict' | 'operation-collision';

export class StorageError extends Error {
  constructor(public readonly code: StorageErrorCode) {
    super(code);
    this.name = 'StorageError';
  }
}

export function storageError(error: unknown): StorageError {
  return error instanceof StorageError ? error : new StorageError('unavailable');
}
