import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { SCENES, openBase, openScene, foldFrost } from './scenes';
import { settle } from './lib';

// Branding (7.2.0): --rdd-brand-accent / --rdd-brand-on-accent set on :root must reach every
// built-in skin, and with neither set every skin must render exactly as before.
//
// The baseline is the computed colours of every rdd- element (and its ::before/::after) in 14
// scenes, 7 skins × dark/light, with the chrome opened. Regenerate it only for an intended visual
// change: RDD_BRANDING_BASELINE=write npm run test:browser -- branding

const FIXTURE = join(__dirname, 'fixtures', 'branding-baseline.json');
const WRITE = process.env.RDD_BRANDING_BASELINE === 'write';

type Snapshot = Record<string, Record<string, string>>;

const TOKENS = [...new Set(readFileSync(join(__dirname, '..', '..', 'src', 'index.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').match(/--rdd-[a-z0-9-]+(?=\s*:)/g) ?? [])];

const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'fill', 'stroke'];

/**
 * Colour-bearing computed properties of every rdd- element (under `root`, default the whole page)
 * and its pseudo-elements, keyed by a DOM path, prefixed with `tag`.
 */
function snapshot(page: Page, root = 'body', tag = ''): Promise<Snapshot> {
  return page.evaluate(([props, rootSel, prefix]) => {
    const out: Record<string, Record<string, string>> = {};
    // Keyed by library classes, not position (7.7.x): an element's key is its nearest
    // library-classed ancestor's key plus its own tag and library classes, numbered (#2, #3…)
    // only where two elements would otherwise share one. A wrapper without a library class, or a
    // sibling of a different kind, no longer renames everything after it.
    const keyOf = new Map<Element, string>();
    const seen = new Map<string, number>();
    for (const e of document.querySelectorAll('[class*="rdd-"]')) {
      const own = [...e.classList].filter(c => c.startsWith('rdd-'));
      if (!own.length) continue;
      let up = e.parentElement;
      while (up && up !== document.body && !keyOf.has(up)) up = up.parentElement;
      const raw = `${up && keyOf.has(up) ? keyOf.get(up) + '>' : ''}${e.tagName.toLowerCase()}${own.map(c => '.' + c).join('')}`;
      const n = (seen.get(raw) ?? 0) + 1;
      seen.set(raw, n);
      keyOf.set(e, n === 1 ? raw : `${raw}#${n}`);
    }
    const path = (el: Element) => keyOf.get(el) ?? '';
    const rootEl = document.querySelector(rootSel as string);
    if (!rootEl) return { [`${prefix}MISSING ${rootSel}`]: {} };
    const els = [rootEl, ...rootEl.querySelectorAll('[class*="rdd-"]')].filter(e => e === rootEl || e.className);
    for (const el of els) {
      const key = prefix + path(el);
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
        const rec: Record<string, string> = {};
        for (const p of props) rec[p] = cs.getPropertyValue(p);
        out[key + pseudo] = rec;
      }
    }
    return out;
  }, [PROPS, root, tag] as const);
}

/**
 * Every --rdd-* token resolved as a colour and as a shadow, inside the workspace and inside the
 * toolbar strip (outside the workspace, so it reads the tokens <html> carries). Covers tokens no
 * scene happens to render — including ones only consumers use (e.g. --rdd-sidebar-card-*).
 */
function tokens(page: Page): Promise<Snapshot> {
  return page.evaluate((names) => {
    const out: Record<string, Record<string, string>> = {};
    for (const [where, sel] of [['ws', '.rdd-workspace'], ['tb', '.rdd-toolbar-strip']]) {
      const host = document.querySelector(sel)!;
      const probe = document.createElement('div');
      host.appendChild(probe);
      for (const n of names) {
        probe.style.cssText = `background-color: var(${n}); box-shadow: var(${n}); color: var(${n})`;
        const cs = getComputedStyle(probe);
        out[`token ${n} @${where}`] = { 'background-color': cs.backgroundColor, 'box-shadow': cs.boxShadow, color: cs.color };
      }
      probe.remove();
    }
    return out;
  }, TOKENS);
}

