export type Label = Readonly<{ id: string; name: string; archived: boolean }>;
export type Project = Readonly<{
  id: string;
  name: string;
  revision: number;
  labels: readonly Label[];
}>;

export class ProjectError extends Error {
  constructor(
    public readonly code:
      'invalid-name' | 'invalid-id' | 'missing-label' | 'duplicate-id' | 'invalid-project',
  ) {
    super(code);
    this.name = 'ProjectError';
  }
}

export function normalizeName(input: string): string {
  if (typeof input !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(input)) {
    throw new ProjectError('invalid-name');
  }
  const name = input.trim().normalize('NFC');
  if (!name) throw new ProjectError('invalid-name');
  return name;
}

export function validateId(id: string): void {
  if (
    typeof id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(id)
  ) {
    throw new ProjectError('invalid-id');
  }
}

export function createProject(id: string, name: string): Project {
  validateId(id);
  return { id, name: normalizeName(name), revision: 1, labels: [] };
}

function revised(project: Project, changes: Partial<Pick<Project, 'name' | 'labels'>>): Project {
  if (!Number.isSafeInteger(project.revision + 1)) throw new ProjectError('invalid-project');
  return { ...project, ...changes, revision: project.revision + 1 };
}

export function renameProject(project: Project, name: string): Project {
  const normalized = normalizeName(name);
  return normalized === project.name ? project : revised(project, { name: normalized });
}

export function addLabel(project: Project, id: string, name: string): Project {
  validateId(id);
  if (project.labels.some((label) => label.id === id) || project.id === id) {
    throw new ProjectError('duplicate-id');
  }
  return revised(project, {
    labels: [...project.labels, { id, name: normalizeName(name), archived: false }],
  });
}

export function changeLabel(
  project: Project,
  id: string,
  changes: { name?: string; archived?: boolean },
): Project {
  const existing = project.labels.find((label) => label.id === id);
  if (!existing) throw new ProjectError('missing-label');
  const label: Label = {
    ...existing,
    name: changes.name === undefined ? existing.name : normalizeName(changes.name),
    archived: changes.archived ?? existing.archived,
  };
  if (label.name === existing.name && label.archived === existing.archived) return project;
  return revised(project, {
    labels: project.labels.map((item) => (item.id === id ? label : item)),
  });
}

// Validate untrusted persisted JSON before it can become editable state.
export function decodeProject(json: string): Project {
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object') throw new ProjectError('invalid-project');
    const project = value as Project;
    validateId(project.id);
    if (
      normalizeName(project.name) !== project.name ||
      !Number.isSafeInteger(project.revision) ||
      project.revision < 1 ||
      !Array.isArray(project.labels)
    ) {
      throw new ProjectError('invalid-project');
    }
    const ids = new Set([project.id]);
    for (const label of project.labels) {
      validateId(label.id);
      if (
        ids.has(label.id) ||
        normalizeName(label.name) !== label.name ||
        typeof label.archived !== 'boolean'
      ) {
        throw new ProjectError('invalid-project');
      }
      ids.add(label.id);
    }
    // Reconstruct only known fields; no unchecked JSON properties enter state.
    return {
      id: project.id,
      name: project.name,
      revision: project.revision,
      labels: project.labels.map(({ id, name, archived }) => ({ id, name, archived })),
    };
  } catch {
    throw new ProjectError('invalid-project');
  }
}
