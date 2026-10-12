import { useState } from 'react';
import { Button, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SavedRecording } from '../../capture/recording';
import type { Annotations } from '../annotations';
import { fitWindow, fractionInWindow, panWindow, visibleInterval, zoomWindow } from '../timeline';

export function Timeline({ record, document, positionMs, selected, disabled, select }: {
  record: SavedRecording; document: Annotations; positionMs: number | null; selected: number | undefined;
  disabled: boolean; select(id: number): void;
}) {
  const [window, setWindow] = useState(() => fitWindow(record.durationMs));
  const zoomed = zoomWindow(window, 'in', record.durationMs);
  const position = positionMs === null ? -1 : fractionInWindow(positionMs, window);
  return <View style={styles.timeline}>
    <Text accessibilityRole="header">Label timeline</Text>
    <Text>Visible: {window.startMs / 1000}–{window.endMs / 1000} seconds</Text>
    <View style={styles.controls}>
      <Button title="Zoom in" disabled={zoomed === window} onPress={() => setWindow(zoomed)} />
      <Button title="Zoom out" disabled={window.startMs === 0 && window.endMs === record.durationMs} onPress={() => setWindow(zoomWindow(window, 'out', record.durationMs))} />
      <Button title="Fit timeline" onPress={() => setWindow(fitWindow(record.durationMs))} />
      <Button title="Earlier" disabled={window.startMs === 0} onPress={() => setWindow(panWindow(window, 'earlier', record.durationMs))} />
      <Button title="Later" disabled={window.endMs === record.durationMs} onPress={() => setWindow(panWindow(window, 'later', record.durationMs))} />
    </View>
    {record.labels.map((label) => {
      const intervals = document.intervals.filter((interval) => interval.labelId === label.id);
      return <View key={label.id} accessibilityLabel={`Track ${label.name}`} style={styles.track}>
        <Text>{label.name}</Text>
        {!intervals.length && <Text>No intervals</Text>}
        {intervals.map((interval) => {
          const geometry = visibleInterval(interval, window);
          return <View key={interval.id} style={styles.lane}>
            {geometry && <Pressable accessibilityRole="button" accessibilityLabel={`${label.name} interval ${interval.id + 1}`}
              accessibilityState={{ selected: interval.id === selected, disabled }} disabled={disabled} onPress={() => select(interval.id)}
              style={[styles.interval, { left: `${geometry.left * 100}%`, width: `${geometry.width * 100}%`,
                transform: [{ translateX: geometry.left === 1 ? -24 : 0 }] }, interval.id === selected && styles.selected]} />}
          </View>;
        })}
        {position >= 0 && position <= 1 && <View accessibilityLabel="Timeline playhead" pointerEvents="none" style={[styles.playhead, { left: `${position * 100}%` }]} />}
      </View>;
    })}
    <Text>Each interval has its own selectable row, including overlaps and zero-length markers. Marker size does not change time bounds.</Text>
  </View>;
}
const styles = StyleSheet.create({
  timeline: { gap: 10 }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  track: { position: 'relative', borderWidth: 1, borderColor: '#ccd5e1', paddingVertical: 8, overflow: 'hidden' },
  lane: { height: 36, position: 'relative', backgroundColor: '#e9eef5', marginVertical: 2 },
  interval: { position: 'absolute', top: 3, bottom: 3, minWidth: 24, backgroundColor: '#348068', borderRadius: 4 },
  selected: { borderWidth: 3, borderColor: '#18304c' }, playhead: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#bb3547' },
});
