import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, rectOf, drag, settle, actions } from './lib';

// Widgets out of the panel (7.11, step 1). M2: a managed widget's content renders once into its
// own element, div.rdd-panel-float__content, which sits between the frame's body and the content.
// Content laid out with height: 100% must fill the body exactly as when it was the body's child.

const WO = 'ov=1&wo=1&anim=0';
const fit = (page: Page) => page.evaluate(() => {
  const body = document.querySelector('[data-rdd-widget="wo"] .rdd-panel-float__body') as HTMLElement;
  const fill = document.getElementById('wo-fill') as HTMLElement;
  return {
    wrapped: fill.parentElement?.classList.contains('rdd-panel-float__content') === true
      && fill.parentElement.parentElement === body,
    body: { w: body.clientWidth, h: body.clientHeight },
    fill: { w: fill.offsetWidth, h: fill.offsetHeight },
  };
});

describe('managed widget content element', () => {
  it('sits between the body and the content, and height: 100% content fills the body', async () => {
    const { page, errors, close } = await openHarness(WO);
    const r = await fit(page);
    expect(r.wrapped).toBe(true);
    expect(r.body.h).toBeGreaterThan(100);
    expect(r.fill).toEqual(r.body);
    await close();
    expect(errors).toEqual([]);
  });

  it('keeps filling the body as the widget is resized', async () => {
    const { page, errors, close } = await openHarness(WO);
    // Docked bottom-right: the free edges are north and west. Drag the north edge up by 60px.
    const win = await rectOf(page, '[data-rdd-widget="wo"]');
    const x = win.x + win.width / 2;
    await drag(page, x, win.y + 1, x, win.y - 59);
    const r = await fit(page);
    expect(Math.round((await rectOf(page, '[data-rdd-widget="wo"]')).height - win.height)).toBe(60);
    expect(r.fill).toEqual(r.body);
    await close();
    expect(errors).toEqual([]);
  });

  it('keeps its state through a drag free and back onto a corner', async () => {
    const { page, errors, close } = await openHarness(WO);
    await page.click('#wo-inc');
    await page.click('#wo-inc');
    await page.fill('#wo-input', 'typed');
    const title = await rectOf(page, '[data-rdd-widget="wo"] .rdd-panel-float__header');
    const overlay = await rectOf(page, '[data-rdd-panel="p3"] .rdd-panel-overlay-root');
    // Free first, then onto the top-left drop zone. By the middle of the header: its start is the
    // title-menu button, which never drags.
    const mid = title.x + title.width / 2;
    await drag(page, mid, title.y + 8, mid - 60, title.y - 300);
    const freed = await rectOf(page, '[data-rdd-widget="wo"] .rdd-panel-float__header');
    expect(Math.round(freed.y)).toBeLessThan(Math.round(title.y) - 200);       // it really moved
    await drag(page, freed.x + freed.width / 2, freed.y + 8, overlay.x + 20, overlay.y + 20);
    // Docked top-left (stacked under the declarative w1 there): inline-start inset, no free `left`.
    const style = await page.$eval('[data-rdd-widget="wo"]', el => ({ left: (el as HTMLElement).style.left, start: (el as HTMLElement).style.insetInlineStart }));
    expect(style).toEqual({ left: '', start: '8px' });
    const state = await page.evaluate(() => ({
      count: document.getElementById('wo-count')?.textContent,
      input: (document.getElementById('wo-input') as HTMLInputElement).value,
    }));
    expect(state).toEqual({ count: '2', input: 'typed' });
    const r = await fit(page);
    expect(r.fill).toEqual(r.body);
    await close();
    expect(errors).toEqual([]);
  });

  it('a pointerdown in the content brings the widget in front of its siblings', async () => {
    const { page, errors, close } = await openHarness(WO);
    const z = () => page.evaluate(() => ({
      wo: Number(getComputedStyle(document.querySelector('[data-rdd-widget="wo"]')!).zIndex),
      w1: Number(getComputedStyle(document.querySelector('[data-rdd-widget="w1"]')!).zIndex),
    }));
    // The first focus gets the default z (101), so put each one in front once before measuring.
    await page.click('[data-rdd-widget="wo"] .rdd-panel-float__header');
    await page.click('[data-rdd-widget="w1"] .rdd-panel-float__header');
    expect((await z()).w1).toBeGreaterThan((await z()).wo);
    await page.click('#wo-count');
    expect((await z()).wo).toBeGreaterThan((await z()).w1);
    await close();
    expect(errors).toEqual([]);
  });
});

// M3: moving out of the panel and back. The content element is marked with a JS property, so
// "the same element" means the very node, and the WebGL context stands in for a map's.

const move = (page: Page, to: unknown) => page.evaluate((t) =>
  (window as unknown as { __wo: { move(id: string, to: unknown): unknown } }).__wo.move('wo', t), to);
