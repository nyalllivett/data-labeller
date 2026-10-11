import { render, screen, userEvent } from '@testing-library/react-native';
import { id } from '../../../test/ids';
import { createProject } from '../project';
import type { ProjectState } from '../ProjectStore';
import type { StorageErrorCode } from '../../storage/StorageError';
import { RecoveryPanel } from './RecoveryPanel';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const state: ProjectState = {
  projects: [],
  pending: [],
  attempted: null,
  status: 'ready',
  error: null,
  discarding: null,
};
test.each<StorageErrorCode>([
  'unavailable',
  'corrupt',
  'unsupported-schema',
  'conflict',
  'operation-collision',
])('surfaces %s with a retry and no empty/success fiction', async (error) => {
  const retry = jest.fn().mockResolvedValue(false);
  const discard = jest.fn().mockResolvedValue(false);
  await render(
    <RecoveryPanel state={{ ...state, status: 'failed', error }} retry={retry} discard={discard} />,
  );
  expect(screen.getByRole('alert')).toBeVisible();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry loading' }));
  expect(retry).toHaveBeenCalledWith(null);
});
test('deduplicates attempted intent, supports retry, and requires explicit discard confirmation', async () => {
  const op = {
    id: id(2),
    expectedRevision: 0,
    project: {
      ...createProject(id(1), 'Pending'),
      labels: [{ id: id(3), name: 'Label', archived: true }],
    },
  };
  const retry = jest.fn().mockResolvedValue(false);
  const discard = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const user = userEvent.setup();
  await render(
    <RecoveryPanel
      state={{ ...state, status: 'failed', error: 'conflict', attempted: op, pending: [op] }}
      retry={retry}
      discard={discard}
    />,
  );
  expect(screen.getAllByRole('header', { name: 'Submitted change: Pending' })).toHaveLength(1);
  expect(screen.getByText('Label (archived)')).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Retry submitted change' }));
  expect(retry).toHaveBeenCalledWith(op);
  await user.press(screen.getByRole('button', { name: 'Discard submitted change' }));
  expect(discard).not.toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'Keep submitted change' }));
  expect(screen.queryByRole('button', { name: 'Confirm discard' })).not.toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Discard submitted change' }));
  await user.press(screen.getByRole('button', { name: 'Confirm discard' }));
  expect(screen.getByRole('button', { name: 'Confirm discard' })).toBeEnabled();
  await user.press(screen.getByRole('button', { name: 'Confirm discard' }));
  expect(discard).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: 'Confirm discard' })).not.toBeOnTheScreen();
});
test.each(['loading', 'saving'] as const)(
  'shows %s and disables pending actions',
  async (status) => {
    const op = { id: id(2), expectedRevision: 0, project: createProject(id(1), 'P') };
    await render(
      <RecoveryPanel
        state={{ ...state, status, pending: [op] }}
        retry={jest.fn()}
        discard={jest.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry submitted change' })).toBeDisabled();
  },
);

test('distinguishes an unconfirmed discard from a request to save the same draft', async () => {
  const op = { id: id(2), expectedRevision: 0, project: createProject(id(1), 'P') };
  const retry = jest.fn().mockResolvedValue(true);
  await render(
    <RecoveryPanel
      state={{ ...state, status: 'failed', error: 'unavailable', attempted: op, discarding: op.id }}
      retry={retry}
      discard={jest.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Retry submitted change' })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry discard' }));
  expect(retry).toHaveBeenCalledWith(op);
});

test('pending active labels are shown without an archived marker', async () => {
  const project = {
    ...createProject(id(1), 'P'),
    labels: [{ id: id(3), name: 'Active label', archived: false }],
  };
  const operation = { id: id(2), expectedRevision: 0, project };
  await render(
    <RecoveryPanel
      state={{ ...state, pending: [operation] }}
      retry={jest.fn()}
      discard={jest.fn()}
    />,
  );
  expect(screen.getByText('Active label')).toBeVisible();
  expect(screen.queryByText('Active label (archived)')).not.toBeOnTheScreen();
});
