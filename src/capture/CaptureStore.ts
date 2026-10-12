import { emitDiagnostic } from '../diagnostics/diagnostics';
import type { Project } from '../projects/project';
import { captureError, type CaptureErrorCode } from './CaptureError';
import type { CameraPort } from './CameraPort';
import type { MediaFiles } from './MediaFiles';
import { activeLabels, checkPosition, createRecordingDraft, finalizeRecording, toggleLabel, type Facing, type RecordingDraft, type SavedRecording } from './recording';
import type { RecordingRepository, RecordingWorkspace } from './RecordingRepository';

type Phase = 'closed' | 'loading' | 'ready' | 'starting' | 'recording' | 'stopping' | 'saving' | 'saved' | 'failed' | 'unfinalized';
export type CaptureState = RecordingWorkspace & Readonly<{
  project: Project | null;
  phase: Phase;
  facing: Facing;
  previewReady: boolean;
  draft: RecordingDraft | null;
  labelBusy: boolean;
  error: CaptureErrorCode | null;
  lastSaved: SavedRecording | null;
}>;

export class CaptureStore {
  private state: CaptureState = {
    project: null, phase: 'closed', facing: 'back', previewReady: false,
    draft: null, labelBusy: false, error: null, lastSaved: null, pending: [], saved: [],
  };
  private listeners = new Set<() => void>();
  private cameraIssued = false;
  private stopSent = false;
  private stopReason: RecordingDraft['termination'] = null;
  private toggleWork: Promise<boolean> | undefined;
  private checking = false;
  private uncheckpointed = false;

  constructor(
    private readonly camera: CameraPort,
    private readonly media: MediaFiles,
    private readonly repository: RecordingRepository,
    private readonly newId: () => string,
    private readonly extension: RecordingDraft['extension'],
  ) {}

  getSnapshot = (): CaptureState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(values: Partial<CaptureState>): void {
    this.state = { ...this.state, ...values };
    for (const listener of this.listeners) listener();
  }

  canClose = (): boolean => !this.uncheckpointed && ['ready', 'saved', 'failed'].includes(this.state.phase);
  close = (): boolean => {
    if (!this.canClose()) return false;
    this.update({ project: null, phase: 'closed' });
    return true;
  };

  open = async (project: Project): Promise<boolean> => {
    if (this.state.phase !== 'closed') return false;
    this.update({ project, phase: 'loading', facing: 'back', draft: null, error: null, lastSaved: null, previewReady: false, pending: [], saved: [] });
    return this.load();
  };

  load = async (): Promise<boolean> => {
    const project = this.state.project;
    if (!project || !['loading', 'failed'].includes(this.state.phase) || this.state.draft) return false;
    this.update({ phase: 'loading', error: null });
    try {
      const workspace = await this.repository.load(project.id);
      this.update({ ...workspace, phase: 'ready' });
      return true;
    } catch (error) {
      this.update({ phase: 'failed', error: captureError(error).code });
      emitDiagnostic('capture.failed');
      return false;
    }
  };

  setFacing = (facing: Facing): boolean => {
    if (this.state.phase !== 'ready') return false;
    if (facing !== this.state.facing) this.update({ facing, previewReady: false });
    return true;
  };
  previewReady = (): void => {
    if (this.state.phase === 'ready') this.update({ previewReady: true });
  };
  previewFailed = (): void => {
    if (this.cameraIssued) { void this.stop('interrupted'); return; }
    if (this.state.phase === 'ready') this.update({ phase: 'failed', error: 'unavailable', previewReady: false });
  };

