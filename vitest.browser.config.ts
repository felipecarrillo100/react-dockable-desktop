import { defineConfig } from 'vitest/config';

// Real-browser suite: `npm run test:browser`. Specs are tests/browser/*.browser.ts — a name the
// default `npm test` pattern does not match. Each spec drives Google Chrome (playwright-core,
// channel 'chrome') against a harness page served by Vite (see tests/browser/globalSetup.ts).
export default defineConfig({
  test: {
    include: ['tests/browser/**/*.browser.ts'],
    environment: 'node',
    globalSetup: ['tests/browser/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
