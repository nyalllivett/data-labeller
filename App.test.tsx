import { render, screen, userEvent } from '@testing-library/react-native';

import App from './App';
import * as welcome from './src/shell/WelcomeScreen';

test('opens the local workspace preview with honest feature availability', async () => {
  await render(<App />);

  expect(screen.getByRole('header', { name: 'Data Labeller' })).toBeVisible();
  expect(screen.getByText('Video with your own labels.')).toBeVisible();
  expect(
    screen.getByText('A local workspace for recording, reviewing and exporting labelled video.'),
  ).toBeVisible();
  expect(screen.getByRole('header', { name: 'Development preview' })).toBeVisible();
  expect(screen.getByText('Project creation and recording are coming next.')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  expect(screen.queryByText("We couldn't show this screen")).not.toBeOnTheScreen();
});

test('the mounted app catches screen failure and permits a fresh render', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const diagnostics = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const renderWelcome = welcome.WelcomeScreen;
  let shouldFail = true;
  jest.spyOn(welcome, 'WelcomeScreen').mockImplementation(() => {
    if (shouldFail) throw new Error('private user text');
    return renderWelcome();
  });

  await render(<App />);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  expect(screen.queryByRole('header', { name: 'Data Labeller' })).not.toBeOnTheScreen();
  shouldFail = false;
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));

  expect(screen.getByRole('header', { name: 'Data Labeller' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  expect(diagnostics.mock.calls).toEqual([
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.failed' }],
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.retry_requested' }],
  ]);
});
