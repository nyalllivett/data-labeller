import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { nativePlayback } from '../nativePlayback';
import { PlaybackController } from '../PlaybackController';

type Props = { id: string; uri: string; durationMs: number; seekMs: number | null; seekRequest: number;
  onPlayback(id: string, positionMs: number | null, ready: boolean): void };
function NativeVideo({ id, uri, durationMs, onPlayback, seekMs, seekRequest }: Props) {
  const player = useVideoPlayer({ uri, useCaching: false }, (value) => {
    value.muted = true;
    value.timeUpdateEventInterval = 0.25; // Display cadence, not a timing tolerance.
  });
  const controller = useMemo(() => new PlaybackController(durationMs), [durationMs]);
  const consumedSeek = useRef(0);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    controller.connect(nativePlayback(player));
    return () => { controller.disconnect(); onPlayback(id, null, false); };
  }, [controller, player, id, onPlayback]);
  const ready = state.status === 'readyToPlay' && !state.error;
  const usable = ready && state.positionUsable;
  useEffect(() => { onPlayback(id, usable ? state.positionMs : null, usable); }, [id, usable, state.positionMs, onPlayback]);
  useEffect(() => {
    if (ready && seekMs !== null && seekRequest !== consumedSeek.current) {
      consumedSeek.current = seekRequest;
      controller.seek(seekMs);
    }
  }, [controller, seekMs, seekRequest, ready]);
  return <>
    <VideoView player={player} nativeControls={false} contentFit="contain" style={styles.video} />
    <Text>{usable ? `Reported playback: ${(state.positionMs / 1000).toFixed(3)} seconds.` : 'Awaiting a usable playback position.'} Reported positions do not confirm displayed-frame arrival.</Text>
    <Button title={state.playing ? 'Pause video' : 'Play video'} disabled={!state.playing && !ready} onPress={controller.toggle} />
    {ready && !state.positionUsable && <Text accessibilityRole="alert">Player position is unavailable or outside captured bounds. Playback controls remain available; no annotation time was assigned.</Text>}
    {state.error && <Text accessibilityRole="alert">Playback or the last control request could not be confirmed. Keep the media, Pause if needed and Retry video.</Text>}
  </>;
}
export function VideoPane(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <View style={styles.pane}>
    <NativeVideo key={attempt} {...props} />
    <Button title="Retry video" onPress={() => setAttempt((value) => value + 1)} />
  </View>;
}
const styles = StyleSheet.create({ pane: { gap: 8 }, video: { width: '100%', height: 240, backgroundColor: '#111925' } });
