import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // The library: `npm run lint` fails on any error or warning here, in CI too.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // A Vite dev-server rule for apps: a library module exporting hooks and constants beside
      // its components is normal, and fast refresh is not ours to keep.
      'react-refresh/only-export-components': 'off',
      // A leading underscore marks a deliberately unused name (a callback parameter, a
      // destructured field dropped on purpose).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_',
      }],
      // `interface Workspace extends WorkspaceClient {}`: an interface rather than an alias, so the
      // API reference lists the members under the public name.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
  // The library's own tests: probes count renders in module variables and stub browser APIs.
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/immutability': 'off',
    },
  },
])
