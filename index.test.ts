jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));

test('registers the app shell as the native Expo entry point exactly once', () => {
  jest.isolateModules(() => {
    const { registerRootComponent } = jest.requireMock<typeof import('expo')>('expo');
    const App = jest.requireActual<typeof import('./App')>('./App').default;
    jest.requireActual('./index');

    expect(registerRootComponent).toHaveBeenCalledTimes(1);
    expect(registerRootComponent).toHaveBeenCalledWith(App);
  });
});
