import { Platform } from 'react-native';

import { newId } from '../projects/runtime';
import { privateDatabaseOpener } from '../storage/privateDatabase';
import { CaptureStore } from './CaptureStore';
import { NativeCamera } from './nativeCamera';
import { createNativeMedia } from './nativeMedia';
import { SqliteRecordingRepository } from './SqliteRecordingRepository';

export const camera = new NativeCamera(Platform.OS === 'ios' ? 'avcapture-recorded-duration' : 'camerax-recording-stats');
export const media = createNativeMedia();
export const recordingRepository = new SqliteRecordingRepository(privateDatabaseOpener('recordings.db'));
export const captureStore = new CaptureStore(
  camera, media, recordingRepository,
  newId, Platform.OS === 'ios' ? 'mov' : 'mp4',
);