const locationOf = (page: Page) => page.evaluate(() =>
  (window as unknown as { __wo: { location(id: string): unknown } }).__wo.location('wo'));
const snapshot = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('.rdd-panel-float__content') as (HTMLElement & { __mark?: string }) | null;
  const fill = document.getElementById('wo-fill');
  const w = window as unknown as { __woLost: number; __woGl: WebGLRenderingContext | null };
  const slot = el?.parentElement;
  // What the content must fill: the frame's body, or the hosted panel's whole content box (the
  // slot itself would shrink to its content without its own sizing, and prove nothing).
  const box = slot?.classList.contains('rdd-hosted-widget') ? slot.closest('.rdd-panel-content') : slot;
  return {
    same: el?.__mark === 'original',
    count: document.getElementById('wo-count')?.textContent,
    input: (document.getElementById('wo-input') as HTMLInputElement | null)?.value,
    glAlive: !!w.__woGl && !w.__woGl.isContextLost() && w.__woLost === 0,
    slot: slot?.classList.contains('rdd-hosted-widget') ? 'hosted' : slot?.classList.contains('rdd-panel-float__body') ? 'frame' : 'none',
    fills: !!box && !!fill && fill.offsetHeight === box.clientHeight && fill.offsetWidth === box.clientWidth,
    frame: !!document.querySelector('[data-rdd-widget="wo"]'),
  };
});

describe('managed widget out of its panel and back', () => {
  it('keeps the same element, its state and its WebGL context through every move', async () => {
    const { page, errors, close } = await openHarness(WO);
    await page.evaluate(() => { (document.querySelector('.rdd-panel-float__content') as HTMLElement & { __mark?: string }).__mark = 'original'; });
    await page.click('#wo-inc');
    await page.fill('#wo-input', 'typed');
    const kept = { same: true, count: '1', input: 'typed', glAlive: true, fills: true };

    const steps: [unknown, string, string][] = [
      [{ to: 'docked', position: 'bottom', size: 0.4 }, 'docked', 'hosted'],
      [{ to: 'tabbed' }, 'tabbed', 'hosted'],
      [{ to: 'floating', rect: { x: 80, y: 80, width: 320, height: 240 } }, 'floating', 'hosted'],
      [{ to: 'panel' }, 'panel', 'frame'],
      [{ to: 'floating' }, 'floating', 'hosted'],
    ];
    for (const [to, where, slot] of steps) {
      expect(await move(page, to), JSON.stringify(to)).toEqual({ ok: true });
      await settle(page, 300);
      expect(await locationOf(page)).toBe(where);
      expect(await snapshot(page), where).toMatchObject({ ...kept, slot, frame: slot === 'frame' });
    }

    // Minimised and restored by the user's workspace actions, then home.
    await actions(page, 'minimizePanel', 'p3/wo');
    await settle(page, 300);
    expect(await locationOf(page)).toBe('minimized');
    await actions(page, 'restorePanel', 'p3/wo');
    await settle(page, 300);
    expect(await locationOf(page)).toBe('floating');
    expect(await snapshot(page)).toMatchObject({ ...kept, slot: 'hosted' });
    expect(await move(page, { to: 'panel' })).toEqual({ ok: true });
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ ...kept, slot: 'frame', frame: true });
    await close();
    expect(errors).toEqual([]);
  });

  it('the × on its tab closes the widget, and the owner closing closes it too', async () => {
    const { page, errors, close } = await openHarness(WO);
    await move(page, { to: 'tabbed' });
    await settle(page, 300);
    await page.click('[data-rdd-tab="p3/wo"] .rdd-close-tab-x');
    await settle(page, 300);
    expect(await page.evaluate(() => (window as unknown as { __wo: { isOpen(id: string): boolean } }).__wo.isOpen('wo'))).toBe(false);
    expect(await page.$('.rdd-panel-float__content')).toBeNull();
    await close();
    expect(errors).toEqual([]);
  });

  it('the owner closing removes its hosted panel', async () => {
    const { page, errors, close } = await openHarness(WO);
    await move(page, { to: 'docked', position: 'left' });
    await settle(page, 300);
    await actions(page, 'closePanel', 'p3');
    await settle(page, 300);
    const ids = await page.evaluate(() => Object.keys((window as unknown as { __wm: { state: { panels: object } } }).__wm.state.panels));
    expect(ids).not.toContain('p3/wo');
    expect(await page.$('.rdd-panel-float__content')).toBeNull();
    await close();
    expect(errors).toEqual([]);
  });

  it('works the same under RTL', async () => {
    const { page, errors, close } = await openHarness(WO + '&dir=html');
    await page.evaluate(() => { (document.querySelector('.rdd-panel-float__content') as HTMLElement & { __mark?: string }).__mark = 'original'; });
    await page.click('#wo-inc');
    expect(await move(page, { to: 'docked', position: 'bottom' })).toEqual({ ok: true });
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ same: true, count: '1', glAlive: true, slot: 'hosted', fills: true });
    expect(await move(page, { to: 'panel' })).toEqual({ ok: true });
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ same: true, count: '1', slot: 'frame', fills: true });
    await close();
    expect(errors).toEqual([]);
  });
});

