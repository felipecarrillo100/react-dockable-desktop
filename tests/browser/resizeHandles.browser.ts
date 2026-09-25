import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, rectOf, drag, type Rect } from './lib';

// Resize handles straddle a window's edge (half outside, half inside). The window's own
// `overflow: hidden` used to clip the outer half — and its rounded corner clipped the corner
// handles — so only ~4px of an 8px edge handle could be grabbed, and a corner drag often hit
// the grid behind instead.

const hitsHandle = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  return el?.classList.contains('rdd-resize-handle') ? [...el.classList].find(c => c.startsWith('rdd-resize-') && c !== 'rdd-resize-handle') : (el?.className || 'nothing');
}, [x, y]);

const edgesOf = (r: Rect) => ({
  n: [r.x + r.width / 2, r.y - 2],
  s: [r.x + r.width / 2, r.bottom + 2],
  e: [r.right + 2, r.y + r.height / 2],
  w: [r.x - 2, r.y + r.height / 2],
});

describe('floating window resize handles', () => {
  it('can be grabbed just outside each edge', async () => {
    const { page, close } = await openHarness();
    const win = await rectOf(page, '.rdd-floating-window');
    for (const [dir, [x, y]] of Object.entries(edgesOf(win))) {
      expect(await hitsHandle(page, x, y), `2px outside the ${dir} edge`).toBe(`rdd-resize-${dir}`);
    }
    await close();
  });

  it('the corner handles are not clipped by the rounded corner', async () => {
    const { page, close } = await openHarness();
    const win = await rectOf(page, '.rdd-floating-window');
    expect(await hitsHandle(page, win.right - 2, win.bottom - 2)).toBe('rdd-resize-se');
    expect(await hitsHandle(page, win.x + 1, win.y + 1)).toBe('rdd-resize-nw');
    expect(await hitsHandle(page, win.right + 2, win.bottom + 2)).toBe('rdd-resize-se');
    await close();
  });

  it('a drag started outside the east edge resizes by the pointer delta', async () => {
    const { page, close } = await openHarness();
    const win = await rectOf(page, '.rdd-floating-window');
    const y = win.y + win.height / 2;
    await drag(page, win.right + 2, y, win.right + 82, y);
    const after = await rectOf(page, '.rdd-floating-window');
    expect(Math.round(after.width - win.width)).toBe(80);
    await close();
  });

  it('title bar and body are still clipped to the rounded frame', async () => {
    const { page, close } = await openHarness();
    const clip = await page.evaluate(() => {
      const frame = document.querySelector('.rdd-floating-window-frame') as HTMLElement | null;
      if (!frame) return null;
      const cs = getComputedStyle(frame);
      return { overflow: cs.overflow, radius: cs.borderTopLeftRadius, holdsTitle: !!frame.querySelector('.rdd-floating-window-titlebar') };
    });
    expect(clip).toEqual({ overflow: 'hidden', radius: expect.stringMatching(/[1-9]/), holdsTitle: true });
    await close();
  });
});

describe('inner floating widget resize handles', () => {
  it('can be grabbed just outside its edges, and a drag from there resizes it', async () => {
    const { page, close } = await openHarness('ov=1');
    const w = await rectOf(page, '.rdd-panel-float');
    expect(await hitsHandle(page, w.right + 2, w.y + w.height / 2)).toBe('rdd-resize-e');
    expect(await hitsHandle(page, w.x + w.width / 2, w.bottom + 2)).toBe('rdd-resize-s');
    // South, not east: the harness hosts the widget in a narrow group, so it has room to grow
    // downward but is clamped sideways.
    const x = w.x + w.width / 2;
    await drag(page, x, w.bottom + 2, x, w.bottom + 62);
    const after = await rectOf(page, '.rdd-panel-float');
    expect(Math.round(after.height - w.height)).toBe(60);
    await close();
  });
});