  start = async (): Promise<boolean> => {
    const project = this.state.project;
    if (!project || this.state.phase !== 'ready' || !this.state.previewReady) return false;
    this.stopSent = false;
    this.stopReason = null;
    this.toggleWork = undefined;
    this.update({ phase: 'starting', error: null, lastSaved: null });
    emitDiagnostic('capture.starting');
    try {
      const draft = createRecordingDraft(this.newId(), project, this.state.facing, this.extension);
      this.update({ draft });
      const destination = await this.media.prepare(draft);
      await this.repository.checkpoint(draft);
      this.update({ pending: [...this.state.pending, draft] });
      if (this.stopReason) {
        await this.repository.cancelUnstarted(draft.id);
        this.update({ phase: 'ready', draft: null, pending: this.state.pending.filter((item) => item.id !== draft.id) });
        emitDiagnostic('capture.cancelled');
        return true;
      }
      this.cameraIssued = true;
      const recording = this.camera.record(draft.id, destination);
      void recording.then(
        (result) => this.finish(result.interrupted),
        (error: unknown) => this.rejectedCapture(error),
      );
      return true;
    } catch (error) {
      this.cameraIssued = false;
      this.update({ phase: 'failed', error: captureError(error).code });
      emitDiagnostic('capture.failed');
      return false;
    }
  };

  // The UI polls only to notice the first usable native media sample (250 ms).
  // The cadence is not a timing tolerance and never advances annotation time.
  checkPosition = async (): Promise<void> => {
    const draft = this.state.draft;
    if (!this.cameraIssued || !draft || this.checking || this.state.phase !== 'starting') return;
    this.checking = true;
    try {
      const position = await this.camera.position(draft.id);
      if (!this.cameraIssued || this.state.draft?.id !== draft.id || this.state.phase !== 'starting') return;
      checkPosition(draft, position);
      this.update({ phase: 'recording' });
      emitDiagnostic('capture.recording');
    } catch {
      // No position yet: keep labels unavailable and Stop accessible. Native
      // record completion/rejection remains the terminal capture outcome.
      emitDiagnostic('capture.clock_unavailable');
    } finally { this.checking = false; }
  };

  toggle = (labelId: string): Promise<boolean> => {
    if (this.state.phase !== 'recording' || this.state.labelBusy) return Promise.resolve(false);
    if (!this.state.draft!.labels.some((label) => label.id === labelId)) {
      this.update({ error: 'invalid-data' });
      return Promise.resolve(false);
    }
    this.update({ labelBusy: true, error: null });
    const action = this.acceptToggle(labelId);
    this.toggleWork = action;
    return action;
  };
  private async acceptToggle(labelId: string): Promise<boolean> {
    const draft = this.state.draft!;
    try {
      const position = await this.camera.position(draft.id);
      // Finish awaits this operation before replacing the draft. The native
      // sample's recording identity is validated by toggleLabel.
      const next = toggleLabel(draft, labelId, position);
      this.uncheckpointed = true;
      this.update({ draft: next });
      try {
        await this.repository.checkpoint(next);
        this.uncheckpointed = false;
      } catch {
        this.update({ error: 'checkpoint-failed' });
        emitDiagnostic('capture.checkpoint_failed');
        void this.stop('interrupted');
        return false;
      }
      this.update({ pending: this.state.pending.map((item) => item.id === next.id ? next : item) });
      return true;
    } catch (error) {
      const code = captureError(error).code;
      const next: RecordingDraft = { ...draft, annotationFailures: [...draft.annotationFailures, {
        labelId, afterEvent: draft.events.length, reason: code === 'invalid-timing' ? 'invalid-timing' : 'clock-unavailable',
      }] };
      this.uncheckpointed = true;
      this.update({ draft: next, error: code });
      emitDiagnostic('capture.failed');
      try {
        await this.repository.checkpoint(next);
        this.uncheckpointed = false;
        this.update({ pending: this.state.pending.map((item) => item.id === next.id ? next : item) });
      } catch {
        this.update({ error: 'checkpoint-failed' });
        emitDiagnostic('capture.checkpoint_failed');
        void this.stop('interrupted');
      }
      return false;
    } finally { this.update({ labelBusy: false }); }
  }

