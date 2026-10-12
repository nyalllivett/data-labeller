import { requireNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';

import { validateId } from '../projects/project';
import { CaptureError } from './CaptureError';
import type { MediaFiles } from './MediaFiles';
import type { RecordingDraft } from './recording';

export type MediaFile = Pick<File, 'uri' | 'exists' | 'size'> & { rename(name: string): void | Promise<void> };
export type MediaDirectory = Pick<Directory, 'uri'> & { create(): void | Promise<void> };

export function createNativeMedia(
  preparePrivate: () => Promise<string> = () => requireNativeModule<{ prepareDatabaseDirectory(): Promise<string> }>('PrivateStorage').prepareDatabaseDirectory(),
  directory: (base: string) => MediaDirectory = (base) => {
    const parent = new Directory(base);
    const value = new Directory(base, 'recordings');
    return { get uri() { return value.uri; }, create: () => {
      // Outside filesDir/cacheDir, Android checks the existing target's access.
      // Create through the prepared parent; verify mkdir's otherwise ignored result.
      if (!value.exists) parent.createDirectory('recordings');
      if (!value.exists) throw new CaptureError('media-unavailable');
    } };
  },
  file: (base: string, name: string) => MediaFile = (base, name) => {
    const value = new File(base, name);
    return {
      get uri() { return value.uri; }, get exists() { return value.exists; }, get size() { return value.size; },
      rename: (name) => value.rename(name),
    };
  },
  inspect: (uri: string) => Promise<number> = (uri) => requireNativeModule<{ inspectVideo(uri: string): Promise<number> }>('CaptureMedia').inspectVideo(uri),
): MediaFiles {
  async function paths(draft: RecordingDraft) {
    validateId(draft.id);
    const base = await preparePrivate();
    if (!base.startsWith('file:///') || !['mov', 'mp4'].includes(draft.extension)) throw new CaptureError('media-unavailable');
    const media = directory(base);
    await media.create();
    return { stage: file(media.uri, `${draft.id}.partial.${draft.extension}`), final: file(media.uri, `${draft.id}.${draft.extension}`) };
  }
  return {
    async prepare(draft) {
      try {
        const { stage, final } = await paths(draft);
        if (stage.exists || final.exists) throw new CaptureError('media-unavailable');
        return stage.uri;
      } catch { throw new CaptureError('media-unavailable'); }
    },
    async promote(draft) {
      try {
        const { stage, final } = await paths(draft);
        const source = final.exists ? final : stage;
        const byteSize = source.size;
        if (!source.exists || !Number.isSafeInteger(byteSize) || byteSize <= 0) throw new CaptureError('media-unavailable');
        const durationMs = await inspect(source.uri);
        if (!Number.isFinite(durationMs) || durationMs <= 0) throw new CaptureError('media-unavailable');
        // A sibling rename checks the existing source, not a missing destination.
        if (!final.exists) await source.rename(`${draft.id}.${draft.extension}`);
        if (!final.exists || final.size !== byteSize) throw new CaptureError('media-unavailable');
        return { durationMs, byteSize };
      } catch { throw new CaptureError('media-unavailable'); }
    },
  };
}
