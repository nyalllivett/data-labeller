import { emitDiagnostic, type DiagnosticEvent } from './diagnostics';

test.each<DiagnosticEvent>([
  'render.failed',
  'render.retry_requested',
  'storage.loading',
  'storage.saving',
  'storage.ready',
  'storage.failed',
])('writes only the fixed structured fields for %s', (event) => {
  const sink = jest.fn();

  expect(emitDiagnostic(event, sink)).toBe(true);
  expect(sink).toHaveBeenCalledTimes(1);
  expect(sink).toHaveBeenCalledWith({ schemaVersion: 1, scope: 'app-shell', event });
});

test('uses the local console without an external diagnostics service', () => {
  const write = jest.spyOn(console, 'info').mockImplementation(() => undefined);

  expect(emitDiagnostic('render.failed')).toBe(true);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith({
    schemaVersion: 1,
    scope: 'app-shell',
    event: 'render.failed',
  });
});

test('reports a failed sink without throwing or forwarding its exception', () => {
  const write = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const sink = jest.fn(() => {
    throw new Error('sensitive exception payload');
  });

  expect(emitDiagnostic('render.failed', sink)).toBe(false);
  expect(sink).toHaveBeenCalledTimes(1);
  expect(write).not.toHaveBeenCalled();
});
