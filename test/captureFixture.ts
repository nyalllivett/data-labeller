import { CaptureStore } from '../src/capture/CaptureStore';
import type { CameraPort } from '../src/capture/CameraPort';
import type { MediaFiles } from '../src/capture/MediaFiles';
import { decodeDraft, decodeRecording, type RecordingDraft, type SavedRecording } from '../src/capture/recording';
import type { RecordingRepository } from '../src/capture/RecordingRepository';
import { createProject } from '../src/projects/project';
import { id } from './ids';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export function captureFixture() {
  const project = {
    ...createProject(id(1), 'Private project'),
    labels: [
      { id: id(2), name: 'A', archived: false },
      { id: id(3), name: 'B', archived: false },
      { id: id(4), name: 'Archived', archived: true },
    ],
  };
  const recording = deferred<{ uri: string; interrupted: boolean }>();
  const camera: jest.Mocked<CameraPort> = {
    record: jest.fn().mockReturnValue(recording.promise),
    position: jest.fn().mockImplementation(async (recordingId: string) => ({ recordingId, mediaMs: 100, source: 'avcapture-recorded-duration' })),
    stop: jest.fn().mockResolvedValue(undefined),
  };
  const media: jest.Mocked<MediaFiles> = {
    prepare: jest.fn().mockImplementation(async (draft: RecordingDraft) => `file:///private/${draft.id}.partial.mov`),
    promote: jest.fn().mockResolvedValue({ durationMs: 1000, byteSize: 123 }),
  };
  const pending = new Map<string, RecordingDraft>();
  const saved = new Map<string, SavedRecording>();
  const repository: jest.Mocked<RecordingRepository> = {
    load: jest.fn().mockImplementation(async () => ({ pending: [...pending.values()], saved: [...saved.values()] })),
    checkpoint: jest.fn().mockImplementation(async (draft: RecordingDraft) => {
      if (!saved.has(draft.id)) pending.set(draft.id, decodeDraft(JSON.stringify(draft)));
    }),
    commit: jest.fn().mockImplementation(async (record: SavedRecording) => {
      const value = decodeRecording(JSON.stringify(record));
      saved.set(value.id, value);
      pending.delete(value.id);
      return value;
    }),
    cancelUnstarted: jest.fn().mockImplementation(async (id: string) => { pending.delete(id); }),
  };
  let nextId = 10;
  const newId = jest.fn(() => id(nextId++));
  const store = new CaptureStore(camera, media, repository, newId, 'mov');
  const ready = async () => { await store.open(project); store.previewReady(); };
  const begin = async () => { await ready(); await store.start(); await store.checkPosition(); };
  const end = async (error?: unknown, interrupted = false) => {
    const settled = new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe(() => {
        if (['saved', 'failed'].includes(store.getSnapshot().phase) || (store.getSnapshot().phase === 'unfinalized' && store.getSnapshot().error)) { unsubscribe(); resolve(); }
      });
    });
    if (error) recording.reject(error);
    else recording.resolve({ uri: 'file:///private/output.mov', interrupted });
    await settled;
  };
  return { project, camera, media, repository, recording, pending, saved, newId, store, ready, begin, end };
}
