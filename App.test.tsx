import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import App from './App';
import * as workspace from './src/projects/ui/ProjectWorkspace';
import { newId, projectStore } from './src/projects/runtime';
import { camera, captureStore } from './src/capture/runtime';
import * as capture from './src/capture/ui/CaptureScreen';
import { createProject } from './src/projects/project';
import { id } from './test/ids';
import { reviewStore } from './src/review/runtime';
import { exportStore } from './src/export/runtime';

let mockExportChanged: () => void;
jest.mock('./src/export/runtime', () => ({ exportStore: {
  getSnapshot: jest.fn().mockReturnValue({ project: null }),
  subscribe: jest.fn((changed) => { mockExportChanged = changed; return () => undefined; }),
  open: jest.fn(),
} }));
jest.mock('./src/export/ui/ExportScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ExportScreen: jest.fn(() => <Text>Export screen</Text>) };
});

let mockReviewChanged: () => void;
jest.mock('./src/review/runtime', () => ({ reviewStore: {
  getSnapshot: jest.fn().mockReturnValue({ project: null }),
  subscribe: jest.fn((changed) => { mockReviewChanged = changed; return () => undefined; }),
  open: jest.fn(),
} }));
jest.mock('./src/review/ui/ReviewScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ReviewScreen: jest.fn(() => <Text>Review screen</Text>) };
});

let mockCaptureChanged: () => void;
jest.mock('./src/capture/runtime', () => ({
  camera: {},
  captureStore: {
    getSnapshot: jest.fn().mockReturnValue({ project: null }),
    subscribe: jest.fn((changed) => { mockCaptureChanged = changed; return () => undefined; }),
    open: jest.fn(),
  },
}));
jest.mock('./src/capture/ui/CaptureScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { CaptureScreen: jest.fn(() => <Text>Capture screen</Text>) };
});
beforeEach(() => {
  jest.mocked(captureStore.getSnapshot).mockReturnValue({ ...captureStore.getSnapshot(), project: null });
  jest.mocked(reviewStore.getSnapshot).mockReturnValue({ ...reviewStore.getSnapshot(), project: null });
  jest.mocked(exportStore.getSnapshot).mockReturnValue({ ...exportStore.getSnapshot(), project: null });
});

jest.mock('./src/projects/runtime', () => ({ newId: jest.fn(), projectStore: {} }));
jest.mock('./src/projects/ui/ProjectWorkspace', () => {
  const { Text } = jest.requireActual('react-native');
  return { ProjectWorkspace: jest.fn(() => <Text>Project workspace</Text>) };
});
test('mounts the workspace with a stable store and native ID factory', async () => {
  await render(<App />);
  expect(screen.getByText('Project workspace')).toBeVisible();
  expect(workspace.ProjectWorkspace).toHaveBeenCalledWith(
    { store: projectStore, newId, onCapture: expect.any(Function), onReview: expect.any(Function), onExport: expect.any(Function) },
    undefined,
  );
});
test('opens the selected project in the stable capture store and renders its capture boundary', async () => {
  await render(<App />);
  const props = jest.mocked(workspace.ProjectWorkspace).mock.calls[0]![0];
  const project = createProject(id(1), 'P');
  props.onCapture(project);
  expect(captureStore.open).toHaveBeenCalledWith(project);
  await act(async () => {
    jest.mocked(captureStore.getSnapshot).mockReturnValue({ ...captureStore.getSnapshot(), project });
    mockCaptureChanged();
  });
  expect(screen.getByText('Capture screen')).toBeVisible();
  expect(capture.CaptureScreen).toHaveBeenCalledWith({ store: captureStore, camera }, undefined);
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

test('opens saved review from the workspace in the stable editor boundary', async () => {
  await render(<App />);
  const project = createProject(id(1), 'P');
  jest.mocked(workspace.ProjectWorkspace).mock.calls[0]![0].onReview(project);
  expect(reviewStore.open).toHaveBeenCalledWith(project);
  await act(async () => {
    jest.mocked(reviewStore.getSnapshot).mockReturnValue({ ...reviewStore.getSnapshot(), project });
    mockReviewChanged();
  });
  expect(screen.getByText('Review screen')).toBeVisible();
});
test('opens export from the committed workspace through its stable store', async () => {
  await render(<App />); const project = createProject(id(1), 'P');
  jest.mocked(workspace.ProjectWorkspace).mock.calls[0]![0].onExport(project);
  expect(exportStore.open).toHaveBeenCalledWith(project);
  await act(async () => {
    jest.mocked(exportStore.getSnapshot).mockReturnValue({ ...exportStore.getSnapshot(), project }); mockExportChanged();
  });
  expect(screen.getByText('Export screen')).toBeVisible();
});
test.each(['capture', 'review', 'export'] as const)('queued project presses cannot open another hidden workspace while %s is active', async (active) => {
  await render(<App />); const props = jest.mocked(workspace.ProjectWorkspace).mock.calls[0]![0]; const project = createProject(id(1), 'P');
  const store = { capture: captureStore, review: reviewStore, export: exportStore }[active];
  jest.mocked(store.getSnapshot).mockReturnValue({ ...store.getSnapshot(), project } as never);
  props.onCapture(project); props.onReview(project); props.onExport(project);
  expect(captureStore.open).not.toHaveBeenCalled(); expect(reviewStore.open).not.toHaveBeenCalled(); expect(exportStore.open).not.toHaveBeenCalled();
});
