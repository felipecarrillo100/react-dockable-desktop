import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { openHarness, actions } from './lib';

// Branding (7.2.0): --rdd-brand-accent / --rdd-brand-on-accent set on :root must reach every
// built-in skin, and with neither set every skin must render exactly as before.
//
// The baseline is the computed colours of every rdd- element (and its ::before/::after) in 14
// scenes, 7 skins × dark/light, with the chrome opened. Regenerate it only for an intended visual
// change: RDD_BRANDING_BASELINE=write npm run test:browser -- branding

const SKINS = ['vscode', 'macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo'];
const SCHEMES = ['dark', 'light'];
const SCENES = SKINS.flatMap(skin => SCHEMES.map(cs => ({ skin, cs })));
const FIXTURE = join(__dirname, 'fixtures', 'branding-baseline.json');
const WRITE = process.env.RDD_BRANDING_BASELINE === 'write';

type Snapshot = Record<string, Record<string, string>>;

const TOKENS = [...new Set(readFileSync(join(__dirname, '..', '..', 'src', 'index.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').match(/--rdd-[a-z0-9-]+(?=\s*:)/g) ?? [])];

/** Opens a scene with the active states on: a selected sidebar tab, radio and toggle, a focused tab, a taskbar item. */
async function openBase(skin: string, cs: string, brand: string) {
  const h = await openHarness(`skin=${skin}&cs=${cs}&anim=0&tbx=1&ntabs=1${brand}`);
  const { page } = h;
  await actions(page, 'minimizePanel', 'p2'); // a taskbar item
  await page.click('.rdd-sidebar-tab-btn[title="Tab A"]');
  await page.click('[aria-label="Radio 1"]');
  await page.click('.rdd-workspace-tab:has-text("Panel One")');
  await page.waitForTimeout(200);
  return h;
}

async function openScene(skin: string, cs: string, brand = ''): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const h = await openBase(skin, cs, brand);
  const { page } = h;
  await page.click('.rdd-toolbar-btn-group'); // the flyout
  await page.evaluate(async () => {
    type Open = (c: unknown, p: object, o: object) => unknown;
    const wm = (window as unknown as { __wm: { overlays: { openLeftPanel: Open; openModal: Open }; Plain: unknown; RddConfirm: unknown; toast: (m: string) => void } }).__wm;
    await wm.overlays.openLeftPanel(wm.Plain, {}, { title: 'Drawer' });
    wm.overlays.openModal(wm.RddConfirm, { message: 'Sure?' }, { title: 'Modal' }); // has the primary button
    wm.toast('hello');
  });
  await page.locator('#ctx').dispatchEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true });
  await page.waitForTimeout(700);
  return h;
}

const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'fill', 'stroke'];

/**
 * Colour-bearing computed properties of every rdd- element (under `root`, default the whole page)
 * and its pseudo-elements, keyed by a DOM path, prefixed with `tag`.
 */
function snapshot(page: Page, root = 'body', tag = ''): Promise<Snapshot> {
  return page.evaluate(([props, rootSel, prefix]) => {
    const out: Record<string, Record<string, string>> = {};
    const seg = (el: Element) => {
      const parent = el.parentElement;
      const idx = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
      return `${el.tagName.toLowerCase()}${[...el.classList].filter(c => c.startsWith('rdd-')).map(c => '.' + c).join('')}:${idx}`;
    };
    const path = (el: Element) => { const p: string[] = []; for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) p.unshift(seg(e)); return p.join('>'); };
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
    await page.waitForTimeout(350); // past the hover transitions
    const marker = `data-rdd-probe-${HOVERS.indexOf(sel)}`;
    await loc.evaluate((el, m) => el.setAttribute(m, ''), marker);
    Object.assign(out, await snapshot(page, `[${marker}]`, `hover ${sel} | `));
    await page.mouse.move(1, 1);
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
function diff(base: Snapshot, snap: Snapshot): Map<string, string> {
  const out = new Map<string, string>();
  for (const key of new Set([...Object.keys(base), ...Object.keys(snap)])) {
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
  if (!d1.size) return d1;
  const d2 = diff(base, (await captureScene(skin, cs)).snap);
  const both = new Map([...d1].filter(([k]) => d2.has(k)));
  const transient = [...d1.keys(), ...d2.keys()].filter(k => !both.has(k));
  if (transient.length) console.warn(`branding ${skin}/${cs}: ${transient.length} transient difference(s), e.g. ${transient[0]}`);
  return both;
}

const lines = (d: Map<string, string>) => [...d].map(([k, v]) => `${k}: ${v}`);

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
      const unexpected = new Map([...d].filter(([, v]) => {
        const [before, now] = v.split(' -> ');
        return now === undefined || !intended(before, now, skin, cs);
      }));
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
  it('text on a solid accent fill uses it (a light brand colour with dark text)', async () => {
    const { page, close } = await openScene('vscode', 'dark', '&ba=facc15&bon=1a1a1a');
    const btn = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.rdd-btn-primary')!);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    await close();
    expect(colours(btn.bg)[0].slice(0, 3)).toEqual([250, 204, 21]);
    expect(colours(btn.fg)[0].slice(0, 3)).toEqual([26, 26, 26]);
  });
});
