import { savedRecord } from '../../test/reviewFixture';
jest.mock('../capture/runtime', () => ({ media: { resolveSaved: jest.fn() }, recordingRepository: 'recording repository' }));
jest.mock('../review/runtime', () => ({ annotationRepository: 'shared annotation repository' }));
jest.mock('../projects/runtime', () => ({ newId: jest.fn() }));
jest.mock('./nativePackage', () => ({ createNativePackage: jest.fn(() => 'package adapter') }));
jest.mock('./nativeShare', () => ({ createNativeShare: jest.fn(() => 'share adapter') }));
jest.mock('./ExportStore', () => ({ ExportStore: jest.fn() }));
test('creates one stable export store reusing committed repositories/media with separate package/share boundaries', async () => {
  const { ExportStore } = jest.requireMock('./ExportStore'); const { media } = jest.requireMock('../capture/runtime');
  const { newId } = jest.requireMock('../projects/runtime'); const runtime = jest.requireActual('./runtime');
  expect(runtime.exportStore).toBe(ExportStore.mock.instances[0]);
  const args = ExportStore.mock.calls[0]; expect(args.slice(0, 2)).toEqual(['recording repository', 'shared annotation repository']);
  expect(args.slice(3)).toEqual(['package adapter', 'share adapter', newId]);
  const record = savedRecord(); media.resolveSaved.mockResolvedValueOnce('file:///private/known.mov');
  expect(await args[2](record)).toBe('file:///private/known.mov'); expect(media.resolveSaved).toHaveBeenCalledWith(record);
});
