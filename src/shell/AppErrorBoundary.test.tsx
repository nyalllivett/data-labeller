import { render, screen, userEvent } from '@testing-library/react-native';
import { Component, useEffect } from 'react';
import { Text } from 'react-native';

import { AppErrorBoundary } from './AppErrorBoundary';

// React's renderer emits its own expected error reports during these tests.
// The app's diagnostic sink is asserted independently; production code receives
// neither an exception object nor its stack.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

const sensitiveError = new Error('private project name /cache/private-video.mp4');

function BrokenScreen(): never {
  throw sensitiveError;
}

test('renders healthy children without emitting an error or showing retry', async () => {
  const sink = jest.fn();
  await render(
    <AppErrorBoundary diagnosticSink={sink}>
      <Text>Healthy screen</Text>
    </AppErrorBoundary>,
  );

  expect(screen.getByText('Healthy screen')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  expect(sink).not.toHaveBeenCalled();
});

test('replaces a render failure with safe recovery text and fixed diagnostics', async () => {
  const sink = jest.fn();
  await render(
    <AppErrorBoundary diagnosticSink={sink}>
      <BrokenScreen />
    </AppErrorBoundary>,
  );

  expect(screen.getByRole('header', { name: "We couldn't show this screen" })).toBeVisible();
  expect(
    screen.getByText('Try again. If this keeps happening, close and reopen the app.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  expect(screen.queryByText(sensitiveError.message)).not.toBeOnTheScreen();
  expect(sink.mock.calls).toEqual([
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.failed' }],
  ]);
});

test('catches descendant lifecycle failure as well as render failure', async () => {
  class BrokenLifecycle extends Component {
    componentDidMount() {
      throw sensitiveError;
    }
    render() {
      return <Text>Failed child</Text>;
    }
  }
  const sink = jest.fn();
  await render(
    <AppErrorBoundary diagnosticSink={sink}>
      <BrokenLifecycle />
    </AppErrorBoundary>,
  );

  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  expect(screen.queryByText('Failed child')).not.toBeOnTheScreen();
  expect(sink).toHaveBeenCalledWith({
    schemaVersion: 1, scope: 'app-shell', event: 'render.failed',
  });
});

test('explicit retry remounts the failed subtree and restores a healthy screen', async () => {
  const sink = jest.fn();
  const mounted = jest.fn();
  const unmounted = jest.fn();
  let shouldFail = false;
  function RecoveringScreen() {
    useEffect(() => {
      mounted();
      return () => { unmounted(); };
    }, []);
    if (shouldFail) throw sensitiveError;
    return <Text>Recovered screen</Text>;
  }
  const view = await render(
    <AppErrorBoundary diagnosticSink={sink}><RecoveringScreen /></AppErrorBoundary>,
  );
  shouldFail = true;
  await view.rerender(
    <AppErrorBoundary diagnosticSink={sink}><RecoveringScreen /></AppErrorBoundary>,
  );
  expect(unmounted).toHaveBeenCalledTimes(1);

  shouldFail = false;
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));

  expect(screen.getByText('Recovered screen')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  expect(mounted).toHaveBeenCalledTimes(2);
  expect(sink.mock.calls).toEqual([
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.failed' }],
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.retry_requested' }],
  ]);
});

test('repeated failed retries keep recovery available and never report success', async () => {
  const sink = jest.fn();
  await render(
    <AppErrorBoundary diagnosticSink={sink}><BrokenScreen /></AppErrorBoundary>,
  );
  const user = userEvent.setup();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('header', { name: "We couldn't show this screen" })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  }
  expect(sink.mock.calls.map(([diagnostic]) => diagnostic.event)).toEqual([
    'render.failed', 'render.retry_requested', 'render.failed',
    'render.retry_requested', 'render.failed',
  ]);
});

test('diagnostic failures do not prevent the fallback or its successful retry', async () => {
  const sink = jest.fn(() => { throw new Error('sink unavailable'); });
  let shouldFail = true;
  function RecoveringScreen() {
    if (shouldFail) throw sensitiveError;
    return <Text>Recovered screen</Text>;
  }
  await render(
    <AppErrorBoundary diagnosticSink={sink}><RecoveringScreen /></AppErrorBoundary>,
  );
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();

  shouldFail = false;
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Recovered screen')).toBeVisible();
  expect(sink).toHaveBeenCalledTimes(2);
});
