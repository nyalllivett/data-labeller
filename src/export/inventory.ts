import { ExportError } from './ExportError';

export type ArchiveEntry = Readonly<{ path: string; size: number; isDirectory: boolean; isEncrypted: boolean }>;
export function verifyInventory(expected: readonly Readonly<{ path: string; size: number }>[], entries: readonly ArchiveEntry[]): void {
  const wanted = new Map(expected.map((entry) => [entry.path, entry.size]));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path) || entry.isDirectory || entry.isEncrypted || !wanted.has(entry.path) || wanted.get(entry.path) !== entry.size) throw new ExportError('invalid-package');
    seen.add(entry.path);
  }
  if (seen.size !== wanted.size) throw new ExportError('invalid-package');
}
