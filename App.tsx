import { StatusBar } from 'expo-status-bar';
import { useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from './src/shell/AppErrorBoundary';
import { newId, projectStore } from './src/projects/runtime';
import { ProjectWorkspace } from './src/projects/ui/ProjectWorkspace';
import { camera, captureStore } from './src/capture/runtime';
import { CaptureScreen } from './src/capture/ui/CaptureScreen';
import { reviewStore } from './src/review/runtime';
import { ReviewScreen } from './src/review/ui/ReviewScreen';
import { exportStore } from './src/export/runtime';
import { ExportScreen } from './src/export/ui/ExportScreen';

function WorkspaceRoot() {
  const state = useSyncExternalStore(captureStore.subscribe, captureStore.getSnapshot);
  const review = useSyncExternalStore(reviewStore.subscribe, reviewStore.getSnapshot);
  const exporting = useSyncExternalStore(exportStore.subscribe, exportStore.getSnapshot);
  return <>
    <StatusBar style={state.project ? 'light' : 'dark'} />
    {exporting.project ? <ExportScreen store={exportStore} /> : review.project ? <ReviewScreen store={reviewStore} /> : state.project ? <CaptureScreen store={captureStore} camera={camera} /> :
      <ProjectWorkspace store={projectStore} newId={newId} onCapture={(project) => { void captureStore.open(project); }} onReview={(project) => { void reviewStore.open(project); }} onExport={(project) => { void exportStore.open(project); }} />}
  </>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <WorkspaceRoot />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
