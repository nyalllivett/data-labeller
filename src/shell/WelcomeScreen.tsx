import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Data Labeller
        </Text>
        <Text style={styles.description}>Video with your own labels.</Text>
        <Text style={styles.description}>
          A local workspace for recording, reviewing and exporting labelled video.
        </Text>
        <Text accessibilityRole="header" style={styles.subtitle}>
          Development preview
        </Text>
        <Text style={styles.description}>
          Project creation and recording are coming next.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 32, fontWeight: '700', color: '#14263d' },
  subtitle: { fontSize: 20, fontWeight: '600', color: '#14263d', marginTop: 16 },
  description: { fontSize: 18, lineHeight: 27, color: '#34465c' },
});
