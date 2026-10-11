import { randomUUID } from 'expo-crypto';
import { newId, projectStore } from './runtime';
import { ProjectStore } from './ProjectStore';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'native-id') }));
jest.mock('../storage/nativeRepository', () => ({
  createNativeRepository: jest.fn(() => ({ load: jest.fn() })),
}));
test('binds native UUID generation and retains one store outside render remounts', () => {
  expect(newId()).toBe('native-id');
  expect(randomUUID).toHaveBeenCalledTimes(1);
  expect(projectStore).toBeInstanceOf(ProjectStore);
});
