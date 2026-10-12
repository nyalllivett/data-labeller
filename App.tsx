import { StatusBar } from 'expo-status-bar';
import { useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from './src/shell/AppErrorBoundary';
import { newId, projectStore } from './src/projects/runtime';
import { ProjectWorkspace } from './src/projects/ui/ProjectWorkspace';
import { camera, captureStore } from './src/capture/runtime';
import { CaptureScreen } from './src/capture/ui/CaptureScreen';

function WorkspaceRoot() {
  const state = useSyncExternalStore(captureStore.subscribe, captureStore.getSnapshot);
  return state.project ? <CaptureScreen store={captureStore} camera={camera} /> :
    <ProjectWorkspace store={projectStore} newId={newId} onCapture={(project) => { void captureStore.open(project); }} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <StatusBar style="dark" />
        <WorkspaceRoot />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
