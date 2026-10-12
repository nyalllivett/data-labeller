import { captureFixture, deferred } from '../../test/captureFixture';
import { id } from '../../test/ids';
import { CaptureError } from './CaptureError';
import type { MediaPosition } from './recording';

beforeEach(() => { jest.spyOn(console, 'info').mockImplementation(() => undefined); });

test('loads local records, locks navigation while busy and permits facing selection only before capture', async () => {
  const f = captureFixture();
  expect(f.store.canClose()).toBe(false);
  expect(f.store.close()).toBe(false);
  expect(await f.store.load()).toBe(false);
  expect(f.store.setFacing('front')).toBe(false);
  expect(await f.store.start()).toBe(false);
  expect(await f.store.stop()).toBe(false);
  expect(await f.store.toggle(id(2))).toBe(false);
  expect(await f.store.recover(id(10))).toBe(false);
  expect(f.store.newRecording()).toBe(false);
  const loading = deferred<{ pending: []; saved: [] }>();
  f.repository.load.mockReturnValueOnce(loading.promise);
  const open = f.store.open(f.project);
  expect(await f.store.open(f.project)).toBe(false);
  f.store.previewReady();
  expect(f.store.getSnapshot().previewReady).toBe(false);
  expect(f.store.close()).toBe(false);
  loading.resolve({ pending: [], saved: [] });
  expect(await open).toBe(true);
  expect(await f.store.start()).toBe(false);
  f.store.previewReady();
  expect(f.store.setFacing('back')).toBe(true);
  expect(f.store.getSnapshot().previewReady).toBe(true);
  expect(f.store.setFacing('front')).toBe(true);
  expect(f.store.getSnapshot().previewReady).toBe(false);
  f.store.previewReady();
  expect(await f.store.start()).toBe(true);
  expect(await f.store.start()).toBe(false);
  expect(f.store.close()).toBe(false);
  expect(f.store.setFacing('back')).toBe(false);
  expect(await f.store.recover(id(10))).toBe(false);
  expect(f.store.newRecording()).toBe(false);
  await f.store.checkPosition();
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'recording', draft: { facing: 'front' } });
  await f.store.stop();
  await f.end();
  expect(f.store.close()).toBe(true);
  expect(f.store.getSnapshot().project).toBeNull();
});

test('snapshots labels, checkpoints ordered independent toggles, closes active intervals and commits after media promotion', async () => {
  const f = captureFixture();
  const listener = jest.fn();
  const unsubscribe = f.store.subscribe(listener);
  await f.begin();
  expect(f.camera.record).toHaveBeenCalledWith(id(10), `file:///private/${id(10)}.partial.mov`);
  expect(f.repository.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(f.camera.record.mock.invocationCallOrder[0]!);
  f.camera.position.mockResolvedValueOnce({ recordingId: id(10), mediaMs: 200, source: 'avcapture-recorded-duration' });
  await f.store.toggle(id(2));
  f.camera.position.mockResolvedValueOnce({ recordingId: id(10), mediaMs: 300, source: 'avcapture-recorded-duration' });
  await f.store.toggle(id(3));
  expect([...f.store.activeLabels()]).toEqual([id(2), id(3)]);
  f.camera.position.mockResolvedValueOnce({ recordingId: id(10), mediaMs: 400, source: 'avcapture-recorded-duration' });
  await f.store.toggle(id(2));
  expect([...f.store.activeLabels()]).toEqual([id(3)]);
  expect(await f.store.stop()).toBe(true);
  expect(await f.store.stop()).toBe(false);
  await f.end();
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'saved', pending: [], lastSaved: { termination: 'stopped', intervals: [
    { labelId: id(2), startMs: 200, endMs: 400 }, { labelId: id(3), startMs: 300, endMs: 1000 },
  ] } });
  expect(f.media.promote.mock.invocationCallOrder[0]).toBeLessThan(f.repository.commit.mock.invocationCallOrder[0]!);
  expect(listener).toHaveBeenCalled();
  unsubscribe();
  const count = listener.mock.calls.length;
  expect(f.store.newRecording()).toBe(true);
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'ready', draft: null, previewReady: false });
  expect(listener).toHaveBeenCalledTimes(count);
});