/** Hovers each control in turn and records it (and what it contains) while hovered. */
const HOVERS = [
  '[aria-label="Action 1"]',
  '[aria-label="Radio 2"]',
  '.rdd-sidebar-tab-btn[title="Tab B"]',
  '.rdd-workspace-tab:has-text("Extra tab number 0")',
  '.rdd-workspace-tab:has-text("Panel Three")',
  '.rdd-floating-window-titlebar .rdd-custom-tab-btn',
  '.rdd-taskbar-glassmorphic-item',
];

async function hoverSnapshots(skin: string, cs: string, brand = ''): Promise<Snapshot> {
  const { page, close } = await openBase(skin, cs, brand);
  const out: Snapshot = {};
  for (const sel of HOVERS) {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) { out[`hover ${sel} MISSING`] = {}; continue; }
    await loc.hover({ force: true });
    await settle(page, 350); // past the hover transitions
    const marker = `data-rdd-probe-${HOVERS.indexOf(sel)}`;
    await loc.evaluate((el, m) => el.setAttribute(m, ''), marker);
    Object.assign(out, await snapshot(page, `[${marker}]`, `hover ${sel} | `));
    await page.mouse.move(1, 1);
    // Fixed, not settled: leaving a control starts timers (a taskbar preview's dismissal) that change
    // nothing until they fire, so a stillness check cannot see them.
    await page.waitForTimeout(350);
  }
  await close();
  return out;
}

/** Every colour in a computed value, as [r, g, b, a] with r/g/b in 0–255. */
function colours(value: string): number[][] {
  const out: number[][] = [];
  const re = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g;
  for (let m; (m = re.exec(value));) {
    if (m[1]) {
      const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
      out.push([+r, +g, +b, +a]);
    } else {
      const [r, g, b, a = '1'] = m[2].split(/[\s/]+/).filter(Boolean);
      out.push([+r * 255, +g * 255, +b * 255, +a]);
    }
  }
  return out;
}

const skeleton = (value: string) => value.replace(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g, 'C');

function sameColours(a: string, b: string): boolean {
  if (skeleton(a) !== skeleton(b)) return false;
  const ca = colours(a), cb = colours(b);
  if (ca.length !== cb.length) return false;
  return ca.every((c, i) => c.every((v, j) => Math.abs(v - cb[i][j]) <= (j === 3 ? 0.005 : 1)));
}

const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const isRgb = (c: number[], rgb: number[]) => rgb.every((v, i) => Math.abs(c[i] - v) <= 1);

/** Each scene's own accent in 7.2.0 (vscode light gained #0066cc, the blue its light tokens used). */
const ACCENT: Record<string, [string, string]> = {
  vscode: ['#38bdf8', '#0066cc'], macos: ['#38bdf8', '#0066cc'], chrome: ['#8ab4f8', '#1a73e8'],
  slate: ['#38bdf8', '#0078d4'], nord: ['#88c0d0', '#5e81ac'], obsidian: ['#ffffff', '#000000'], tokyo: ['#bb9af7', '#9854f1'],
};
const accentOf = (skin: string, cs: string) => rgbOf(ACCENT[skin][cs === 'light' ? 1 : 0]);
/**
 * The only colours 7.2.0 may change without a brand: literals of the accent family that a skin
 * showed instead of its own accent — the default cyan and #0066cc left in other skins, and the
 * active-state blues/violet of slate, tokyo and obsidian — now drawn in the skin's own accent.
 * In obsidian, whose accent is white (dark) and black (light), that includes the white glows its
 * dark-scheme rules also drew in light mode.
 */
const STALE = [...new Set(Object.values(ACCENT).flat())].filter(h => h !== '#ffffff' && h !== '#000000').map(rgbOf)
  .concat([[96, 165, 250], [122, 162, 247], [56, 90, 246], [167, 139, 250]]);
const staleIn = (skin: string) => skin === 'obsidian' ? STALE.concat([[255, 255, 255], [0, 0, 0]]) : STALE;

