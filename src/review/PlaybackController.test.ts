import { PlaybackController, type PlaybackPort, type PlaybackUpdate } from './PlaybackController';

function fixture() {
  let callback!: (update: Partial<PlaybackUpdate>) => void;
  const remove = jest.fn();
  const port: jest.Mocked<PlaybackPort> = {
    read: jest.fn().mockReturnValue({ status: 'readyToPlay', positionMs: 200, playing: false }),
    subscribe: jest.fn((listener) => { callback = listener; return remove; }),
    play: jest.fn(), pause: jest.fn(), seek: jest.fn(),
  };
  const controller = new PlaybackController(1000);
  return { port, controller, remove, report: (update: Partial<PlaybackUpdate>) => callback(update) };
}
beforeEach(() => { jest.spyOn(console, 'info').mockImplementation(() => undefined); });
test('uses reported media time, preserves seek uncertainty, and plays/pauses only while ready', () => {
  const f = fixture(); const listener = jest.fn(); const unsubscribe = f.controller.subscribe(listener);
  expect(f.controller.toggle()).toBe(false); expect(f.controller.seek(100)).toBe(false);
  f.controller.connect(f.port); expect(f.controller.getSnapshot().positionMs).toBe(200);
  expect(f.controller.seek(500)).toBe(true); expect(f.port.seek).toHaveBeenCalledWith(500);
  expect(f.controller.getSnapshot().positionMs).toBe(200);
  f.report({ positionMs: 498 }); expect(f.controller.getSnapshot().positionMs).toBe(498);
  expect(f.controller.toggle()).toBe(true); expect(f.port.play).toHaveBeenCalledTimes(1);
  f.report({ playing: true }); expect(f.controller.toggle()).toBe(true); expect(f.port.pause).toHaveBeenCalledTimes(1);
  f.report({ status: 'loading' }); expect(f.controller.toggle()).toBe(true); expect(f.controller.seek(100)).toBe(false);
  f.report({ playing: false }); expect(f.controller.toggle()).toBe(false);
  f.report({ status: 'readyToPlay', playing: false }); expect(f.controller.seek(0)).toBe(true); expect(f.controller.seek(1000)).toBe(true);
  expect(listener).toHaveBeenCalled(); unsubscribe(); const count = listener.mock.calls.length;
  f.controller.disconnect(); const old = f.controller.getSnapshot(); f.report({ positionMs: 999 });
  expect(f.controller.getSnapshot()).toBe(old); expect(listener).toHaveBeenCalledTimes(count); expect(f.remove).toHaveBeenCalledTimes(1);
  expect(f.controller.toggle()).toBe(false); f.controller.disconnect();
});
test.each([-1, NaN, Infinity, 1001])('unusable reported position %s disables annotation use, preserves controls and recovers on a valid report', (positionMs) => {
  const f = fixture(); f.controller.connect(f.port); f.report({ positionMs });
  expect(f.controller.getSnapshot()).toMatchObject({ positionMs: 200, error: false, positionUsable: false });
  expect(f.controller.toggle()).toBe(true); expect(f.controller.seek(200)).toBe(true);
  f.report({ positionMs: 250 }); expect(f.controller.getSnapshot()).toMatchObject({ positionMs: 250, positionUsable: true });
});
test.each([-1, NaN, 1001])('invalid seek %s is never sent to native playback', (positionMs) => {
  const f = fixture(); f.controller.connect(f.port); expect(f.controller.seek(positionMs)).toBe(false);
  expect(f.port.seek).not.toHaveBeenCalled(); expect(f.controller.getSnapshot().error).toBe(true);
});
test('native status/read/subscription/control/cleanup failures expose fixed diagnostics with no raw data', () => {
  for (const step of ['read', 'subscribe', 'play', 'pause', 'seek', 'remove'] as const) {
    const f = fixture();
    const failure = () => { throw new Error('/private/raw-secret'); };
    if (step === 'remove') f.remove.mockImplementationOnce(failure); else f.port[step].mockImplementationOnce(failure);
    f.controller.connect(f.port);
    if (step === 'play') f.controller.toggle();
    if (step === 'pause' || step === 'remove') f.controller.disconnect();
    if (step === 'seek') f.controller.seek(200);
    expect(f.controller.getSnapshot().error).toBe(true);
  }
  const f = fixture(); f.controller.connect(f.port); f.report({ status: 'error' });
  expect(f.controller.getSnapshot()).toMatchObject({ status: 'error', error: true });
  expect(JSON.stringify((console.info as jest.Mock).mock.calls)).not.toContain('raw-secret');
});
test('a late listener from the previous connected player cannot update a reconnected controller', () => {
  const f = fixture(); f.controller.connect(f.port); const old = f.port.subscribe.mock.calls[0]![0];
  f.controller.disconnect(); const next = fixture(); f.controller.connect(next.port);
  old({ positionMs: 999 }); expect(f.controller.getSnapshot().positionMs).toBe(200);
});
test('ordinary SDK float/double rounding is not a permanent playback failure or a fabricated corrected annotation', () => {
  const f = fixture(); const controller = new PlaybackController(1001);
  f.port.read.mockReturnValueOnce({ status: 'readyToPlay', positionMs: Math.fround(1.001) * 1000, playing: true });
  controller.connect(f.port);
  expect(controller.getSnapshot()).toMatchObject({ positionUsable: false, error: false, playing: true });
  expect(controller.toggle()).toBe(true); expect(f.port.pause).toHaveBeenCalledTimes(1);
  f.report({ positionMs: 1001 }); expect(controller.getSnapshot()).toMatchObject({ positionMs: 1001, positionUsable: true });
  f.report({ status: 'error', playing: true }); expect(f.port.pause).toHaveBeenCalledTimes(2);
  expect(controller.toggle()).toBe(true); expect(f.port.pause).toHaveBeenCalledTimes(3);
  f.port.pause.mockImplementation(() => { throw new Error('pause unavailable'); });
  expect(controller.toggle()).toBe(false);
  const g = fixture(); const other = new PlaybackController(2007); other.connect(g.port);
  g.report({ positionMs: 2.007 * 1000 }); expect(other.getSnapshot()).toMatchObject({ positionUsable: false, error: false });
  g.report({ positionMs: 2007 }); expect(other.getSnapshot()).toMatchObject({ positionUsable: true, positionMs: 2007 });
});
