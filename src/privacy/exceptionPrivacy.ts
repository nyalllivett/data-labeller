type Handler = (error: unknown, isFatal: boolean) => void;
export type ExceptionManager = { handleException: Handler };

const installed = new WeakMap<ExceptionManager, Handler>();

function safeError(code: string): Error {
  const error = new Error(code);
  error.name = 'DataLabellerError';
  error.stack = '';
  return error;
}

// Version-pinned boundary. Never inspect the incoming value, including getters.
export function installExceptionPrivacy(manager: ExceptionManager): void {
  try {
    if (typeof manager?.handleException !== 'function')
      throw safeError('exception-privacy-unavailable');
    if (installed.get(manager) === manager.handleException) return;
    const delegate = manager.handleException;
    const wrapper: Handler = function (_error, isFatal) {
      try {
        delegate.call(manager, safeError('application-exception'), isFatal);
      } catch {
        throw safeError('exception-reporting-failed');
      }
    };
    manager.handleException = wrapper;
    if (manager.handleException !== wrapper) throw safeError('exception-privacy-unavailable');
    installed.set(manager, wrapper);
  } catch {
    throw safeError('exception-privacy-unavailable');
  }
}
