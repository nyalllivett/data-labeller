import { render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import App from './App';
import * as workspace from './src/projects/ui/ProjectWorkspace';
import { newId, projectStore } from './src/projects/runtime';

jest.mock('./src/projects/runtime', () => ({ newId: jest.fn(), projectStore: {} }));
jest.mock('./src/projects/ui/ProjectWorkspace', () => {
  const { Text } = jest.requireActual('react-native');
  return { ProjectWorkspace: jest.fn(() => <Text>Project workspace</Text>) };
});
test('mounts the workspace with a stable store and native ID factory', async () => {
  await render(<App />);
  expect(screen.getByText('Project workspace')).toBeVisible();
  expect(workspace.ProjectWorkspace).toHaveBeenCalledWith(
    { store: projectStore, newId },
    undefined,
  );
});
test('catches screen failure and permits a fresh render', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const diagnostics = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  let shouldFail = true;
  jest.spyOn(workspace, 'ProjectWorkspace').mockImplementation(() => {
    if (shouldFail) throw new Error('private user text');
    return <Text>Project workspace</Text>;
  });
  await render(<App />);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  shouldFail = false;
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Project workspace')).toBeVisible();
  expect(diagnostics.mock.calls).toEqual([
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.failed' }],
    [{ schemaVersion: 1, scope: 'app-shell', event: 'render.retry_requested' }],
  ]);
});
