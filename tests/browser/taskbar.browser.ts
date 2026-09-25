import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, actions } from './lib';

// The autohide taskbar must never slide away while the pointer is on it — a press there would be
// lost. Two ways it used to: a panel minimized while the pointer was already on the taskbar (its
// 2s auto-collapse timer was never cleared), and a quick leave and re-enter (the 400ms timer
// overwrote the pending 2s one without clearing it, so re-entering cancelled only the 400ms one).
// "Away" is the top-left of the page: the preview above a taskbar item is a React child of the
// taskbar, so the pointer over it still counts as on the taskbar.

/** Moves the pointer onto the middle of the taskbar (measured: its height depends on the layout). */
async function ontoTaskbar(page: Page) {
  const r = await page.evaluate(() => { const b = document.querySelector('.rdd-taskbar-footer-container')!.getBoundingClientRect(); return { x: b.x + 40, y: b.y + b.height / 2 }; });
  await page.mouse.move(r.x, r.y);
}

const expanded = (page: Page) => page.evaluate(() =>
  document.querySelector('.rdd-taskbar-footer-container')?.classList.contains('rdd-taskbar-expanded') ?? null);

describe('autohide taskbar', () => {
  it('stays open when a panel is minimized while the pointer is on it', async () => {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    await page.waitForTimeout(300);
    await ontoTaskbar(page);
    await page.waitForTimeout(300);
    await actions(page, 'minimizePanel', 'p1');
    await page.waitForTimeout(2400);
    expect(await expanded(page)).toBe(true);
    await close();
  });

  it('stays open after a quick leave and re-enter', async () => {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    await page.waitForTimeout(200);
    await ontoTaskbar(page);                 // on it while the 2s timer is pending…
    await page.waitForTimeout(100);
    await actions(page, 'minimizePanel', 'p1'); // …and a new one starts while it is there
    await page.waitForTimeout(200);
    await page.mouse.move(150, 150);         // leave: the 400ms timer
    await page.waitForTimeout(100);
    await ontoTaskbar(page);                 // back within 400ms
    await page.waitForTimeout(2300);
    expect(await expanded(page)).toBe(true);
    await close();
  });

  it('a leftover timer never cuts short the grace period after leaving', async () => {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    await page.waitForTimeout(300);
    await ontoTaskbar(page);
    await actions(page, 'minimizePanel', 'p1');  // a 2s timer starts while the pointer is on it (t=0)
    await page.waitForTimeout(100);
    await page.mouse.move(150, 150);           // leave (400ms)…
    await page.waitForTimeout(100);
    await ontoTaskbar(page);                   // …and back
    await page.waitForTimeout(1600);
    await page.mouse.move(150, 150);           // leave for good at t≈1.8s: collapse due at t≈2.2s
    await page.waitForTimeout(250);            // t≈2.05s: a leftover 2s timer would already have fired
    expect(await expanded(page)).toBe(true);
    await page.waitForTimeout(500);
    expect(await expanded(page)).toBe(false);
    await close();
  });

  it('collapses once the pointer has left (control)', async () => {
    const { page, close } = await openHarness();
    await actions(page, 'minimizePanel', 'p2');
    await page.waitForTimeout(300);
    await ontoTaskbar(page);
    await page.waitForTimeout(300);
    await page.mouse.move(150, 150);
    await page.waitForTimeout(800);
    expect(await expanded(page)).toBe(false);
    await close();
  });
});
