import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, actions } from './lib';

// One source of truth for direction (7.4.0): setDirection('rtl') mirrors the sidebar and the
// toasts too. A sidebar is usually an ancestor of the workspace and toasts are portalled to
// <body>, so neither received the workspace's own dir; an app that called setDirection and never
// set <html dir> got a mirrored desktop beside an unmirrored rail. Found by a consumer's field report.

const read = (page: Page) => page.evaluate(() => {
  const layout = document.querySelector('.rdd-sidebar-layout')!;
  const strip = document.querySelector('.rdd-sidebar-tabs-strip')!.getBoundingClientRect();
  const box = layout.getBoundingClientRect();
  const toasts = document.querySelector('.rdd-toast-container');
  return {
    sidebar: getComputedStyle(layout).direction,
    // With sb=left, the rail sits on the inline start: the left edge in LTR, the right in RTL.
    railOnRight: strip.left + strip.width / 2 > box.left + box.width / 2,
    toasts: toasts ? getComputedStyle(toasts).direction : 'missing',
  };
});

const toast = (page: Page) => page.evaluate(() => (window as unknown as { __wm: { toast: (m: string) => void } }).__wm.toast('hello'));

describe('direction: setDirection reaches the sidebar and the toasts', () => {
  it("follows setDirection('rtl') with no dir on the page, and back", async () => {
    const { page, errors, close } = await openHarness('anim=0');
    await toast(page);
    await page.waitForTimeout(200);
    const ltr = await read(page);
    await actions(page, 'setDirection', 'rtl');
    await page.waitForTimeout(200);
    const rtl = await read(page);
    await actions(page, 'setDirection', 'ltr');
    await page.waitForTimeout(200);
    const back = await read(page);
    const htmlDir = await page.evaluate(() => document.documentElement.dir);
    await close();
    expect(errors).toEqual([]);
    expect(htmlDir).toBe('');
    expect(ltr).toEqual({ sidebar: 'ltr', railOnRight: false, toasts: 'ltr' });
    expect(rtl).toEqual({ sidebar: 'rtl', railOnRight: true, toasts: 'rtl' });
    expect(back).toEqual(ltr);
  });

  it('still inherits the page direction when the workspace is left-to-right', async () => {
    const { page, close } = await openHarness('anim=0&dir=html');
    await toast(page);
    await page.waitForTimeout(200);
    const r = await read(page);
    await close();
    expect(r.sidebar).toBe('rtl');
    expect(r.toasts).toBe('rtl');
  });
});
