/**
 * Starts a Vite dev server on the harness page for the browser suite, and stops it afterwards.
 * The URL is handed to the specs through `provide('harnessUrl', …)`.
 */
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

let server: ViteDevServer | undefined;

export async function setup(project: TestProject): Promise<void> {
  server = await createServer({
    configFile: false,
    root: join(__dirname, 'harness'),
    plugins: [react()],
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5400 + Math.floor(Math.random() * 400), strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('browser suite: Vite did not report a URL');
  project.provide('harnessUrl', url);
}

export async function teardown(): Promise<void> {
  await server?.close();
}

declare module 'vitest' {
  export interface ProvidedContext {
    harnessUrl: string;
  }
}
