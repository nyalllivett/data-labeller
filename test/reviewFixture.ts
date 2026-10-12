import { captureFixture } from './captureFixture';
import { id } from './ids';
import { createRecordingDraft, finalizeRecording, toggleLabel, type SavedRecording } from '../src/capture/recording';
import { annotations, originalAnnotations, type Annotations } from '../src/review/annotations';
import type { AnnotationRepository } from '../src/review/AnnotationRepository';
import { ReviewStore } from '../src/review/ReviewStore';

export function savedRecord(recordId = id(10), durationMs = 1000): SavedRecording {
  const { project } = captureFixture();
  let draft = createRecordingDraft(recordId, project, 'back', 'mov');
  for (const [labelId, mediaMs] of [[id(2), 100], [id(3), 200], [id(2), 600]] as const) {
    draft = toggleLabel(draft, labelId, { recordingId: recordId, mediaMs, source: 'avcapture-recorded-duration' });
  }
  return finalizeRecording({ ...draft, termination: 'stopped', annotationFailures: [{ labelId: id(3), afterEvent: 3, reason: 'clock-unavailable' }] }, { durationMs, byteSize: 123 });
}
export function reviewFixture() {
  const { project } = captureFixture();
  const record = savedRecord();
  const second = savedRecord(id(11));
  const documents = new Map<string, Annotations>();
  const recordings = { load: jest.fn().mockResolvedValue({ pending: [], saved: [record, second] }) };
  const repository: jest.Mocked<AnnotationRepository> = {
    load: jest.fn(async (value) => documents.get(value.id) ?? originalAnnotations(value)),
    save: jest.fn(async (value, expected, document) => {
      const saved = annotations(value, expected + 1, document.intervals); documents.set(value.id, saved); return saved;
    }),
  };
  const resolve = jest.fn(async (value: SavedRecording) => `file:///private/recordings/${value.id}.mov`);
  const store = new ReviewStore(recordings, repository, resolve);
  const open = async () => { await store.open(project); await store.selectRecord(record.id); };
  return { project, record, second, documents, recordings, repository, resolve, store, open };
}
