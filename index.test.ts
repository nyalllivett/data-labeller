const mockOrder: string[] = [];
jest.mock('expo', () => ({ registerRootComponent: jest.fn(() => mockOrder.push('register')) }));
jest.mock('react-native/Libraries/Core/ExceptionsManager', () => {
  let handler: (error: unknown, isFatal: boolean) => void = jest.fn();
  return {
    __esModule: true,
    default: {
      get handleException() {
        return handler;
      },
      set handleException(value: (error: unknown, isFatal: boolean) => void) {
        handler = value;
        mockOrder.push('privacy');
      },
    },
  };
});
jest.mock('./App', () => {
  mockOrder.push('app');
  return { __esModule: true, default: jest.fn() };
});

test('installs privacy before importing the data-bearing app and registering it', () => {
  jest.isolateModules(() => {
    jest.requireActual('./index');
    const { registerRootComponent } = jest.requireMock<typeof import('expo')>('expo');
    const App = jest.requireMock<typeof import('./App')>('./App').default;
    expect(registerRootComponent).toHaveBeenCalledTimes(1);
    expect(registerRootComponent).toHaveBeenCalledWith(App);
    expect(mockOrder).toEqual(['privacy', 'app', 'register']);
  });
});
