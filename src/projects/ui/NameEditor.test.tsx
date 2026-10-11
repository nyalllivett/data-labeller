import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { NameEditor } from './NameEditor';
import { ProjectError } from '../project';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

test('uses initial input, validates without leaking errors, and saves the corrected draft', async () => {
  const save = jest
    .fn()
    .mockRejectedValueOnce(new ProjectError('invalid-name'))
    .mockResolvedValue(true);
  const onSaved = jest.fn();
  const onCancel = jest.fn();
  const user = userEvent.setup();
  await render(
    <NameEditor
      edit={{ title: 'Rename label', initialName: 'Old', save }}
      locked={false}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Old');
  await fireEvent.changeText(screen.getByLabelText('Name'), 'bad\n');
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a name without control characters.');
  expect(onSaved).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Name'), 'New');
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(save).toHaveBeenLastCalledWith('New');
  expect(onSaved).toHaveBeenCalledTimes(1);
});
test('retains an unconfirmed draft, catches unexpected preparation error, and permits cancellation', async () => {
  const save = jest
    .fn()
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error('private raw error'));
  const cancel = jest.fn();
  const saved = jest.fn();
  const user = userEvent.setup();
  await render(
    <NameEditor
      edit={{ title: 'New project', initialName: 'Draft', save }}
      locked={false}
      onSaved={saved}
      onCancel={cancel}
    />,
  );
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Draft');
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not prepare this change. Try again.');
  expect(screen.queryByText('private raw error')).not.toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Cancel editing' }));
  expect(cancel).toHaveBeenCalledTimes(1);
});
test('guards repeated/locked actions and does not notify a parent after unmount during save', async () => {
  let resolve!: (value: boolean) => void;
  const save = jest.fn(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  const saved = jest.fn();
  const cancel = jest.fn();
  const props = {
    edit: { title: 'New label', initialName: 'Label', save },
    onSaved: saved,
    onCancel: cancel,
  };
  const view = await render(<NameEditor {...props} locked />);
  const user = userEvent.setup();
  expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(save).not.toHaveBeenCalled();
  await view.rerender(<NameEditor {...props} locked={false} />);
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Save name' }));
  expect(save).toHaveBeenCalledTimes(1);
  await view.unmount();
  await act(async () => {
    resolve(true);
  });
  expect(saved).not.toHaveBeenCalled();
});
