import type { SavedRecording } from '../capture/recording';
import type { RecordingRepository } from '../capture/RecordingRepository';
import { emitDiagnostic } from '../diagnostics/diagnostics';
import type { Project } from '../projects/project';
import { applyForm, deleteInterval, intervalForm, sameIntervals, secondsText, type Annotations, type IntervalForm } from './annotations';
import type { AnnotationRepository } from './AnnotationRepository';
import { ReviewError, reviewError, type ReviewErrorCode } from './ReviewError';

type Phase = 'closed' | 'loading' | 'library' | 'opening' | 'editing' | 'saving' | 'save-failed' | 'load-failed';
export type ReviewState = Readonly<{
  phase: Phase; project: Project | null; recordings: readonly SavedRecording[];
  record: SavedRecording | null; uri: string | null; document: Annotations | null;
  saved: Annotations | null; history: readonly Annotations[]; form: IntervalForm | null;
  error: ReviewErrorCode | null; positionMs: number | null; playbackReady: boolean;
}>;

export class ReviewStore {
  private state: ReviewState = {
    phase: 'closed', project: null, recordings: [], record: null, uri: null, document: null,
    saved: null, history: [], form: null, error: null, positionMs: null, playbackReady: false,
  };
  private listeners = new Set<() => void>();
  private submission: { record: SavedRecording; expected: number; document: Annotations } | undefined;
  constructor(
    private readonly recordings: Pick<RecordingRepository, 'load'>,
    private readonly annotations: AnnotationRepository,
    private readonly resolveMedia: (record: SavedRecording) => Promise<string>,
  ) {}
  getSnapshot = (): ReviewState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<ReviewState>): void { this.state = { ...this.state, ...values }; for (const listener of this.listeners) listener(); }
  private failed(error: unknown): false {
    this.update({ error: reviewError(error).code }); emitDiagnostic('review.failed'); return false;
  }
  formDirty = (): boolean => {
    const form = this.state.form;
    if (!form) return false;
    const interval = this.state.document!.intervals.find((value) => value.id === form.id)!;
    const { startPositionMs, endPositionMs, ...fields } = form;
    return JSON.stringify({ ...fields, startPositionMs: startPositionMs ?? interval.startMs, endPositionMs: endPositionMs ?? interval.endMs }) !==
      JSON.stringify({ ...intervalForm(interval), startPositionMs: interval.startMs, endPositionMs: interval.endMs });
  };
  dirty = (): boolean => !!this.state.document && !sameIntervals(this.state.document, this.state.saved!);
  canLeave = (): boolean => ['library', 'editing', 'load-failed'].includes(this.state.phase) && !this.dirty() && !this.formDirty();
  close = (): boolean => {
    if (!this.canLeave()) return false;
    this.update({ phase: 'closed', project: null, record: null, form: null, positionMs: null, playbackReady: false }); return true;
  };
  open = async (project: Project): Promise<boolean> => {
    if (this.state.phase !== 'closed') return false;
    this.update({ phase: 'loading', project, recordings: [], record: null, document: null, saved: null, history: [], form: null, uri: null, error: null, positionMs: null, playbackReady: false });
    return this.loadLibrary();
  };
  load = async (): Promise<boolean> => {
    if (this.state.phase !== 'load-failed' || this.state.record) return false;
    return this.loadLibrary();
  };
  private async loadLibrary(): Promise<boolean> {
    this.update({ phase: 'loading', error: null });
    try {
      const workspace = await this.recordings.load(this.state.project!.id);
      this.update({ phase: 'library', recordings: workspace.saved }); return true;
    } catch (error) { this.update({ phase: 'load-failed' }); return this.failed(error); }
  }
  selectRecord = async (id: string): Promise<boolean> => {
    if (!this.canLeave()) return false;
    if (this.state.phase === 'editing' && this.state.record?.id === id) return true;
    const record = this.state.recordings.find((value) => value.id === id);
    if (!record) return false;
    this.update({ phase: 'opening', record, document: null, saved: null, form: null, history: [], uri: null, positionMs: null, playbackReady: false, error: null });
    return this.openRecord();
  };
  retryOpen = async (): Promise<boolean> => {
    if (!this.state.record || this.state.phase !== 'load-failed') return false;
    return this.openRecord();
  };
  private async openRecord(): Promise<boolean> {
    const record = this.state.record!;
    this.update({ phase: 'opening', error: null });
    try {
      const document = await this.annotations.load(record);
      const uri = await this.resolveMedia(record);
      this.update({ phase: 'editing', document, saved: document, uri });
      emitDiagnostic('review.opened'); return true;
    } catch (error) { this.update({ phase: 'load-failed' }); return this.failed(error); }
  }
  selectInterval = (id: number): boolean => {
    if (this.state.phase !== 'editing') return false;
    if (this.formDirty()) return this.failed(new ReviewError('unapplied-fields'));
    const interval = this.state.document!.intervals.find((value) => value.id === id);
    if (!interval) return false;
    this.update({ form: intervalForm(interval), error: null }); return true;
  };
  private changeField(field: 'start' | 'end' | 'labelId', value: string, positionMs?: number): boolean {
    if (this.state.phase !== 'editing' || !this.state.form) return false;
    const form = { ...this.state.form, [field]: value };
    // Manual boundary input clears its numeric report; relabelling keeps both.
    if (field !== 'labelId') {
      delete form[`${field}PositionMs`];
      if (positionMs !== undefined) form[`${field}PositionMs`] = positionMs;
    }
    this.update({ form, error: null }); return true;
  }
  setField = (field: 'start' | 'end' | 'labelId', value: string): boolean => this.changeField(field, value);
  resetForm = (): boolean => {
    if (this.state.phase !== 'editing' || !this.state.form) return false;
    const interval = this.state.document!.intervals.find((value) => value.id === this.state.form!.id)!;
    this.update({ form: intervalForm(interval), error: null }); return true;
  };
  private accept(document: Annotations): void {
    if (document === this.state.document) { this.update({ error: null }); return; }
    this.update({ document, history: [...this.state.history, this.state.document!], error: null });
    emitDiagnostic('review.changed');
  }
  apply = (): boolean => {
    if (this.state.phase !== 'editing' || !this.state.form) return false;
    try {
      const next = applyForm(this.state.record!, this.state.document!, this.state.form);
      this.accept(next);
      this.update({ form: intervalForm(next.intervals.find((value) => value.id === this.state.form!.id)!) }); return true;
    } catch (error) { return this.failed(error); }
  };
  delete = (id: number): boolean => {
    if (this.state.phase !== 'editing') return false;
    if (this.formDirty()) return this.failed(new ReviewError('unapplied-fields'));
    const next = deleteInterval(this.state.record!, this.state.document!, id);
    if (next === this.state.document) return false;
    this.accept(next);
    if (this.state.form?.id === id) this.update({ form: null });
    return true;
  };
  undo = (): boolean => {
    if (this.state.phase !== 'editing' || !this.state.history.length) return false;
    if (this.formDirty()) return this.failed(new ReviewError('unapplied-fields'));
    this.update({ document: this.state.history.at(-1)!, history: this.state.history.slice(0, -1), form: null, error: null });
    emitDiagnostic('review.changed'); return true;
  };
  setPlayback = (id: string, positionMs: number | null, ready: boolean): void => {
    if (this.state.record?.id === id) this.update({ positionMs, playbackReady: ready });
  };
  usePosition = (field: 'start' | 'end'): boolean => {
    if (!this.state.playbackReady || this.state.positionMs === null) return false;
    return this.changeField(field, secondsText(this.state.positionMs), this.state.positionMs);
  };
  canSave = (): boolean => this.state.phase === 'editing' && this.dirty() && !this.formDirty();
  save = async (): Promise<boolean> => {
    if (!this.canSave()) return false;
    this.submission = { record: this.state.record!, expected: this.state.saved!.revision, document: this.state.document! };
    return this.write();
  };
  retrySave = async (): Promise<boolean> => this.state.phase === 'save-failed' ? this.write() : false;
  private async write(): Promise<boolean> {
    const submission = this.submission!;
    this.update({ phase: 'saving', error: null }); emitDiagnostic('review.saving');
    try {
      const saved = await this.annotations.save(submission.record, submission.expected, submission.document);
      this.update({ phase: 'editing', saved, document: saved }); this.submission = undefined;
      emitDiagnostic('review.saved'); return true;
    } catch (error) { this.update({ phase: 'save-failed' }); return this.failed(error); }
  }
}
