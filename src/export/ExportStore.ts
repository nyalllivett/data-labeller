import type { RecordingRepository, RecordingWorkspace } from '../capture/RecordingRepository';
import type { SavedRecording } from '../capture/recording';
import { emitDiagnostic } from '../diagnostics/diagnostics';
import { decodeProject, validateId, type Project } from '../projects/project';
import type { AnnotationRepository } from '../review/AnnotationRepository';
import type { ExportDocument, ExportScope } from './document';
import { ExportError, type ExportErrorCode } from './ExportError';
import type { PackagePort, PreparedPackage } from './PackagePort';
import type { SharePort } from './SharePort';
import { checkCancellation, snapshotExport } from './snapshot';

type Phase = 'closed' | 'loading' | 'load-failed' | 'library' | 'preparing' | 'cancelling' | 'cleaning' |
  'cleanup-failed' | 'preparation-failed' | 'prepared' | 'sharing' | 'share-returned' | 'share-failed';
export type ExportState = Readonly<{
  phase: Phase; project: Project | null; workspace: RecordingWorkspace; scope: ExportScope;
  document: ExportDocument | null; packageFile: PreparedPackage | null; error: ExportErrorCode | null; cancelled: boolean;
}>;
type Snapshot = Awaited<ReturnType<typeof snapshotExport>>;
export class ExportStore {
  private state: ExportState = { phase: 'closed', project: null, workspace: { pending: [], saved: [] }, scope: { kind: 'project' },
    document: null, packageFile: null, error: null, cancelled: false };
  private listeners = new Set<() => void>();
  private submission: { id: string; snapshot: Snapshot | null } | undefined;
  private cancelRequested = false;
  private cancellation: Promise<void> | undefined;
  private outcome: ExportErrorCode | undefined;
  constructor(private readonly recordings: Pick<RecordingRepository, 'load'>,
    private readonly annotations: Pick<AnnotationRepository, 'load'>,
    private readonly resolve: (record: SavedRecording) => Promise<string>,
    private readonly packages: PackagePort, private readonly sharing: SharePort, private readonly newId: () => string) {}
  getSnapshot = (): ExportState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<ExportState>): void { this.state = { ...this.state, ...values }; for (const listener of this.listeners) listener(); }
  private idle(): boolean { return ['library', 'preparation-failed', 'prepared', 'share-returned', 'share-failed'].includes(this.state.phase); }
  canClose = (): boolean => this.idle() || this.state.phase === 'load-failed';
  close = (): boolean => {
    if (!this.canClose()) return false;
    // Completed cache ZIPs may still be consumed by a share recipient.
    this.submission = undefined;
    this.update({ phase: 'closed', project: null, document: null, packageFile: null }); return true;
  };
  open = async (project: Project): Promise<boolean> => {
    if (this.state.phase !== 'closed') return false;
    this.update({ phase: 'loading', project, workspace: { saved: [], pending: [] }, scope: { kind: 'project' },
      document: null, packageFile: null, error: null, cancelled: false });
    return this.loadLibrary();
  };
  retryLoad = async (): Promise<boolean> => this.state.phase === 'load-failed' ? this.loadLibrary() : false;
  private async loadLibrary(): Promise<boolean> {
    this.update({ phase: 'loading', error: null });
    try {
      const project = decodeProject(JSON.stringify(this.state.project));
      const workspace = await this.recordings.load(project.id);
      this.update({ phase: 'library', project, workspace }); return true;
    } catch { this.update({ phase: 'load-failed', error: 'source-unavailable' }); emitDiagnostic('export.failed'); return false; }
  }
  selectScope = (scope: ExportScope): boolean => {
    if (!this.idle() || (scope.kind === 'recording' && !this.state.workspace.saved.some((record) => record.id === scope.recordingId))) return false;
    if (JSON.stringify(scope) === JSON.stringify(this.state.scope)) return true;
    this.submission = undefined;
    this.update({ scope, phase: 'library', document: null, packageFile: null, error: null, cancelled: false }); return true;
  };
  canSelect = (): boolean => this.idle();
  canPrepare = (): boolean => ['library', 'prepared', 'share-returned', 'share-failed'].includes(this.state.phase) && this.state.workspace.saved.length > 0;
  prepare = async (): Promise<boolean> => this.canPrepare() ? this.begin() : false;
  private async begin(): Promise<boolean> {
    this.submission = undefined;
    try { const id = this.newId(); validateId(id); this.submission = { id, snapshot: null }; }
    catch { this.update({ phase: 'preparation-failed', error: 'package-failed', packageFile: null, document: null, cancelled: false }); emitDiagnostic('export.failed'); return false; }
    return this.run();
  }
  retryPrepare = async (): Promise<boolean> => {
    if (this.state.phase !== 'preparation-failed') return false;
    return this.submission ? this.run() : this.begin();
  };
  private async run(): Promise<boolean> {
    const submission = this.submission!;
    this.cancelRequested = false; this.cancellation = undefined;
    this.update({ phase: 'preparing', error: null, cancelled: false, packageFile: null, document: null }); emitDiagnostic('export.preparing');
    try {
      submission.snapshot ??= await snapshotExport(this.state.project!, this.state.scope, this.state.workspace, this.annotations, this.resolve, () => this.cancelRequested);
      checkCancellation(this.cancelRequested);
      const snapshot = submission.snapshot;
      this.update({ document: snapshot.document });
      const packageFile = await this.packages.prepare({ id: submission.id, json: snapshot.json, media: snapshot.media }, () => this.cancelRequested);
      checkCancellation(this.cancelRequested); // Local intent wins even if native completes successfully.
      this.update({ phase: 'prepared', packageFile }); emitDiagnostic('export.prepared'); return true;
    } catch (error) {
      // Wait for both actual native work and a possibly queued cancel request.
      await this.cancellation;
      this.outcome = this.cancelRequested ? 'cancelled' : error instanceof ExportError ? error.code : 'package-failed';
      return this.cleanup();
    }
  }
  cancel = (): boolean => {
    if (this.state.phase !== 'preparing') return false;
    this.cancelRequested = true; this.update({ phase: 'cancelling' }); emitDiagnostic('export.cancel_requested');
    this.cancellation = this.packages.cancel().catch(() => {
      this.update({ error: 'cancel-failed' }); emitDiagnostic('export.cancel_failed');
    }); return true;
  };
  private async cleanup(): Promise<false> {
    this.update({ phase: 'cleaning', error: null });
    try {
      await this.packages.discard(this.submission!.id);
      if (this.outcome === 'cancelled') {
        this.submission = undefined;
        this.update({ phase: 'library', error: null, cancelled: true, document: null }); emitDiagnostic('export.cancelled');
      } else { this.update({ phase: 'preparation-failed', error: this.outcome! }); emitDiagnostic('export.failed'); }
    } catch { this.update({ phase: 'cleanup-failed', error: 'cleanup-failed' }); emitDiagnostic('export.failed'); }
    return false;
  }
  retryCleanup = async (): Promise<boolean> => {
    if (this.state.phase !== 'cleanup-failed') return false;
    await this.cleanup(); return this.state.phase !== 'cleanup-failed';
  };
  canShare = (): boolean => ['prepared', 'share-returned', 'share-failed'].includes(this.state.phase) && this.state.error !== 'package-missing';
  share = async (): Promise<boolean> => {
    if (!this.canShare()) return false;
    const packageFile = this.state.packageFile!;
    this.update({ phase: 'sharing', error: null }); emitDiagnostic('export.share_opening');
    try {
      if (!await this.packages.available(packageFile)) throw new ExportError('package-missing');
      await this.sharing.share(packageFile.uri);
      this.update({ phase: 'share-returned' }); emitDiagnostic('export.share_returned'); return true;
    } catch (error) {
      this.update({ phase: 'share-failed', error: error instanceof ExportError ? error.code : 'share-failed' });
      emitDiagnostic('export.failed'); return false;
    }
  };
}
