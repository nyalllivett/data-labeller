import { decodeProject, type Project, validateId } from '../projects/project';
import { StorageError } from './StorageError';

export type ProjectOperation = Readonly<{ id: string; expectedRevision: number; project: Project }>;
export type Workspace = Readonly<{
  projects: readonly Project[];
  pending: readonly ProjectOperation[];
}>;

export interface ProjectRepository {
  load(): Promise<Workspace>;
  save(operation: ProjectOperation): Promise<Workspace>;
  discard(operationId: string): Promise<Workspace>;
}

export function validateOperation(operation: ProjectOperation): ProjectOperation {
  try {
    validateId(operation.id);
    const project = decodeProject(JSON.stringify(operation.project));
    if (
      !Number.isSafeInteger(operation.expectedRevision) ||
      operation.expectedRevision < 0 ||
      project.revision !== operation.expectedRevision + 1
    ) {
      throw new StorageError('corrupt');
    }
    const frozenProject = Object.freeze({
      ...project,
      labels: Object.freeze(project.labels.map((label) => Object.freeze(label))),
    });
    return Object.freeze({
      id: operation.id,
      expectedRevision: operation.expectedRevision,
      project: frozenProject,
    });
  } catch {
    throw new StorageError('corrupt');
  }
}

export function decodeOperation(payload: string): ProjectOperation {
  try {
    return validateOperation(JSON.parse(payload) as ProjectOperation);
  } catch {
    throw new StorageError('corrupt');
  }
}
