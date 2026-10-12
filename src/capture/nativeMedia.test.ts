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
  const rename = jest.fn(async (source: string, name: string) => {
    const target = `${source.slice(0, source.lastIndexOf('/'))}/${name}`;
    events.push('rename'); data.set(target, data.get(source)!); data.delete(source);
  });
  const file = jest.fn((base: string, name: string): MediaFile => {
    const uri = `${base}/${name}`;
    return { uri, get exists() { return data.has(uri); }, get size() { return data.get(uri) ?? 0; }, rename: (name) => rename(uri, name) };
  });
  const inspect = jest.fn(async () => { events.push('inspect'); return 1250; });
  const media = createNativeMedia(prepare, directory, file, inspect);
  const stage = `file:///private/recordings/${id(10)}.partial.mov`;
  const final = `file:///private/recordings/${id(10)}.mov`;
  return { data, events, prepare, create, directory, file, rename, inspect, media, stage, final };
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
  expect(f.rename).not.toHaveBeenCalled();
});
test('inspects nonempty video, awaits promotion and verifies the immutable destination before returning metadata', async () => {
  const f = fixture(); f.data.set(f.stage, 123);
  const renaming = deferred<void>();
  f.rename.mockImplementationOnce(async (source) => {
    const target = f.final;
    await renaming.promise; f.data.set(target, f.data.get(source)!); f.data.delete(source);
  });
  const promoted = f.media.promote(draft());
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(f.data.has(f.final)).toBe(false);
  renaming.resolve();
  expect(await promoted).toEqual({ durationMs: 1250, byteSize: 123 });
  expect(f.data.has(f.stage)).toBe(false);
  expect(f.data.get(f.final)).toBe(123);
  expect(f.inspect).toHaveBeenCalledWith(f.stage);
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1250, byteSize: 123 });
  expect(f.inspect).toHaveBeenLastCalledWith(f.final);
  expect(f.rename).toHaveBeenCalledWith(f.stage, `${id(10)}.mov`);
  expect(f.rename).toHaveBeenCalledTimes(1);
});
test('promotion failure and an ambiguous rename preserve discoverable data for same-path retry', async () => {
  const f = fixture(); f.data.set(f.stage, 123);
  f.rename.mockRejectedValueOnce(new Error('secret low storage'));
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f.stage)).toBe(123);
  f.rename.mockImplementationOnce(async (source) => {
    f.data.set(f.final, f.data.get(source)!); f.data.delete(source); throw new Error('rename completed then rejected');
  });
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f.final)).toBe(123);
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1250, byteSize: 123 });
  expect(f.rename).toHaveBeenCalledTimes(2);
});
test.each([0, 1.5, NaN])('missing/invalid media size %s cannot be promoted', async (size) => {
  const f = fixture(); f.data.set(f.stage, size);
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.inspect).not.toHaveBeenCalled(); expect(f.rename).not.toHaveBeenCalled();
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
  f.rename.mockResolvedValueOnce(undefined);
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  f.rename.mockImplementationOnce(async () => { f.data.set(f.final, 1); });
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
  expect(f.rename).not.toHaveBeenCalled();
});
// Controlled SDK boundary: model the inspected Android rule that a no-backup
// target has permission only once it exists. No real filesystem/native code runs.
function sdkFixture() {
  const base = 'file:///no-backup/data-labeller';
  const directories = new Set([base]);
  const data = new Map<string, number>();
  const faults = { mkdirWorks: true };
  const inspect = jest.fn().mockResolvedValue(1000);
  const prepare = jest.fn().mockResolvedValue(base);
  (requireNativeModule as jest.Mock).mockImplementation((name) => name === 'PrivateStorage' ? { prepareDatabaseDirectory: prepare } : { inspectVideo: inspect });
  const create = jest.fn((uri: string) => {
    if (!directories.has(uri)) throw new Error('missing target has no write permission');
  });
  const createDirectory = jest.fn((parent: string, name: string) => {
    if (!directories.has(parent)) throw new Error('parent is unavailable');
    const uri = `${parent}/${name}`;
    if (faults.mkdirWorks) directories.add(uri);
    return { uri };
  });
  (Directory as unknown as jest.Mock).mockImplementation((parent: string, name?: string) => {
    const uri = name ? `${parent}/${name}` : parent;
    return { uri, get exists() { return directories.has(uri); }, create: () => create(uri), createDirectory: (child: string) => createDirectory(uri, child) };
  });
  const move = jest.fn((_source: string, destination: { uri: string }) => {
    if (!data.has(destination.uri)) throw new Error('missing destination has no write permission');
  });
  const rename = jest.fn((source: string, name: string) => {
    if (!data.has(source)) throw new Error('source is unavailable');
    const target = `${source.slice(0, source.lastIndexOf('/'))}/${name}`;
    if (data.has(target)) throw new Error('destination already exists');
    data.set(target, data.get(source)!); data.delete(source);
    return target;
  });
  (File as unknown as jest.Mock).mockImplementation((parent: string, name?: string) => {
    let uri = name ? `${parent}/${name}` : parent;
    return { get uri() { return uri; }, get exists() { return data.has(uri); }, get size() { return data.get(uri) ?? 0; },
      move: (destination: { uri: string }) => move(uri, destination), rename: (name: string) => { uri = rename(uri, name); } };
  });
  const media = createNativeMedia();
  const stage = `${base}/recordings/${id(10)}.partial.mov`;
  const final = `${base}/recordings/${id(10)}.mov`;
  return { base, directories, data, faults, inspect, create, createDirectory, move, rename, media, stage, final };
}

