import { savedRecord } from '../../test/reviewFixture';

jest.mock('../capture/runtime', () => ({ media: { resolveSaved: jest.fn() }, recordingRepository: 'recording repository' }));
jest.mock('../storage/privateDatabase', () => ({ privateDatabaseOpener: jest.fn(() => 'annotation opener') }));
jest.mock('./SqliteAnnotationRepository', () => ({ SqliteAnnotationRepository: jest.fn() }));
jest.mock('./ReviewStore', () => ({ ReviewStore: jest.fn() }));
test('wires one stable review store to saved-record reads, a private sidecar, and sanitized read-only media resolution', async () => {
  const { ReviewStore } = jest.requireMock('./ReviewStore');
  const { SqliteAnnotationRepository } = jest.requireMock('./SqliteAnnotationRepository');
  const { privateDatabaseOpener } = jest.requireMock('../storage/privateDatabase');
  const { media } = jest.requireMock('../capture/runtime');
  jest.requireActual('./runtime');
  expect(privateDatabaseOpener).toHaveBeenCalledWith('annotations.db');
  expect(SqliteAnnotationRepository).toHaveBeenCalledWith('annotation opener');
  const args = ReviewStore.mock.calls[0];
  expect(args.slice(0, 2)).toEqual(['recording repository', SqliteAnnotationRepository.mock.instances[0]]);
  const record = savedRecord(); media.resolveSaved.mockResolvedValueOnce('file:///private/video.mov');
  expect(await args[2](record)).toBe('file:///private/video.mov');
  expect(media.resolveSaved).toHaveBeenCalledWith(record);
  media.resolveSaved.mockRejectedValueOnce(new Error('/private/secret'));
  await expect(args[2](record)).rejects.toThrow('media-unavailable');
});
