import { fitWindow, fractionInWindow, panWindow, visibleInterval, zoomWindow } from './timeline';
import { id } from '../../test/ids';

test('all tracks use a common window, with centered zoom, bounded pan and Fit', () => {
  const full = fitWindow(1000); expect(full).toEqual({ startMs: 0, endMs: 1000 });
  const zoomed = zoomWindow(full, 'in', 1000); expect(zoomed).toEqual({ startMs: 250, endMs: 750 });
  expect(fractionInWindow(500, zoomed)).toBe(0.5);
  expect(panWindow(zoomed, 'earlier', 1000)).toEqual({ startMs: 0, endMs: 500 });
  expect(panWindow(zoomed, 'later', 1000)).toEqual({ startMs: 500, endMs: 1000 });
  expect(zoomWindow(zoomed, 'out', 1000)).toEqual(full);
  expect(zoomWindow(full, 'out', 1000)).toBe(full);
  expect(zoomWindow({ startMs: 1, endMs: 1 + Number.EPSILON }, 'in', 1000)).toEqual({ startMs: 1, endMs: 1 + Number.EPSILON });
});
test('clips display geometry only, preserves zero markers and excludes offscreen intervals', () => {
  const window = { startMs: 200, endMs: 600 };
  const interval = { id: 0, labelId: id(2), startMs: 100, endMs: 700 };
  expect(visibleInterval(interval, window)).toEqual({ left: 0, width: 1 });
  expect(interval).toMatchObject({ startMs: 100, endMs: 700 });
  expect(visibleInterval({ ...interval, startMs: 400, endMs: 400 }, window)).toEqual({ left: 0.5, width: 0 });
  expect(visibleInterval({ ...interval, startMs: 600, endMs: 600 }, window)).toEqual({ left: 1, width: 0 });
  expect(visibleInterval({ ...interval, startMs: 0, endMs: 100 }, window)).toBeNull();
  expect(visibleInterval({ ...interval, startMs: 601 }, window)).toBeNull();
});
