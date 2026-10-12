import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

export function LabelRow({ labels, active, disabled, toggle }: {
  labels: readonly Readonly<{ id: string; name: string }>[];
  active: ReadonlySet<string>;
  disabled: boolean;
  toggle(id: string): void;
}) {
  return (
    <ScrollView horizontal accessibilityLabel="Live labels" contentContainerStyle={styles.row}>
      {labels.map((label) => (
        <Pressable key={label.id} accessibilityRole="button" accessibilityLabel={label.name}
          accessibilityState={{ selected: active.has(label.id), disabled }} disabled={disabled}
          onPress={() => toggle(label.id)} style={[styles.label, active.has(label.id) && styles.active]}>
          <Text style={styles.text}>{label.name}</Text>
        </Pressable>
      ))}
      {!labels.length && <Text style={styles.text}>No active project labels. Video will be unlabelled.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, alignItems: 'center', padding: 12 },
  label: { padding: 14, borderRadius: 8, backgroundColor: '#273449', borderWidth: 2, borderColor: '#526078' },
  active: { backgroundColor: '#175d44', borderColor: '#68dbac' },
  text: { color: '#f1f5fa', fontSize: 17 },
});
