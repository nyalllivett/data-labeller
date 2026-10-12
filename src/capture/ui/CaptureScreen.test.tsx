import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { Camera, type CameraViewProps } from 'expo-camera';
import type { ForwardedRef } from 'react';

import { captureFixture, deferred } from '../../../test/captureFixture';
import { id } from '../../../test/ids';
import { CaptureError, type CaptureErrorCode } from '../CaptureError';
import { type CaptureState } from '../CaptureStore';
import { NativeCamera, type CameraHandle } from '../nativeCamera';
import { CaptureScreen } from './CaptureScreen';
import { createRecordingDraft } from '../recording';
import type { MediaPosition } from '../recording';

let mockPreviewReady = true;
const mockHandle: jest.Mocked<CameraHandle> = {
  recordAsync: jest.fn(), sampleRecordingPosition: jest.fn(), stopRecordingAsync: jest.fn(),
};
jest.mock('expo-camera', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    Camera: { getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() },
    CameraView: React.forwardRef(function MockCameraPreview(props: CameraViewProps, ref: ForwardedRef<CameraHandle>) {
      const { onCameraReady } = props;
      React.useImperativeHandle(ref, () => mockHandle, []);
      React.useEffect(() => { if (mockPreviewReady) onCameraReady?.(); }, [onCameraReady]);
      return React.createElement(View, { ...props, accessibilityLabel: 'Camera preview' });
    }),
  };
});

let background!: (state: AppStateStatus) => void;
const remove = jest.fn();
beforeEach(() => {
  jest.useFakeTimers();
  mockPreviewReady = true;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { background = listener; return { remove }; });
  jest.mocked(Camera.getCameraPermissionsAsync).mockResolvedValue({ granted: true, canAskAgain: false, status: 'granted', expires: 'never' } as Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>);
  jest.mocked(Camera.requestCameraPermissionsAsync).mockResolvedValue({ granted: true, canAskAgain: false, status: 'granted', expires: 'never' } as Awaited<ReturnType<typeof Camera.requestCameraPermissionsAsync>>);
});
afterEach(() => { jest.useRealTimers(); });

async function fixture() {
  const f = captureFixture(); await f.store.open(f.project);
  const native = new NativeCamera('avcapture-recorded-duration');
  const attach = jest.spyOn(native, 'attach');
  return { ...f, native, attach };
}

test('previews muted video, selects front/rear before capture and leaves Stop outside horizontal independent label buttons', async () => {
  const f = await fixture();
  const user = userEvent.setup();
  const { unmount } = await render(<CaptureScreen store={f.store} camera={f.native} />);
  expect(f.attach).toHaveBeenCalledWith(mockHandle);
  expect(screen.getByLabelText('Camera preview').props).toMatchObject({ facing: 'back', mode: 'video', mute: true });
  await user.press(screen.getByRole('radio', { name: 'Front camera' }));
  expect(screen.getByLabelText('Camera preview').props.facing).toBe('front');
  expect(screen.getByRole('radio', { name: 'Front camera', checked: true })).toBeVisible();
  expect(screen.getByRole('radio', { name: 'Front camera' })).toHaveStyle({ borderColor: '#68dbac' });
  await user.press(screen.getByRole('radio', { name: 'Rear camera' }));
  await user.press(screen.getByRole('button', { name: 'Start recording' }));
  expect(screen.getByText('Recording')).toBeVisible();
  expect(screen.queryAllByRole('radio')).toEqual([]);
  expect(screen.getByRole('button', { name: 'Back to projects' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Archived' })).not.toBeOnTheScreen();
  const labels = screen.getByLabelText('Live labels');
  expect(labels.props.horizontal).toBe(true);
  expect(within(labels).queryByRole('button', { name: 'Stop' })).not.toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'A' }));
  await user.press(screen.getByRole('button', { name: 'B' }));
  expect(screen.getByRole('button', { name: 'A', selected: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'B', selected: true })).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Stop' }));
  expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
  await act(async () => { await f.end(); });
  expect(screen.getByText('Saved locally.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'A', selected: false })).toBeDisabled();
  expect(screen.getByText(/Recording 1: 1.00 seconds, 2 intervals/)).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'New recording (keep pending data)' }));
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  await user.press(screen.getByRole('button', { name: 'Back to projects' }));
  expect(f.store.getSnapshot().phase).toBe('closed');
  await unmount();
  expect(remove).toHaveBeenCalled();
  expect(f.attach).toHaveBeenLastCalledWith(null);
});

test('waits for preview readiness and native video position, with Stop available while no sample exists', async () => {
  const f = await fixture(); mockPreviewReady = false;
  f.camera.position.mockRejectedValue(new CaptureError('clock-unavailable'));
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled();
  await fireEvent(screen.getByLabelText('Camera preview'), 'cameraReady');
  await userEvent.setup().press(screen.getByRole('button', { name: 'Start recording' }));
  expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(f.camera.position).toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Stop' }));
  expect(f.camera.stop).toHaveBeenCalledWith(id(10));
  await act(async () => { await f.end(); });
});

