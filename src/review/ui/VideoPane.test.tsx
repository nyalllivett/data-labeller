import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useVideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { VideoPane } from './VideoPane';

type Event = { currentTime?: number; status?: VideoPlayerStatus; isPlaying?: boolean };
const mockPlayers: ReturnType<typeof mockVideoDouble>[] = [];
let mockLoading = false;
function mockVideoDouble() {
  const callbacks = new Map<string, Set<(event: Event) => void>>();
  let reported = 0;
  const requests: number[] = [];
  const remove = jest.fn();
  const player = {
    status: (mockLoading ? 'loading' : 'readyToPlay') as VideoPlayerStatus, playing: false,
    muted: false, timeUpdateEventInterval: 0,
    get currentTime() { return reported; }, set currentTime(value: number) { requests.push(value); },
    play: jest.fn(), pause: jest.fn(),
    addListener: jest.fn((name: string, callback: (event: Event) => void) => {
      const list = callbacks.get(name) ?? new Set(); list.add(callback); callbacks.set(name, list);
      return { remove: () => { remove(); list.delete(callback); } };
    }),
  };
  const emit = (name: string, event: Event) => {
    if (event.currentTime !== undefined) reported = event.currentTime;
    if (event.status) player.status = event.status;
    if (event.isPlaying !== undefined) player.playing = event.isPlaying;
    for (const callback of callbacks.get(name) ?? []) callback(event);
  };
  return { player, emit, requests, callbacks, remove };
}
jest.mock('expo-video', () => {
  const React = jest.requireActual('react'); const { View } = jest.requireActual('react-native');
  return { useVideoPlayer: jest.fn((_source, setup) => {
    const [player] = React.useState(() => {
      const value = mockVideoDouble(); mockPlayers.push(value); setup(value.player); return value.player;
    });
    return player;
  }), VideoView: (props: object) => React.createElement(View, { ...props, accessibilityLabel: 'Native saved video' }) };
});
beforeEach(() => { mockPlayers.length = 0; mockLoading = false; jest.useFakeTimers(); jest.spyOn(console, 'info').mockImplementation(() => undefined); });
afterEach(() => { jest.useRealTimers(); });
const props = () => ({ id: 'record-A', uri: 'file:///private/video.mov', durationMs: 1000, seekMs: null as number | null, seekRequest: 0, onPlayback: jest.fn() });

test('uses hook-managed muted local video, reports native time and leaves a seek unconfirmed until an event', async () => {
  const p = props(); const { rerender, unmount } = await render(<VideoPane {...p} />); const f = mockPlayers[0]!;
  expect(useVideoPlayer).toHaveBeenCalledWith({ uri: p.uri, useCaching: false }, expect.any(Function));
  expect(f.player).toMatchObject({ muted: true, timeUpdateEventInterval: 0.25 });
  expect(screen.getByLabelText('Native saved video').props).toMatchObject({ nativeControls: false, contentFit: 'contain' });
  expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, 0, true);
  const user = userEvent.setup(); await user.press(screen.getByRole('button', { name: 'Play video' })); expect(f.player.play).toHaveBeenCalledTimes(1);
  await act(async () => { f.emit('playingChange', { isPlaying: true }); });
  await user.press(screen.getByRole('button', { name: 'Pause video' })); expect(f.player.pause).toHaveBeenCalledTimes(1);
  await rerender(<VideoPane {...p} seekMs={500} seekRequest={1} />);
  expect(f.requests).toEqual([0.5]); expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, 0, true);
  await act(async () => { f.emit('timeUpdate', { currentTime: 0.498 }); });
  expect(screen.getByText(/Reported playback: 0.498 seconds/)).toBeVisible(); expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, 498, true);
  await act(async () => { f.emit('statusChange', { status: 'loading' }); f.emit('statusChange', { status: 'readyToPlay' }); });
  expect(f.requests).toEqual([0.5]);
  await unmount(); expect(f.remove).toHaveBeenCalledTimes(3); expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, null, false);
});
test('inspection seek waits for ready, consumes each request once and retries video without changing annotation identity', async () => {
  mockLoading = true; const p = props(); const { unmount } = await render(<VideoPane {...p} seekMs={200} seekRequest={1} />);
  const f = mockPlayers[0]!; expect(f.requests).toEqual([]); expect(screen.getByRole('button', { name: 'Play video' })).toBeDisabled();
  await act(async () => { f.emit('statusChange', { status: 'readyToPlay' }); }); expect(f.requests).toEqual([0.2]);
  await act(async () => { f.emit('statusChange', { status: 'error' }); });
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be confirmed/);
  expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, null, false);
  mockLoading = false; await userEvent.setup().press(screen.getByRole('button', { name: 'Retry video' }));
  expect(mockPlayers).toHaveLength(2); expect(f.remove).toHaveBeenCalledTimes(3);
  expect(mockPlayers[1]!.requests).toEqual([0.2]); expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, 0, true);
  await act(async () => { f.emit('timeUpdate', { currentTime: 0.999 }); });
  expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, 0, true);
  await unmount();
});
test('unusable position disables annotation reporting while Pause remains accessible, then a valid report restores it', async () => {
  const p = props(); await render(<VideoPane {...p} />); const f = mockPlayers[0]!;
  await act(async () => { f.emit('playingChange', { isPlaying: true }); f.emit('timeUpdate', { currentTime: 1.0001 }); });
  expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, null, false);
  expect(screen.getByRole('button', { name: 'Pause video' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent(/outside captured bounds/);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Pause video' }));
  expect(f.player.pause).toHaveBeenCalled();
  await act(async () => { f.emit('timeUpdate', { currentTime: 0.5 }); });
  expect(p.onPlayback).toHaveBeenLastCalledWith(p.id, 500, true);
  await act(async () => { f.emit('statusChange', { status: 'error' }); });
  expect(screen.getByRole('button', { name: 'Pause video' })).toBeEnabled();
});
