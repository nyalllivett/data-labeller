import { media, recordingRepository } from '../capture/runtime';
import { privateDatabaseOpener } from '../storage/privateDatabase';
import { ReviewError } from './ReviewError';
import { ReviewStore } from './ReviewStore';
import { SqliteAnnotationRepository } from './SqliteAnnotationRepository';

export const reviewStore = new ReviewStore(recordingRepository,
  new SqliteAnnotationRepository(privateDatabaseOpener('annotations.db')),
  async (record) => {
    try { return await media.resolveSaved(record); }
    catch { throw new ReviewError('media-unavailable'); }
  },
);
