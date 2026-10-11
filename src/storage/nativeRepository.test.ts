import { requireNativeModule } from 'expo';
import { openDatabaseAsync } from 'expo-sqlite';
import { TransactionDatabase } from '../../test/transactionDatabase';
import { createNativeRepository } from './nativeRepository';

jest.mock('expo', () => ({ requireNativeModule: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
test('opens only after preparation and retries private directory failures', async () => {
  const order: string[] = [];
  const db = Object.assign(new TransactionDatabase(), {
    closeAsync: jest.fn(async () => {
      order.push('close');
    }),
  });
  const prepare = jest.fn(async () => {
    order.push('prepare');
    return 'file:///private/data';
  });
  const open = jest.fn(async () => {
    order.push('open');
    return db;
  });
  prepare.mockRejectedValueOnce(new Error('sensitive path'));
  const repo = createNativeRepository(prepare, open);
  await expect(repo.load()).rejects.toThrow('unavailable');
  expect(open).not.toHaveBeenCalled();
  expect(await repo.load()).toEqual({ projects: [], pending: [] });
  expect(order).toEqual(['prepare', 'open']);
  expect(open).toHaveBeenCalledWith('projects.db', 'file:///private/data');
});
test('rejects default/cache fallback and closes a failed initialization before retry', async () => {
  const db = Object.assign(new TransactionDatabase(), {
    closeAsync: jest.fn().mockResolvedValue(undefined),
  });
  const prepare = jest
    .fn()
    .mockResolvedValueOnce('https://unsafe')
    .mockResolvedValue('file:///private/data');
  const open = jest.fn().mockResolvedValue(db);
  const repo = createNativeRepository(prepare, open);
  await expect(repo.load()).rejects.toThrow('unavailable');
  expect(open).not.toHaveBeenCalled();
  db.faults = ['schema'];
  await expect(repo.load()).rejects.toThrow('unavailable');
  await repo.load();
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  db.closeAsync.mockRejectedValueOnce(new Error('private close failure'));
  const broken = createNativeRepository(prepare, open);
  db.version = 2;
  await expect(broken.load()).rejects.toThrow('unsupported-schema');
  await expect(broken.load()).rejects.toThrow('unavailable');
});
test('default adapter binds the module and explicit SQLite options/directory', async () => {
  const prepare = jest.fn().mockResolvedValue('file:///private/data');
  jest.mocked(requireNativeModule).mockReturnValue({ prepareDatabaseDirectory: prepare });
  const db = Object.assign(new TransactionDatabase(), {
    closeAsync: jest.fn().mockResolvedValue(undefined),
  });
  jest
    .mocked(openDatabaseAsync)
    .mockResolvedValue(db as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>);
  await createNativeRepository().load();
  expect(requireNativeModule).toHaveBeenCalledWith('PrivateStorage');
  expect(openDatabaseAsync).toHaveBeenCalledWith(
    'projects.db',
    { useNewConnection: true },
    'file:///private/data',
  );
});
