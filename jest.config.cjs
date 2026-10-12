module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: ['App.tsx', 'index.ts', 'scripts/verify-camera-version.cjs', 'src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/*.d.ts'],
  clearMocks: true,
  restoreMocks: true,
};
