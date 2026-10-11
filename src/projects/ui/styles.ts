import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 24, gap: 16 },
  section: { gap: 12, paddingVertical: 12 },
  row: { gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#d6dce5' },
  title: { fontSize: 28, fontWeight: '700', color: '#14263d' },
  heading: { fontSize: 20, fontWeight: '600', color: '#14263d' },
  text: { fontSize: 17, lineHeight: 25, color: '#34465c' },
  error: { fontSize: 17, lineHeight: 25, color: '#8b2020' },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#607086',
    borderRadius: 6,
    backgroundColor: '#fff',
    fontSize: 18,
    color: '#14263d',
  },
});
