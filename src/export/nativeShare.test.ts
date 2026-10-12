import * as Sharing from 'expo-sharing';
import { createNativeShare } from './nativeShare';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
test('opens only the given local package and returns no delivery claim when the native sheet returns', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
  expect(await createNativeShare().share('file:///cache/export/package.zip')).toBeUndefined();
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/export/package.zip', {
    mimeType: 'application/zip', UTI: 'com.pkware.zip-archive', dialogTitle: 'Share Data Labeller package',
  });
});
test('unavailable sharing does not invoke a native sheet', async () => {
  const api = { isAvailableAsync: jest.fn().mockResolvedValue(false), shareAsync: jest.fn() };
  await expect(createNativeShare(api).share('file:///cache/package.zip')).rejects.toThrow('sharing-unavailable');
  expect(api.shareAsync).not.toHaveBeenCalled();
});
test.each(['availability', 'presentation'])('sanitizes %s failure without logging private paths or raw messages', async (stage) => {
  const api = { isAvailableAsync: jest.fn().mockResolvedValue(true), shareAsync: jest.fn().mockResolvedValue(undefined) };
  const error = new Error('/private/names/recording.zip');
  if (stage === 'availability') api.isAvailableAsync.mockRejectedValue(error); else api.shareAsync.mockRejectedValue(error);
  await expect(createNativeShare(api).share('file:///cache/package.zip')).rejects.toMatchObject({ message: 'share-failed', code: 'share-failed' });
});
