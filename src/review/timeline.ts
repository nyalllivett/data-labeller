import type { EditedInterval } from './annotations';

export type TimeWindow = Readonly<{ startMs: number; endMs: number }>;
export function fitWindow(durationMs: number): TimeWindow { return { startMs: 0, endMs: durationMs }; }
export function zoomWindow(window: TimeWindow, direction: 'in' | 'out', durationMs: number): TimeWindow {
  const span = Math.min(durationMs, (window.endMs - window.startMs) * (direction === 'in' ? 0.5 : 2));
  const center = (window.startMs + window.endMs) / 2;
  const startMs = Math.max(0, Math.min(durationMs - span, center - span / 2));
  const endMs = startMs + span;
  // Stop at representable boundaries, not an invented timing/zoom tolerance.
  return endMs <= startMs || (startMs === window.startMs && endMs === window.endMs) ? window : { startMs, endMs };
}
export function panWindow(window: TimeWindow, direction: 'earlier' | 'later', durationMs: number): TimeWindow {
  const span = window.endMs - window.startMs;
  const startMs = Math.max(0, Math.min(durationMs - span, window.startMs + span / 2 * (direction === 'earlier' ? -1 : 1)));
  return { startMs, endMs: startMs + span };
}
export function fractionInWindow(mediaMs: number, window: TimeWindow): number {
  return (mediaMs - window.startMs) / (window.endMs - window.startMs);
}
export function visibleInterval(interval: EditedInterval, window: TimeWindow): { left: number; width: number } | null {
  if (interval.endMs < window.startMs || interval.startMs > window.endMs) return null;
  const start = Math.max(interval.startMs, window.startMs);
  const end = Math.min(interval.endMs, window.endMs);
  return { left: fractionInWindow(start, window), width: fractionInWindow(end, window) - fractionInWindow(start, window) };
}
