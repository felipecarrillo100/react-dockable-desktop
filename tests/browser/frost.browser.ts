import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness } from './lib';

// Frosted glass (7.4.0): a `backdrop-filter` on an element makes it the containing block for
// `position: fixed` descendants, so a consumer's fixed dropdown inside a frosted container was
// positioned against the container instead of the viewport — and which containers were frosted
// depended on the skin. The frost now sits on each container's ::before, which is not an ancestor
// of the content. Found by a consumer's field report; its console probe is the first test here.

interface Frosted { name: string; query: string; selector: string; open?: (page: Page) => Promise<void> }

const openDrawer = async (page: Page) => {
  await page.evaluate(async () => {
    type Open = (c: unknown, p: object, o: object) => unknown;
    const wm = (window as unknown as { __wm: { overlays: { openLeftPanel: Open }; Plain: unknown } }).__wm;
    await wm.overlays.openLeftPanel(wm.Plain, {}, { title: 'Drawer' });
  });
  await page.waitForSelector('.rdd-side-panel');
  await page.waitForTimeout(400);
};

/** Every container that hosts consumer content and a skin frosts. */
const FROSTED: Frosted[] = [
  { name: 'floating window', query: 'anim=0', selector: '.rdd-floating-window' },
  { name: 'floating window, macos', query: 'anim=0&skin=macos', selector: '.rdd-floating-window' },
  { name: 'side panel', query: 'anim=0', selector: '.rdd-side-panel', open: openDrawer },
  { name: 'docked panel, macos', query: 'anim=0&skin=macos', selector: '.rdd-workspace-panel' },
  { name: 'overlay widget', query: 'anim=0&ov=1', selector: '.rdd-panel-float' },
  { name: 'frosted panel toolbar', query: 'anim=0&ov=1&pt=frosted', selector: '.rdd-panel-toolbar[data-variant="frosted"]' },
  { name: 'frosted panel toolbar, light', query: 'anim=0&ov=1&pt=frosted&cs=light', selector: '.rdd-panel-toolbar[data-variant="frosted"]' },
];

/**
 * How far a `position: fixed; right: 0; bottom: 0` child of `selector` lands from the viewport's
 * bottom-right corner — [0, 0] when the viewport is its containing block. (The bottom-right corner,
 * not the top-left: a left-hand drawer's own origin *is* the viewport's top-left.)
 */
const probe = (page: Page, selector: string) => page.evaluate((sel) => {
  const host = document.querySelector(sel);
  if (!host) return null;
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;right:0;bottom:0;width:10px;height:10px';
  host.appendChild(p);
  const r = p.getBoundingClientRect();
  p.remove();
  return [Math.round(innerWidth - r.right), Math.round(innerHeight - r.bottom)];
}, selector);

describe('frost: a fixed child of a frosted container is positioned against the viewport', () => {
  for (const f of FROSTED) {
    it(f.name, async () => {
      const { page, errors, close } = await openHarness(f.query);
      await f.open?.(page);
      const at = await probe(page, f.selector);
      // Not vacuous: the container is there and is still frosted (by itself or its ::before).
      const frosted = await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        const own = getComputedStyle(el).backdropFilter, before = getComputedStyle(el, '::before').backdropFilter;
        return [own, before].some(v => v && v !== 'none');
      }, f.selector);
      await close();
      expect(errors).toEqual([]);
      expect(frosted, 'the container is no longer frosted at all').toBe(true);
      expect(at).toEqual([0, 0]);
    });
  }
});

/**
 * The pixels are unchanged: each frosted container is screenshotted over a striped background as
 * it renders now (frost on ::before), then with the frost moved back onto the element itself —
 * the pre-7.4.0 rule — and the two must match.
 */
describe('frost: moving the blur to ::before does not change what is drawn', () => {
  const STRIPES = '.probe-scroller > div, .rdd-workspace { background: repeating-linear-gradient(45deg, #e11 0 6px, #11e 6px 12px, #1b1 12px 18px) !important; }';

  /** Mean absolute difference (0–255) and the share of pixels differing by more than 24, computed in Chrome. */
  async function compare(page: Page, a: Buffer, b: Buffer): Promise<{ mean: number; off: number }> {
    return page.evaluate(async ([x, y]) => {
      const load = (src: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const [ia, ib] = [await load(x), await load(y)];
      const px = (img: HTMLImageElement) => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let sum = 0, off = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        sum += d; if (d > 24) off++;
      }
      const n = da.length / 4;
      return { mean: sum / n, off: off / n };
    }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`] as const);
  }

  for (const f of FROSTED) {
    it(f.name, async () => {
      const { page, errors, close } = await openHarness(f.query);
      await page.addStyleTag({ content: STRIPES });
      await f.open?.(page);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      const el = page.locator(f.selector).first();
      const now = await el.screenshot();
      // The pre-7.4.0 rule: the ::before's frost, if any, back on the element.
      const moved = await page.evaluate((sel) => {
        const e = document.querySelector(sel) as HTMLElement;
        const before = getComputedStyle(e, '::before').backdropFilter;
        if (!before || before === 'none') return false;
        const s = document.createElement('style');
        s.textContent = `${sel}::before { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`;
        document.head.appendChild(s);
        e.style.setProperty('backdrop-filter', before, 'important');
        return true;
      }, f.selector);
      await page.waitForTimeout(200);
      const then = await el.screenshot();
      const d = await compare(page, now, then);
      await close();
      expect(errors).toEqual([]);
      // Before the change there is nothing on ::before to move, and the two shots are the same page.
      if (moved) {
        expect(d.mean, `mean difference ${d.mean.toFixed(2)}`).toBeLessThan(1.5);
        expect(d.off, `${(d.off * 100).toFixed(2)}% of pixels differ by more than 24`).toBeLessThan(0.01);
      }
    });
  }
});
