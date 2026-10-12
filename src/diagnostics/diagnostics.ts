export type DiagnosticEvent =
  | 'render.failed'
  | 'render.retry_requested'
  | 'storage.loading'
  | 'storage.saving'
  | 'storage.ready'
  | 'storage.failed';
export type ReviewDiagnosticEvent =
  | 'review.opened'
  | 'review.changed'
  | 'review.saving'
  | 'review.saved'
  | 'review.failed'
  | 'review.playback_failed'
  | 'review.position_unavailable';
export type ExportDiagnosticEvent =
  | 'export.preparing'
  | 'export.prepared'
  | 'export.cancel_requested'
  | 'export.cancel_failed'
  | 'export.cancelled'
  | 'export.share_opening'
  | 'export.share_returned'
  | 'export.failed';
export type CaptureDiagnosticEvent =
  | 'capture.starting'
  | 'capture.recording'
  | 'capture.stopping'
  | 'capture.interrupted'
  | 'capture.saving'
  | 'capture.saved'
  | 'capture.cancelled'
  | 'capture.failed'
  | 'capture.clock_unavailable'
  | 'capture.checkpoint_failed';
// Failure codes are separate fixed events; native messages never enter logs.
export type StorageDiagnosticEvent =
  | 'storage.unavailable'
  | 'storage.corrupt'
  | 'storage.unsupported_schema'
  | 'storage.conflict'
  | 'storage.operation_collision';

export type Diagnostic = Readonly<{
  schemaVersion: 1;
  scope: 'app-shell';
  event: DiagnosticEvent | StorageDiagnosticEvent | CaptureDiagnosticEvent | ReviewDiagnosticEvent | ExportDiagnosticEvent;
}>;

export type DiagnosticSink = (diagnostic: Diagnostic) => void;

const consoleSink: DiagnosticSink = (diagnostic) => console.info(diagnostic);

// Only fixed event codes enter diagnostics. Never pass exception/user payloads.
export function emitDiagnostic(
  event: DiagnosticEvent | StorageDiagnosticEvent | CaptureDiagnosticEvent | ReviewDiagnosticEvent | ExportDiagnosticEvent,
  sink: DiagnosticSink = consoleSink,
): boolean {
  try {
    sink({ schemaVersion: 1, scope: 'app-shell', event });
    return true;
  } catch {
    // Diagnostics are best effort: a broken sink must not prevent recovery UI.
    return false;
  }
}