test('Stop during preparation cancels before native issuance, without manufacturing a recording or Saved state', async () => {
  const f = captureFixture();
  await f.ready();
  const preparing = deferred<string>();
  f.media.prepare.mockReturnValueOnce(preparing.promise);
  const start = f.store.start();
  await f.store.checkPosition();
  expect(f.camera.position).not.toHaveBeenCalled();
  expect(await f.store.stop()).toBe(true);
  preparing.resolve(`file:///private/${id(10)}.partial.mov`);
  await start;
  expect(f.repository.cancelUnstarted).toHaveBeenCalledWith(id(10));
  expect(f.camera.record).not.toHaveBeenCalled();
  expect(f.camera.stop).not.toHaveBeenCalled();
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'ready', draft: null, lastSaved: null, pending: [] });
});

test('Stop after native issuance is sent without any positive annotation-clock sample', async () => {
  const f = captureFixture(); await f.ready(); await f.store.start();
  f.camera.position.mockRejectedValue(new CaptureError('clock-unavailable'));
  expect(await f.store.stop()).toBe(true);
  expect(f.camera.stop).toHaveBeenCalledWith(id(10));
  expect(f.camera.position).not.toHaveBeenCalled();
  await f.end();
  expect(f.store.getSnapshot().lastSaved?.events).toEqual([]);
});

test('unknown/invalid initial clocks stay pending, overlapping sampling is coalesced and late clock results are ignored', async () => {
  const f = captureFixture();
  await f.ready(); await f.store.start();
  const reading = deferred<MediaPosition>();
  f.camera.position.mockReturnValueOnce(reading.promise);
  const first = f.store.checkPosition();
  await f.store.checkPosition();
  expect(f.camera.position).toHaveBeenCalledTimes(1);
  reading.resolve({ recordingId: id(11), mediaMs: 100, source: 'avcapture-recorded-duration' });
  await first;
  expect(f.store.getSnapshot().phase).toBe('starting');
  const late = deferred<MediaPosition>();
  f.camera.position.mockReturnValueOnce(late.promise);
  const pending = f.store.checkPosition();
  await f.end();
  late.resolve({ recordingId: id(10), mediaMs: 100, source: 'avcapture-recorded-duration' });
  await pending;
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'saved', lastSaved: { termination: 'interrupted' } });
});

test('same-recording native toggle result requested before Stop is preserved even when its promise resolves late', async () => {
  const f = captureFixture(); await f.begin();
  const position = deferred<MediaPosition>();
  f.camera.position.mockReturnValueOnce(position.promise);
  const toggle = f.store.toggle(id(2));
  expect(await f.store.toggle(id(3))).toBe(false);
  expect(f.store.getSnapshot().labelBusy).toBe(true);
  await f.store.stop();
  position.resolve({ recordingId: id(10), mediaMs: 100, source: 'avcapture-recorded-duration' });
  expect(await toggle).toBe(true);
  await f.end();
  expect(f.store.getSnapshot().lastSaved?.events).toEqual([{ labelId: id(2), mediaMs: 100, source: 'avcapture-recorded-duration' }]);
});

test('unavailable/regressing positions do not add a toggle and a later valid position can recover', async () => {
  const f = captureFixture(); await f.begin();
  f.camera.position.mockRejectedValueOnce(new CaptureError('clock-unavailable'));
  expect(await f.store.toggle(id(2))).toBe(false);
  expect(f.store.getSnapshot()).toMatchObject({ error: 'clock-unavailable', draft: { events: [] } });
  expect(await f.store.toggle(id(2))).toBe(true);
  f.camera.position.mockResolvedValueOnce({ recordingId: id(10), mediaMs: 99, source: 'avcapture-recorded-duration' });
  expect(await f.store.toggle(id(3))).toBe(false);
  expect(f.store.getSnapshot().error).toBe('invalid-timing');
  expect(await f.store.toggle(id(3))).toBe(true);
  await f.store.stop(); await f.end();
  expect(f.store.getSnapshot().lastSaved?.events).toHaveLength(2);
});

test('failed annotation checkpoint retains intended event, stops capture and waits for the pending write before final save', async () => {
  const f = captureFixture(); await f.begin();
  const checkpoint = deferred<void>();
  f.repository.checkpoint.mockReturnValueOnce(checkpoint.promise);
  const toggling = f.store.toggle(id(2));
  await Promise.resolve();
  checkpoint.reject(new Error('/private/storage-full'));
  expect(await toggling).toBe(false);
  expect(f.camera.stop).toHaveBeenCalledTimes(1);
  expect(f.store.getSnapshot().draft?.events).toHaveLength(1);
  await f.end();
  expect(f.store.getSnapshot().lastSaved).toMatchObject({ termination: 'interrupted', events: [{ labelId: id(2), mediaMs: 100 }] });
  expect(JSON.stringify((console.info as jest.Mock).mock.calls)).not.toMatch(/Private project|storage-full/);
});

