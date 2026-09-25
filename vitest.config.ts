import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The migration fixture (tests/migration-fixture) imports the package by name, as an app does.
  resolve: { alias: { 'react-dockable-desktop': fileURLToPath(new URL('./src/index.ts', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/migration-fixture/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    pool: 'vmThreads',
  },
});
