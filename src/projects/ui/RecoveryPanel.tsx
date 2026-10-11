import { useState } from 'react';
import { Button, Text, View } from 'react-native';

import type { ProjectState } from '../ProjectStore';
import type { ProjectOperation } from '../../storage/ProjectRepository';
import { styles } from './styles';

const errors = {
  unavailable:
    'Local storage is unavailable or the save outcome could not be confirmed. Check available device storage and retry before making another change.',
  corrupt:
    'Local data could not be read safely. Keep the app data and retry; it has not been reset.',
  'unsupported-schema':
    'This database needs a newer compatible app. Existing data has not been changed.',
  conflict:
    'Saved data changed since editing began. The submitted change is retained for review; it has not replaced the saved version.',
  'operation-collision':
    'This change could not be matched safely. Keep the submitted change and retry loading.',
};

export function RecoveryPanel({
  state,
  retry,
  discard,
}: {
  state: ProjectState;
  retry(operation: ProjectOperation | null): Promise<boolean>;
  discard(id: string): Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const disabled = state.status === 'saving' || state.status === 'loading';
  const operations = state.attempted
    ? [state.attempted, ...state.pending.filter((item) => item.id !== state.attempted?.id)]
    : state.pending;
  return (
    <View style={styles.section}>
      {state.status === 'loading' && (
        <Text accessibilityRole="progressbar" style={styles.text}>
          Loading projects…
        </Text>
      )}
      {state.status === 'saving' && (
        <Text accessibilityRole="progressbar" style={styles.text}>
          Saving change…
        </Text>
      )}
      {state.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {errors[state.error]}
        </Text>
      )}
      {state.error && !operations.length && (
        <Button
          title="Retry loading"
          disabled={disabled}
          onPress={() => {
            void retry(null);
          }}
        />
      )}
      {operations.map((operation) => (
        <View key={operation.id} style={styles.row}>
          <Text accessibilityRole="header" style={styles.heading}>
            Submitted change: {operation.project.name}
          </Text>
          {operation.project.labels.map((label) => (
            <Text key={label.id} style={styles.text}>
              {label.name}
              {label.archived ? ' (archived)' : ''}
            </Text>
          ))}
          <Text style={styles.text}>
            Retry uses the same request. Discard removes only this pending request.
          </Text>
          <Button
            title={state.discarding === operation.id ? 'Retry discard' : 'Retry submitted change'}
            disabled={disabled}
            onPress={() => {
              void retry(operation);
            }}
          />
          {state.discarding === operation.id ? (
            <Text style={styles.text}>
              Discard could not be confirmed. Retry discard; saved projects are retained.
            </Text>
          ) : confirm === operation.id ? (
            <>
              <Text style={styles.text}>Discard this submitted change?</Text>
              <Button
                title="Keep submitted change"
                disabled={disabled}
                onPress={() => setConfirm(null)}
              />
              <Button
                title="Confirm discard"
                disabled={disabled}
                onPress={() => {
                  void discard(operation.id).then((ok) => {
                    if (ok) setConfirm(null);
                  });
                }}
              />
            </>
          ) : (
            <Button
              title="Discard submitted change"
              disabled={disabled}
              onPress={() => setConfirm(operation.id)}
            />
          )}
        </View>
      ))}
    </View>
  );
}
