import { render, screen, userEvent } from '@testing-library/react-native';
import { id } from '../../../test/ids';
import { LabelRow } from './LabelRow';

const labels = [{ id: id(2), name: 'A' }, { id: id(3), name: 'B' }];
test('horizontal labels remain independent and visually highlight each active label', async () => {
  const toggle = jest.fn();
  const { rerender } = await render(<LabelRow labels={labels} active={new Set([id(2), id(3)])} disabled={false} toggle={toggle} />);
  expect(screen.getByLabelText('Live labels').props.horizontal).toBe(true);
  expect(screen.getByRole('button', { name: 'A', selected: true })).toHaveStyle({ backgroundColor: '#175d44' });
  expect(screen.getByRole('button', { name: 'B', selected: true })).toHaveStyle({ backgroundColor: '#175d44' });
  await userEvent.setup().press(screen.getByRole('button', { name: 'A' }));
  expect(toggle).toHaveBeenCalledWith(id(2));
  await rerender(<LabelRow labels={labels} active={new Set([id(3)])} disabled={true} toggle={toggle} />);
  expect(screen.getByRole('button', { name: 'A', selected: false })).toHaveStyle({ backgroundColor: '#273449' });
  expect(screen.getByRole('button', { name: 'B', selected: true })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole('button', { name: 'B' }));
  expect(toggle).toHaveBeenCalledTimes(1);
});
test('no labels means unlabelled video and does not imply negative examples', async () => {
  await render(<LabelRow labels={[]} active={new Set()} disabled={false} toggle={jest.fn()} />);
  expect(screen.getByText('No active project labels. Video will be unlabelled.')).toBeVisible();
  expect(screen.queryAllByRole('button')).toEqual([]);
});
