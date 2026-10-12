import * as Sharing from 'expo-sharing';
import { ExportError } from './ExportError';
import type { SharePort } from './SharePort';

export function createNativeShare(api: Pick<typeof Sharing, 'isAvailableAsync' | 'shareAsync'> = Sharing): SharePort {
  return {
    async share(uri) {
      try {
        if (!await api.isAvailableAsync()) throw new ExportError('sharing-unavailable');
        await api.shareAsync(uri, { mimeType: 'application/zip', UTI: 'com.pkware.zip-archive', dialogTitle: 'Share Data Labeller package' });
      } catch (error) { throw error instanceof ExportError ? error : new ExportError('share-failed'); }
    },
  };
}
