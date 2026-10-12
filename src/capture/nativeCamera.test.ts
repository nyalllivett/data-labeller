import { Camera } from 'expo-camera';
import { id } from '../../test/ids';
import { deferred } from '../../test/captureFixture';
import { cameraPermissions, NativeCamera, type CameraHandle } from './nativeCamera';

jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() } }));
const uri = `file:///private/${id(10)}.partial.mov`;
function fixture() {
  const handle: jest.Mocked<CameraHandle> = {
    recordAsync: jest.fn().mockResolvedValue({ uri, dataLabellerInterrupted: false, dataLabellerFinalized: true }),
    sampleRecordingPosition: jest.fn().mockResolvedValue(125.5),
    stopRecordingAsync: jest.fn().mockResolvedValue(undefined),
  };
  const camera = new NativeCamera('avcapture-recorded-duration');
  camera.attach(handle);
  return { camera, handle };
}
test('camera-only permission bindings use the SDK and do not request microphone permission', () => {
  expect(cameraPermissions.get).toBe(Camera.getCameraPermissionsAsync);
  expect(cameraPermissions.request).toBe(Camera.requestCameraPermissionsAsync);
});
test('records to the pre-associated staging URI, awaits completion and distinguishes native interruption', async () => {
  const { camera, handle } = fixture();
  const native = deferred<unknown>();
  handle.recordAsync.mockReturnValueOnce(native.promise);
  const result = camera.record(id(10), uri);
  expect(handle.recordAsync).toHaveBeenCalledWith({ dataLabellerRecordingId: id(10), dataLabellerOutputUri: uri });
  native.resolve({ uri, dataLabellerInterrupted: true, dataLabellerFinalized: true });
  expect(await result).toEqual({ uri, interrupted: true });
  expect(await camera.record(id(11), uri)).toEqual({ uri, interrupted: false });
});
test.each([undefined, {}, { uri: 'file:///cache/unassociated.mov', dataLabellerInterrupted: false }, { uri }, { uri, dataLabellerInterrupted: 'fake' }])('rejects unassociated/missing capture output %j', async (value) => {
  const { camera, handle } = fixture(); handle.recordAsync.mockResolvedValueOnce(value);
  await expect(camera.record(id(10), uri)).rejects.toMatchObject({ code: 'unavailable', message: 'unavailable' });
});
test('detached views and native failures have fixed errors without native paths or causes', async () => {
  const { camera, handle } = fixture();
  handle.recordAsync.mockRejectedValueOnce(new Error('/private/secret'));
  handle.sampleRecordingPosition.mockRejectedValueOnce(new Error('/private/secret'));
  handle.stopRecordingAsync.mockRejectedValueOnce(new Error('/private/secret'));
  await expect(camera.record(id(10), uri)).rejects.toMatchObject({ code: 'capture-unfinalized', message: 'capture-unfinalized' });
  await expect(camera.position(id(10))).rejects.toMatchObject({ code: 'clock-unavailable', message: 'clock-unavailable' });
  await expect(camera.stop(id(10))).rejects.toMatchObject({ code: 'stop-failed', message: 'stop-failed' });
  camera.attach(null);
  await expect(camera.record(id(10), uri)).rejects.toThrow('unavailable');
  await expect(camera.position(id(10))).rejects.toThrow('clock-unavailable');
  await expect(camera.stop(id(10))).rejects.toThrow('stop-failed');
});
test('samples actual native milliseconds with source/recording identity and awaits native Stop', async () => {
  const { camera, handle } = fixture();
  expect(await camera.position(id(10))).toEqual({ recordingId: id(10), mediaMs: 125.5, source: 'avcapture-recorded-duration' });
  expect(handle.sampleRecordingPosition).toHaveBeenCalledWith(id(10));
  await camera.stop(id(10));
  expect(handle.stopRecordingAsync).toHaveBeenCalledTimes(1);
  const android = new NativeCamera('camerax-recording-stats'); android.attach(handle);
  expect((await android.position(id(10))).source).toBe('camerax-recording-stats');
});
test.each([undefined, 0, -1, NaN, Infinity, '125'])('rejects unusable native sample %s instead of inventing an offset', async (value) => {
  const { camera, handle } = fixture(); handle.sampleRecordingPosition.mockResolvedValueOnce(value as number);
  await expect(camera.position(id(10))).rejects.toThrow('clock-unavailable');
});
