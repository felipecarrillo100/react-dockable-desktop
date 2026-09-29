/**
 * The 14 branding scenes — 7 skins × dark/light with the chrome opened — shared by the colour
 * baseline (branding.browser.ts) and the corner baseline (radius.browser.ts).
 */
import type { Page } from 'playwright-core';
import { openHarness, actions } from './lib';

export const SKINS = ['vscode', 'macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo'];
export const SCHEMES = ['dark', 'light'];
export const SCENES = SKINS.flatMap(skin => SCHEMES.map(cs => ({ skin, cs })));

/** Opens a scene with the active states on: a selected sidebar tab, radio and toggle, a focused tab, a taskbar item. */
export async function openBase(skin: string, cs: string, brand: string) {
  const h = await openHarness(`skin=${skin}&cs=${cs}&anim=0&tbx=1&ntabs=1${brand}`);
  const { page } = h;
  await actions(page, 'minimizePanel', 'p2'); // a taskbar item
  await page.click('.rdd-sidebar-tab-btn[title="Tab A"]');
  await page.click('[aria-label="Radio 1"]');
  await page.click('.rdd-workspace-tab:has-text("Panel One")');
  await page.waitForTimeout(200);
  return h;
}

export async function openScene(skin: string, cs: string, brand = ''): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const h = await openBase(skin, cs, brand);
  const { page } = h;
  await page.click('.rdd-toolbar-btn-group'); // the flyout
  await page.evaluate(async () => {
    type Open = (c: unknown, p: object, o: object) => unknown;
    const wm = (window as unknown as { __wm: { overlays: { openLeftPanel: Open; openModal: Open }; Plain: unknown; RddConfirm: unknown; toast: (m: string) => void } }).__wm;
    await wm.overlays.openLeftPanel(wm.Plain, {}, { title: 'Drawer' });
    wm.overlays.openModal(wm.RddConfirm, { message: 'Sure?' }, { title: 'Modal' }); // has the primary button
    wm.toast('hello');
  });
  await page.locator('#ctx').dispatchEvent('contextmenu', { clientX: 40, clientY: 40, bubbles: true });
  await page.waitForTimeout(700);
  return h;
}

