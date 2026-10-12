jest.mock('../projects/runtime', () => ({ newId: jest.fn() }));
jest.mock('../storage/privateDatabase', () => ({ privateDatabaseOpener: jest.fn(() => 'private opener') }));
jest.mock('./nativeMedia', () => ({ createNativeMedia: jest.fn(() => 'media files') }));
jest.mock('./nativeCamera', () => ({ NativeCamera: jest.fn() }));
jest.mock('./SqliteRecordingRepository', () => ({ SqliteRecordingRepository: jest.fn() }));
jest.mock('./CaptureStore', () => ({ CaptureStore: jest.fn() }));
test.each(['ios', 'android'] as const)('wires a single %s capture store to its camera, private media and separate recording database', (platform) => {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
  jest.isolateModules(() => {
    const { CaptureStore } = jest.requireMock('./CaptureStore');
    const { NativeCamera } = jest.requireMock('./nativeCamera');
    const { privateDatabaseOpener } = jest.requireMock('../storage/privateDatabase');
    const { SqliteRecordingRepository } = jest.requireMock('./SqliteRecordingRepository');
    const { newId } = jest.requireMock('../projects/runtime');
    const runtime = jest.requireActual('./runtime');
    expect(NativeCamera).toHaveBeenCalledWith(platform === 'ios' ? 'avcapture-recorded-duration' : 'camerax-recording-stats');
    expect(privateDatabaseOpener).toHaveBeenCalledWith('recordings.db');
    expect(SqliteRecordingRepository).toHaveBeenCalledWith('private opener');
    expect(CaptureStore).toHaveBeenCalledWith(runtime.camera, 'media files', SqliteRecordingRepository.mock.instances.at(-1), newId, platform === 'ios' ? 'mov' : 'mp4');
  });
});
