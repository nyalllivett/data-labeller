import { Button, Text, View } from 'react-native';

import type { Project } from '../project';
import { styles } from './styles';

export function ProjectList({
  projects,
  disabled,
  open,
  create,
}: {
  projects: readonly Project[];
  disabled: boolean;
  open(id: string): void;
  create(): void;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        Data Labeller
      </Text>
      <Text style={styles.text}>Your projects stay on this device.</Text>
      <Button title="New project" onPress={create} disabled={disabled} />
      {!projects.length && <Text style={styles.text}>No projects yet.</Text>}
      {projects.map((project) => (
        <View key={project.id} style={styles.row}>
          <Text style={styles.heading}>{project.name}</Text>
          <Button
            title={`Open ${project.name}`}
            onPress={() => open(project.id)}
            disabled={disabled}
          />
        </View>
      ))}
    </View>
  );
}