  stop = async (reason: 'stopped' | 'interrupted' = 'stopped'): Promise<boolean> => {
    if (!['starting', 'recording', 'stopping'].includes(this.state.phase) || this.stopSent) return false;
    this.stopReason = this.stopReason ?? reason;
    this.update({ phase: 'stopping' });
    emitDiagnostic(reason === 'interrupted' ? 'capture.interrupted' : 'capture.stopping');
    // Before issuance, start cancels its empty pending row. After issuance the
    // native start/Stop handshake retains Stop without waiting for video time.
    if (this.cameraIssued) return this.sendStop();
    return true;
  };
  private async sendStop(): Promise<boolean> {
    this.stopSent = true;
    this.update({ error: null });
    try {
      await this.camera.stop(this.state.draft!.id);
      return true;
    } catch {
      emitDiagnostic('capture.failed');
      if (this.cameraIssued) {
        this.stopSent = false;
        this.update({ error: 'stop-failed' });
      }
      return false;
    }
  }

  private async finish(interrupted: boolean): Promise<void> {
    this.cameraIssued = false;
    this.update({ phase: 'saving' });
    await this.toggleWork;
    const draft = this.state.draft!;
    const termination = interrupted || !this.stopReason ? 'interrupted' : this.stopReason;
    this.update({ draft: { ...draft, termination } });
    if (termination === 'interrupted') emitDiagnostic('capture.interrupted');
    await this.saveDraft();
  }

  private async rejectedCapture(error: unknown): Promise<void> {
    this.cameraIssued = false;
    emitDiagnostic('capture.failed');
    this.update({ phase: 'saving' });
    await this.toggleWork;
    if (captureError(error).code !== 'capture-unfinalized') {
      this.update({ phase: 'failed', error: captureError(error).code });
      return;
    }
    // iOS view cleanup can reject before its queued writer teardown finishes.
    // Do not inspect/promote an output whose finalization is unconfirmed.
    this.update({ phase: 'unfinalized', error: null, draft: { ...this.state.draft!, termination: 'interrupted' } });
    await this.checkpointUnfinalized();
  }

  checkpointUnfinalized = async (): Promise<boolean> => {
    if (this.state.phase !== 'unfinalized') return false;
    this.update({ phase: 'saving' });
    try {
      await this.repository.checkpoint(this.state.draft!);
      this.uncheckpointed = false;
      this.update({ phase: 'unfinalized', error: 'capture-unfinalized' });
      return true;
    } catch {
      this.uncheckpointed = true;
      emitDiagnostic('capture.checkpoint_failed');
      this.update({ phase: 'unfinalized', error: 'checkpoint-failed' });
      return false;
    }
  };

  private async saveDraft(): Promise<boolean> {
    const draft = this.state.draft!;
    this.update({ phase: 'saving', error: null });
    emitDiagnostic('capture.saving');
    try {
      await this.repository.checkpoint(draft);
      this.uncheckpointed = false;
      const media = await this.media.promote(draft);
      const saved = await this.repository.commit(finalizeRecording(draft, media));
      const workspace = await this.repository.load(draft.projectId);
      this.update({ ...workspace, phase: 'saved', lastSaved: saved, error: saved.annotationFailures.length ? 'annotation-incomplete' : null });
      emitDiagnostic('capture.saved');
      return true;
    } catch (error) {
      this.update({ phase: 'failed', error: captureError(error).code });
      emitDiagnostic('capture.failed');
      return false;
    }
  }

  recover = async (id: string): Promise<boolean> => {
    if (!this.canRecover(id)) return false;
    const draft = this.state.draft?.id === id ? this.state.draft : this.state.pending.find((item) => item.id === id);
    if (!draft) return false;
    this.update({ draft: { ...draft, termination: draft.termination ?? 'interrupted' } });
    return this.saveDraft();
  };
  canRecover = (id: string): boolean =>
    ['ready', 'failed', 'saved'].includes(this.state.phase) && (!this.uncheckpointed || this.state.draft?.id === id);
  newRecording = (): boolean => {
    if (!this.canClose()) return false;
    if (this.state.phase === 'failed' && !this.state.draft) return false;
    this.update({ phase: 'ready', draft: null, lastSaved: null, previewReady: false, error: null });
    return true;
  };

  activeLabels = (): ReadonlySet<string> => activeLabels(this.state.draft?.events ?? []);
}