test('finalization waits for an accepted checkpoint instead of racing it', async () => {
  const f = captureFixture(); await f.begin();
  const checkpoint = deferred<void>();
  f.repository.checkpoint.mockReturnValueOnce(checkpoint.promise);
  const toggle = f.store.toggle(id(2));
  await Promise.resolve();
  const ending = f.end();
  await Promise.resolve();
  expect(f.store.getSnapshot().phase).toBe('saving');
  expect(f.media.promote).not.toHaveBeenCalled();
  checkpoint.resolve();
  await toggle; await ending;
  expect(f.store.getSnapshot().lastSaved?.events).toHaveLength(1);
});

test('Stop failure can be retried; a late failure cannot replace a finalized saved outcome', async () => {
  const f = captureFixture(); await f.begin();
  f.camera.stop.mockRejectedValueOnce(new Error('secret stop failure'));
  expect(await f.store.stop()).toBe(false);
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'stopping', error: 'stop-failed' });
  await f.store.checkPosition();
  expect(f.camera.stop).toHaveBeenCalledTimes(1);
  const stop = deferred<void>();
  f.camera.stop.mockReturnValueOnce(stop.promise);
  const retry = f.store.stop();
  expect(await f.store.stop()).toBe(false);
  await f.end();
  stop.reject(new Error('secret late stop failure'));
  expect(await retry).toBe(false);
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'saved', error: null });
});

test.each(['prepare', 'checkpoint', 'id', 'record'] as const)('reports %s start failure and preserves draft/data without a false Saved state', async (step) => {
  const f = captureFixture(); await f.ready();
  if (step === 'prepare') f.media.prepare.mockRejectedValueOnce(new CaptureError('media-unavailable'));
  if (step === 'checkpoint') f.repository.checkpoint.mockRejectedValueOnce(new Error('secret storage failure'));
  if (step === 'id') f.newId.mockImplementationOnce(() => { throw new Error('secret ID error'); });
  if (step === 'record') f.camera.record.mockImplementationOnce(() => { throw new Error('secret native error'); });
  expect(await f.store.start()).toBe(false);
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'failed', lastSaved: null });
  expect(f.repository.commit).not.toHaveBeenCalled();
  expect(f.store.close()).toBe(true);
});

test.each(['promote', 'commit', 'load'] as const)('retries %s save failure using the same recording and media without duplicate saved rows', async (step) => {
  const f = captureFixture(); await f.begin(); await f.store.toggle(id(2)); await f.store.stop();
  if (step === 'promote') f.media.promote.mockRejectedValueOnce(new CaptureError('media-unavailable'));
  if (step === 'commit') f.repository.commit.mockImplementationOnce(async (value) => {
    f.saved.set(value.id, value); f.pending.delete(value.id); throw new Error('commit acknowledged ambiguously');
  });
  if (step === 'load') f.repository.load.mockRejectedValueOnce(new Error('snapshot read failed'));
  await f.end();
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'failed', lastSaved: null, draft: { id: id(10), events: [{ labelId: id(2) }] } });
  expect(await f.store.recover(id(10))).toBe(true);
  expect(f.saved.size).toBe(1);
  expect(f.newId).toHaveBeenCalledTimes(1);
  expect(f.camera.record).toHaveBeenCalledTimes(1);
});

test('native failure or unsolicited end keeps a recoverable interrupted video; inconsistent timing remains pending', async () => {
  const f = captureFixture(); await f.begin(); await f.store.toggle(id(2));
  await f.end(undefined, true);
  expect(f.store.getSnapshot().lastSaved?.termination).toBe('interrupted');
  const second = captureFixture(); await second.begin(); await second.store.toggle(id(2));
  second.media.promote.mockResolvedValueOnce({ durationMs: 99, byteSize: 123 });
  await second.end(undefined, true);
  expect(second.store.getSnapshot()).toMatchObject({ phase: 'failed', error: 'invalid-timing', lastSaved: null });
  expect(second.pending.size).toBe(1);
  expect(second.store.newRecording()).toBe(true);
  expect(second.store.getSnapshot().pending).toHaveLength(1);
});

