import { useSyncExternalStore } from 'react';
import { Button, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ExportStore } from '../ExportStore';

const messages = {
  'invalid-export': 'The saved annotation data or media linkage is invalid. Keep the app data; no source data was changed.',
  'source-unavailable': 'Saved recordings or committed annotations could not be read. Keep the app data and Retry; persistent errors may need a compatible app version.',
  'package-failed': 'The package could not be prepared, for example if storage is unavailable. Sources are unchanged. Retry preparation after resolving the storage or development-build issue.',
  'invalid-package': 'The prepared files could not be verified as a complete package. Sources are unchanged. Retry preparation.',
  'cancelled': 'Preparation cancelled. Sources are unchanged.',
  'cancel-failed': 'Native cancellation could not be confirmed. Waiting for the current operation to finish before discarding the output.',
  'cleanup-failed': 'Incomplete export files could not be removed. Sources are unchanged. Retry cleanup before another export.',
  'package-missing': 'The prepared cache package is missing or changed. Prepare a new package from the saved sources.',
  'sharing-unavailable': 'Sharing is unavailable in this development build. Keep the saved data; a compatible rebuilt client is required.',
  'share-failed': 'The share sheet could not be confirmed. The package and sources are retained. Retry Share; if failure persists, fully close and reopen the app before preparing again.',
};
export function ExportScreen({ store }: { store: ExportStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { saved, pending } = state.workspace;
  const scope = state.scope;
  const selected = scope.kind === 'project' ? saved : saved.filter((record) => record.id === scope.recordingId);
  return <SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
    <Button title="Back to projects" disabled={!store.canClose()} onPress={store.close} />
    <Text accessibilityRole="header" style={{ fontSize: 24 }}>{state.project?.name}: export</Text>
    {state.error && <Text accessibilityRole="alert">{messages[state.error]}</Text>}
    {state.phase === 'loading' && <Text>Loading saved recordings…</Text>}
    {state.phase === 'load-failed' && <Button title="Retry export library" onPress={() => { void store.retryLoad(); }} />}
    {state.phase !== 'loading' && !saved.length && <Text>No saved video to export. Recover or save a recording first.</Text>}
    <Pressable accessibilityRole="radio" accessibilityLabel="Export project" accessibilityState={{ checked: state.scope.kind === 'project', disabled: !store.canSelect() }}
      disabled={!store.canSelect()} onPress={() => store.selectScope({ kind: 'project' })}><Text>Project: all saved recordings</Text></Pressable>
    {saved.map((record, index) => <Pressable key={record.id} accessibilityRole="radio" accessibilityLabel={`Export recording ${index + 1}`}
      accessibilityState={{ checked: state.scope.kind === 'recording' && state.scope.recordingId === record.id, disabled: !store.canSelect() }}
      disabled={!store.canSelect()} onPress={() => store.selectScope({ kind: 'recording', recordingId: record.id })}>
      <Text>Recording {index + 1}: captured project {record.projectName}, {record.durationMs / 1000} seconds.</Text>
    </Pressable>)}
    {pending.length > 0 && <Text accessibilityRole="alert">{pending.length} pending recordings have no committed video included. Project packages include their annotation inventory; selected-recording packages exclude other recordings.</Text>}
    {selected.some((record) => record.termination === 'interrupted') && <Text accessibilityRole="alert">The selection includes interrupted capture. Original interruption evidence remains in the package.</Text>}
    {selected.some((record) => record.annotationFailures.length > 0) && <Text accessibilityRole="alert">The selection has untimed label changes. Reviewed intervals do not resolve those capture failures; they remain in the package.</Text>}
    <Text>One ZIP contains video files and JSON annotations with media linkage, milliseconds, effective saved edits and original capture evidence. Unlabelled gaps are not negative examples.</Text>
    <Text>Only committed annotations are exported. Preparation does not change recordings or annotations. Timing alignment remains unverified on devices.</Text>
    <Button title="Prepare export package" disabled={!store.canPrepare()} onPress={() => { void store.prepare(); }} />
    {state.phase === 'preparing' && <><Text>Preparing local package…</Text><Button title="Cancel preparation" onPress={store.cancel} /></>}
    {state.phase === 'cancelling' && <Text>Cancel requested; finishing the current file or native operation before cleanup.</Text>}
    {state.phase === 'cleaning' && <Text>Removing incomplete export files…</Text>}
    {state.phase === 'cleanup-failed' && <Button title="Retry export cleanup" onPress={() => { void store.retryCleanup(); }} />}
    {state.phase === 'preparation-failed' && <Button title="Retry package preparation" onPress={() => { void store.retryPrepare(); }} />}
    {state.cancelled && <Text>Preparation cancelled. Sources are unchanged.</Text>}
    {state.packageFile && <>
      <Text>Package prepared in local cache. It has not been confirmed delivered.</Text>
      <Button title="Share package" disabled={!store.canShare()} onPress={() => { void store.share(); }} />
    </>}
    {state.phase === 'sharing' && <Text>The OS share sheet is open. Return from it to continue.</Text>}
    {state.phase === 'share-returned' && <Text>Share sheet closed; delivery is not confirmed.</Text>}
    <Text>Completed packages remain in app cache because a share recipient may still read them. The OS can remove cache files; prepare again if needed. Saved sources stay local.</Text>
  </ScrollView></SafeAreaView>;
}
