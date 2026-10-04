/**
 * Static checks on `src/index.css` (shipped verbatim as `dist/styles.css`). Since 7.6.1 that file
 * is generated from the area files in `src/styles/` by `scripts/build-css.mjs`; the first test
 * fails when it has not been regenerated after an edit.
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
import { spawnSync } from 'node:child_process';

const ROOT = join(__dirname, '..', '..', '..');
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('generated stylesheet', () => {
  it('src/index.css is exactly what src/styles/*.css give (run `npm run css` after an edit)', () => {
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-css.mjs'), '--check'], { encoding: 'utf8' });
    expect(run.stderr.trim()).toBe('');
    expect(run.status).toBe(0);
  });
});

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

  it('right-to-left rules use :dir(rtl), never a [dir="rtl"] ancestor selector', () => {
    // An ancestor selector matches any RTL ancestor, so an LTR workspace inside an RTL page was
    // partly mirrored. :dir() follows the element's own direction, as isComputedRtl() does.
    expect(css.match(/\[dir=["']?rtl["']?\]/g) ?? []).toEqual([]);
    expect((css.match(/:dir\(rtl\)/g) ?? []).length).toBeGreaterThan(40);
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

// Branding (7.2.0): a consumer sets --rdd-brand-accent / --rdd-brand-on-accent on :root, and every
// built-in skin follows. Two things make that work, and both are easy to undo by accident:
// the library only ever *reads* the brand variables (a declaration here would override the
// consumer's :root value on the element that carries data-rdd-skin), and each skin's accent
// colour appears exactly once, in its --rdd-accent-color declaration.
describe('branding contract (index.css)', () => {
  /** Every skin accent, plus the active-state colours slate, tokyo and obsidian used before 7.2.0. */
  const ACCENT_FAMILY = ['#38bdf8', '#0066cc', '#8ab4f8', '#1a73e8', '#0078d4', '#88c0d0', '#5e81ac', '#bb9af7', '#9854f1']
    .map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))
    .concat([[96, 165, 250], [122, 162, 247], [56, 90, 246], [167, 139, 250]]);

  it('every --rdd-accent-color declaration reads --rdd-brand-accent first', () => {
    const decls = [...css.matchAll(/--rdd-accent-color\s*:\s*([^;]+);/g)].map(m => m[1].trim());
    expect(decls.length).toBeGreaterThanOrEqual(14); // :root, the light scheme, and 6 skins × 2
    expect(decls.filter(v => !/^var\(--rdd-brand-accent,\s*#[0-9a-f]{6}\)$/i.test(v))).toEqual([]);
  });

  it('never declares a --rdd-brand-* variable (the consumer does)', () => {
    expect(css.match(/--rdd-brand-[\w-]+\s*:/g) ?? []).toEqual([]);
  });

  it('no accent colour is written as a literal outside its --rdd-accent-color declaration', () => {
    const literals: string[] = [];
    for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)[^)]*\)/g)) {
      const rgb = m[0].startsWith('#') ? [1, 3, 5].map(i => parseInt(m[0].slice(i, i + 2), 16)) : [m[1], m[2], m[3]].map(Number);
      if (!ACCENT_FAMILY.some(a => a.every((v, i) => v === rgb[i]))) continue;
      const before = css.slice(Math.max(0, m.index! - 60), m.index);
      // A var() fallback — the skin's own colour inside var(--rdd-brand-accent, …), or a fallback
      // of a variable that is always defined — is the one place a literal belongs.
      if (/var\(--rdd-[\w-]+,\s*$/.test(before)) continue;
      literals.push(`${m[0]} after …${before.slice(-40).replace(/\s+/g, ' ')}`);
    }
    expect(literals).toEqual([]);
  });

  it('only :root declares --rdd-font-family; a skin sets --rdd-skin-font-family instead', () => {
    // A skin-level --rdd-font-family would override the consumer's :root font on the workspace.
    const declaring = [...css.matchAll(/([^{}]+)\{[^{}]*--rdd-font-family\s*:/g)].map(m => m[1].trim());
    expect(declaring).toEqual([':root']);
    expect(css).toMatch(/--rdd-font-family:\s*var\(--rdd-skin-font-family,/);
  });

  it('text on a solid accent fill reads --rdd-brand-on-accent', () => {
    for (const sel of ['.rdd-btn-primary', '[data-color-scheme="light"] .rdd-btn-primary', '.rdd-dock-target-box--active']) {
      const body = css.match(new RegExp(`(^|\\})\\s*${sel.replace(/[.\-[\]="]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
      expect(body, sel).toMatch(/(^|[;\s])color:\s*var\(--rdd-brand-on-accent,/);
    }
  });
});

// Corners (7.3.0): --rdd-radius-scale multiplies every corner the library draws. A radius written
// as a bare length is one the scale silently misses — a consumer asks for square corners and one
// control stays rounded. The rendered result is checked in real Chrome by radius.browser.ts.
describe('corner contract (index.css)', () => {
  /** Kept as they are at every scale: circles and pills stay round, a zero is a zero. */
  const UNSCALED = /^(0|0px|50%|999px|inherit)$/;

  it('every corner length is multiplied by --rdd-radius-scale', () => {
    const bare: string[] = [];
    for (const m of css.matchAll(/(border(?:-(?:top|bottom)-(?:left|right))?-radius)\s*:\s*([^;]+);/g)) {
      const parts = m[2].replace(/\s*!important\s*$/, '').match(/calc\([^()]*(?:\([^()]*\)[^()]*)*\)|var\([^)]*\)|[^\s]+/g) ?? [];
      for (const p of parts) {
        if (UNSCALED.test(p)) continue;
        if (/^calc\(.+ \* var\(--rdd-radius-scale, 1\)\)$/.test(p)) continue;
        bare.push(`${m[1]}: ${m[2].trim()}`);
        break;
      }
    }
    expect(bare).toEqual([]);
  });

  it('never declares --rdd-radius-scale (the consumer does)', () => {
    expect(css.match(/--rdd-radius-scale\s*:/g) ?? []).toEqual([]);
  });
});

// Brand surfaces (7.3.0): every surface colour a skin declares reads --rdd--b-<token> first, which
// derives it from the application's --rdd-brand-surface / --rdd-brand-text. A surface written as a
// bare colour is one a brand silently misses. The rendered result is checked by branding.browser.ts.
describe('surface contract (index.css)', () => {
  /** Tokens that are not surfaces: status colours and shadows. */
  const NOT_SURFACES = new Set(['danger-color', 'toast-info-color', 'toast-success-color', 'toast-warning-color',
    'toast-error-color', 'window-shadow', 'window-shadow-focused',
    'panel-float-shadow', 'panel-float-shadow-active', 'tab-btn-active-shadow', 'toolbar-btn-active-shadow']);
  /** Translucent pure white or black: a neutral tint or shade, right over any surface. */
  const NEUTRAL = /^rgba\(\s*(0|255)\s*,\s*\1\s*,\s*\1\s*,\s*0?\.\d+\s*\)$/;

  it('every coloured surface declaration reads a --rdd--b-* value first', () => {
    const bare: string[] = [];
    for (const m of css.matchAll(/--rdd-([\w-]+)\s*:\s*([^;{}]+);/g)) {
      const [tok, value] = [m[1], m[2].trim()];
      if (tok.startsWith('-') || NOT_SURFACES.has(tok) || /accent|brand|--rdd--b-/.test(value) || value.startsWith('var(')) continue;
      if (!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value) || NEUTRAL.test(value)) continue;
      bare.push(`--rdd-${tok}: ${value}`);
    }
    expect(bare).toEqual([]);
  });

  it('no element rule paints a coloured literal, outside status colours and macOS window buttons', () => {
    // A colour an element rule writes itself is one no token, brand or skin can reach.
    const ALLOWED = /\.rdd-confirmation-alert-(danger|info|warning|success)$|\[data-rdd-skin="macos"\] \.rdd-btn-(close|minimize|maximize)-tab$/;
    const bare: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\s+/g, ' ').trim();
      if (sel.startsWith('@') || /^(from|to|\d+%)/.test(sel) || ALLOWED.test(sel)) continue;
      for (const d of m[2].matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) {
        if (d[1].startsWith('--')) continue; // tokens: the surface rule above
        // Neutral tints and shades, and a colour that is only a var() fallback, are fine.
        const value = d[2].replace(/var\(--rdd-[\w-]+,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\)/g, 'V')
          .replace(/rgba\(\s*(0|255)\s*,\s*\1\s*,\s*\1\s*,[^)]*\)|#(?:fff|000)(?:fff|000)?\b/gi, 'N');
        if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)) bare.push(`${sel} { ${d[1]}: ${d[2].trim()} }`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('declares the --rdd--b-* values in one :root block only, each built on --rdd--b-base', () => {
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(b => /--rdd--b-[\w-]+\s*:/.test(b[2]));
    expect(blocks.map(b => b[1].trim())).toEqual([':root']);
    const defs = [...blocks[0][2].matchAll(/(--rdd--b-[\w-]+)\s*:\s*([^;]+);/g)];
    expect(defs.length).toBeGreaterThan(30);
    // Built on the base, so that each is valid only while both brand inputs are set.
    const base = defs.find(d => d[1] === '--rdd--b-base')?.[2] ?? '';
    expect(base).toMatch(/var\(--rdd-brand-surface\).*var\(--rdd-brand-text\)/);
    expect(defs.filter(d => d[1] !== '--rdd--b-base' && !d[2].includes('var(--rdd--b-base)')).map(d => d[1])).toEqual([]);
  });
});

// Field report (7.4.0): containers that host consumer content never carry a filter themselves — a
// backdrop-filter makes its element the containing block for position: fixed content — and the
// user's reduced-motion preference is honoured. The rendered result: frost.browser.ts, motion.browser.ts.
describe('consumer content contract (index.css)', () => {
  const CONTENT_HOSTS = /\.rdd-(floating-window|side-panel|workspace-panel|panel-float|panel-toolbar)(\.[\w-]+|\[[^\]]+\])*$/;

  it('no container that hosts consumer content carries a backdrop-filter or filter itself (only its ::before)', () => {
    const offending: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].split(',').map(s => s.replace(/\s+/g, ' ').trim());
      if (!selectors.some(s => CONTENT_HOSTS.test(s))) continue;
      if (/(^|[;\s])(-webkit-)?(backdrop-)?filter\s*:\s*(?!none)/.test(m[2])) offending.push(selectors.join(', '));
    }
    expect(offending).toEqual([]);
  });

  it('honours prefers-reduced-motion for the library elements', () => {
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? '';
    expect(block).toMatch(/\[class\*="rdd-"\]/);
    expect(block).toMatch(/transition:\s*none\s*!important/);
    expect(block).toMatch(/animation:\s*none\s*!important/);
  });
});
