/**
 * DOM identity attributes (7.4.0). The library's own data- attributes are `data-rdd-*`, the scheme
 * vue- and angular-dockable-desktop use, so a test or a stylesheet can address every part of the
 * desktop by one prefix. The unprefixed ones below predate that and stay until 8.0.0, which
 * removes them; this keeps any new one from being added. The rendered attributes and their values
 * are checked in real Chrome by tests/browser/identity.browser.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** Unprefixed attributes that predate `data-rdd-*`. Removed in 8.0.0; nothing may be added. */
const LEGACY = new Set(['data-active-panel-id', 'data-btn-variant', 'data-color-scheme', 'data-container-type',
  'data-content', 'data-controller', 'data-cy-action', 'data-drop-zone', 'data-edge-trigger', 'data-leaf-id',
  'data-menu-index', 'data-panel-id', 'data-panel-size', 'data-tab-id', 'data-tab-index', 'data-testid',
  'data-variant', 'data-window-id']);

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? (d.name === '__tests__' ? [] : walk(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe('DOM identity attributes', () => {
  it('adds no unprefixed data- attribute (new ones are data-rdd-*)', () => {
    const found = new Map<string, string>();
    for (const f of walk(SRC)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\b(data-[a-z][a-z-]*)=/g)) {
        if (!m[1].startsWith('data-rdd-') && !LEGACY.has(m[1])) found.set(m[1], relative(SRC, f));
      }
    }
    expect([...found].map(([a, f]) => `${a} in ${f}`)).toEqual([]);
  });
});