test('default SDK bindings create missing recordings through the existing private no-backup parent and reuse an existing directory', async () => {
  const f = sdkFixture();
  expect(await f.media.prepare(draft())).toBe(f.stage);
  expect(f.createDirectory).toHaveBeenCalledWith(f.base, 'recordings');
  expect(f.create).not.toHaveBeenCalled();
  expect(f.directories.has(`${f.base}/recordings`)).toBe(true);
  expect(f.data.size).toBe(0);
  expect(await f.media.prepare(draft())).toBe(f.stage);
  expect(f.createDirectory).toHaveBeenCalledTimes(1);
  expect(requireNativeModule).toHaveBeenCalledWith('PrivateStorage');
});

test('default SDK bindings promote into a missing private filename with source-only sibling rename and confirm final bytes', async () => {
  const f = sdkFixture();
  f.directories.add(`${f.base}/recordings`); f.data.set(f.stage, 123);
  expect(f.data.has(f.final)).toBe(false);
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1000, byteSize: 123 });
  expect(f.rename).toHaveBeenCalledWith(f.stage, `${id(10)}.mov`);
  expect(f.move).not.toHaveBeenCalled();
  expect(f.data.has(f.stage)).toBe(false); expect(f.data.get(f.final)).toBe(123);
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1000, byteSize: 123 });
  expect(f.rename).toHaveBeenCalledTimes(1);
  expect(f.inspect).toHaveBeenLastCalledWith(f.final);
  expect(requireNativeModule).toHaveBeenCalledWith('CaptureMedia');
});

test('an ignored native mkdir failure cannot issue a camera destination; retry uses the same private parent', async () => {
  const f = sdkFixture(); f.faults.mkdirWorks = false;
  await expect(f.media.prepare(draft())).rejects.toThrow('media-unavailable');
  expect(File).not.toHaveBeenCalled();
  expect(f.data.size).toBe(0);
  f.faults.mkdirWorks = true;
  expect(await f.media.prepare(draft())).toBe(f.stage);
  expect(f.createDirectory.mock.calls).toEqual([[f.base, 'recordings'], [f.base, 'recordings']]);
});

test('native parent/rename failures stay sanitized and preserve staged media without a cache fallback', async () => {
  const f = sdkFixture(); f.directories.clear();
  await expect(f.media.prepare(draft())).rejects.toThrow('media-unavailable');
  expect(File).not.toHaveBeenCalled();
  f.directories.add(f.base); f.directories.add(`${f.base}/recordings`); f.data.set(f.stage, 123);
  f.rename.mockImplementationOnce(() => { throw new Error('secret storage failure'); });
  await expect(f.media.promote(draft())).rejects.toThrow('media-unavailable');
  expect(f.data.get(f.stage)).toBe(123);
  expect(f.data.has(f.final)).toBe(false);
  expect(f.move).not.toHaveBeenCalled();
  expect(await f.media.promote(draft())).toEqual({ durationMs: 1000, byteSize: 123 });
});
