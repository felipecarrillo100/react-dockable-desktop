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


/**
 * The containers whose frost (and background) moved onto their own ::before in 7.4.0, so a
 * consumer's position: fixed content inside them keeps the viewport. See frost.browser.ts.
 */
export const FROSTED = /\.rdd-(floating-window|side-panel|panel-float|workspace-panel|panel-toolbar)(\.|:|$)/;

/**
 * A snapshot taken before 7.4.0 painted a frosted container's background on the element; from
 * 7.4.0 it is on the element's ::before. Folds that ::before back onto its element — only where the
 * baseline has no such pseudo-element — so the two compare as what is drawn, not where.
 */
export function foldFrost<T extends Record<string, Record<string, string>>>(snap: T, base: T): T {
  const out = { ...snap } as Record<string, Record<string, string>>;
  for (const key of Object.keys(snap)) {
    if (!key.endsWith('::before') || base[key]) continue;
    const el = key.slice(0, -'::before'.length);
    if (!FROSTED.test(el.split('>').pop() ?? '') || !out[el]) continue;
    const bg = snap[key]['background-color'];
    // A pseudo that only frosts (a plain blur leaves the background on the element) paints nothing to fold.
    if (bg && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(bg)) {
      out[el] = { ...out[el], 'background-color': bg, 'background-image': snap[key]['background-image'] ?? out[el]['background-image'] };
    }
    delete out[key];
  }
  return out as T;
}
