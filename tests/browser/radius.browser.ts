import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { SCENES, openScene, FROSTED } from './scenes';
import { settle } from './lib';

// Corners (7.3.0): --rdd-radius-scale multiplies every corner the library draws — 0 square, 1 each
// skin's own, 1.5 rounder — except circles and pills, which stay round. Unset, every corner must
// be exactly what 7.2.0 drew.
//
// The baseline is the four computed corner radii of every rdd- element (and its ::before/::after)
// in the 14 branding scenes. Regenerate it only for an intended change of shape:
// RDD_RADIUS_BASELINE=write npm run test:browser -- radius

const FIXTURE = join(__dirname, 'fixtures', 'radius-baseline.json');
const WRITE = process.env.RDD_RADIUS_BASELINE === 'write';
const CORNERS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];

type Radii = Record<string, string[]>;

/** Every rdd- element's four corners, keyed by a DOM path; elements with no rounded corner are left out. */
function radii(page: Page): Promise<Radii> {
  return page.evaluate((corners) => {
    const out: Record<string, string[]> = {};
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
    for (const el of document.querySelectorAll('[class*="rdd-"]')) {
      if (!el.className) continue;
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
        const r = corners.map(c => cs.getPropertyValue(c));
        if (r.every(v => v === '0px')) continue;
        out[path(el) + pseudo] = r;
      }
    }
    return out;
  }, CORNERS).then(all => Object.fromEntries(Object.entries(all)
    // A frosted container's ::before (7.4.0) takes border-radius: inherit — its corners are its element's.
    .filter(([key]) => !(key.endsWith('::before') && FROSTED.test(key.slice(0, -8).split('>').pop() ?? '')))));
}

async function capture(skin: string, cs: string, extra = ''): Promise<{ r: Radii; errors: string[] }> {
  const { page, errors, close } = await openScene(skin, cs, extra);
  const r = await radii(page);
  await close();
  return { r, errors };
}

/** A circle or a pill: kept round at every scale. */
const round = (v: string) => v === '50%' || v === '999px';
const px = (v: string) => /^-?[\d.]+px$/.test(v) ? parseFloat(v) : NaN;

/** What each baseline corner must be at `scale`, as a check on the value measured. */
function expected(base: string, scale: number): (v: string) => boolean {
  if (round(base) || Number.isNaN(px(base))) return v => v === base;
  return v => Math.abs(px(v) - px(base) * scale) <= 0.01;
}

function mismatches(base: Radii, now: Radii, scale: number): string[] {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(now)])) {
    const b = base[key] ?? ['0px', '0px', '0px', '0px'];
    const n = now[key] ?? ['0px', '0px', '0px', '0px'];
    b.forEach((v, i) => { if (!expected(v, scale)(n[i])) out.push(`${key} ${CORNERS[i]}: ${v} -> ${n[i]} (scale ${scale})`); });
  }
  return out;
}

if (WRITE) {
  describe('radius baseline: --rdd-radius-scale unset draws the corners of 7.2.0', () => {
    const baseline: Record<string, Radii> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
    const captured: Record<string, Radii> = {};
    let failed = false;

    for (const { skin, cs } of SCENES) {
      it(`${skin} / ${cs}`, async ({ onTestFailed }) => {
        let over = false;
        onTestFailed(() => { over = true; failed = true; });
        // Two captures, each on a fresh page, must agree before one becomes the baseline.
        const a = await capture(skin, cs), b = await capture(skin, cs);
        expect(a.errors).toEqual([]);
        expect(mismatches(a.r, b.r, 1).slice(0, 20), 'the capture is not stable').toEqual([]);
        expect(Object.keys(a.r).length, 'no rounded corners captured').toBeGreaterThan(10);
        if (!over) captured[`${skin}/${cs}`] = a.r;
      }, 120_000);
    }

    it('writes the baseline', () => {
      expect(failed, 'a scene failed; nothing written').toBe(false);
      expect(Object.keys(captured).length).toBeGreaterThan(0);
      mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify({ ...baseline, ...captured }));
    });
  });
} else {
  // One page per scene for all three scales: --rdd-radius-scale is a custom property on :root (the
  // harness's `rs` parameter only sets it at start-up), so each scale is set on the open scene and
  // the page settles before its corners are read — the same values a fresh page per scale gave,
  // for a third of the page loads.
  const baseline: Record<string, Radii> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
  for (const { skin, cs } of SCENES) {
    describe(`radius: ${skin} / ${cs}`, () => {
      let scene: Awaited<ReturnType<typeof openScene>> | undefined;
      beforeAll(async () => { scene = await openScene(skin, cs); }, 60_000);
      afterAll(async () => { await scene?.close(); });

      const at = async (scale: number | null): Promise<Radii> => {
        const { page } = scene!;
        await page.evaluate(s => {
          if (s === null) document.documentElement.style.removeProperty('--rdd-radius-scale');
          else document.documentElement.style.setProperty('--rdd-radius-scale', String(s));
        }, scale);
        await settle(page, 700);
        return radii(page);
      };

      it('--rdd-radius-scale unset draws the corners of 7.2.0', async () => {
        const base = baseline[`${skin}/${cs}`];
        expect(base, 'no baseline — run with RDD_RADIUS_BASELINE=write').toBeDefined();
        const r = await at(null);
        expect(scene!.errors).toEqual([]);
        expect(mismatches(base, r, 1).slice(0, 25)).toEqual([]);
      }, 120_000);

      for (const scale of [0, 1.5]) {
        it(`--rdd-radius-scale: ${scale}`, async () => {
          const base = baseline[`${skin}/${cs}`];
          expect(base).toBeDefined();
          const r = await at(scale);
          expect(scene!.errors).toEqual([]);
          expect(mismatches(base, r, scale).slice(0, 25)).toEqual([]);
          // Not vacuous: the scene has corners the scale is meant to change.
          expect(Object.values(base).flat().filter(v => !round(v) && px(v) > 0).length).toBeGreaterThan(10);
        }, 120_000);
      }
    });
  }
}
