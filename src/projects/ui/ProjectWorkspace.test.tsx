import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { id } from '../../../test/ids';
import { createProject, type Project } from '../project';
import { ProjectStore } from '../ProjectStore';
import type {
  ProjectOperation,
  ProjectRepository,
  Workspace,
} from '../../storage/ProjectRepository';
import { ProjectWorkspace } from './ProjectWorkspace';

function fixture() {
  const projects = new Map<string, Project>();
  const repository: jest.Mocked<ProjectRepository> = {
    load: jest.fn().mockResolvedValue({ projects: [], pending: [] }),
    save: jest.fn().mockImplementation(async (operation: ProjectOperation) => {
      projects.set(operation.project.id, operation.project);
      return { projects: [...projects.values()], pending: [] };
    }),
    discard: jest
      .fn()
      .mockImplementation(async () => ({ projects: [...projects.values()], pending: [] })),
  };
  let nextProjectId = 1;
  let nextOperationId = 100;
  const store = new ProjectStore(repository, () => id(nextOperationId++));
  return { repository, store, newId: () => id(nextProjectId++) };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
});
async function enterName(name: string) {
  await fireEvent.changeText(screen.getByLabelText('Name'), name);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Save name' }));
}

test('creates/renames a project, adds/renames/archives/restores labels with stable IDs, and cancels/no-ops editing', async () => {
  const { repository, store, newId } = fixture();
  const user = userEvent.setup();
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  expect(screen.getByText('No projects yet.')).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'New project' }));
  await enterName('  My project  ');
  expect(screen.getByRole('header', { name: 'My project' })).toBeVisible();
  expect(screen.getByText('No labels yet.')).toBeVisible();
  expect(repository.save.mock.calls[0]?.[0]).toMatchObject({
    expectedRevision: 0,
    project: { id: id(1), name: 'My project', revision: 1 },
  });
  await user.press(screen.getByRole('button', { name: 'Rename project' }));
  await enterName('Renamed');
  await user.press(screen.getByRole('button', { name: 'Add label' }));
  await enterName('Movement');
  await user.press(screen.getByRole('button', { name: 'Rename Movement' }));
  await enterName('New movement');
  expect(store.getSnapshot().projects[0]?.labels[0]).toEqual({
    id: id(2),
    name: 'New movement',
    archived: false,
  });
  await user.press(screen.getByRole('button', { name: 'Archive New movement' }));
  expect(screen.getByText('Archived')).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Restore New movement' }));
  expect(screen.queryByText('Archived')).not.toBeOnTheScreen();
  expect(store.getSnapshot().projects[0]?.labels[0]?.id).toBe(id(2));
  await user.press(screen.getByRole('button', { name: 'Add label' }));
  await enterName('New movement');
  expect(screen.getAllByRole('button', { name: 'Rename New movement' })).toHaveLength(2);
  const count = repository.save.mock.calls.length;
  await user.press(screen.getByRole('button', { name: 'Add label' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Discarded');
  await user.press(screen.getByRole('button', { name: 'Cancel editing' }));
  expect(repository.save).toHaveBeenCalledTimes(count);
  await user.press(screen.getByRole('button', { name: 'Rename project' }));
  await enterName(' Renamed ');
  expect(repository.save).toHaveBeenCalledTimes(count);
  await user.press(screen.getByRole('button', { name: 'All projects' }));
  await user.press(screen.getByRole('button', { name: 'Open Renamed' }));
  expect(screen.getByRole('header', { name: 'Renamed' })).toBeVisible();
});
test('failed saves lock the retained draft and retry the identical request without regenerating IDs', async () => {
  const { repository, store, newId } = fixture();
  const user = userEvent.setup();
  repository.save.mockRejectedValueOnce(new Error('PRIVATE storage failure'));
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  await user.press(screen.getByRole('button', { name: 'New project' }));
  await enterName('Retained');
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Retained');
  expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  expect(screen.queryByText('All submitted changes are saved locally.')).not.toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Retry submitted change' }));
  expect(repository.save.mock.calls[0]?.[0]).toBe(repository.save.mock.calls[1]?.[0]);
  expect(screen.getByRole('header', { name: 'Retained' })).toBeVisible();
  expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
});
test('explicit discard clears a failed draft while preserving committed data', async () => {
  const { repository, store, newId } = fixture();
  const user = userEvent.setup();
  repository.save.mockRejectedValueOnce(new Error('failed'));
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  await user.press(screen.getByRole('button', { name: 'New project' }));
  await enterName('Draft');
  await user.press(screen.getByRole('button', { name: 'Discard submitted change' }));
  await user.press(screen.getByRole('button', { name: 'Confirm discard' }));
  expect(repository.discard).toHaveBeenCalledWith(id(100));
  expect(screen.getByText('No projects yet.')).toBeVisible();
  expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
});
test('loading/failure never masquerades as an empty workspace, and initialization can be retried', async () => {
  const { repository, store, newId } = fixture();
  let reject!: (error: Error) => void;
  repository.load.mockReturnValueOnce(
    new Promise<Workspace>((_resolve, fail) => {
      reject = fail;
    }),
  );
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  expect(screen.getByRole('progressbar')).toBeVisible();
  expect(screen.queryByText('No projects yet.')).not.toBeOnTheScreen();
  await act(async () => {
    reject(new Error('private initialization error'));
  });
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByText('No projects yet.')).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry loading' }));
  expect(screen.getByText('No projects yet.')).toBeVisible();
});
test('recovered pending intent blocks unrelated edits and opens the reconciled project after retry', async () => {
  const { repository, store, newId } = fixture();
  const project = createProject(id(1), 'Recovered');
  const operation = { id: id(50), expectedRevision: 0, project };
  repository.load.mockResolvedValueOnce({ projects: [], pending: [operation] });
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry submitted change' }));
  expect(repository.save).toHaveBeenCalledWith(operation);
  expect(screen.getByRole('header', { name: 'Recovered' })).toBeVisible();
});

test('failed discard remains visible and its explicit retry clears the editor only after confirmation', async () => {
  const { repository, store, newId } = fixture();
  const user = userEvent.setup();
  repository.save.mockRejectedValueOnce(new Error('save failed'));
  repository.discard.mockRejectedValueOnce(new Error('discard failed'));
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  await user.press(screen.getByRole('button', { name: 'New project' }));
  await enterName('Draft');
  await user.press(screen.getByRole('button', { name: 'Discard submitted change' }));
  await user.press(screen.getByRole('button', { name: 'Confirm discard' }));
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Draft');
  await user.press(screen.getByRole('button', { name: 'Retry discard' }));
  expect(repository.discard).toHaveBeenCalledTimes(2);
  expect(repository.save).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
});

test('initialization retry after request-ID failure retains the unstaged editor draft', async () => {
  const { repository, newId } = fixture();
  const operationId = jest
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('native ID unavailable');
    })
    .mockReturnValue(id(100));
  const store = new ProjectStore(repository, operationId);
  await render(<ProjectWorkspace store={store} newId={newId} onCapture={jest.fn()} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'New project' }));
  await enterName('Unstaged draft');
  await user.press(screen.getByRole('button', { name: 'Retry loading' }));
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Unstaged draft');
  expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(screen.getByRole('header', { name: 'Unstaged draft' })).toBeVisible();
  expect(repository.save).toHaveBeenCalledTimes(1);
});
