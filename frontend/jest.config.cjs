module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transform: {
    '^.+\\.(m?js|[jt]sx?)$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } }],
  },
  moduleNameMapper: { '\\.(css)$': '<rootDir>/test/styleMock.cjs', '\\.(png|jpe?g|svg|webp)$': '<rootDir>/test/fileMock.cjs' },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'json'],
}
