import { requireNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';
import { captureFixture, deferred } from '../../test/captureFixture';
import { createRecordingDraft } from './recording';
import { createNativeMedia, type MediaFile } from './nativeMedia';
import { id } from '../../test/ids';

jest.mock('expo', () => ({ requireNativeModule: jest.fn() }));
jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn() }));

const draft = () => createRecordingDraft(id(10), captureFixture().project, 'back', 'mov');
function fixture() {
  const data = new Map<string, number>();
  const events: string[] = [];
  const prepare = jest.fn(async () => { events.push('prepare'); return 'file:///private'; });
  const create = jest.fn(async () => { events.push('create'); });
  const directory = jest.fn((base: string) => ({ uri: `${base}/recordings`, create }));
  const move = jest.fn(async (source: string, target: string) => {
    events.push('move'); data.set(target, data.get(source)!); data.delete(source);
  });
  const file = jest.fn((base: string, name: string): MediaFile => {
    const uri = `${base}/${name}`;
    return { uri, get exists() { return data.has(uri); }, get size() { return data.get(uri) ?? 0; }, move: (target) => move(uri, target.uri) };
  });
  const inspect = jest.fn(async () => { events.push('inspect'); return 1250; });
  const media = createNativeMedia(prepare, directory, file, inspect);
  const stage = `file:///private/recordings/${id(10)}.partial.mov`;
  const final = `file:///private/recordings/${id(10)}.mov`;
  return { data, events, prepare, create, directory, file, move, inspect, media, stage, final };
}

test('prepares private persistent staging without creating or overwriting a recording file', async () => {
  const f = fixture();
  const creating = deferred<void>(); f.create.mockReturnValueOnce(creating.promise);
  const prepared = f.media.prepare(draft());
  await Promise.resolve();
  expect(f.file).not.toHaveBeenCalled();
  creating.resolve();
  expect(await prepared).toBe(f.stage);
  expect(f.data.size).toBe(0);
  expect(f.events).toEqual(['prepare']);
  expect(f.directory).toHaveBeenCalledWith('file:///private');
});
test.each(['stage', 'final'] as const)('never overwrites an existing %s recording', async (path) => {
  const f = fixture(); f.data.set(f[path], 123);
  await expect(f.media.prepare(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f[path])).toBe(123);
  expect(f.move).not.toHaveBeenCalled();
});
test('inspects nonempty video, awaits promotion and verifies the immutable destination before returning metadata', async () => {
  const f = fixture(); f.data.set(f.stage, 123);
  const moving = deferred<void>();
  f.move.mockImplementationOnce(async (source, target) => {
    await moving.promise; f.data.set(target, f.data.get(source)!); f.data.delete(source);
  });
  const promoted = f.media.promote(draft());
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(f.data.has(f.final)).toBe(false);
  moving.resolve();
  expect(await promoted).toEqual({ durationMs: 1250, byteSize: 123 });
  expect(f.data.has(f.stage)).toBe(false);
  expect(f.data.get(f.final)).toBe(123);
  expect(f.inspect).toHaveBeenCalledWith(f.stage);
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1250, byteSize: 123 });
  expect(f.inspect).toHaveBeenLastCalledWith(f.final);
  expect(f.move).toHaveBeenCalledTimes(1);
});
test('promotion failure and an ambiguous move preserve discoverable data for same-path retry', async () => {
  const f = fixture(); f.data.set(f.stage, 123);
  f.move.mockRejectedValueOnce(new Error('secret low storage'));
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f.stage)).toBe(123);
  f.move.mockImplementationOnce(async (source, target) => {
    f.data.set(target, f.data.get(source)!); f.data.delete(source); throw new Error('move completed then rejected');
  });
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f.final)).toBe(123);
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1250, byteSize: 123 });
  expect(f.move).toHaveBeenCalledTimes(2);
});
test.each([0, 1.5, NaN])('missing/invalid media size %s cannot be promoted', async (size) => {
  const f = fixture(); f.data.set(f.stage, size);
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.inspect).not.toHaveBeenCalled(); expect(f.move).not.toHaveBeenCalled();
});
test('missing files, unusable asset duration, failed inspection and unconfirmed destination stay recoverable', async () => {
  const f = fixture();
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  f.data.set(f.stage, 123);
  for (const duration of [0, NaN, -1]) {
    f.inspect.mockResolvedValueOnce(duration);
    await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  }
  f.inspect.mockRejectedValueOnce(new Error('/private/invalid video'));
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  f.move.mockResolvedValueOnce(undefined);
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  f.move.mockImplementationOnce(async (_source, target) => { f.data.set(target, 1); });
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f.stage)).toBe(123);
});
test('invalid identities/extension, private preparation and directory failures have sanitized errors and no fallback', async () => {
  const f = fixture();
  for (const value of [{ ...draft(), id: 'bad' }, { ...draft(), extension: 'bad' as 'mov' }]) {
    await expect(f.media.prepare(value)).rejects.toThrow('media-unavailable');
  }
  f.prepare.mockResolvedValueOnce('file:///cache-not-used');
  f.create.mockRejectedValueOnce(new Error('/private/path'));
  await expect(f.media.prepare(draft())).rejects.toThrow('media-unavailable');
  f.prepare.mockResolvedValueOnce('content://other');
  await expect(f.media.prepare(draft())).rejects.toThrow('media-unavailable');
  f.prepare.mockRejectedValueOnce(new Error('private native failure'));
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.move).not.toHaveBeenCalled();
});
test('default SDK bindings prepare PrivateStorage and use current asynchronous File.move', async () => {
  const data = new Map<string, number>();
  const create = jest.fn(); const inspect = jest.fn().mockResolvedValue(1000);
  const prepare = jest.fn().mockResolvedValue('file:///private');
  (requireNativeModule as jest.Mock).mockImplementation((name) => name === 'PrivateStorage' ? { prepareDatabaseDirectory: prepare } : { inspectVideo: inspect });
  (Directory as unknown as jest.Mock).mockImplementation((base, name) => ({ uri: `${base}/${name}`, create }));
  const move = jest.fn(async (source: string, destination: { uri: string }) => { data.set(destination.uri, data.get(source)!); data.delete(source); });
  (File as unknown as jest.Mock).mockImplementation((base: string, name?: string) => {
    const uri = name ? `${base}/${name}` : base;
    return { uri, get exists() { return data.has(uri); }, get size() { return data.get(uri) ?? 0; }, move: (destination: { uri: string }) => move(uri, destination) };
  });
  const media = createNativeMedia(); const record = draft();
  const uri = await media.prepare(record); data.set(uri, 123);
  expect(await media.promote(record)).toEqual({ durationMs: 1000, byteSize: 123 });
  expect(create).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
  expect(requireNativeModule).toHaveBeenCalledWith('PrivateStorage');
  expect(requireNativeModule).toHaveBeenCalledWith('CaptureMedia');
  expect(move).toHaveBeenCalledTimes(1);
});
