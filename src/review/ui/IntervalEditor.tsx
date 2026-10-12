import { Button, Pressable, Text, TextInput, View } from 'react-native';
import type { SavedRecording } from '../../capture/recording';
import type { ReviewStore, ReviewState } from '../ReviewStore';

export function IntervalEditor({ store, state }: { store: ReviewStore; state: ReviewState & { record: SavedRecording } }) {
  const form = state.form;
  if (!form) return <Text>Select an interval to inspect or edit.</Text>;
  const disabled = state.phase !== 'editing';
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header">Interval {form.id + 1}</Text>
    <Text>Start (seconds)</Text>
    <TextInput accessibilityLabel="Interval start seconds" keyboardType="decimal-pad" editable={!disabled} value={form.start} onChangeText={(value) => store.setField('start', value)} />
    <Text>End (seconds)</Text>
    <TextInput accessibilityLabel="Interval end seconds" keyboardType="decimal-pad" editable={!disabled} value={form.end} onChangeText={(value) => store.setField('end', value)} />
    <Button title="Use playback for start" disabled={disabled || !state.playbackReady} onPress={() => store.usePosition('start')} />
    <Button title="Use playback for end" disabled={disabled || !state.playbackReady} onPress={() => store.usePosition('end')} />
    <Text>Label (historical name)</Text>
    {state.record.labels.map((label) => <Pressable key={label.id} accessibilityRole="radio" accessibilityLabel={`Interval label ${label.name}`}
      accessibilityState={{ checked: form.labelId === label.id, disabled }} disabled={disabled} onPress={() => store.setField('labelId', label.id)}>
      <Text>{form.labelId === label.id ? '● ' : '○ '}{label.name}</Text>
    </Pressable>)}
    <Button title="Apply interval edit" disabled={disabled} onPress={store.apply} />
    <Button title="Reset fields" disabled={disabled} onPress={store.resetForm} />
    <Button title="Delete interval" disabled={disabled || store.formDirty()} onPress={() => store.delete(form.id)} />
  </View>;
}
