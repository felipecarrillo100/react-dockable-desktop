/**
 * tests/migration-fixture is a 6.x app migrated to 7.0 by following the migration guide alone
 * (see its README). It has to keep compiling against the current API: if it stops, either the
 * API drifted from what the guide promises, or the guide needs updating.
 * (Its own behaviour test, App.test.tsx, runs with the rest of the suite.)
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';

describe('migration fixture', () => {
  it('type-checks against the current API', () => {
    const dir = join(__dirname, '..', '..', '..', 'tests', 'migration-fixture');
    const configPath = join(dir, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dir);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const errors = ts.getPreEmitDiagnostics(program)
      .filter(d => d.file?.fileName.includes('migration-fixture'))
      .map(d => `${d.file!.fileName.split('migration-fixture/')[1]}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    expect(errors).toEqual([]);
  }, 120_000);
});
