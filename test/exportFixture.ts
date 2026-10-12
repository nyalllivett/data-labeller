import { createRecordingDraft } from '../src/capture/recording';
import { ExportStore } from '../src/export/ExportStore';
import type { PackagePort } from '../src/export/PackagePort';
import type { SharePort } from '../src/export/SharePort';
import { reviewFixture } from './reviewFixture';
import { id } from './ids';

export function exportFixture() {
  const f = reviewFixture();
  const pending = createRecordingDraft(id(12), f.project, 'front', 'mp4');
  const workspace = { saved: [f.record, f.second], pending: [pending] };
  f.recordings.load.mockResolvedValue(workspace);
  const packages: jest.Mocked<PackagePort> = {
    prepare: jest.fn<ReturnType<PackagePort['prepare']>, Parameters<PackagePort['prepare']>>(async (intent) => ({ id: intent.id, uri: `file:///cache/${intent.id}/data-labeller.zip`, byteSize: 500 })),
    cancel: jest.fn().mockResolvedValue(undefined), discard: jest.fn().mockResolvedValue(undefined), available: jest.fn().mockResolvedValue(true),
  };
  const sharing: jest.Mocked<SharePort> = { share: jest.fn().mockResolvedValue(undefined) };
  let serial = 20; const newId = jest.fn(() => id(serial++));
  const store = new ExportStore(f.recordings, f.repository, f.resolve, packages, sharing, newId);
  return { ...f, pending, workspace, packages, sharing, newId, store, open: () => store.open(f.project) };
}
