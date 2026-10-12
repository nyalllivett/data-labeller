import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';

import type { CaptureStore } from '../CaptureStore';
import { cameraPermissions, type CameraPermission, type CameraPermissions, type NativeCamera } from '../nativeCamera';
import { LabelRow } from './LabelRow';

const errors = {
  unavailable: 'Capture or local storage is unavailable. Keep the app data and retry.',
  'clock-unavailable': 'A video position is not available for this label change. Its untimed intent was retained; try again or Stop.',
  'invalid-timing': 'Video timing could not be confirmed. Video and pending annotations are retained for recovery.',
  'checkpoint-failed': 'Annotations could not be saved. Stopping capture to preserve the pending change.',
  'stop-failed': 'Stop could not be confirmed. Retry Stop; the recording may still be running.',
  'media-unavailable': 'Video is missing, unfinished or unavailable. Check free storage and retry saving. Pending data has been retained.',
  'invalid-data': 'Recording data could not be read safely. Keep the app data and retry; it has not been reset.',
  'capture-unfinalized': 'Video finalization could not be confirmed. Keep the app data and fully close and reopen the app before recovering this recording.',
  'annotation-incomplete': 'Video was saved, but at least one label change could not be timed. Annotations are incomplete; the failed intent was retained without a timestamp.',
};
const messages = {
  closed: '', loading: 'Loading recordings…', ready: 'Ready to record',
  starting: 'Starting video… Labels become available when the recorder reports a video position.',
  recording: 'Recording', stopping: 'Stopping video…', saving: 'Finalizing and saving video…', saved: 'Saved locally.', failed: 'Recording needs attention.', unfinalized: 'Video finalization needs app restart.',
};

