import { useState, useSyncExternalStore } from 'react';
import { Button, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReviewStore } from '../ReviewStore';
import { IntervalEditor } from './IntervalEditor';
import { Timeline } from './Timeline';
import { VideoPane } from './VideoPane';

const errors = {
  'invalid-interval': 'Use a captured label and finite bounds from zero to the video duration, with start no later than end.',
  'invalid-input': 'Enter a number of seconds for both bounds. Blank or nonnumeric fields cannot be applied.',
  'unapplied-fields': 'Apply or reset the current fields before changing selection or using Undo.',
  'storage-failed': 'Annotations could not be confirmed. Keep the app data and Retry the same save.',
  conflict: 'The annotation save conflicts with committed data. Your submitted edit is retained; no data was overwritten.',
  'invalid-data': 'Stored annotations could not be read safely. Keep the app data; it has not been reset.',
  'unsupported-schema': 'This annotation database needs a compatible app version. Keep the app data.',
  'media-unavailable': 'Saved video is missing or unavailable. Keep the app data and retry opening; temporary media was not promoted.',
  'playback-failed': 'Video playback is unavailable. Keep the media and retry video.',
};
export function ReviewScreen({ store }: { store: ReviewStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [seek, setSeek] = useState<{ recordingId: string | null; mediaMs: number | null; request: number }>({ recordingId: null, mediaMs: null, request: 0 });
  const { record, document } = state;
  const editable = state.phase === 'editing';
  const select = (id: number) => {
    if (store.selectInterval(id)) {
      const interval = document!.intervals.find((value) => value.id === id)!;
      setSeek((value) => ({ recordingId: record!.id, mediaMs: interval.startMs, request: value.request + 1 }));
    }
  };
  return <SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
    <Button title="Back to projects" disabled={!store.canLeave()} onPress={store.close} />
    <Text accessibilityRole="header" style={{ fontSize: 24 }}>{state.project?.name}: review</Text>
    {state.error && <Text accessibilityRole="alert">{errors[state.error]}</Text>}
    {['loading', 'opening'].includes(state.phase) && <Text>Loading local recordings and annotations…</Text>}
    {state.phase === 'load-failed' && <Button title="Retry opening review" onPress={() => { void (record ? store.retryOpen() : store.load()); }} />}
    {!state.recordings.length && state.phase === 'library' && <Text>No saved recordings yet. Capture and save video first.</Text>}
    {state.recordings.map((item, index) => <Button key={item.id} title={`Review recording ${index + 1}`}
      disabled={!store.canLeave()} onPress={() => { void store.selectRecord(item.id); }} />)}
    {record && document && state.uri && <>
      <Text>Captured project: {record.projectName}; duration {record.durationMs / 1000} seconds.</Text>
      {record.annotationFailures.length > 0 && <Text accessibilityRole="alert">Capture annotations are incomplete: {record.annotationFailures.length} untimed label changes remain recorded. Editing intervals does not resolve those failures.</Text>}
      {record.termination === 'interrupted' && <Text>Capture was interrupted.</Text>}
      <Text>Original capture events and timing provenance remain unchanged. Physical timing/playback alignment still needs device verification.</Text>
      <VideoPane key={`video:${record.id}`} id={record.id} uri={state.uri} durationMs={record.durationMs} seekMs={seek.recordingId === record.id ? seek.mediaMs : null} seekRequest={seek.request} onPlayback={store.setPlayback} />
      <Timeline key={`timeline:${record.id}`} record={record} document={document} positionMs={state.positionMs} selected={state.form?.id} disabled={!editable || store.formDirty()} select={select} />
      <Text accessibilityRole="header">Intervals</Text>
      {!document.intervals.length && <Text>No effective intervals. Unlabelled time is not a negative example.</Text>}
      {document.intervals.map((interval) => <Button key={interval.id} title={`Inspect interval ${interval.id + 1}: ${record.labels.find((label) => label.id === interval.labelId)!.name}, ${interval.startMs / 1000}–${interval.endMs / 1000} seconds`}
        disabled={!editable || store.formDirty()} onPress={() => select(interval.id)} />)}
      <IntervalEditor store={store} state={{ ...state, record }} />
      <Text>{store.dirty() ? 'Unsaved annotation changes.' : `Annotations saved locally (revision ${state.saved!.revision}).`}</Text>
      {store.formDirty() && <Text>Unapplied fields: Apply or Reset before saving, Undo or leaving.</Text>}
      <Button title="Undo annotation change" disabled={!editable || !state.history.length || store.formDirty()} onPress={store.undo} />
      <Button title="Save annotations" disabled={!store.canSave()} onPress={() => { void store.save(); }} />
      {state.phase === 'saving' && <Text>Saving annotations…</Text>}
      {state.phase === 'save-failed' && <Button title="Retry annotation save" onPress={() => { void store.retrySave(); }} />}
      <Text>Undo is available while this recording remains open, including after Save. Unsaved edits are not promised across app process death.</Text>
    </>}
  </ScrollView></SafeAreaView>;
}
