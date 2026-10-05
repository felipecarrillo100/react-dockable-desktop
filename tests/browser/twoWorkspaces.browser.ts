import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, actions, drag, rectOf, settle } from './lib';

// Two workspaces on one page, each with its own provider (harness `two=1`). Before 7.7.1 the panel DOM
// cache was shared: the first workspace's cleanup deleted the second's cached elements, and the second's
// panels came back blank — typed text, scroll and React state gone — the next time it rendered.

const second = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => {
  const wm = (window as unknown as { __wm2: { actions: Record<string, (...x: unknown[]) => void> } }).__wm2;
  wm.actions[f as string](...(a as unknown[]));
}, [fn, args] as const);

describe('two workspaces on one page', () => {
  it("dragging and closing in one leaves the other's panel content, input and scroll intact", async () => {
    const { page, errors, close } = await openHarness('two=1');
    await page.waitForSelector('#in-b1');

    // State in the second workspace's panel: typed text, a scroll offset, and a marker on its DOM.
    await page.fill('#in-b1', 'typed in the second workspace');
    await page.evaluate(() => {
      (document.getElementById('sc-b1') as HTMLElement).scrollTop = 400;
      (document.getElementById('content-b1') as HTMLElement).dataset.marker = 'original';
    });
    await page.waitForTimeout(100);

    // A real tab drag in the first workspace, then a close there: its cache cleanup runs.
    const from = await rectOf(page, '#first [data-tab-id="p1"]');
    const to = await rectOf(page, '#first [data-tab-id="p3"]');
    await drag(page, from.x + from.width / 2, from.y + from.height / 2, to.x + to.width / 2, to.y + 60);
    await actions(page, 'closePanel', 'p2');
    await settle(page, 300);

    // The second workspace renders again — when a deleted cache entry used to swap in an empty element.
    await second(page, 'openPanel', 'b3', 'probe', { title: 'Bee Three' });
    await second(page, 'focusPanel', 'b1');
    await settle(page, 300);

    expect(await page.locator('#in-b1').count()).toBe(1);
    expect(await page.inputValue('#in-b1')).toBe('typed in the second workspace');
    expect(await page.evaluate(() => (document.getElementById('content-b1') as HTMLElement).dataset.marker)).toBe('original');
    expect(await page.evaluate(() => (document.getElementById('sc-b1') as HTMLElement).scrollTop)).toBe(400);
    expect(errors).toEqual([]);
    await close();
  });
});
