import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Sources run in the browser and tests under Jest; without these globals every fetch/window/jest is no-undef.
  { files: ['src/**'], languageOptions: { globals: { ...globals.browser, ...globals.jest } } },
  // Playwright specs, their fixtures and the compare script run in Node, not the browser.
  { files: ['e2e/**', 'playwright.config.ts'], languageOptions: { globals: globals.node } },
  // …except the functions this spec hands to page.evaluate, which run inside the page.
  { files: ['e2e/style-baseline.spec.ts'], languageOptions: { globals: globals.browser } },
  // Declaration shims for the untyped .mjs avatar runtime describe foreign objects.
  { files: ['**/*.d.mts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  // Components read translations only through src/i18n/useT, so locale handling stays in one place.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/i18n/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'i18next', message: 'Use useT() / applyLocale() from src/i18n instead.' },
          { name: 'react-i18next', message: 'Use useT() from src/i18n instead.' },
        ],
      }],
    },
  },
)
