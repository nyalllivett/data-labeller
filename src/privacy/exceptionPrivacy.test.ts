import { installExceptionPrivacy, type ExceptionManager } from './exceptionPrivacy';

test.each([false, true])('forwards sanitized errors with receiver and fatal=%s', (fatal) => {
  const delegate = jest.fn(function (this: unknown, _error: unknown, _isFatal: boolean) {
    expect(this).toBe(manager);
  });
  const manager: ExceptionManager = { handleException: delegate };
  installExceptionPrivacy(manager);
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error('getter accessed private data');
      },
    },
  );
  manager.handleException(hostile, fatal);
  const [error, forwardedFatal] = delegate.mock.calls[0] ?? [];
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: 'DataLabellerError',
    message: 'application-exception',
    stack: '',
  });
  expect(Object.getOwnPropertyNames(error as Error).sort()).toEqual(['message', 'name', 'stack']);
  expect(forwardedFatal).toBe(fatal);
  expect(error).not.toBe(hostile);
});
test('installation is idempotent and delegate failure is sanitized without being swallowed', () => {
  const delegate = jest.fn(() => {
    throw new Error('private delegate failure');
  });
  const manager: ExceptionManager = { handleException: delegate };
  installExceptionPrivacy(manager);
  const wrapper = manager.handleException;
  installExceptionPrivacy(manager);
  expect(manager.handleException).toBe(wrapper);
  expect(() => manager.handleException('raw private text', false)).toThrow(
    'exception-reporting-failed',
  );
  expect(delegate).toHaveBeenCalledTimes(1);
});
test('incompatible/frozen manager fails closed with fixed data', () => {
  for (const value of [null, {}, { handleException: 1 }, Object.freeze({ handleException() {} })])
    expect(() => installExceptionPrivacy(value as never)).toThrow('exception-privacy-unavailable');
});