export function CaptureScreen({ store, camera, permissions = cameraPermissions }: { store: CaptureStore; camera: NativeCamera; permissions?: CameraPermissions }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [permission, setPermission] = useState<CameraPermission | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [asking, setAsking] = useState(false);
  const checkPermission = useCallback(async (request: boolean) => {
    setAsking(true);
    setPermissionError(false);
    try { setPermission(await (request ? permissions.request() : permissions.get())); }
    catch { setPermissionError(true); }
    finally { setAsking(false); }
  }, [permissions]);
  useEffect(() => {
    void permissions.get().then(setPermission, () => setPermissionError(true));
  }, [permissions]);
  const attach = useCallback((value: CameraView | null) => camera.attach(value), [camera]);
  const live = ['starting', 'recording', 'stopping'].includes(state.phase);
  const preview = state.phase === 'ready' || live;
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void store.stop('interrupted');
      else void checkPermission(false);
    });
    return () => { listener.remove(); void store.stop('interrupted'); };
  }, [store, checkPermission]);
  useEffect(() => {
    if (state.phase !== 'starting') return;
    void store.checkPosition();
    const timer = setInterval(() => { void store.checkPosition(); }, 250);
    return () => clearInterval(timer);
  }, [store, state.phase]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Button title="Back to projects" disabled={!store.canClose()} onPress={store.close} />
        <Text accessibilityRole="header" style={styles.title}>{state.project?.name}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.text}>{messages[state.phase]}</Text>
        <Text style={styles.note}>Live label timing is provisional and still needs device verification.</Text>
        {state.error && <Text accessibilityRole="alert" style={styles.error}>{errors[state.error]}</Text>}
        {state.phase === 'ready' && (
          <View style={styles.facing}>
            {(['back', 'front'] as const).map((facing) => (
              <Pressable key={facing} accessibilityRole="radio" accessibilityLabel={facing === 'back' ? 'Rear camera' : 'Front camera'}
                accessibilityState={{ checked: state.facing === facing }} onPress={() => store.setFacing(facing)} style={[styles.choice, state.facing === facing && styles.selected]}>
                <Text style={styles.text}>{facing === 'back' ? 'Rear' : 'Front'}</Text>
              </Pressable>
            ))}
            <Button title="Start recording" disabled={!permission?.granted || !state.previewReady} onPress={() => { void store.start(); }} />
          </View>
        )}
      </View>
      {preview && !permission && !permissionError && <Text style={styles.text}>Checking camera permission…</Text>}
      {preview && permissionError && <View style={styles.header}>
        <Text accessibilityRole="alert" style={styles.error}>Camera permission could not be checked. Try again.</Text>
        <Button title="Retry camera permission" disabled={asking || live} onPress={() => { void checkPermission(false); }} />
      </View>}
      {preview && permission && !permission.granted && (
        <View style={styles.header}>
          <Text style={styles.text}>Camera access is needed to record video. Audio is off.</Text>
          {permission.canAskAgain ? (
            <Button title="Allow camera access" disabled={asking || live} onPress={() => { void checkPermission(true); }} />
          ) : <Text style={styles.text}>Camera access is denied. Enable it in device settings, then return to the app.</Text>}
        </View>
      )}
      {preview && permission?.granted && (
        <CameraView key={state.facing} ref={attach} style={styles.preview} facing={state.facing} mode="video" mute
          onCameraReady={store.previewReady} onMountError={store.previewFailed} />
      )}
      {!live && !['loading', 'saving'].includes(state.phase) && (
        <ScrollView style={styles.history} contentContainerStyle={styles.header}>
          {state.phase === 'failed' && !state.draft && <Button title="Retry loading recordings" onPress={() => { void store.load(); }} />}
          {state.lastSaved?.termination === 'interrupted' && <Text accessibilityRole="alert" style={styles.error}>Capture was interrupted. Recoverable video and annotations were saved.</Text>}
          {state.pending.map((draft) => (
            <View key={draft.id} style={styles.pending}>
              <Text style={styles.text}>Pending recording: {draft.labels.map((label) => label.name).join(', ') || 'unlabelled'}</Text>
              <Button title="Retry saving pending recording" disabled={!store.canRecover(draft.id)} onPress={() => { void store.recover(draft.id); }} />
            </View>
          ))}
          {state.saved.map((recording, index) => (
            <Text key={recording.id} style={styles.text}>
              Recording {index + 1}: {(recording.durationMs / 1000).toFixed(2)} seconds, {recording.intervals.length} intervals{recording.termination === 'interrupted' ? ', interrupted' : ''}{recording.annotationFailures.length ? ', incomplete annotations' : ''}. Saved locally.
            </Text>
          ))}
          {['saved', 'failed'].includes(state.phase) && state.draft && <Button title="New recording (keep pending data)" disabled={!store.canClose()} onPress={store.newRecording} />}
          {state.phase === 'unfinalized' && state.error === 'checkpoint-failed' && <Button title="Retry pending annotation save" onPress={() => { void store.checkpointUnfinalized(); }} />}
          <Text style={styles.note}>Review and correct saved recordings from the project screen. Export is coming in slice E.</Text>
        </ScrollView>
      )}
      <View style={styles.footer}>
        <LabelRow labels={state.draft?.labels ?? state.project?.labels.filter((label) => !label.archived) ?? []}
          active={live ? store.activeLabels() : new Set()} disabled={state.phase !== 'recording' || state.labelBusy} toggle={(id) => { void store.toggle(id); }} />
        {live && <View style={styles.stop}><Button title={state.error === 'stop-failed' ? 'Retry Stop' : 'Stop'}
          disabled={state.phase === 'stopping' && state.error !== 'stop-failed'} onPress={() => { void store.stop(); }} /></View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101925' },
  header: { padding: 16, gap: 10 },
  title: { color: '#f1f5fa', fontSize: 24, fontWeight: '600' },
  text: { color: '#f1f5fa', fontSize: 16 },
  note: { color: '#aebacf', fontSize: 14 },
  error: { color: '#ffb3ad', fontSize: 16 },
  facing: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  choice: { padding: 12, backgroundColor: '#273449', borderRadius: 8 },
  selected: { borderWidth: 2, borderColor: '#68dbac' },
  preview: { flex: 1, minHeight: 120 },
  history: { flex: 1 },
  pending: { gap: 8, paddingVertical: 12 },
  footer: { borderTopWidth: 1, borderColor: '#526078' },
  stop: { padding: 12 },
});
