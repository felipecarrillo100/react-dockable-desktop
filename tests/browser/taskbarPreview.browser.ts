import { describe, it, expect } from 'vitest';
import { openHarness, actions } from './lib';

describe('taskbar preview', () => {
  it('counter-scales a canvas inside a [data-rdd-preview-unscale] box, so it renders at full resolution', async () => {
    const { page, errors, close } = await openHarness('canvas=1');
    await actions(page, 'minimizePanel', 'cv');
    await page.mouse.move(640, 798); // reveal the autohide taskbar
    await page.waitForTimeout(400);
    const item = page.locator('.rdd-taskbar-glassmorphic-item').first();
    await item.hover();
    await page.waitForSelector('.rdd-taskbar-item-preview-host canvas', { timeout: 5000 });
    await page.waitForTimeout(300);
    const transform = await page.evaluate(() => {
      const c = document.querySelector('.rdd-taskbar-item-preview-host canvas') as HTMLElement;
      return getComputedStyle(c).transform;
    });
    // matrix(a, 0, 0, d, …) with a = d = 1 / --rdd-preview-scale > 1
    const scale = Number(/matrix\(([^,]+)/.exec(transform)?.[1]);
    expect(transform).not.toBe('none');
    expect(scale).toBeGreaterThan(1);
    expect(errors).toEqual([]);
    await close();
  });
});

// The preview fades in while the pointer is still on its icon. It used to start 10% of its own
// height lower than its resting place — over the whole 38px icon — so a quick click right after
// arriving pressed on the preview and released on the icon, and neither received the click.
describe('a click on a minimized panel\'s taskbar icon', () => {
  async function clickIcon(dy: number, waitBeforeDown: number, hold: number) {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    await page.mouse.move(640, 798);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const b = document.querySelector('.rdd-taskbar-glassmorphic-item')!.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y }; });
    await page.mouse.move(r.x + 200, r.y + 19);
    await page.waitForTimeout(100);
    await page.mouse.move(r.x, r.y + dy);
    await page.waitForTimeout(waitBeforeDown);
    await page.mouse.down();
    await page.waitForTimeout(hold);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => (window as unknown as { __wm: { state: { panels: Record<string, { state: string }> } } }).__wm.state.panels.p2.state);
    await close();
    return state;
  }
  for (const [dy, wait, hold] of [[19, 20, 30], [19, 20, 150], [6, 10, 120]] as const) {
    it(`restores the panel when pressed ${wait}ms after arriving, ${dy}px below the icon's top, held ${hold}ms`, async () => {
      expect(await clickIcon(dy, wait, hold)).not.toBe('minimized');
    });
  }
  it('with the preview at rest, the icon itself is under its top edge', async () => {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    await page.mouse.move(640, 798);
    await page.waitForTimeout(400);
    const item = page.locator('.rdd-taskbar-glassmorphic-item').first();
    await item.hover();
    await page.waitForTimeout(500);
    const hit = await page.evaluate(() => {
      const b = document.querySelector('.rdd-taskbar-glassmorphic-item')!.getBoundingClientRect();
      const e = document.elementFromPoint(b.x + b.width / 2, b.y + 2);
      return e?.closest('.rdd-taskbar-item-tooltip') ? 'preview' : e?.closest('.rdd-taskbar-glassmorphic-item') ? 'icon' : e?.tagName;
    });
    expect(hit).toBe('icon');
    await close();
  });
});

// The preview's resting transform must be in its class, not only in the fade-in keyframe's end
// state: with animations off there is no keyframe, and the preview would sit on its icon.
describe('the taskbar preview with animations off (anim=0)', () => {
  it('sits above its icon, and a quick click on the icon restores the panel', async () => {
    const { page, close } = await openHarness('anim=0');
    await actions(page, 'minimizePanel', 'p2');
    await page.mouse.move(640, 798);
    await page.waitForTimeout(400);
    const item = page.locator('.rdd-taskbar-glassmorphic-item').first();
    await item.hover();
    await page.waitForSelector('.rdd-taskbar-item-tooltip');
    const { tipBottom, iconTop, x, y } = await page.evaluate(() => {
      const t = document.querySelector('.rdd-taskbar-item-tooltip')!.getBoundingClientRect();
      const i = document.querySelector('.rdd-taskbar-glassmorphic-item')!.getBoundingClientRect();
      return { tipBottom: t.bottom, iconTop: i.top, x: i.x + i.width / 2, y: i.y + i.height / 2 };
    });
    expect(tipBottom).toBeLessThanOrEqual(iconTop);
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => (window as unknown as { __wm: { state: { panels: Record<string, { state: string }> } } }).__wm.state.panels.p2.state);
    expect(state).not.toBe('minimized');
    await close();
  });
});
