import { nativePlayback, type VideoHandle } from './nativePlayback';

test('converts SDK seconds at one boundary without interpolation and forwards controls', () => {
  const callbacks: Record<string, (value: never) => void> = {};
  const remove = jest.fn();
  const player = { currentTime: 1.25, status: 'readyToPlay', playing: false, play: jest.fn(), pause: jest.fn(),
    addListener: jest.fn((name, callback) => { callbacks[name] = callback; return { remove }; }),
  } as unknown as VideoHandle;
  const port = nativePlayback(player); const listener = jest.fn(); const dispose = port.subscribe(listener);
  expect(port.read()).toEqual({ status: 'readyToPlay', playing: false, positionMs: 1250 });
  port.seek(500); expect(player.currentTime).toBe(0.5);
  port.play(); port.pause(); expect(player.play).toHaveBeenCalled(); expect(player.pause).toHaveBeenCalled();
  callbacks.timeUpdate!({ currentTime: 0.498 } as never);
  callbacks.statusChange!({ status: 'loading' } as never); callbacks.playingChange!({ isPlaying: true } as never);
  expect(listener.mock.calls).toEqual([[{ positionMs: 498 }], [{ status: 'loading' }], [{ playing: true }]]);
  dispose(); expect(remove).toHaveBeenCalledTimes(3);
});
test('subscription setup failure removes already installed listeners and leaves no accepted false status', () => {
  const remove = jest.fn(); const player = { addListener: jest.fn().mockReturnValueOnce({ remove }).mockImplementationOnce(() => { throw new Error('secret'); }) } as unknown as VideoHandle;
  expect(() => nativePlayback(player).subscribe(jest.fn())).toThrow('secret'); expect(remove).toHaveBeenCalledTimes(1);
});
