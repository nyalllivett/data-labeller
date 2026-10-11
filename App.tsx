import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from './src/shell/AppErrorBoundary';
import { WelcomeScreen } from './src/shell/WelcomeScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <StatusBar style="dark" />
        <WelcomeScreen />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
