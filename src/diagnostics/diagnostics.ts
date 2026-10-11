export type DiagnosticEvent =
  | 'render.failed'
  | 'render.retry_requested'
  | 'storage.loading'
  | 'storage.saving'
  | 'storage.ready'
  | 'storage.failed';
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
  event: DiagnosticEvent | StorageDiagnosticEvent;
}>;

export type DiagnosticSink = (diagnostic: Diagnostic) => void;

const consoleSink: DiagnosticSink = (diagnostic) => console.info(diagnostic);

// Only fixed event codes enter diagnostics. Never pass exception/user payloads.
export function emitDiagnostic(
  event: DiagnosticEvent | StorageDiagnosticEvent,
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
