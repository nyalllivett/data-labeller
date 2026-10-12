import { Directory, File } from 'expo-file-system';
import * as Zip from 'react-native-zip-archive';
import { deferred } from '../../test/captureFixture';
import { id } from '../../test/ids';
import { createNativePackage, type PackageDirectory, type PackageFile } from './nativePackage';
import type { PackageIntent } from './PackagePort';

jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn(), Paths: { cache: { uri: 'file:///cache%20root' } } }));
jest.mock('react-native-zip-archive', () => ({ zip: jest.fn(), listContents: jest.fn(), cancel: jest.fn() }));
function fixture() {
  const data = new Map<string, number>(); const dirs = new Set<string>(); const calls: string[] = [];
  const root = 'file:///cache%20root/data-labeller-exports';
  const folder = `${root}/${id(20)}`; const source = `file:///private/recordings/${id(10)}.mov`; data.set(source, 123);
  const create = jest.fn(async () => { calls.push('create'); if (dirs.has(folder)) throw new Error('already exists'); dirs.add(folder); });
  const remove = jest.fn(async () => { calls.push('discard'); dirs.delete(folder); for (const path of data.keys()) if (path.startsWith(`${folder}/`)) data.delete(path); });
  const directory = jest.fn((): PackageDirectory => ({ uri: folder, get exists() { return dirs.has(folder); }, create, delete: remove }));
  const write = jest.fn(async (uri: string, text: string) => { calls.push('write'); data.set(uri, Buffer.byteLength(text, 'utf8')); });
  const rename = jest.fn(async (uri: string, name: string) => { calls.push('rename'); const final = `${folder}/${name}`; data.set(final, data.get(uri)!); data.delete(uri); });
  const deleteFile = jest.fn(async (uri: string) => { calls.push('remove-manifest'); data.delete(uri); });
  const file = jest.fn((base: string, name: string): PackageFile => {
    const uri = `${base}/${name}`;
    return { uri, get exists() { return data.has(uri); }, get size() { return data.get(uri) ?? 0; },
      write: (text) => write(uri, text), rename: (name) => rename(uri, name), delete: () => deleteFile(uri) };
  });
  const uriFromPath = (path: string) => `file://${encodeURI(path)}`;
  const zip = jest.fn(async (_inputs: string | string[], target: string) => { calls.push('zip'); data.set(uriFromPath(target), 500); return target; });
  const listContents = jest.fn(async () => { calls.push('inspect'); return [
    { path: 'annotations.json', size: data.get(`${folder}/annotations.json`)!, compressedSize: 0, isDirectory: false, isEncrypted: false },
    { path: `${id(10)}.mov`, size: 123, compressedSize: 0, isDirectory: false, isEncrypted: false },
  ]; });
  const cancel = jest.fn().mockResolvedValue(undefined);
  const api = { zip: zip as typeof Zip.zip, listContents, cancel };
  const intent: PackageIntent = { id: id(20), json: '{"label":"é🙂"}\n', media: [{ uri: source, filename: `${id(10)}.mov`, byteSize: 123 }] };
  const packagePort = createNativePackage(() => 'file:///cache%20root', directory, file, api);
  return { data, dirs, calls, folder, source, create, remove, directory, write, rename, deleteFile, file, zip, listContents, cancel, intent, packagePort };
}
test('archives native paths directly, verifies actual UTF-8/media bytes and promotes only its cache output', async () => {
  const f = fixture(); const result = await f.packagePort.prepare(f.intent, () => false);
  expect(f.zip).toHaveBeenCalledWith([`/cache root/data-labeller-exports/${id(20)}/annotations.json`, `/private/recordings/${id(10)}.mov`], `/cache root/data-labeller-exports/${id(20)}/package.partial.zip`, 0);
  expect(f.write).toHaveBeenCalledWith(`${f.folder}/annotations.json`, f.intent.json);
  expect(Buffer.byteLength(f.intent.json, 'utf8')).toBeGreaterThan(f.intent.json.length);
  expect(f.calls).toEqual(['create', 'write', 'zip', 'inspect', 'rename', 'remove-manifest']);
  expect(result).toEqual({ id: id(20), uri: `${f.folder}/data-labeller.zip`, byteSize: 500 });
  expect(f.file.mock.calls.every(([base]) => base === f.folder)).toBe(true);
  expect(f.data.get(f.source)).toBe(123); expect(await f.packagePort.available(result)).toBe(true);
  f.data.set(result.uri, 1); expect(await f.packagePort.available(result)).toBe(false);
  f.data.delete(result.uri); expect(await f.packagePort.available(result)).toBe(false);
  await expect(f.packagePort.available({ ...result, id: 'bad' })).rejects.toThrow('package-missing');
});
test('default SDK wiring uses cache/UUID directories and the ZIP API without moving or reading source bytes in JS', async () => {
  const f = fixture(); jest.mocked(Directory).mockImplementation(f.directory as never); jest.mocked(File).mockImplementation(f.file as never);
  jest.mocked(Zip.zip).mockImplementation(f.zip as never); jest.mocked(Zip.listContents).mockImplementation(f.listContents); jest.mocked(Zip.cancel).mockImplementation(f.cancel);
  const port = createNativePackage(); await port.cancel();
  const result = await port.prepare(f.intent, () => false);
  expect(Directory).toHaveBeenCalledWith('file:///cache%20root', 'data-labeller-exports', id(20));
  expect(await port.available(result)).toBe(true); await port.discard(id(20));
  expect(f.data.get(f.source)).toBe(123); expect(Zip.cancel).not.toHaveBeenCalled();
});
test('cancellation is requested natively but prepare does not reject early while the actual writer is pending', async () => {
  const f = fixture(); const native = deferred<string>(); f.zip.mockReturnValueOnce(native.promise);
  let cancelled = false, settled = false;
  const preparing = f.packagePort.prepare(f.intent, () => cancelled).finally(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  cancelled = true; await f.packagePort.cancel(); expect(f.cancel).toHaveBeenCalledTimes(1); expect(settled).toBe(false);
  expect(f.remove).not.toHaveBeenCalled();
  native.resolve('ignored-native-return'); await expect(preparing).rejects.toThrow('cancelled');
  expect(f.listContents).not.toHaveBeenCalled(); expect(f.rename).not.toHaveBeenCalled();
  await f.packagePort.discard(id(20)); expect(f.data.get(f.source)).toBe(123);
  await f.packagePort.discard(id(20)); expect(f.remove).toHaveBeenCalledTimes(1);
  await f.packagePort.cancel(); expect(f.cancel).toHaveBeenCalledTimes(1);
});
test('cancellation before issuance or during inventory prevents final promotion', async () => {
  const f = fixture(); await expect(f.packagePort.prepare(f.intent, () => true)).rejects.toThrow('cancelled'); expect(f.create).not.toHaveBeenCalled();
  let cancelled = false; const inspect = f.listContents.getMockImplementation()!;
  f.listContents.mockImplementationOnce(async () => { const valid = await inspect(); cancelled = true; return valid; });
  await expect(f.packagePort.prepare(f.intent, () => cancelled)).rejects.toThrow('cancelled');
  expect(f.rename).not.toHaveBeenCalled();
});
test('creation/write/ZIP/inventory/rename failures and invalid bytes remain fixed errors with source files intact', async () => {
  for (const stage of ['create', 'write', 'zip', 'listContents', 'rename', 'deleteFile'] as const) {
    const f = fixture(); f[stage].mockRejectedValueOnce(new Error('/private/storage-error'));
    await expect(f.packagePort.prepare(f.intent, () => false)).rejects.toThrow('package-failed');
    expect(f.data.get(f.source)).toBe(123);
  }
  const f = fixture(); f.write.mockImplementationOnce(async () => undefined);
  await expect(f.packagePort.prepare(f.intent, () => false)).rejects.toThrow('invalid-package');
  await f.packagePort.discard(id(20)); f.zip.mockImplementationOnce(async (_inputs, target) => target);
  await expect(f.packagePort.prepare(f.intent, () => false)).rejects.toThrow('invalid-package');
  await f.packagePort.discard(id(20)); f.rename.mockImplementationOnce(async () => undefined);
  await expect(f.packagePort.prepare(f.intent, () => false)).rejects.toThrow('invalid-package');
  expect(f.data.get(f.source)).toBe(123);
});
test('invalid filesystem URLs/identity, cleanup and native cancel failures are explicit and contain no raw paths', async () => {
  const f = fixture();
  await expect(f.packagePort.prepare({ ...f.intent, id: 'bad' }, () => false)).rejects.toThrow('package-failed');
  for (const uri of ['https://remote/video', 'file:///%bad']) {
    await expect(f.packagePort.prepare({ ...f.intent, media: [{ ...f.intent.media[0]!, uri }] }, () => false)).rejects.toThrow('package-failed');
    await f.packagePort.discard(id(20));
  }
  const native = deferred<string>(); f.zip.mockReturnValueOnce(native.promise);
  const preparing = f.packagePort.prepare(f.intent, () => false);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); f.cancel.mockRejectedValueOnce(new Error('native secret'));
  await expect(f.packagePort.cancel()).rejects.toThrow('cancel-failed');
  f.data.set(`${f.folder}/package.partial.zip`, 500); native.resolve('ignored'); await preparing;
  f.remove.mockRejectedValueOnce(new Error('private cache failure')); await expect(f.packagePort.discard(id(20))).rejects.toThrow('cleanup-failed');
  await expect(f.packagePort.discard('../outside')).rejects.toThrow('cleanup-failed');
});