test('Stop remains enabled during a label checkpoint and pending label input is guarded', async () => {
  const f = await fixture(); await render(<CaptureScreen store={f.store} camera={f.native} />);
  const user = userEvent.setup(); await user.press(screen.getByRole('button', { name: 'Start recording' }));
  const checkpoint = deferred<void>(); f.repository.checkpoint.mockReturnValueOnce(checkpoint.promise);
  await user.press(screen.getByRole('button', { name: 'A' }));
  expect(screen.getByRole('button', { name: 'B' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await user.press(screen.getByRole('button', { name: 'Stop' }));
  await act(async () => { checkpoint.resolve(); });
  await act(async () => { await f.end(); });
  expect(f.store.getSnapshot().lastSaved?.events).toHaveLength(1);
});

test('permission checking and denial do not mount/request capture; user request and settings return can recover', async () => {
  const f = await fixture();
  const permission = deferred<Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>>();
  jest.mocked(Camera.getCameraPermissionsAsync).mockReturnValueOnce(permission.promise);
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  expect(screen.getByText('Checking camera permission…')).toBeVisible();
  expect(screen.queryByLabelText('Camera preview')).not.toBeOnTheScreen();
  await act(async () => { permission.resolve({ granted: false, canAskAgain: true, status: 'denied', expires: 'never' } as Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>); });
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled();
  expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Allow camera access' }));
  expect(Camera.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Camera preview')).toBeVisible();
  await act(async () => { background('active'); });
  expect(Camera.getCameraPermissionsAsync).toHaveBeenCalledTimes(2);
});

test('permanent denial explains device settings, and permission errors offer retry without raw errors', async () => {
  const f = await fixture();
  jest.mocked(Camera.getCameraPermissionsAsync).mockRejectedValueOnce(new Error('/private/permission-secret'));
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Camera permission could not be checked. Try again.');
  expect(screen.queryByText(/permission-secret/)).not.toBeOnTheScreen();
  jest.mocked(Camera.getCameraPermissionsAsync).mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied', expires: 'never' } as Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry camera permission' }));
  expect(screen.getByText('Camera access is denied. Enable it in device settings, then return to the app.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Allow camera access' })).not.toBeOnTheScreen();
  await act(async () => { background('active'); });
  expect(screen.getByLabelText('Camera preview')).toBeVisible();
});

