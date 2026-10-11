export type DiagnosticEvent = 'render.failed' | 'render.retry_requested';

export type Diagnostic = Readonly<{
  schemaVersion: 1;
  scope: 'app-shell';
  event: DiagnosticEvent;
}>;

export type DiagnosticSink = (diagnostic: Diagnostic) => void;

const consoleSink: DiagnosticSink = (diagnostic) => console.info(diagnostic);

// Only fixed event codes enter diagnostics. Never pass exception/user payloads.
export function emitDiagnostic(
  event: DiagnosticEvent,
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
