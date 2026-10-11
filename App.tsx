import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from './src/shell/AppErrorBoundary';
import { newId, projectStore } from './src/projects/runtime';
import { ProjectWorkspace } from './src/projects/ui/ProjectWorkspace';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <StatusBar style="dark" />
        <ProjectWorkspace store={projectStore} newId={newId} />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
