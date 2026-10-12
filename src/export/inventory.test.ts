import { verifyInventory, type ArchiveEntry } from './inventory';
const expected = [{ path: 'annotations.json', size: 17 }, { path: 'video.mov', size: 100 }];
const entries: ArchiveEntry[] = expected.map((entry) => ({ ...entry, isDirectory: false, isEncrypted: false }));
test('requires exact unique file inventory and uncompressed bytes, independent of archive entry order', () => {
  expect(() => verifyInventory(expected, [...entries].reverse())).not.toThrow();
});
test.each([
  entries.slice(1), [...entries, entries[0]!], [...entries, { ...entries[0]!, path: '../unexpected' }],
  [{ ...entries[0]!, isDirectory: true }, entries[1]!], [{ ...entries[0]!, isEncrypted: true }, entries[1]!],
  [{ ...entries[0]!, size: 16 }, entries[1]!],
].map((bad) => ({ bad })))('rejects missing, duplicate, unexpected, directory, encrypted or wrong-sized data (%#)', ({ bad }) => {
  expect(() => verifyInventory(expected, bad)).toThrow('invalid-package');
});
