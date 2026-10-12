export class ExportError extends Error {
  constructor(public readonly code: 'sharing-unavailable' | 'share-failed') {
    super(code); this.name = 'ExportError';
  }
}