test('relaunch loads old pending paths and snapshots, marks interruption, and does not capture again during recovery', async () => {
  const first = captureFixture(); await first.begin(); await first.store.toggle(id(2));
  const pending = first.pending.get(id(10))!;
  const f = captureFixture(); f.pending.set(pending.id, pending);
  await f.ready();
  expect(await f.store.recover(id(99))).toBe(false);
  expect(await f.store.recover(pending.id)).toBe(true);
  expect(f.store.getSnapshot().lastSaved).toMatchObject({ termination: 'interrupted', labels: pending.labels, events: pending.events });
  expect(f.camera.record).not.toHaveBeenCalled();
});

test('load and preview errors offer safe retry; preview failure during capture requests an interruption Stop', async () => {
  const f = captureFixture(); f.repository.load.mockRejectedValueOnce(new Error('/private/database'));
  expect(await f.store.open(f.project)).toBe(false);
  expect(f.store.newRecording()).toBe(false);
  expect(await f.store.load()).toBe(true);
  f.store.previewFailed();
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'failed', previewReady: false, error: 'unavailable' });
  expect(await f.store.load()).toBe(true);
  f.store.previewReady(); await f.store.start(); await f.store.checkPosition();
  f.store.previewFailed();
  expect(f.camera.stop).toHaveBeenCalledTimes(1);
  await f.end();
  expect(f.store.getSnapshot().lastSaved?.termination).toBe('interrupted');
});

test('consecutive checkpoint failures retain the latest event and block navigation/new capture until it is staged', async () => {
  const f = captureFixture(); await f.begin();
  f.repository.checkpoint.mockRejectedValueOnce(new Error('toggle write failed')).mockRejectedValueOnce(new Error('end checkpoint failed'));
  expect(await f.store.toggle(id(2))).toBe(false);
  await f.end();
  expect(f.pending.get(id(10))?.events).toEqual([]);
  expect(f.store.getSnapshot().draft?.events).toHaveLength(1);
  expect(f.store.close()).toBe(false);
  expect(f.store.newRecording()).toBe(false);
  expect(await f.store.recover(id(10))).toBe(true);
  expect(f.store.getSnapshot().lastSaved?.events).toHaveLength(1);
  expect(f.store.close()).toBe(true);
});

test('unconfirmed native finalization never promotes a readable still-writing file; journal-only retry precedes restart recovery', async () => {
  const f = captureFixture(); await f.begin(); await f.store.toggle(id(2));
  f.repository.checkpoint.mockRejectedValueOnce(new Error('journal failed'));
  await f.end(new CaptureError('capture-unfinalized'));
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'unfinalized', error: 'checkpoint-failed', draft: { termination: 'interrupted' } });
  expect(f.media.promote).not.toHaveBeenCalled();
  expect(f.repository.commit).not.toHaveBeenCalled();
  expect(await f.store.recover(id(10))).toBe(false);
  expect(f.store.close()).toBe(false);
  expect(f.store.newRecording()).toBe(false);
  expect(await f.store.checkpointUnfinalized()).toBe(true);
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'unfinalized', error: 'capture-unfinalized' });
  expect(f.pending.get(id(10))?.events).toHaveLength(1);
  const relaunched = captureFixture(); relaunched.pending.set(id(10), f.pending.get(id(10))!);
  await relaunched.ready();
  expect(await relaunched.store.recover(id(10))).toBe(true);
  expect(relaunched.store.getSnapshot().lastSaved?.termination).toBe('interrupted');
  expect(await relaunched.store.checkpointUnfinalized()).toBe(false);
});

test('known pre-start failure stays pending without assuming finalized output, and cancellation failure remains explicit', async () => {
  const f = captureFixture(); await f.ready(); await f.store.start();
  await f.end(new CaptureError('unavailable'));
  expect(f.store.getSnapshot()).toMatchObject({ phase: 'failed', error: 'unavailable' });
  expect(f.media.promote).not.toHaveBeenCalled();
  const cancelled = captureFixture(); await cancelled.ready();
  const preparation = deferred<string>(); cancelled.media.prepare.mockReturnValueOnce(preparation.promise);
  const start = cancelled.store.start(); await cancelled.store.stop();
  cancelled.repository.cancelUnstarted.mockRejectedValueOnce(new Error('cancel failed'));
  preparation.resolve('file:///private/stage.mov');
  expect(await start).toBe(false);
  expect(cancelled.camera.record).not.toHaveBeenCalled();
  expect(cancelled.store.getSnapshot().pending).toHaveLength(1);
});
