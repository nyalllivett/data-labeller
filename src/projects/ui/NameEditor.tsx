import { useEffect, useRef, useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';

import { ProjectError } from '../project';
import { styles } from './styles';

export type NameEdit = { title: string; initialName: string; save(name: string): Promise<boolean> };

export function NameEditor({
  edit,
  locked,
  onSaved,
  onCancel,
}: {
  edit: NameEdit;
  locked: boolean;
  onSaved(): void;
  onCancel(): void;
}) {
  const [name, setName] = useState(edit.initialName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disabled = locked || submitting;

  async function save() {
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      if ((await edit.save(name)) && mounted.current) onSaved();
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof ProjectError && failure.code === 'invalid-name'
            ? 'Enter a name without control characters.'
            : 'Could not prepare this change. Try again.',
        );
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {edit.title}
      </Text>
      <TextInput
        accessibilityLabel="Name"
        value={name}
        onChangeText={setName}
        editable={!disabled}
        style={styles.input}
        autoCapitalize="sentences"
      />
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button
        title="Save name"
        disabled={disabled}
        onPress={() => {
          void save();
        }}
      />
      <Button title="Cancel editing" disabled={disabled} onPress={onCancel} />
    </View>
  );
}
