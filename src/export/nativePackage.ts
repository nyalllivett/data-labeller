import { Directory, File, Paths } from 'expo-file-system';
import * as Zip from 'react-native-zip-archive';
import { validateId } from '../projects/project';
import { ExportError } from './ExportError';
import { verifyInventory } from './inventory';
import { checkCancellation } from './snapshot';
import type { PackagePort } from './PackagePort';

export type PackageFile = Pick<File, 'uri' | 'exists' | 'size'> & {
  write(json: string): void | Promise<void>; rename(name: string): void | Promise<void>; delete(): void | Promise<void>;
};
export type PackageDirectory = Pick<Directory, 'uri' | 'exists'> & {
  create(options: { intermediates: true }): void | Promise<void>; delete(): void | Promise<void>;
};
function nativePath(uri: string): string {
  if (!uri.startsWith('file:///')) throw new ExportError('package-failed');
  return decodeURIComponent(uri.slice(7)); // The ZIP API takes filesystem paths, not URL-escaped paths.
}
export function createNativePackage(
  cache: () => string = () => Paths.cache.uri,
  directory: (base: string, id: string) => PackageDirectory = (base, id) => new Directory(base, 'data-labeller-exports', id),
  file: (base: string, name: string) => PackageFile = (base, name) => new File(base, name),
  zip: Pick<typeof Zip, 'zip' | 'listContents' | 'cancel'> = Zip,
): PackagePort {
  let archiving = false;
  function workspace(id: string) {
    validateId(id);
    return directory(cache(), id);
  }
  return {
    async prepare(intent, cancelled) {
      try {
        checkCancellation(cancelled());
        const folder = workspace(intent.id); await folder.create({ intermediates: true });
        const manifest = file(folder.uri, 'annotations.json'); await manifest.write(intent.json);
        const manifestSize = manifest.size; // Native file size is UTF-8 bytes, not JS string length.
        if (!manifest.exists || !Number.isSafeInteger(manifestSize) || manifestSize <= 0) throw new ExportError('invalid-package');
        const partial = file(folder.uri, 'package.partial.zip'); const final = file(folder.uri, 'data-labeller.zip');
        checkCancellation(cancelled());
        archiving = true;
        try {
          // No AbortSignal: its JS wrapper may reject while native is still writing.
          await zip.zip([nativePath(manifest.uri), ...intent.media.map((media) => nativePath(media.uri))], nativePath(partial.uri), 0);
        } finally { archiving = false; }
        checkCancellation(cancelled());
        const entries = await zip.listContents(nativePath(partial.uri));
        verifyInventory([{ path: 'annotations.json', size: manifestSize }, ...intent.media.map((media) => ({ path: media.filename, size: media.byteSize }))], entries);
        checkCancellation(cancelled());
        const byteSize = partial.size;
        if (!partial.exists || !Number.isSafeInteger(byteSize) || byteSize <= 0) throw new ExportError('invalid-package');
        await partial.rename('data-labeller.zip');
        if (!final.exists || final.size !== byteSize) throw new ExportError('invalid-package');
        await manifest.delete();
        return Object.freeze({ id: intent.id, uri: final.uri, byteSize });
      } catch (error) { throw error instanceof ExportError ? error : new ExportError('package-failed'); }
    },
    async cancel() {
      try { if (archiving) await zip.cancel(); }
      catch { throw new ExportError('cancel-failed'); }
    },
    async discard(id) {
      try { const folder = workspace(id); if (folder.exists) await folder.delete(); }
      catch { throw new ExportError('cleanup-failed'); }
    },
    async available(prepared) {
      try {
        const final = file(workspace(prepared.id).uri, 'data-labeller.zip');
        return final.uri === prepared.uri && final.exists && final.size === prepared.byteSize;
      } catch { throw new ExportError('package-missing'); }
    },
  };
}
