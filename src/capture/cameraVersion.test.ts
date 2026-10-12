const verifyCameraVersion = jest.requireActual<(version: string) => void>('../../scripts/verify-camera-version.cjs');

test('allows only the installed camera revision whose native capture contract is patched', () => {
  expect(() => verifyCameraVersion('57.0.6')).not.toThrow();
  for (const version of ['57.0.5', '57.0.7', '58.0.0', '']) {
    expect(() => verifyCameraVersion(version)).toThrow('Expo Camera 57.0.6 is required');
  }
});
