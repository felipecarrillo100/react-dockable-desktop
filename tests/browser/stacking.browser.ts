import { describe, it, expect } from 'vitest';
import { openHarness, actions, rectOf } from './lib';

// `zIndexBase` is how an app places the library's chrome above or below its own overlays (a MUI
// dialog at 1300, a Bootstrap modal at 1055). Everything the library stacks must move with it.

const zOf = (page: import('playwright-core').Page, sel: string) =>
  page.evaluate(s => { const e = document.querySelector(s); return e ? getComputedStyle(e).zIndex : 'MISSING'; }, sel);

describe('stacking follows zIndexBase', () => {
  it('the taskbar preview is stacked from the base, not at a fixed 999999', async () => {
    const { page, close } = await openHarness('zb=5000');
    await actions(page, 'minimizePanel', 'p2');
    await page.mouse.move(640, 798);
    await page.waitForTimeout(400);
    await page.locator('.rdd-taskbar-glassmorphic-item').first().hover();
    await page.waitForSelector('.rdd-taskbar-item-tooltip');
    expect(Number(await zOf(page, '.rdd-taskbar-item-tooltip'))).toBe(5000 + 8400);
    await close();
  });

  it('the dragged-tab ghost is stacked from the base', async () => {
    const { page, close } = await openHarness('zb=5000');
    const tab = await rectOf(page, '[data-tab-id="p1"]');
    await page.mouse.move(tab.x + 20, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.mouse.move(tab.x + 60, tab.y + 120, { steps: 8 });
    await page.waitForSelector('.rdd-drag-ghost-tab');
    const z = Number(await zOf(page, '.rdd-drag-ghost-tab'));
    await page.mouse.up();
    expect(z).toBe(5000 + 9300);
    await close();
  });

  it('split and sidebar resizer bars take their z-index from the stylesheet', async () => {
    const { page, close } = await openHarness();
    await page.click('.rdd-sidebar-tab-btn'); // open the drawer, which brings its resizer
    await page.waitForTimeout(300);
    const inline = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.rdd-resizer-bar')).map(e => e.style.zIndex));
    expect(inline.length).toBeGreaterThan(1);
    expect(inline.every(z => z === '')).toBe(true);
    expect(await zOf(page, '.rdd-resizer-bar')).toBe('21');
    await close();
  });

  it('an auto-hide taskbar stays above a floating window parked over the bottom edge', async () => {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    const ws = await rectOf(page, '.rdd-workspace');
    await actions(page, 'updateFloatingPosition', 'p4', { x: 100, y: ws.height - 200, width: 900, height: 300 });
    await page.waitForTimeout(200);
    await page.mouse.move(640, ws.bottom - 2); // reveal the bar
    await page.waitForTimeout(500);
    const item = await rectOf(page, '.rdd-taskbar-glassmorphic-item');
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('.rdd-taskbar-footer-container') ? 'taskbar' : el?.closest('.rdd-floating-window') ? 'floating window' : el?.className ?? 'nothing';
    }, [item.x + item.width / 2, item.y + item.height / 2]);
    expect(hit).toBe('taskbar');
    await close();
  });
});