// M4: the title icon as a menu button, in the panel and out of it.

describe('managed widget title menu', () => {
  it('a click opens the app\'s items without starting a drag, and an item moves the widget out', async () => {
    const { page, errors, close } = await openHarness(WO);
    const before = await rectOf(page, '[data-rdd-widget="wo"]');
    await page.click('[data-rdd-widget="wo"] .rdd-panel-float__menu');
    await settle(page, 200);
    const after = await rectOf(page, '[data-rdd-widget="wo"]');
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    expect(await page.evaluate(() => document.body.classList.contains('rdd-dragging-active'))).toBe(false);
    await page.click('.rdd-context-menu__item:has-text("Dock below")');
    await settle(page, 300);
    expect(await locationOf(page)).toBe('docked');
    // Out of the panel, the same items lead the hosted tab's menu.
    await page.click('[data-rdd-tab="p3/wo"]', { button: 'right' });
    await settle(page, 200);
    const labels = await page.$$eval('.rdd-context-menu:not(.rdd-context-menu--submenu) .rdd-context-menu__label', els => els.map(e => e.textContent));
    expect(labels[0]).toBe('Back into the panel');
    expect(labels).not.toContain('Float Window');
    await page.click('.rdd-context-menu__item:has-text("Back into the panel")');
    await settle(page, 300);
    expect(await locationOf(page)).toBe('panel');
    await close();
    expect(errors).toEqual([]);
  });

  it('opened from the keyboard, the menu focuses its first item', async () => {
    const { page, errors, close } = await openHarness(WO);
    await page.focus('[data-rdd-widget="wo"] .rdd-panel-float__menu');
    await page.keyboard.press('Enter');
    await settle(page, 200);
    expect(await page.evaluate(() => document.activeElement?.querySelector('.rdd-context-menu__label')?.textContent
      ?? document.activeElement?.textContent)).toContain('Dock below');
    await page.keyboard.press('Enter');
    await settle(page, 300);
    expect(await locationOf(page)).toBe('docked');
    await close();
    expect(errors).toEqual([]);
  });
});

// M5: useWidget() and the move callbacks, with real layout.

describe('managed widget move callbacks', () => {
  it('onWillMove sees the old size and onMoved the new one; location re-renders', async () => {
    const { page, errors, close } = await openHarness(WO);
    const fill = () => rectOf(page, '#wo-fill');
    const inPanel = await fill();
    expect(await move(page, { to: 'docked', position: 'bottom', size: 0.5 })).toEqual({ ok: true });
    await settle(page, 400);
    const docked = await fill();
    expect(Math.round(docked.width)).not.toBe(Math.round(inPanel.width));
    const moves = () => page.evaluate(() => (window as unknown as { __woMoves: string[] }).__woMoves);
    expect(await moves()).toEqual([
      `will ${Math.round(inPanel.width)}x${Math.round(inPanel.height)}`,
      `moved ${Math.round(docked.width)}x${Math.round(docked.height)}`,
    ]);
    expect(await page.getAttribute('#wo-fill', 'data-location')).toBe('docked');
    // The user's own move: minimise the hosted panel, then restore it.
    await actions(page, 'minimizePanel', 'p3/wo');
    await settle(page, 400);
    expect(await page.getAttribute('#wo-fill', 'data-location')).toBe('minimized');
    await actions(page, 'restorePanel', 'p3/wo');
    await settle(page, 400);
    const m = await moves();
    expect(m).toHaveLength(6);
    expect(m[2]).toMatch(/^will /);
    expect(m[5]).toMatch(/^moved \d+x\d+$/);
    expect(m[5]).not.toBe('moved 0x0');
    await close();
    expect(errors).toEqual([]);
  });
});

// M6: WidgetPlacement, with real layout.

const placementOf = (page: Page) => page.evaluate(() =>
  (window as unknown as { __wo: { placement(id: string): unknown } }).__wo.placement('wo'));
const reopen = (page: Page, placement: unknown) => page.evaluate((p) => {
  const w = window as unknown as { __wo: { close(id: string): void }; __woOpen(p: unknown): void };
  w.__wo.close('wo');
  w.__woOpen(p);
}, placement);
/** The widget's gaps to the overlay's edges. */
const gaps = (page: Page) => page.evaluate(() => {
  const o = document.querySelector('[data-rdd-panel="p3"] .rdd-panel-overlay-root')!.getBoundingClientRect();
  const w = document.querySelector('[data-rdd-widget="wo"]')!.getBoundingClientRect();
  return { left: Math.round(w.left - o.left), top: Math.round(w.top - o.top), right: Math.round(o.right - w.right), bottom: Math.round(o.bottom - w.bottom), width: Math.round(w.width), height: Math.round(w.height) };
});

