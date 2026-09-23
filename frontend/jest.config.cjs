module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  transform: { '^.+\\.(t|j)sx?$': ['@swc/jest', {
    jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  }] },
  moduleNameMapper: { '\\.(css|scss)$': '<rootDir>/test/styleMock.cjs' },
  clearMocks: true,
}
