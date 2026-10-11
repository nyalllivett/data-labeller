import { Component, Fragment, type ReactNode } from 'react';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { emitDiagnostic, type DiagnosticSink } from '../diagnostics/diagnostics';

type Props = { children: ReactNode; diagnosticSink?: DiagnosticSink };
type State = { hasError: boolean; retryCount: number };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(): void {
    emitDiagnostic('render.failed', this.props.diagnosticSink);
  }

  private retry = (): void => {
    emitDiagnostic('render.retry_requested', this.props.diagnosticSink);
    this.setState(({ retryCount }) => ({ hasError: false, retryCount: retryCount + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>
              {"We couldn't show this screen"}
            </Text>
            <Text style={styles.message}>
              Try again. If this keeps happening, close and reopen the app.
            </Text>
            <Button title="Try again" onPress={this.retry} />
          </ScrollView>
        </SafeAreaView>
      );
    }

    return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '600', color: '#14263d' },
  message: { fontSize: 18, lineHeight: 27, color: '#34465c' },
});
