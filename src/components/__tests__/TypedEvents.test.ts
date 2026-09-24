/**
 * The documented way to type the event bus — `interface AppEvents { … }` passed to
 * `new WorkspaceClient<AppEvents>()` — has to compile. It used to fail with TS2344, because the
 * type parameter was constrained to `Record<string, unknown>`, which an interface (having no
 * index signature) does not satisfy.
 *
 * jsdom tests can't see a compile error, so this compiles the fixture with the TypeScript API.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';

describe('typed event bus', () => {
  it('the documented interface-based event map compiles, and wrong payloads are still rejected', () => {
    const fixture = join(__dirname, 'fixtures', 'typedEvents.fixture.ts');
    const program = ts.createProgram([fixture], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program)
      .filter(d => d.file?.fileName === fixture)
      .map(d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    expect(diagnostics).toEqual([]);
  }, 60_000);
});
