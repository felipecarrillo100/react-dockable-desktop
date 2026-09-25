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