/** True when `now` differs from `before` only by stale literals turned into the scene's accent at the same alpha. */
function intended(before: string, now: string, skin: string, cs: string): boolean {
  if (skeleton(before) !== skeleton(now)) return false;
  const cb = colours(before), cn = colours(now), acc = accentOf(skin, cs), stale = staleIn(skin);
  return cb.length === cn.length && cb.every((c, i) =>
    c.every((v, j) => Math.abs(v - cn[i][j]) <= (j === 3 ? 0.005 : 1)) ||
    (stale.some(s => isRgb(c, s)) && isRgb(cn[i], acc) && Math.abs(c[3] - cn[i][3]) <= 0.005));
}

async function captureScene(skin: string, cs: string, brand = ''): Promise<{ snap: Snapshot; errors: string[] }> {
  const { page, errors, close } = await openScene(skin, cs, brand);
  const snap = { ...await snapshot(page), ...await tokens(page) };
  await close();
  Object.assign(snap, await hoverSnapshots(skin, cs, brand));
  return { snap, errors };
}

/** `key prop` → "old -> new" for every colour that differs between two snapshots. */
function diff(base: Snapshot, now: Snapshot): Map<string, string> {
  const snap = foldFrost(now, base);
  const out = new Map<string, string>();
  for (const key of new Set([...Object.keys(base), ...Object.keys(snap)])) {
    // A token added since the baseline (e.g. --rdd-skin-font-family) is fine if it isn't a colour:
    // as a background it resolves to nothing. (Its `color` probe inherits the text colour instead.)
    if (!base[key] && key.startsWith('token ') && colours(snap[key]['background-color'] ?? '').every(c => c[3] === 0)
      && (snap[key]['box-shadow'] ?? 'none') === 'none') continue;
    if (!base[key] || !snap[key]) { out.set(key, base[key] ? 'gone' : 'new'); continue; }
    for (const p of new Set([...Object.keys(base[key]), ...Object.keys(snap[key])])) {
      if (!sameColours(base[key][p] ?? '', snap[key][p] ?? '')) out.set(`${key} ${p}`, `${base[key][p]} -> ${snap[key][p]}`);
    }
  }
  return out;
}

// Under heavy machine load a hover transition or an entrance can occasionally be caught
// mid-flight. A stylesheet change is deterministic, so a scene that differs is captured once more
// on a fresh page and only the differences both captures agree on count. The transient ones are
// logged, never silently dropped.
async function stableDiff(base: Snapshot, skin: string, cs: string): Promise<Map<string, string>> {
  const first = await captureScene(skin, cs);
  expect(first.errors).toEqual([]);
  const d1 = diff(base, first.snap);
  // Only an unexpected difference earns a second capture: the intended stale-accent changes are in
  // every capture, so recapturing for them doubled the cost of most scenes and proved nothing.
  if (![...d1].some(([, v]) => isUnexpected(v, skin, cs))) return d1;
  const d2 = diff(base, (await captureScene(skin, cs)).snap);
  const both = new Map([...d1].filter(([k]) => d2.has(k)));
  const transient = [...d1.keys(), ...d2.keys()].filter(k => !both.has(k));
  if (transient.length) console.warn(`branding ${skin}/${cs}: ${transient.length} transient difference(s), e.g. ${transient[0]}`);
  return both;
}

const lines = (d: Map<string, string>) => [...d].map(([k, v]) => `${k}: ${v}`);

/** A difference that is not one of the intended stale-accent changes: a missing key, or another colour. */
function isUnexpected(v: string, skin: string, cs: string): boolean {
  const [before, now] = v.split(' -> ');
  return now === undefined || !intended(before, now, skin, cs);
}

