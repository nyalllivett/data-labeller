import { emitDiagnostic, type StorageDiagnosticEvent } from '../diagnostics/diagnostics';
import type { ProjectOperation, ProjectRepository, Workspace } from '../storage/ProjectRepository';
import { validateOperation } from '../storage/ProjectRepository';
import { type StorageErrorCode, storageError } from '../storage/StorageError';
import type { Project } from './project';

const failures: Record<StorageErrorCode, StorageDiagnosticEvent> = {
  unavailable: 'storage.unavailable',
  corrupt: 'storage.corrupt',
  'unsupported-schema': 'storage.unsupported_schema',
  conflict: 'storage.conflict',
  'operation-collision': 'storage.operation_collision',
};

export type ProjectState = Workspace &
  Readonly<{
    status: 'loading' | 'ready' | 'saving' | 'failed';
    error: StorageErrorCode | null;
    attempted: ProjectOperation | null;
    discarding: string | null;
  }>;

export class ProjectStore {
  private state: ProjectState = {
    projects: [],
    pending: [],
    status: 'loading',
    error: null,
    attempted: null,
    discarding: null,
  };
  private listeners = new Set<() => void>();
  private busy = false;

  constructor(
    private readonly repository: ProjectRepository,
    private readonly newId: () => string,
  ) {}

  getSnapshot = (): ProjectState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: ProjectState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private async perform(
    status: 'loading' | 'saving',
    action: () => Promise<Workspace>,
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.update({ ...this.state, status, error: null });
    emitDiagnostic(status === 'loading' ? 'storage.loading' : 'storage.saving');
    try {
      const workspace = await action();
      this.update({
        ...workspace,
        status: 'ready',
        error: null,
        attempted: null,
        discarding: null,
      });
      emitDiagnostic('storage.ready');
      return true;
    } catch (error) {
      const code = storageError(error).code;
      this.update({ ...this.state, status: 'failed', error: code });
      emitDiagnostic('storage.failed');
      emitDiagnostic(failures[code]);
      return false;
    } finally {
      this.busy = false;
    }
  }

  load = (): Promise<boolean> =>
    this.state.discarding
      ? this.discard(this.state.discarding)
      : this.state.attempted
        ? this.retry(this.state.attempted)
        : this.perform('loading', () => this.repository.load());

  submit = (project: Project, expectedRevision: number): Promise<boolean> => {
    if (this.busy || this.state.attempted || this.state.pending.length || this.state.discarding)
      return Promise.resolve(false);
    return this.perform('saving', () => {
      const operation = validateOperation({ id: this.newId(), expectedRevision, project });
      this.update({ ...this.state, attempted: operation });
      return this.repository.save(operation);
    });
  };

  retry = (operation: ProjectOperation | null = this.state.attempted): Promise<boolean> => {
    if (this.state.discarding) return this.discard(this.state.discarding);
    if (!operation) return this.load();
    return this.perform('saving', () => {
      this.update({ ...this.state, attempted: operation });
      return this.repository.save(operation);
    });
  };

  discard = (operationId: string): Promise<boolean> =>
    this.perform('saving', () => {
      this.update({ ...this.state, discarding: operationId });
      return this.repository.discard(operationId);
    });
}
