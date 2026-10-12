import { CameraView, type CameraRecordingOptions } from 'expo-camera';
import { id } from '../../test/ids';

test('installed patched JS wrapper forwards clock/Stop identity and staging options to a controlled native ref', async () => {
  const view = new CameraView({});
  const native = {
    sampleRecordingPosition: jest.fn().mockResolvedValue(125),
    stopDataLabellerRecording: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue({ uri: 'file:///private/output.mov' }),
  };
  const ref = view as unknown as { _cameraRef: { current: typeof native | null } };
  ref._cameraRef.current = native;
  expect(await view.sampleRecordingPosition(id(10))).toBe(125);
  await view.stopRecordingAsync(id(10));
  const options = { dataLabellerRecordingId: id(10), dataLabellerOutputUri: 'file:///private/output.mov' };
  await view.recordAsync(options as CameraRecordingOptions);
  expect(native.record).toHaveBeenCalledWith(options);
  expect(native.sampleRecordingPosition).toHaveBeenCalledWith(id(10));
  expect(native.stopDataLabellerRecording).toHaveBeenCalledWith(id(10));
  ref._cameraRef.current = null;
  expect(await view.sampleRecordingPosition(id(10))).toBeUndefined();
  await expect(view.stopRecordingAsync(id(10))).resolves.toBeUndefined();
});