describe('branding baseline: no brand set renders as 7.1.3, except stale accent literals', () => {
  const baseline: Record<string, Snapshot> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
  const captured: Record<string, Snapshot> = {};
  let failed = false;

  for (const { skin, cs } of SCENES) {
    it(`${skin} / ${cs}`, async ({ onTestFailed }) => {
      // A timed-out test keeps running after vitest gives up on it; it must not feed the baseline.
      let over = false;
      onTestFailed(() => { over = true; failed = true; });
      if (WRITE) {
        // Two captures must agree before one becomes the baseline.
        const a = await captureScene(skin, cs), b = await captureScene(skin, cs);
        expect(a.errors).toEqual([]);
        expect(lines(diff(a.snap, b.snap)).slice(0, 20), 'the capture is not stable').toEqual([]);
        if (!over) captured[`${skin}/${cs}`] = a.snap;
        return;
      }
      const base = baseline[`${skin}/${cs}`];
      expect(base, 'no baseline — run with RDD_BRANDING_BASELINE=write').toBeDefined();
      const d = await stableDiff(base, skin, cs);
      const unexpected = new Map([...d].filter(([, v]) => isUnexpected(v, skin, cs)));
      if (process.env.RDD_BRANDING_REPORT) {
        appendFileSync(process.env.RDD_BRANDING_REPORT, lines(d).map(l => `${skin}/${cs} ${l}`).join('\n') + '\n');
      }
      expect(lines(unexpected).slice(0, 25)).toEqual([]);
    }, 240_000); // four page loads, two of them hover walks — slow on a loaded machine
  }

  if (WRITE) {
    // Merges the scenes this run captured (all 14, or those selected with -t) into the fixture.
    it('writes the baseline', () => {
      expect(failed, 'a scene failed; nothing written').toBe(false);
      expect(Object.keys(captured).length).toBeGreaterThan(0);
      mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify({ ...baseline, ...captured }));
    });
  }
});

// With a brand set, the brand colour must reach every skin and no trace of the skin's own accent
// (or the stale literals it used to show) may remain anywhere: rendered, hovered or as a token.
describe('branding: --rdd-brand-accent on :root reaches every skin', () => {
  const RED = '#e4002b';
  for (const { skin, cs } of SCENES) {
    it(`${skin} / ${cs}`, async () => {
      const { snap, errors } = await captureScene(skin, cs, `&ba=${RED.slice(1)}`);
      expect(errors).toEqual([]);
      const own = accentOf(skin, cs);
      const neutral = own.every(v => v === 0) || own.every(v => v === 255); // obsidian: white/black stay as text
      const leftovers: string[] = [];
      let branded = 0;
      for (const [key, rec] of Object.entries(snap)) {
        for (const [p, v] of Object.entries(rec)) {
          for (const c of colours(v)) {
            if (c[3] === 0) continue;
            if (isRgb(c, rgbOf(RED))) branded++;
            else if (STALE.some(s => isRgb(c, s)) || (!neutral && isRgb(c, own))) leftovers.push(`${key} ${p}: ${v}`);
          }
        }
      }
      expect(leftovers.slice(0, 20)).toEqual([]);
      expect(branded).toBeGreaterThan(40); // rendered, hover and token uses together
    }, 240_000);
  }
});

describe('branding: --rdd-brand-on-accent', () => {
  // Both schemes: light mode has its own primary-button rule (white text by default), which must
  // read the variable too — a yellow brand in light mode once got white text on yellow.
  for (const cs of ['dark', 'light']) {
    it(`${cs}: text on a solid accent fill uses it (a light brand colour with dark text)`, async () => {
      const { page, close } = await openScene('vscode', cs, '&ba=facc15&bon=1a1a1a');
      const btn = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('.rdd-btn-primary')!);
        return { bg: s.backgroundColor, fg: s.color };
      });
      await close();
      expect(colours(btn.bg)[0].slice(0, 3)).toEqual([250, 204, 21]);
      expect(colours(btn.fg)[0].slice(0, 3)).toEqual([26, 26, 26]);
    });
  }
});

