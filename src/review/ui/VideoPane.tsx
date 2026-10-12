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
  useEffect(() => { onPlayback(id, ready ? state.positionMs : null, ready); }, [id, ready, state.positionMs, onPlayback]);
  useEffect(() => {
    if (ready && seekMs !== null && seekRequest !== consumedSeek.current) {
      consumedSeek.current = seekRequest;
      controller.seek(seekMs);
    }
  }, [controller, seekMs, seekRequest, ready]);
  return <>
    <VideoView player={player} nativeControls={false} contentFit="contain" style={styles.video} />
    <Text>Reported playback: {(state.positionMs / 1000).toFixed(3)} seconds. Seeking is provisional until reported by the player.</Text>
    <Button title={state.playing ? 'Pause video' : 'Play video'} disabled={!ready} onPress={controller.toggle} />
    {state.error && <Text accessibilityRole="alert">Playback is unavailable or its position is outside the captured timeline. Keep the media and retry video.</Text>}
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
