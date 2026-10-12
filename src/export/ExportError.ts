export type ExportErrorCode = 'invalid-export' | 'source-unavailable' | 'package-failed' | 'invalid-package' | 'cancelled' |
  'cancel-failed' | 'cleanup-failed' | 'package-missing' | 'sharing-unavailable' | 'share-failed';
export class ExportError extends Error {
  constructor(public readonly code: ExportErrorCode) {
    super(code); this.name = 'ExportError';
  }
}