test('permission request failure remains retryable and preview failure has safe local recovery', async () => {
  const f = await fixture();
  jest.mocked(Camera.getCameraPermissionsAsync).mockResolvedValueOnce({ granted: false, canAskAgain: true, status: 'denied', expires: 'never' } as Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>);
  jest.mocked(Camera.requestCameraPermissionsAsync).mockRejectedValueOnce(new Error('secret native failure'));
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Allow camera access' }));
  expect(screen.getByRole('button', { name: 'Allow camera access' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent(/Camera permission could not be checked/);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Allow camera access' }));
  await fireEvent(screen.getByLabelText('Camera preview'), 'mountError');
  expect(screen.getByRole('alert')).toHaveTextContent(/Capture or local storage is unavailable/);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry loading recordings' }));
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
});

test('backgrounding and unmount request interrupted Stop; a finalized interrupted clip is identified', async () => {
  const f = await fixture();
  const { unmount } = await render(<CaptureScreen store={f.store} camera={f.native} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Start recording' }));
  await act(async () => { background('background'); });
  expect(f.camera.stop).toHaveBeenCalledTimes(1);
  await act(async () => { await f.end(); });
  expect(screen.getByRole('alert')).toHaveTextContent(/Capture was interrupted/);
  await unmount(); expect(remove).toHaveBeenCalled();
  const second = await fixture();
  const mounted = await render(<CaptureScreen store={second.store} camera={second.native} />);
  await userEvent.setup().press(screen.getByRole('button', { name: 'Start recording' }));
  await mounted.unmount();
  expect(second.camera.stop).toHaveBeenCalledWith(id(10));
  await second.end(undefined, true);
});

test('failed saves retain pending rows and offer same-recording retry; Stop failure offers Retry Stop', async () => {
  const f = await fixture(); await render(<CaptureScreen store={f.store} camera={f.native} />);
  const user = userEvent.setup(); await user.press(screen.getByRole('button', { name: 'Start recording' }));
  f.camera.stop.mockRejectedValueOnce(new Error('native stop failure'));
  await user.press(screen.getByRole('button', { name: 'Stop' }));
  expect(screen.getByRole('button', { name: 'Retry Stop' })).toBeEnabled();
  await user.press(screen.getByRole('button', { name: 'Retry Stop' }));
  f.media.promote.mockRejectedValueOnce(new CaptureError('media-unavailable'));
  await act(async () => { await f.end(); });
  expect(screen.getByRole('button', { name: 'Retry saving pending recording' })).toBeEnabled();
  await user.press(screen.getByRole('button', { name: 'Retry saving pending recording' }));
  expect(screen.getByText('Saved locally.')).toBeVisible();
  expect(f.camera.record).toHaveBeenCalledTimes(1);
});

test('a failed label sample during Stop is retained and the saved video visibly warns that annotations are incomplete', async () => {
  const f = await fixture(); await render(<CaptureScreen store={f.store} camera={f.native} />);
  const user = userEvent.setup(); await user.press(screen.getByRole('button', { name: 'Start recording' }));
  const sampling = deferred<MediaPosition>(); f.camera.position.mockReturnValueOnce(sampling.promise);
  await user.press(screen.getByRole('button', { name: 'A' }));
  await user.press(screen.getByRole('button', { name: 'Stop' }));
  await act(async () => {
    const ending = f.end(); await Promise.resolve();
    sampling.reject(new CaptureError('clock-unavailable')); await ending;
  });
  expect(screen.getByText('Saved locally.')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(/Annotations are incomplete/);
  expect(screen.getByText(/Recording 1: 1.00 seconds, 0 intervals, incomplete annotations/)).toBeVisible();
  expect(f.store.getSnapshot().lastSaved?.annotationFailures).toEqual([{ labelId: id(2), afterEvent: 0, reason: 'clock-unavailable' }]);
});

test('only same-recording recovery is enabled while a failed checkpoint leaves the latest annotation solely in memory', async () => {
  const f = await fixture(); f.store.close();
  const old = createRecordingDraft(id(9), f.project, 'back', 'mov'); f.pending.set(old.id, old);
  await f.store.open(f.project);
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  const user = userEvent.setup(); await user.press(screen.getByRole('button', { name: 'Start recording' }));
  f.repository.checkpoint.mockRejectedValueOnce(new Error('toggle failed')).mockRejectedValueOnce(new Error('finish failed'));
  await user.press(screen.getByRole('button', { name: 'A' }));
  await act(async () => { await f.end(); });
  expect(screen.getByRole('button', { name: 'Back to projects' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'New recording (keep pending data)' })).toBeDisabled();
  const retry = screen.getAllByRole('button', { name: 'Retry saving pending recording' });
  expect(retry[0]).toBeDisabled(); expect(retry[1]).toBeEnabled();
  await user.press(retry[0]!);
  expect(f.store.getSnapshot().draft?.id).toBe(id(10));
  expect(f.media.promote).not.toHaveBeenCalled();
  await user.press(retry[1]!);
  expect(f.saved.get(id(10))?.events).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Retry saving pending recording' })).toBeEnabled();
});

test('unconfirmed writer finalization disables file recovery/new capture and permits only pending annotation retry', async () => {
  const f = await fixture(); await render(<CaptureScreen store={f.store} camera={f.native} />);
  const user = userEvent.setup(); await user.press(screen.getByRole('button', { name: 'Start recording' }));
  f.repository.checkpoint.mockRejectedValueOnce(new Error('journal failed'));
  await act(async () => { await f.end(new CaptureError('capture-unfinalized')); });
  expect(screen.getByRole('button', { name: 'Back to projects' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retry saving pending recording' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Retry pending annotation save' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/fully close and reopen the app before recovering/);
  expect(f.media.promote).not.toHaveBeenCalled();
});

test('an interrupted pending video without labels remains explicitly unlabelled during recovery', async () => {
  const f = await fixture();
  f.store.close();
  const pending = createRecordingDraft(id(9), { ...f.project, labels: [] }, 'back', 'mov');
  f.pending.set(pending.id, pending);
  await f.store.open(f.project);
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  expect(screen.getByText('Pending recording: unlabelled')).toBeVisible();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry saving pending recording' }));
  expect(f.store.getSnapshot().lastSaved?.intervals).toEqual([]);
});

test.each<CaptureErrorCode>(['unavailable', 'clock-unavailable', 'invalid-timing', 'checkpoint-failed', 'stop-failed', 'media-unavailable', 'invalid-data', 'capture-unfinalized', 'annotation-incomplete'])('renders actionable fixed %s errors with no raw data', async (error) => {
  const f = await fixture();
  const state: CaptureState = { ...f.store.getSnapshot(), phase: 'failed', error };
  jest.spyOn(f.store, 'getSnapshot').mockReturnValue(state);
  await render(<CaptureScreen store={f.store} camera={f.native} />);
  expect(screen.getByRole('alert')).toBeVisible();
});
