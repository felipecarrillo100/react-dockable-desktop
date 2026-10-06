/**
 * scripts/api-check.mjs decides what counts as a breaking change between two API reports
 * (STABILITY.md): a removed declaration, or one that lost a line, is breaking; an added
 * declaration or member is not.
 */
import { describe, it, expect } from 'vitest';
import { breakingChanges } from '../../../scripts/api-check.mjs';

const report = (body: string) => `## API Report File\n\n\`\`\`ts\n\nimport { ReactNode } from 'react';\n\n${body}\n\`\`\`\n`;

const base = report(`// @public
export interface PanelOptions {
    // (undocumented)
    title?: string;
    width: number;
}

// @public
export function openPanel(id: string, component: string): void;

// @public
export type Skin = 'vscode' | 'macos';`);

describe('api-check: breaking changes between reports', () => {
  it('an identical report has none', () => {
    expect(breakingChanges(base, base)).toEqual([]);
  });

  it('additions are not breaking: a new member, a new export, a changed comment', () => {
    const next = base
      .replace('    width: number;', '    width: number;\n    height?: number;')
      .replace("export type Skin", '// @public\nexport function closePanel(id: string): void;\n\n// @public\nexport type Skin')
      .replace('    // (undocumented)\n', '');
    expect(breakingChanges(base, next)).toEqual([]);
  });

  it('a removed export is breaking', () => {
    const next = base.replace("// @public\nexport type Skin = 'vscode' | 'macos';", '');
    expect(breakingChanges(base, next)).toEqual(['removed: Skin']);
  });

  it('a removed member is breaking', () => {
    const next = base.replace('    width: number;\n', '');
    expect(breakingChanges(base, next)).toEqual(['changed: PanelOptions (no longer has: width: number;)']);
  });

  it('a type the API refers to without exporting it is tracked too (includeForgottenExports)', () => {
    const before = report(`interface WorkspaceClientConfig {
    canDrop?: (drop: PanelDrop) => boolean;
    zIndexBase?: number;
}`);
    const after = report(`interface WorkspaceClientConfig {
    canDrop?: (drop: PanelDrop) => boolean;
}`);
    expect(breakingChanges(before, after)).toEqual(['changed: WorkspaceClientConfig (no longer has: zIndexBase?: number;)']);
  });

  it('a changed signature or type is breaking', () => {
    const next = base
      .replace('openPanel(id: string, component: string): void;', 'openPanel(id: string, component: string): boolean;')
      .replace("'vscode' | 'macos'", "'vscode'");
    expect(breakingChanges(base, next)).toEqual([
      'changed: openPanel (no longer has: export function openPanel(id: string, component: string): void;)',
      "changed: Skin (no longer has: export type Skin = 'vscode' | 'macos';)",
    ]);
  });
});
