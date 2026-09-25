/**
 * Static checks on `src/index.css` (shipped verbatim as `dist/styles.css`).
 *
 * jsdom never loads the stylesheet, so no rendering test can see a rule that matches nothing, or
 * a class that collides with the host page's CSS. Three shipped defects were exactly that: the
 * maximized-window rule targeted `.maximized` while the component emitted `rdd-maximized`;
 * unprefixed `@keyframes` names (`fadeIn`, `scaleUp`, …) that Animate.css and others also
 * define; and rules for classes nothing renders. These tests read the stylesheet as text.
 *
 * Prefix convention: see CLAUDE.md — every class, custom property and keyframe name the library
 * ships is `rdd-` / `--rdd-` prefixed, so it cannot collide with a host framework's own names.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Unprefixed classes still shipped on purpose, each with the release that removes it. */
const LEGACY_CLASSES = new Set<string>([]);

/** Unprefixed custom properties still shipped on purpose. Emptied in 7.0.0; nothing may be added. */
const LEGACY_PROPERTIES = new Set<string>([]);

/**
 * `rdd-*` classes that no library component emits, because the consumer applies them (documented
 * hooks) or the browser does. Each needs a reason.
 */
const CONSUMER_APPLIED_CLASSES = new Set<string>([
  'rdd-fill-viewport', // the consumer puts it on their workspace wrapper (docs: quick-start)
]);

/** Values `rdd-${position}` can take (Toolbar strip position). */
const BARE_TEMPLATE_VALUES = ['rdd-left', 'rdd-right', 'rdd-top', 'rdd-bottom'];

interface ParsedCss {
  classes: Map<string, string>; // class name → first selector it appears in
  keyframes: string[];
  animationValues: string[];
}

function parseCss(text: string): ParsedCss {
  const classes = new Map<string, string>();
  const keyframes: string[] = [];
  const animationValues: string[] = [];
  // Walk the blocks, tracking which ones are @keyframes (whose inner "selectors" are from/to/%).
  const stack: boolean[] = [];
  let prelude = '';
  for (const ch of text) {
    if (ch === '{') {
      const head = prelude.trim();
      const insideKeyframes = stack.includes(true);
      const isKeyframes = /^@(-webkit-)?keyframes\b/.test(head);
      if (isKeyframes) keyframes.push(head.replace(/^@(-webkit-)?keyframes\s+/, '').trim());
      if (!insideKeyframes && !isKeyframes && !head.startsWith('@')) {
        for (const m of head.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
          if (!classes.has(m[1])) classes.set(m[1], head.replace(/\s+/g, ' '));
        }
      }
      stack.push(isKeyframes);
      prelude = '';
    } else if (ch === '}') {
      stack.pop();
      prelude = '';
    } else if (ch === ';') {
      const decl = prelude.trim();
      const anim = decl.match(/^animation(?:-name)?\s*:\s*(.+)$/);
      if (anim) animationValues.push(anim[1]);
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return { classes, keyframes, animationValues };
}

function librarySourceFiles(): string[] {
  const dir = join(ROOT, 'src');
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter(f => /\.tsx?$/.test(f) && !f.split(/[\\/]/).includes('__tests__'))
    .map(f => join(dir, f));
}

/** Every `rdd-*` class the library's own components can emit, and every template prefix. */
function emittedClasses(): { exact: Set<string>; prefixes: Set<string> } {
  const exact = new Set<string>(BARE_TEMPLATE_VALUES);
  const prefixes = new Set<string>();
  for (const file of librarySourceFiles()) {
    const text = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of text.matchAll(/rdd-[\w-]*/g)) {
      const token = m[0];
      const before = text.slice(Math.max(0, m.index! - 2), m.index);
      if (before === '--') continue; // a custom property, not a class
      const templated = text.startsWith('${', m.index! + token.length);
      if (templated && /[-_]$/.test(token)) {
        if (token !== 'rdd-') prefixes.add(token); // `rdd-${position}` is covered by BARE_TEMPLATE_VALUES
      } else {
        exact.add(token);
      }
    }
  }
  return { exact, prefixes };
}

const parsed = parseCss(css);

describe('stylesheet contract (index.css)', () => {
  it('parses the stylesheet (sanity check for the rest of this suite)', () => {
    expect(parsed.classes.size).toBeGreaterThan(150);
    expect(parsed.keyframes.length).toBeGreaterThan(3);
    expect(parsed.classes.has('rdd-floating-window')).toBe(true);
  });

  it('every class selector is rdd- prefixed', () => {
    const unprefixed = [...parsed.classes.entries()]
      .filter(([name]) => !name.startsWith('rdd-') && !LEGACY_CLASSES.has(name))
      .map(([name, selector]) => `.${name}   in   ${selector}`);
    expect(unprefixed).toEqual([]);
  });

  it('every @keyframes name is rdd- prefixed', () => {
    expect(parsed.keyframes.filter(name => !name.startsWith('rdd-'))).toEqual([]);
  });

  it('every animation declaration names a keyframes rule defined here', () => {
    const defined = new Set(parsed.keyframes);
    const broken = parsed.animationValues.filter(value => {
      const v = value.replace(/!important/g, '').trim();
      if (v === 'none' || v.startsWith('var(')) return false;
      const words = v.match(/[a-zA-Z][\w-]*/g) ?? [];
      return !words.some(w => defined.has(w));
    });
    expect(broken).toEqual([]);
  });

  it('every custom property is --rdd- prefixed (or on the documented legacy list)', () => {
    const names = new Set<string>();
    for (const m of css.matchAll(/(?:^|[\s;{(,])--([a-zA-Z][\w-]*)\s*:/g)) names.add(m[1]);
    for (const m of css.matchAll(/var\(\s*--([a-zA-Z][\w-]*)/g)) names.add(m[1]);
    const unprefixed = [...names].filter(n => !n.startsWith('rdd-') && !LEGACY_PROPERTIES.has(n)).sort();
    expect(unprefixed).toEqual([]);
  });

  it('every rdd- class the stylesheet styles is emitted by a library component', () => {
    const { exact, prefixes } = emittedClasses();
    const dead = [...parsed.classes.keys()]
      .filter(name => name.startsWith('rdd-'))
      .filter(name => !exact.has(name) && !CONSUMER_APPLIED_CLASSES.has(name))
      .filter(name => ![...prefixes].some(p => name.startsWith(p)))
      .map(name => `.${name}   in   ${parsed.classes.get(name)}`);
    expect(dead).toEqual([]);
  });

  it('the emitted-class scan finds classes (sanity check)', () => {
    const { exact, prefixes } = emittedClasses();
    expect(exact.has('rdd-floating-window')).toBe(true);
    expect(exact.has('rdd-maximized')).toBe(true);
    expect(prefixes.has('rdd-resize-')).toBe(true);
    expect(relative(ROOT, librarySourceFiles()[0]).startsWith('src')).toBe(true);
  });
});
