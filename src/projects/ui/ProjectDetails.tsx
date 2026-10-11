import { Button, Text, View } from 'react-native';

import type { Label, Project } from '../project';
import { styles } from './styles';

export function ProjectDetails({
  project,
  disabled,
  back,
  renameProject,
  addLabel,
  renameLabel,
  archive,
}: {
  project: Project;
  disabled: boolean;
  back(): void;
  renameProject(): void;
  addLabel(): void;
  renameLabel(label: Label): void;
  archive(label: Label): void;
}) {
  return (
    <View style={styles.section}>
      <Button title="All projects" disabled={disabled} onPress={back} />
      <Text accessibilityRole="header" style={styles.title}>
        {project.name}
      </Text>
      <Button title="Rename project" disabled={disabled} onPress={renameProject} />
      <Text accessibilityRole="header" style={styles.heading}>
        Labels
      </Text>
      <Text style={styles.text}>
        Renaming keeps label identity. Archived labels can be restored.
      </Text>
      <Button title="Add label" disabled={disabled} onPress={addLabel} />
      {!project.labels.length && <Text style={styles.text}>No labels yet.</Text>}
      {project.labels.map((label) => (
        <View key={label.id} style={styles.row}>
          <Text style={styles.heading}>{label.name}</Text>
          {label.archived && <Text style={styles.text}>Archived</Text>}
          <Button
            title={`Rename ${label.name}`}
            disabled={disabled}
            onPress={() => renameLabel(label)}
          />
          <Button
            title={`${label.archived ? 'Restore' : 'Archive'} ${label.name}`}
            disabled={disabled}
            onPress={() => archive(label)}
          />
        </View>
      ))}
    </View>
  );
}
