import { media, recordingRepository } from '../capture/runtime';
import { newId } from '../projects/runtime';
import { annotationRepository } from '../review/runtime';
import { ExportStore } from './ExportStore';
import { createNativePackage } from './nativePackage';
import { createNativeShare } from './nativeShare';

export const exportStore = new ExportStore(recordingRepository, annotationRepository,
  (record) => media.resolveSaved(record), createNativePackage(), createNativeShare(), newId);
