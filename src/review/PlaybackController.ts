import { emitDiagnostic } from '../diagnostics/diagnostics';

export type PlaybackUpdate = Readonly<{ status: 'idle' | 'loading' | 'readyToPlay' | 'error'; positionMs: number; playing: boolean }>;
export interface PlaybackPort {
  read(): PlaybackUpdate;
  subscribe(listener: (update: Partial<PlaybackUpdate>) => void): () => void;
  play(): void;
  pause(): void;
  seek(mediaMs: number): void;
}
export type PlaybackState = PlaybackUpdate & Readonly<{ error: boolean; positionUsable: boolean }>;
export class PlaybackController {
  private state: PlaybackState = { status: 'idle', positionMs: 0, playing: false, error: false, positionUsable: false };
  private listeners = new Set<() => void>();
  private port: PlaybackPort | undefined;
  private remove: (() => void) | undefined;
  constructor(private readonly durationMs: number) {}
  getSnapshot = (): PlaybackState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<PlaybackState>): void { this.state = { ...this.state, ...values }; for (const listener of this.listeners) listener(); }
  private failed(): false {
    this.update({ error: true });
    try { this.port?.pause(); } catch { /* A failed native control may need player recreation. */ }
    emitDiagnostic('review.playback_failed'); return false;
  }
  connect(port: PlaybackPort): void {
    this.port = port;
    try {
      this.remove = port.subscribe((update) => {
        if (this.port === port) this.receive(update);
      });
      this.receive(port.read());
    } catch { this.failed(); }
  }
  disconnect(): void {
    const port = this.port;
    this.port = undefined;
    try { this.remove?.(); } catch { this.failed(); }
    this.remove = undefined;
    try { port?.pause(); } catch { this.failed(); }
  }
  private receive(update: Partial<PlaybackUpdate>): void {
    if (update.status === 'error') { this.update({ status: 'error', playing: update.playing ?? this.state.playing }); this.failed(); return; }
    if (update.positionMs !== undefined) {
      const positionUsable = Number.isFinite(update.positionMs) && update.positionMs >= 0 && update.positionMs <= this.durationMs;
      this.update({ ...update, positionUsable, positionMs: positionUsable ? update.positionMs : this.state.positionMs });
      if (!positionUsable) emitDiagnostic('review.position_unavailable');
      return;
    }
    this.update(update);
  }
  toggle = (): boolean => {
    if (!this.port) return false;
    // Pause remains available after a failure while native playback may continue.
    if (!this.state.playing && (this.state.error || this.state.status !== 'readyToPlay')) return false;
    try { if (this.state.playing) this.port.pause(); else this.port.play(); return true; }
    catch { return this.failed(); }
  };
  seek = (mediaMs: number): boolean => {
    if (!this.port || this.state.error || this.state.status !== 'readyToPlay') return false;
    if (!Number.isFinite(mediaMs) || mediaMs < 0 || mediaMs > this.durationMs) return this.failed();
    try {
      this.port.seek(mediaMs); // Request only; await a reported position for playhead/edits.
      return true;
    } catch { return this.failed(); }
  };
}
