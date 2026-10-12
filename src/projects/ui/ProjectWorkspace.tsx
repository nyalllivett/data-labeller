import { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addLabel, changeLabel, createProject, renameProject, type Project } from '../project';
import type { ProjectStore } from '../ProjectStore';
import { NameEditor, type NameEdit } from './NameEditor';
import { ProjectDetails } from './ProjectDetails';
import { ProjectList } from './ProjectList';
import { RecoveryPanel } from './RecoveryPanel';
import { styles } from './styles';

export function ProjectWorkspace({ store, newId, onCapture, onReview, onExport }: { store: ProjectStore; newId(): string; onCapture(project: Project): void; onReview(project: Project): void; onExport(project: Project): void }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState<NameEdit | null>(null);
  const project = state.projects.find((item) => item.id === selected);
  const locked = state.status !== 'ready' || !!state.attempted || !!state.pending.length;
  useEffect(() => {
    void store.load();
  }, [store]);

  function editProject(
    title: string,
    initialName: string,
    original: Project,
    update: (name: string) => Project,
  ) {
    setEdit({
      title,
      initialName,
      save: (name) => {
        const desired = update(name);
        if (desired === original) return Promise.resolve(true);
        return store.submit(desired, original.revision);
      },
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <RecoveryPanel
          state={state}
          retry={async (operation) => {
            const ok = await store.retry(operation);
            if (ok && operation) {
              setEdit(null);
              setSelected(operation.project.id);
            }
            return ok;
          }}
          discard={async (id) => {
            const ok = await store.discard(id);
            if (ok) setEdit(null);
            return ok;
          }}
        />
        {state.status === 'ready' && !state.attempted && !state.pending.length && (
          <Text style={styles.text}>All submitted changes are saved locally.</Text>
        )}
        {(state.status === 'ready' || state.projects.length > 0) &&
          (project ? (
            <ProjectDetails
              project={project}
              disabled={locked || !!edit}
              back={() => setSelected(null)}
              renameProject={() =>
                editProject('Rename project', project.name, project, (name) =>
                  renameProject(project, name),
                )
              }
              addLabel={() =>
                editProject('New label', '', project, (name) => addLabel(project, newId(), name))
              }
              renameLabel={(label) =>
                editProject('Rename label', label.name, project, (name) =>
                  changeLabel(project, label.id, { name }),
                )
              }
              archive={(label) => {
                void store.submit(
                  changeLabel(project, label.id, { archived: !label.archived }),
                  project.revision,
                );
              }}
              capture={() => onCapture(project)}
              review={() => onReview(project)}
              exportRecordings={() => onExport(project)}
            />
          ) : (
            <ProjectList
              projects={state.projects}
              disabled={locked || !!edit}
              open={setSelected}
              create={() =>
                setEdit({
                  title: 'New project',
                  initialName: '',
                  save: async (name) => {
                    const desired = createProject(newId(), name);
                    const ok = await store.submit(desired, 0);
                    if (ok) setSelected(desired.id);
                    return ok;
                  },
                })
              }
            />
          ))}
        {edit && (
          <NameEditor
            edit={edit}
            locked={locked}
            onSaved={() => setEdit(null)}
            onCancel={() => setEdit(null)}
          />
        )}
        <Text style={styles.text}>Review and export saved recordings from a committed project.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