describe('managed widget placement', () => {
  it('a free position made by a drag comes back where it was', async () => {
    const { page, errors, close } = await openHarness(WO);
    const title = await rectOf(page, '[data-rdd-widget="wo"] .rdd-panel-float__header');
    // By the middle of the header (its start is the title-menu button, which never drags), up into
    // the middle of the panel, away from every corner's drop zone.
    const mid = title.x + title.width / 2;
    await drag(page, mid, title.y + 8, mid - 10, title.y - 300);
    const before = await gaps(page);
    const saved = await placementOf(page);
    expect(saved).toMatchObject({ v: 1, at: 'panel', mode: 'free' });
    await reopen(page, saved);
    await settle(page, 300);
    expect(await gaps(page)).toEqual(before);
    await close();
    expect(errors).toEqual([]);
  });

  it('restored while its panel is a background tab, it is placed when the tab is shown', async () => {
    const { page, errors, close } = await openHarness(WO);
    const saved = { v: 1, at: 'panel', anchor: 'top-left', stretch: null, mode: 'free', offset: { corner: 'bottom-right', inline: 16, block: 24 }, width: 180, height: 120 };
    await actions(page, 'openPanel', 'bg', 'probe', { title: 'Background', dockTo: { panel: 'p3', position: 'center' } });
    await settle(page, 300);
    await reopen(page, saved);
    await settle(page, 200);
    expect(await placementOf(page)).toEqual(saved);      // held, not measured against a hidden panel
    await page.click('[data-rdd-tab="p3"]');
    await settle(page, 400);
    expect(await gaps(page)).toMatchObject({ right: 16, bottom: 24, width: 180, height: 120 });
    await close();
    expect(errors).toEqual([]);
  });

  it('out of the panel: closed and reopened at its placement, it docks again beside its owner', async () => {
    const { page, errors, close } = await openHarness(WO);
    expect(await move(page, { to: 'docked', position: 'bottom', size: 0.4 })).toEqual({ ok: true });
    await settle(page, 300);
    const saved = await placementOf(page);
    expect(saved).toMatchObject({ v: 1, at: 'docked', position: 'bottom', size: 0.4, home: { at: 'panel' } });
    await reopen(page, JSON.parse(JSON.stringify(saved)));
    await settle(page, 300);
    expect(await locationOf(page)).toBe('docked');
    expect(await snapshot(page)).toMatchObject({ slot: 'hosted', fills: true });
    expect(await move(page, { to: 'panel' })).toEqual({ ok: true });
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ slot: 'frame' });
    await close();
    expect(errors).toEqual([]);
  });
});

// M7: preserveEmbeds with a real iframe, in a browser that has moveBefore().

describe('preserveEmbeds', () => {
  const loads = (page: Page) => page.evaluate(() => (window as unknown as { __loads?: Record<string, number> }).__loads ?? {});

  it('an iframe in a panel type with it keeps its document as the panel moves; one without reloads', async () => {
    const { page, errors, close } = await openHarness('emb=1&anim=0');
    expect(await page.evaluate(() => 'moveBefore' in Element.prototype)).toBe(true);
    await settle(page, 400);
    expect(await loads(page)).toMatchObject({ fk: 1, fb: 1 });
    for (const [fn, ...args] of [['floatPanel', 'fk'], ['dockPanel', 'fk'], ['minimizePanel', 'fk'], ['restorePanel', 'fk'], ['floatPanel', 'fb']] as const) {
      await actions(page, fn, ...args);
      await settle(page, 400);
    }
    const l = await loads(page);
    expect(l.fk).toBe(1);                      // never reloaded
    expect(l.fb).toBeGreaterThan(1);           // the control: a plain move reloads
    await close();
    expect(errors).toEqual([]);
  });

  it('an iframe in a widget with it keeps its document out of the panel and back', async () => {
    const { page, errors, close } = await openHarness(WO + '&emb=1');
    await settle(page, 400);
    expect((await loads(page)).wo).toBe(1);
    for (const to of [{ to: 'docked', position: 'bottom' }, { to: 'floating', rect: { x: 60, y: 60, width: 300, height: 220 } }, { to: 'tabbed' }, { to: 'panel' }]) {
      expect(await move(page, to)).toEqual({ ok: true });
      await settle(page, 400);
      expect((await loads(page)).wo, JSON.stringify(to)).toBe(1);
    }
    await close();
    expect(errors).toEqual([]);
  });
});