// Brand surfaces (7.3.0): with --rdd-brand-surface and --rdd-brand-text set, every skin draws its
// surfaces from those two colours — no background or text colour of any skin's own palette remains,
// the layers stay distinct, and the text stays readable. With only one of them set, nothing changes.
describe('branding: --rdd-brand-surface / --rdd-brand-text reach every skin', () => {
  const BRAND = { dark: { bs: '0b1f3a', bt: 'e8eef7' }, light: { bs: 'f4f1ec', bt: '2b2620' } } as const;
  const query = (cs: string) => `&bs=${BRAND[cs as 'dark'].bs}&bt=${BRAND[cs as 'dark'].bt}`;

  /**
   * Every skin colour a brand surface replaces: the fallbacks written inside var(--rdd--b-…, <colour>).
   * Pure white and black are left out — they are also the neutral tints and shades every skin keeps.
   */
  const PALETTE = [...readFileSync(join(__dirname, '..', '..', 'src', 'index.css'), 'utf8')
    .matchAll(/var\(--rdd--b-[\w-]+, (#[0-9a-fA-F]{6}|rgb\((\d+) (\d+) (\d+)\))\)/g)]
    .map(m => m[1].startsWith('#') ? rgbOf(m[1]) : [+m[2], +m[3], +m[4]])
    .filter(c => !c.every(v => v === 0) && !c.every(v => v === 255));

  const luminance = (c: number[]) => {
    const [r, g, b] = c.slice(0, 3).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  /** `top` composited over the opaque `under` (macOS panels are glass over the workspace). */
  const over = (top: number[], under: number[]) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));
  const token = (snap: Snapshot, name: string) => colours(snap[`token ${name} @ws`]?.['background-color'] ?? '')[0] ?? [0, 0, 0, 0];

  it('the palette the check looks for is not empty', () => {
    expect(PALETTE.length).toBeGreaterThan(100);
  });

  for (const { skin, cs } of SCENES) {
    it(`${skin} / ${cs}`, async () => {
      const { snap, errors } = await captureScene(skin, cs, query(cs));
      expect(errors).toEqual([]);
      const leftovers: string[] = [];
      for (const [key, rec] of Object.entries(snap)) {
        for (const [p, v] of Object.entries(rec)) {
          for (const c of colours(v)) {
            // Text on a solid accent fill is --rdd-brand-on-accent's, not a surface (its default,
            // #090b11, is also the default backdrop).
            if (/rdd-btn-primary|rdd-dock-target-box--active/.test(key) && /^(color|outline-color)$/.test(p)) continue;
            if (c[3] > 0 && PALETTE.some(s => isRgb(c, s))) leftovers.push(`${key} ${p}: ${v}`);
          }
        }
      }
      expect(leftovers.slice(0, 20)).toEqual([]);

      const workspace = token(snap, '--rdd-bg-workspace');
      const panel = over(token(snap, '--rdd-bg-panel'), workspace);
      const tabBar = over(token(snap, '--rdd-bg-tab-bar'), workspace);
      const layers = [workspace.slice(0, 3), panel, tabBar].map(c => c.map(Math.round).join(','));
      expect(new Set(layers).size, `workspace / panel / tab bar: ${layers.join(' | ')}`).toBe(3);
      expect(contrast(token(snap, '--rdd-text-primary'), panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(snap, '--rdd-text-secondary'), panel)).toBeGreaterThanOrEqual(3);
    }, 240_000);
  }

  // Both inputs, or neither: one alone must leave every skin exactly as unbranded.
  for (const [skin, cs, only] of [['vscode', 'dark', 'bs'], ['nord', 'light', 'bt']] as const) {
    it(`only ${only === 'bs' ? '--rdd-brand-surface' : '--rdd-brand-text'} set: ${skin} / ${cs} is unchanged`, async () => {
      const baseline: Record<string, Snapshot> = JSON.parse(readFileSync(FIXTURE, 'utf8'));
      const { snap, errors } = await captureScene(skin, cs, `&${only}=${BRAND[cs][only]}`);
      expect(errors).toEqual([]);
      const unexpected = [...diff(baseline[`${skin}/${cs}`], snap)].filter(([, v]) => {
        const [before, now] = v.split(' -> ');
        return now === undefined || !intended(before, now, skin, cs);
      });
      expect(lines(new Map(unexpected)).slice(0, 25)).toEqual([]);
    }, 240_000);
  }
});
