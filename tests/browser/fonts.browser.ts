import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness } from './lib';

// The host page's body font is Courier New (font=1). Every piece of library chrome must use
// --rdd-font-family instead — including chrome outside .rdd-workspace (toolbar, sidebar) and
// chrome portaled to <body> (menus, flyouts, drawers, modals). Before 6.4.0 there were four
// different stacks, and the toolbar and sidebar simply took the host page's font.

const CHROME = [
  '.rdd-workspace-tab',
  '.rdd-floating-window-title',
  '.rdd-toolbar-strip',
  '.rdd-toolbar-btn',
  '.rdd-sidebar-tabs-strip',
  '.rdd-sidebar-tab-btn',
  '.rdd-context-menu',
  '.rdd-toolbar-group-flyout',
  '.rdd-side-panel',
  '.rdd-modal-overlay',
];

async function openEverything(page: Page) {
  await page.click('.rdd-toolbar-btn-group');
  await page.evaluate(async () => {
    type Open = (c: unknown, p: object, o: object) => unknown;
    const wm = (window as unknown as { __wm: { overlays: { openLeftPanel: Open; openModal: Open }; Plain: unknown } }).__wm;
    await wm.overlays.openLeftPanel(wm.Plain, {}, { title: 'Drawer' });
    wm.overlays.openModal(wm.Plain, {}, { title: 'Modal' });
  });
  // Last, and dispatched rather than clicked: a click elsewhere would dismiss it, and the modal
  // now covers the trigger.
  await page.locator('#ctx').dispatchEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true });
  await page.waitForTimeout(300);
}

const fontsOf = (page: Page, selectors: string[]) => page.evaluate((sels) => {
  const out: Record<string, string> = {};
  for (const s of sels) {
    const el = document.querySelector(s);
    out[s] = el ? getComputedStyle(el).fontFamily : 'MISSING';
  }
  return out;
}, selectors);

describe('chrome font token', () => {
  it('every chrome root uses --rdd-font-family, not the host page font', async () => {
    const { page, errors, close } = await openHarness('font=1');
    await openEverything(page);
    const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--rdd-font-family').trim());
    expect(token).toMatch(/^['"]?Outfit/);
    const fonts = await fontsOf(page, CHROME);
    const wrong = Object.entries(fonts).filter(([, f]) => !/^['"]?Outfit/.test(f));
    expect(wrong).toEqual([]);
    expect(errors).toEqual([]);
    await close();
  });

  it("leaves the consumer's own form controls inside a panel alone", async () => {
    const { page, close } = await openHarness('font=1');
    const input = await page.evaluate(() => getComputedStyle(document.querySelector('#in-p2')!).fontFamily);
    expect(input).not.toMatch(/Outfit/);
    await close();
  });

  it('--rdd-font-family: inherit hands the choice to the host page', async () => {
    const { page, close } = await openHarness('font=1');
    await page.evaluate(() => document.documentElement.style.setProperty('--rdd-font-family', 'inherit'));
    await openEverything(page);
    const fonts = await fontsOf(page, CHROME.filter(s => s !== '.rdd-toolbar-btn' && s !== '.rdd-sidebar-tab-btn'));
    const wrong = Object.entries(fonts).filter(([, f]) => !/Courier New/.test(f));
    expect(wrong).toEqual([]);
    await close();
  });
});

// A custom property set to `inherit` copies its parent's value, so `inherit` below :root just
// copies the Outfit stack down. `initial` leaves it without a value: var() then fails, and
// font-family falls back to inheriting from the host.
describe('where --rdd-font-family can be set', () => {
  const tabFont = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.rdd-workspace-tab')!).fontFamily);
  it('initial on a wrapper hands the choice to the host page', async () => {
    const { page, close } = await openHarness('font=1');
    await page.evaluate(() => (document.querySelector('.rdd-fill-viewport') as HTMLElement).style.setProperty('--rdd-font-family', 'initial'));
    expect(await tabFont(page)).toMatch(/Courier New/);
    await close();
  });
  it('an explicit stack on a wrapper applies', async () => {
    const { page, close } = await openHarness('font=1');
    await page.evaluate(() => (document.querySelector('.rdd-fill-viewport') as HTMLElement).style.setProperty('--rdd-font-family', 'Georgia, serif'));
    expect(await tabFont(page)).toMatch(/Georgia/);
    await close();
  });
  it('inherit below :root does not (it copies the Outfit stack down)', async () => {
    const { page, close } = await openHarness('font=1');
    await page.evaluate(() => document.body.style.setProperty('--rdd-font-family', 'inherit'));
    expect(await tabFont(page)).toMatch(/Outfit/);
    await close();
  });
});

// The forms that reach every piece of chrome, including what is portaled to <body> (context menu,
// toolbar flyout, toasts): inherit on :root, or initial on <body>.
describe('--rdd-font-family forms that reach portaled chrome', () => {
  const PORTALED = ['.rdd-workspace-tab', '.rdd-context-menu', '.rdd-toolbar-group-flyout', '.rdd-toast'];
  const openPortaled = async (page: Page) => {
    await page.click('.rdd-toolbar-btn-group');
    await page.evaluate(() => (window as unknown as { __wm: { toast: (m: string) => void } }).__wm.toast('hello'));
    await page.locator('#ctx').dispatchEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true });
    await page.waitForTimeout(300);
  };
  for (const [label, apply] of [
    ['inherit on :root', () => document.documentElement.style.setProperty('--rdd-font-family', 'inherit')],
    ['initial on <body>', () => document.body.style.setProperty('--rdd-font-family', 'initial')],
  ] as const) {
    it(`${label}: tab, context menu, flyout and toast all use the page font`, async () => {
      const { page, close } = await openHarness('font=1');
      await page.evaluate(apply);
      await openPortaled(page);
      const fonts = await fontsOf(page, PORTALED);
      expect(Object.entries(fonts).filter(([, f]) => !/Courier New/.test(f))).toEqual([]);
      await close();
    });
  }
  it('initial on a wrapper reaches only the chrome inside it (the menu keeps the library stack)', async () => {
    const { page, close } = await openHarness('font=1');
    await page.evaluate(() => (document.querySelector('.rdd-fill-viewport') as HTMLElement).style.setProperty('--rdd-font-family', 'initial'));
    await openPortaled(page);
    const fonts = await fontsOf(page, ['.rdd-workspace-tab', '.rdd-context-menu']);
    expect(fonts['.rdd-workspace-tab']).toMatch(/Courier New/);
    expect(fonts['.rdd-context-menu']).toMatch(/Outfit/);
    await close();
  });
});
