import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, settle, actions, wmState } from './lib';

// Pop-out windows (7.12.0, S2): a panel moves into a real child window and back. The panel's
// element is marked with a JS property, so "the same element" means the very node; the WebGL
// context stands in for a map's. Harness po=1: panel `pp` (canPopOut) a tab in p1's group, and the
// header's #po-btn calls workspace.popOutPanel('pp') inside a real click.

const PO = 'po=1';

/** Clicks #po-btn (a user gesture) and returns the window that opened. */
async function popOutByClick(page: Page): Promise<Page> {
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#po-btn')]);
  await popup.waitForLoadState();
  await popup.waitForSelector('[data-rdd-panel="pp"]');
  return popup;
}

/** What must survive, read in the document the panel is in now (the opener's globals hold the GL context). */
const snapshot = (p: Page) => p.evaluate(() => {
  const content = document.querySelector('[data-rdd-panel="pp"]');
  const el = content?.closest('.rdd-panel-dom') as (HTMLElement & { __mark?: string }) | null | undefined;
  const main = (window.opener ?? window) as unknown as { __poLost: number; __poGl: WebGLRenderingContext | null };
  return {
    here: !!content,
    same: el?.__mark === 'original',
    count: document.getElementById('po-count')?.textContent,
    scroll: document.getElementById('po-sc')?.scrollTop,
    glAlive: !!main.__poGl && !main.__poGl.isContextLost() && main.__poLost === 0,
    inFrame: !!el?.closest('.rdd-popout-frame'),
    // The panel fills its slot: in the window, without the stylesheet, too.
    fills: (document.getElementById('po-fill')?.offsetHeight ?? 0) > 150,
  };
});

async function prepare(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.querySelector('[data-rdd-panel="pp"]')!.closest('.rdd-panel-dom') as HTMLElement & { __mark?: string }).__mark = 'original';
  });
  await page.click('#po-inc');
  await page.click('#po-inc');
  await page.evaluate(() => { document.getElementById('po-sc')!.scrollTop = 300; });
  await settle(page, 200);
}

/** The grid's shape: panels per group and sizes (rounded), without the generated group ids. */
const gridShape = (page: Page) => page.evaluate(() => {
  type N = { type: 'leaf'; panels: string[] } | { type: 'branch'; orientation: string; sizes: number[]; children: N[] };
  const shape = (n: N): unknown => n.type === 'leaf' ? n.panels
    : { o: n.orientation, sizes: n.sizes.map(x => Math.round(x * 1000) / 1000), c: n.children.map(shape) };
  return shape((window as unknown as { __wm: { state: { gridRoot: N } } }).__wm.state.gridRoot);
});

const kept = { here: true, same: true, count: '2', scroll: 300, glAlive: true, fills: true };

describe('a panel in its own window', () => {
  it('docked → popped out → "Return to desktop": the same element, state, scroll and WebGL context, back in its group', async () => {
    const { page, errors, close } = await openHarness(PO);
    const group = await page.evaluate(() => document.querySelector('[data-tab-id="pp"]')?.closest('[data-leaf-id]')?.getAttribute('data-leaf-id') ?? null);
    expect(group).not.toBeNull();
    await prepare(page);

    const popup = await popOutByClick(page);
    expect(await page.evaluate(() => (window as unknown as { __poResult: unknown }).__poResult)).toEqual({ ok: true });
    expect(await snapshot(popup)).toMatchObject({ ...kept, inFrame: true });
    expect(await popup.title()).toBe('Pop');
    expect(await page.$('[data-rdd-panel="pp"]')).toBeNull();          // nothing left in the main page
    expect(await page.$('[data-rdd-window="pp"]')).toBeNull();
    expect(await wmState(page, 'panels.pp.poppedOut')).toBe(true);

    // It works in the child: a click there updates the panel.
    await popup.click('#po-inc');
    expect(await popup.textContent('#po-count')).toBe('3');

    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ ...kept, count: '3', inFrame: false });
    expect(await wmState(page, 'panels.pp.state')).toBe('docked');
    expect(await page.evaluate(() => document.querySelector('[data-tab-id="pp"]')?.closest('[data-leaf-id]')?.getAttribute('data-leaf-id') ?? null)).toBe(group);
    await close();
    expect(errors).toEqual([]);
  });

  it('alone in its group (an edge dock): the grid comes back exactly, sizes too', async () => {
    const { page, errors, close } = await openHarness(PO);
    await actions(page, 'dockPanelToWorkspaceEdge', 'pp', 'right');
    await settle(page, 300);
    const gridBefore = await gridShape(page);
    // [[p1 p2 | p3] | pp] at 80/20
    expect(gridBefore).toMatchObject({ o: 'horizontal', sizes: [0.8, 0.2], c: [{ o: 'horizontal' }, ['pp']] });
    const sideBefore = await page.evaluate(() => {
      const pp = document.querySelector('[data-tab-id="pp"]')!.getBoundingClientRect();
      const p1 = document.querySelector('[data-tab-id="p1"]')!.getBoundingClientRect();
      return pp.left > p1.left;
    });
    expect(sideBefore).toBe(true);
    await prepare(page);
    const popup = await popOutByClick(page);
    expect(await snapshot(popup)).toMatchObject({ ...kept, inFrame: true });
    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
    await settle(page, 300);
    expect(await wmState(page, 'panels.pp.state')).toBe('docked');
    expect(await page.evaluate(() => {
      const pp = document.querySelector('[data-tab-id="pp"]')!.getBoundingClientRect();
      const p1 = document.querySelector('[data-tab-id="p1"]')!.getBoundingClientRect();
      return { right: pp.left > p1.left, ownGroup: document.querySelector('[data-tab-id="pp"]')!.getAttribute('data-leaf-id') !== document.querySelector('[data-tab-id="p1"]')!.getAttribute('data-leaf-id') };
    })).toEqual({ right: true, ownGroup: true });
    expect(await gridShape(page)).toEqual(gridBefore);
    expect(await snapshot(page)).toMatchObject({ ...kept, inFrame: false });
    await close();
    expect(errors).toEqual([]);
  });

  for (const order of [['pp', 'pq'], ['pq', 'pp']]) {
    it(`two neighbours out at once, back ${order.join(' then ')}: the grid is the original, sizes too`, async () => {
      const { page, errors, close } = await openHarness(`${PO}&po2=1`);
      // [[p1 p2 | p3] | [pp / pq]]: pp and pq the two sides of one split, at the workspace's edge.
      await actions(page, 'dockPanelToWorkspaceEdge', 'pp', 'right');
      await settle(page, 300);
      const ppLeaf = await page.evaluate(() => document.querySelector('[data-tab-id="pp"]')!.getAttribute('data-leaf-id'));
      await actions(page, 'dockPanelToGroup', 'pq', ppLeaf, 'bottom');
      await settle(page, 300);
      const before = await gridShape(page);
      expect(before).toMatchObject({ o: 'horizontal', c: [{ o: 'horizontal' }, { o: 'vertical', c: [['pp'], ['pq']] }] });

      const [first] = await Promise.all([page.waitForEvent('popup'), page.click('#po-btn')]);
      const [second] = await Promise.all([page.waitForEvent('popup'), page.click('#po-btn-q')]);
      await first.waitForSelector('[data-rdd-panel="pp"]');
      await second.waitForSelector('[data-rdd-panel="pq"]');
      const windows: Record<string, Page> = { pp: first, pq: second };
      for (const id of order) {
        await Promise.all([windows[id].waitForEvent('close'), windows[id].click('.rdd-popout-frame__return')]);
        await settle(page, 300);
        expect(await wmState(page, `panels.${id}.state`)).toBe('docked');
      }
      expect(await gridShape(page)).toEqual(before);
      await close();
      expect(errors).toEqual([]);
    });
  }

  it('floating → popped out → closed by the user: back floating, the same element and state', async () => {
    const { page, errors, close } = await openHarness(PO);
    await actions(page, 'floatPanel', 'pp');
    await settle(page, 300);
    await prepare(page);

    const popup = await popOutByClick(page);
    expect(await snapshot(popup)).toMatchObject({ ...kept, inFrame: true });
    await popup.close();
    await page.waitForSelector('[data-rdd-window="pp"]');
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ ...kept, inFrame: false });
    expect(await wmState(page, 'panels.pp.state')).toBe('floating');
    expect(await wmState(page, 'panels.pp.poppedOut')).toBeUndefined();
    await close();
    expect(errors).toEqual([]);
  });

  it('with popoutUrl, opens the app\'s page and moves the panel in once it has loaded', async () => {
    const { page, errors, close } = await openHarness(`${PO}&pourl=1`);
    await prepare(page);
    const popup = await popOutByClick(page);
    expect(new URL(popup.url()).pathname).toBe('/popout.html');
    expect(await snapshot(popup)).toMatchObject({ ...kept, inFrame: true });
    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
    await settle(page, 300);
    expect(await snapshot(page)).toMatchObject({ ...kept, inFrame: false });
    await close();
    expect(errors).toEqual([]);
  });

  it('a blocked pop-up: the menu item shows a toast and the panel stays', async () => {
    const { page, errors, close } = await openHarness(PO);
    await page.evaluate(() => { window.open = () => null; });
    await page.click('[data-tab-id="pp"]', { button: 'right' });
    await page.click('.rdd-context-menu__item:has-text("Open in new window")');
    await page.waitForSelector('.rdd-toast--warning');
    expect(await page.textContent('.rdd-toast--warning')).toContain('blocked');
    expect(await wmState(page, 'panels.pp.state')).toBe('docked');
    expect(await wmState(page, 'panels.pp.poppedOut')).toBeUndefined();
    await close();
    expect(errors).toEqual([]);
  });
});

// S3: styles in the pop-out. The window gets the page's stylesheets, <html>'s attributes and the
// workspace's scheme and skin, so what is drawn there looks as it does in the page.

/** Computed colours of the workspace (the frame's counterpart) and a panel element, in `p`. */
const colours = (p: Page, frameSelector: string) => p.evaluate((sel) => {
  const frame = document.querySelector(sel) as HTMLElement;
  const panel = document.getElementById('po-fill') ?? document.querySelector('.rdd-panel-content');
  const f = getComputedStyle(frame);
  return {
    background: f.backgroundColor,
    color: f.color,
    accent: f.getPropertyValue('--rdd-accent-color').trim(),
    font: f.fontFamily,
    panelColor: panel ? getComputedStyle(panel).color : null,
    marker: panel ? getComputedStyle(panel).outlineColor : null,
  };
}, frameSelector);

describe('styles in a pop-out window', () => {
  for (const scheme of ['dark', 'light']) {
    it(`under a skin, ${scheme}: the frame and the panel look as in the page; they follow a scheme and a skin switch, and a sheet added later`, async () => {
      const { page, errors, close } = await openHarness(`${PO}&skin=nord&cs=${scheme}`);
      const popup = await popOutByClick(page);
      await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
      const same = async () => {
        await settle(page, 200);
        const main = await colours(page, '.rdd-workspace:not(.rdd-popout-frame)');
        const out = await colours(popup, '.rdd-popout-frame');
        expect(out.background).toBe(main.background);
        expect(out.color).toBe(main.color);
        expect(out.accent).toBe(main.accent);
        expect(out.font).toBe(main.font);
        expect(out.panelColor).toBe(main.color);       // a panel element inherits the workspace's colour
        return { main, out };
      };
      const first = await same();

      // A scheme switch, as the app does it: on <html>.
      await page.evaluate((s) => document.documentElement.setAttribute('data-color-scheme', s), scheme === 'dark' ? 'light' : 'dark');
      const switched = await same();
      expect(switched.main.background).not.toBe(first.main.background);

      // A skin switch.
      await page.evaluate(() => (window as unknown as { __setSkin(s: string): void }).__setSkin('tokyo'));
      const reskinned = await same();
      expect(reskinned.main).not.toEqual(switched.main);              // the skin changed something
      expect(await popup.getAttribute('.rdd-popout-frame', 'data-rdd-skin')).toBe('tokyo');

      // A sheet added to the page after the pop-out applies there too.
      await page.evaluate(() => {
        const s = document.createElement('style');
        s.textContent = '#po-fill { outline: 1px solid rgb(1, 2, 3); }';
        document.head.appendChild(s);
      });
      await settle(page, 200);
      expect((await colours(popup, '.rdd-popout-frame')).marker).toBe('rgb(1, 2, 3)');
      await close();
      expect(errors).toEqual([]);
    });
  }
});

// S4: the app's popoutWrapper. With the documented Emotion recipe (a cache per document, speedy:
// rules inserted with insertRule, which the head copy can't carry), a styled element looks the same
// in the pop-out and after the return, and nothing remounts.

const emotionStyle = (p: Page) => p.evaluate(() => {
  const el = document.getElementById('po-emo');
  if (!el) return null;
  const s = getComputedStyle(el);
  return { color: s.color, letterSpacing: s.letterSpacing, border: s.borderBottomColor };
});
/** The Emotion <style> tags of a document: whether one holds its rules only through insertRule. */
const insertedOnly = (p: Page) => p.evaluate(() => Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-emotion^="hx"]'))
  .some(s => (s.textContent ?? '') === '' && (s.sheet?.cssRules.length ?? 0) > 0));

describe('popoutWrapper (Emotion, speedy)', () => {
  it('an Emotion-styled element looks the same in the pop-out and after the return, with no remount', async () => {
    const { page, errors, close } = await openHarness(`${PO}&emo=1`);
    const inPage = await emotionStyle(page);
    expect(inPage).toEqual({ color: 'rgb(10, 20, 30)', letterSpacing: '3px', border: 'rgb(40, 50, 60)' });
    expect(await insertedOnly(page)).toBe(true);                // the production path: insertRule
    const mounts = await page.evaluate(() => (window as unknown as { __poMounts: number }).__poMounts);

    const popup = await popOutByClick(page);
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    expect(await emotionStyle(popup)).toEqual(inPage);
    expect(await insertedOnly(popup)).toBe(true);               // inserted into the pop-out's own head

    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
    await settle(page, 300);
    expect(await emotionStyle(page)).toEqual(inPage);
    expect(await page.evaluate(() => (window as unknown as { __poMounts: number }).__poMounts)).toBe(mounts);
    await close();
    expect(errors).toEqual([]);
  });
});

// S5: a managed widget in its own window. Out of its panel into a real window, and back into its
// panel by closing that window (D17): the same element, its state and WebGL context, and onMoved
// at the new size each time.

const widgetSnapshot = (p: Page) => p.evaluate(() => {
  const el = document.querySelector('.rdd-panel-float__content') as (HTMLElement & { __mark?: string }) | null;
  const main = (window.opener ?? window) as unknown as { __woLost: number; __woGl: WebGLRenderingContext | null };
  const fill = document.getElementById('wo-fill');
  return {
    here: !!el,
    same: el?.__mark === 'original',
    count: document.getElementById('wo-count')?.textContent,
    input: (document.getElementById('wo-input') as HTMLInputElement | null)?.value,
    glAlive: !!main.__woGl && !main.__woGl.isContextLost() && main.__woLost === 0,
    size: fill ? `${fill.offsetWidth}x${fill.offsetHeight}` : null,
    inPanelFrame: !!document.querySelector('[data-rdd-widget="wo"]'),
  };
});
const woMoves = (page: Page) => page.evaluate(() => [...((window as unknown as { __woMoves?: string[] }).__woMoves ?? [])]);

describe('a managed widget in its own window', () => {
  it('out of its panel into a window and back into the panel by closing it: the same element, state, and onMoved at the new size', async () => {
    const { page, errors, close } = await openHarness(`${PO}&ov=1&wo=1`);
    await page.evaluate(() => { (document.querySelector('.rdd-panel-float__content') as HTMLElement & { __mark?: string }).__mark = 'original'; });
    await page.click('#wo-inc');
    await page.fill('#wo-input', 'typed');
    const kept = { here: true, same: true, count: '1', input: 'typed', glAlive: true };
    const inPanel = await widgetSnapshot(page);
    expect(inPanel).toMatchObject({ ...kept, inPanelFrame: true });
    const before = (await woMoves(page)).length;

    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#wo-po-btn')]);
    await popup.waitForSelector('.rdd-panel-float__content');
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    await settle(page, 300);
    expect(await page.evaluate(() => (window as unknown as { __woPopResult: unknown }).__woPopResult)).toEqual({ ok: true });
    const out = await widgetSnapshot(popup);
    expect(out).toMatchObject(kept);
    expect(await page.$('.rdd-panel-float__content')).toBeNull();           // nothing left in the page
    expect(await popup.getAttribute('.rdd-popout-frame__return', 'aria-label')).toBe('Back into the panel');
    // One move: onWillMove, then onMoved at its size in the window.
    let moves = (await woMoves(page)).slice(before);
    expect(moves.length).toBe(2);
    expect(moves[0]).toMatch(/^will /);
    expect(moves[1]).toBe(`moved ${out.size}`);
    expect(out.size).not.toBe(inPanel.size);

    // Closing the window: back into its panel (D17), with the same element and state.
    const mid = (await woMoves(page)).length;
    await popup.close();
    await page.waitForSelector('[data-rdd-widget="wo"]');
    await settle(page, 300);
    const back = await widgetSnapshot(page);
    expect(back).toMatchObject({ ...kept, inPanelFrame: true, size: inPanel.size });
    moves = (await woMoves(page)).slice(mid);
    expect(moves.length).toBe(2);
    expect(moves[1]).toBe(`moved ${inPanel.size}`);
    await close();
    expect(errors).toEqual([]);
  });

  it("the frame's title icon opens the widget's titleMenu in the window, and it stays open; Enter opens it too", async () => {
    const { page, errors, close } = await openHarness(`${PO}&ov=1&wo=1`);
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#wo-po-btn')]);
    await popup.waitForSelector('.rdd-panel-float__content');
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    const icon = '.rdd-popout-frame__icon--menu';

    // Enter on the focused icon: the menu opens there and is still open a moment later.
    await popup.focus(icon);
    await popup.keyboard.press('Enter');
    await popup.waitForSelector('.rdd-context-menu');
    await settle(popup, 300);
    expect(await popup.$('.rdd-context-menu')).not.toBeNull();
    await popup.keyboard.press('Escape');
    await popup.waitForSelector('.rdd-context-menu', { state: 'detached' });

    // A click: the same, and its item runs (back into the panel closes the window).
    await popup.click(icon);
    await settle(popup, 300);
    expect(await popup.$('.rdd-context-menu')).not.toBeNull();
    expect(await page.$('.rdd-context-menu')).toBeNull();
    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-context-menu >> text=Back into the panel')]);
    await page.waitForSelector('[data-rdd-widget="wo"]');
    await close();
    expect(errors).toEqual([]);
  });
});

// S6: focus across windows. Headless Chromium can't show which OS window is in front, so the
// window coming forward is checked by the call it makes (the child window's focus() is counted),
// and activation by the page's active panel.

describe('focus across windows', () => {
  it('a click in the pop-out activates its panel; Escape there closes its menu only; the taskbar entry brings its window forward', async () => {
    const { page, errors, close } = await openHarness(PO);
    const popup = await popOutByClick(page);
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');

    // Activation: another panel active in the page, then a click inside the pop-out.
    await page.click('[data-tab-id="p1"]');
    await settle(page, 200);
    expect(await wmState(page, 'activePanelId')).toBe('p1');
    // A click on something that takes no focus: the pointerdown activates it.
    await popup.click('#po-count');
    await settle(page, 200);
    expect(await wmState(page, 'activePanelId')).toBe('pp');
    expect(await popup.getAttribute('.rdd-popout-frame', 'data-rdd-focused')).toBe('');
    // Focus moving in (no pointer) activates it too.
    await page.click('[data-tab-id="p1"]');
    await settle(page, 200);
    await popup.focus('#po-inc');
    await settle(page, 200);
    expect(await wmState(page, 'activePanelId')).toBe('pp');

    // A menu opened in the pop-out renders there; Escape in the page leaves it, Escape there closes it.
    await popup.evaluate(() => {
      const main = window.opener as unknown as { __wm: { actions: { showContextMenu(o: unknown): void } } };
      main.__wm.actions.showContextMenu({ event: { target: document.body, clientX: 20, clientY: 20 }, items: [{ label: 'Item', action: () => {} }] });
    });
    await popup.waitForSelector('.rdd-context-menu');
    expect(await page.$('.rdd-context-menu')).toBeNull();
    await page.keyboard.press('Escape');
    await settle(page, 150);
    expect(await popup.$('.rdd-context-menu')).not.toBeNull();
    await popup.keyboard.press('Escape');
    await popup.waitForSelector('.rdd-context-menu', { state: 'detached' });

    // The taskbar lists it while out; a click brings its window forward and activates it.
    await page.click('[data-tab-id="p1"]');
    await popup.evaluate(() => {
      const w = window as unknown as { __focusCalls: number };
      w.__focusCalls = 0;
      const original = window.focus.bind(window);
      window.focus = () => { w.__focusCalls += 1; original(); };
    });
    const entry = '[data-rdd-taskbar-popout="pp"]';
    expect(await page.$(entry)).not.toBeNull();
    await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).click(), entry);
    await settle(page, 200);
    expect(await popup.evaluate(() => (window as unknown as { __focusCalls: number }).__focusCalls)).toBe(1);
    expect(await wmState(page, 'activePanelId')).toBe('pp');

    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
    await settle(page, 200);
    expect(await page.$(entry)).toBeNull();
    await close();
    expect(errors).toEqual([]);
  });
});

// next.1: what the app hands the library (icons) and what the library renders in a pop-out besides
// the panel (the frame, menus, toasts) are inside the app's popoutWrapper there. Emotion with
// speedy (the production path): without the wrapper, these icons measure 0 x 0 in the window.

/** Size and colour of the Emotion-styled icon `name` in `p`, or null when it isn't there. */
const emoIcon = (p: Page, name: string, within = '') => p.evaluate(([n, w]) => {
  const el = document.querySelector(`${w} [data-emo-icon="${n}"]`.trim()) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(el).backgroundColor };
}, [name, within]);
const EMO_LOOK = { w: 16, h: 16, bg: 'rgb(200, 30, 40)' };

describe('popoutWrapper around the frame, menus and toasts (Emotion, speedy)', () => {
  it("the frame's icon and a menu item's icon look as in the page; a toast raised in the window shows there", async () => {
    const { page, errors, close } = await openHarness(`${PO}&emo=1`);
    // In the page: the tab's icon and a menu's item icon.
    expect(await emoIcon(page, 'frame', '[data-tab-id="pp"]')).toEqual(EMO_LOOK);
    await page.click('#po-menu');
    await page.waitForSelector('.rdd-context-menu');
    expect(await emoIcon(page, 'menu', '.rdd-context-menu')).toEqual(EMO_LOOK);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.rdd-context-menu', { state: 'detached' });

    const popup = await popOutByClick(page);
    popup.setDefaultTimeout(5000);
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    expect(await emoIcon(popup, 'frame', '.rdd-popout-frame__icon')).toEqual(EMO_LOOK);

    // A menu opened from inside the window: there, its item's icon styled, and it can be clicked.
    await popup.click('#po-menu');
    await popup.waitForSelector('.rdd-context-menu');
    expect(await page.$('.rdd-context-menu')).toBeNull();
    expect(await emoIcon(popup, 'menu', '.rdd-context-menu')).toEqual(EMO_LOOK);
    await popup.click('.rdd-context-menu__item:has-text("Emo item")');
    await popup.waitForSelector('.rdd-context-menu', { state: 'detached' });

    // A toast raised by a click in the window shows in the window, its icon styled; not in the page.
    await popup.click('#po-toast');
    await popup.waitForSelector('.rdd-toast:has-text("from pp")');
    expect(await page.$('.rdd-toast:has-text("from pp")')).toBeNull();
    expect(await emoIcon(popup, 'toast', '.rdd-toast')).toEqual(EMO_LOOK);
    // (Raised from the page, it shows in the page: Playwright reports hasFocus() true in every page,
    // so that half stubs the pop-out's; see "testing toasts across windows" below, and PC2.)

    // Its window closing takes it away.
    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
    await settle(page, 300);
    expect(await page.$('.rdd-toast:has-text("from pp")')).toBeNull();
    await close();
    expect(errors).toEqual([]);
  });

  it("a widget's frame icon is styled and clickable in the window; its titleMenu's icons too", async () => {
    const { page, errors, close } = await openHarness(`${PO}&ov=1&wo=1&emo=1`);
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#wo-po-btn')]);
    await popup.waitForSelector('.rdd-panel-float__content');
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    expect(await emoIcon(popup, 'wo', '.rdd-popout-frame__icon--menu')).toEqual(EMO_LOOK);
    await popup.click('.rdd-popout-frame__icon--menu');
    await popup.waitForSelector('.rdd-context-menu');
    expect(await emoIcon(popup, 'wo-menu', '.rdd-context-menu')).toEqual(EMO_LOOK);
    await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-context-menu >> text=Back into the panel')]);
    await page.waitForSelector('[data-rdd-widget="wo"]');
    await close();
    expect(errors).toEqual([]);
  });
});

// next.1: the frame's way back is a title-bar button in the skin, as a floating window's.

/** The look of a button in `p`. */
const buttonLook = (p: Page, sel: string) => p.evaluate((s) => {
  const el = document.querySelector(s) as HTMLElement;
  const c = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bg: c.backgroundColor, border: c.borderTopColor, color: c.color, radius: c.borderTopLeftRadius };
}, sel);

describe("the frame's return button", () => {
  for (const [skin, scheme] of [['', 'dark'], ['', 'light'], ['nord', 'dark'], ['nord', 'light']] as const) {
    it(`looks like a floating window's title-bar button (${skin || 'default skin'}, ${scheme}); its label is the tooltip and the name`, async () => {
      const { page, errors, close } = await openHarness(`${PO}&cs=${scheme}${skin ? `&skin=${skin}` : ''}`);
      const inPage = await buttonLook(page, '[data-rdd-window="p4"] .rdd-btn-minimize-tab');
      const popup = await popOutByClick(page);
      await popup.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
      const back = '.rdd-popout-frame__return';
      expect(await buttonLook(popup, back)).toEqual(inPage);
      expect(await popup.getAttribute(back, 'title')).toBe('Return to desktop');
      expect(await popup.getAttribute(back, 'aria-label')).toBe('Return to desktop');
      await close();
      expect(errors).toEqual([]);
    });
  }
});

// 7.12.0: when the four events arrive. popping-out and returning while the panel is still in its
// old place at its size; popped-out and returned once it is laid out in its new place, so a resize()
// there sees the new size. At each event, where the panel's element is and its size.

type Seen = { type: string; where: string; w: number; h: number };

/** Records, at each of the four events, the panel element's document and size (in `window.__poSeen`). */
const recordEvents = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __poSeen: Seen[]; __wm: { actions: { subscribe(t: string, cb: () => void): () => void } } };
  w.__poSeen = [];
  const el = document.querySelector('[data-rdd-panel="pp"]')!.closest('.rdd-panel-dom') as HTMLElement;
  for (const type of ['panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:returned']) {
    w.__wm.actions.subscribe(type, () => {
      w.__poSeen.push({ type, where: el.ownerDocument === document ? 'page' : 'window', w: el.offsetWidth, h: el.offsetHeight });
    });
  }
  return { w: el.offsetWidth, h: el.offsetHeight };
});
const seenEvents = (page: Page) => page.evaluate(() => (window as unknown as { __poSeen: Seen[] }).__poSeen);
/** The size of the pop-out's slot, which the panel fills. */
const slotSize = (p: Page) => p.evaluate(() => {
  const slot = document.querySelector('.rdd-popout-frame__body') as HTMLElement;
  return { w: slot.offsetWidth, h: slot.offsetHeight };
});

describe('the pop-out events, against the layout', () => {
  for (const [name, query] of [['a blank window', PO], ['popoutUrl', `${PO}&pourl=1`]] as const) {
    it(`${name}: popping-out and returning at the old place and size, popped-out and returned laid out in the new one`, async () => {
      const { page, errors, close } = await openHarness(query);
      const inPage = await recordEvents(page);
      expect(inPage.w).toBeGreaterThan(100);
      expect(inPage.h).toBeGreaterThan(100);

      const popup = await popOutByClick(page);
      await page.waitForFunction(() => (window as unknown as { __poSeen: Seen[] }).__poSeen.length >= 2);
      await settle(popup, 300);
      const inWindow = await slotSize(popup);
      expect(inWindow.w).toBeGreaterThan(100);
      expect(await seenEvents(page)).toEqual([
        { type: 'panel:popping-out', where: 'page', ...inPage },
        { type: 'panel:popped-out', where: 'window', ...inWindow },
      ]);

      await Promise.all([popup.waitForEvent('close'), popup.click('.rdd-popout-frame__return')]);
      await page.waitForFunction(() => (window as unknown as { __poSeen: Seen[] }).__poSeen.length >= 4);
      expect((await seenEvents(page)).slice(2)).toEqual([
        { type: 'panel:returning', where: 'window', ...inWindow },
        { type: 'panel:returned', where: 'page', ...inPage },
      ]);
      await close();
      expect(errors).toEqual([]);
    });
  }
});

// The guide's recipe for testing which window a toast goes to: Playwright reports document.hasFocus()
// true in every page (focus emulation), so the page that should not have focus says so with a stub.
describe('testing toasts across windows (the guide\'s recipe)', () => {
  it('with the pop-out\'s hasFocus stubbed false, a toast raised from the page shows in the page', async () => {
    const { page, errors, close } = await openHarness(PO);
    const popup = await popOutByClick(page);
    await popup.evaluate(() => { document.hasFocus = () => false; });
    await page.evaluate(() => { (window as unknown as { __wm: { toast(m: string): void } }).__wm.toast('from the page'); });
    await page.waitForSelector('.rdd-toast:has-text("from the page")');
    expect(await popup.$('.rdd-toast:has-text("from the page")')).toBeNull();
    await close();
    expect(errors).toEqual([]);
  });
});

// 7.12.1: a pop-out from a click inside a pop-out window. The click activates that window, not the
// main page, so the new window must be opened from there (the main page's window.open is blocked).
// Harness opo=1: p3 (the widget's owner) can pop out (#ov-po-btn), and #wo-po-in inside p3 pops the
// widget out; po2=1: #po-pop-q inside pp pops pq out.

/** Waits for the context to hold `n` pages, and returns the newest. */
async function nthPage(page: Page, n: number): Promise<Page> {
  await expect.poll(() => page.context().pages().length).toBe(n);
  const next = page.context().pages()[n - 1];
  await next.waitForLoadState();
  return next;
}
/**
 * Playwright runs page.evaluate (and its waits) as a user gesture, so the main page holds a
 * transient activation for a while after any call into it (5 s in Chrome): wait that out, without
 * touching the main page, so the click inside the pop-out is the only activation, as for a user.
 */
const mainActivationExpired = () => new Promise(r => setTimeout(r, 5500));
/** The widget's WebGL context, held in the main page's globals, is still alive. */
const woGlAlive = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __woLost: number; __woGl: WebGLRenderingContext | null };
  return !!w.__woGl && !w.__woGl.isContextLost() && w.__woLost === 0;
});
const woFillMarked = (p: Page) => p.evaluate(() => {
  const fill = document.getElementById('wo-fill') as (HTMLElement & { __mark?: string }) | null;
  return { here: !!fill, same: fill?.__mark === 'original', count: document.getElementById('wo-count')?.textContent ?? null };
});

describe('a pop-out from a click inside a pop-out window (7.12.1)', () => {
  it("a widget, from its owner's window: a second window with the widget; closing it puts the widget back into its panel there", async () => {
    const { page, errors, close } = await openHarness(`${PO}&ov=1&wo=1&opo=1`);
    await page.evaluate(() => { (document.getElementById('wo-fill') as HTMLElement & { __mark?: string }).__mark = 'original'; });
    await page.click('#wo-inc');

    // The owner panel into its window, from the page's own button.
    const [owner] = await Promise.all([page.waitForEvent('popup'), page.click('#ov-po-btn')]);
    await owner.waitForLoadState();
    await owner.waitForSelector('[data-rdd-widget="wo"] #wo-fill');
    await owner.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    await settle(owner, 300);
    await mainActivationExpired();

    // A click inside the owner's window pops the widget out.
    await owner.click('#wo-po-in');
    expect(await page.evaluate(() => (window as unknown as { __woPopResult: unknown }).__woPopResult)).toEqual({ ok: true });
    const widgetWin = await nthPage(page, 3);
    await widgetWin.waitForSelector('#wo-fill');
    await widgetWin.waitForFunction(() => getComputedStyle(document.querySelector('.rdd-popout-frame')!).visibility === 'visible');
    await settle(widgetWin, 300);
    expect(await woFillMarked(widgetWin)).toEqual({ here: true, same: true, count: '1' });
    // Opened by the owner's window, the one the user clicked.
    expect(await widgetWin.evaluate(() => window.opener?.name)).toMatch(/^rdd-popout-p3-/);
    expect(await owner.$('#wo-fill')).toBeNull();
    expect(await page.$('#wo-fill')).toBeNull();
    expect(await wmState(page, 'panels.p3.poppedOut')).toBe(true);
    expect(await woGlAlive(page)).toBe(true);

    // Closing it: back into its panel, inside the owner's window.
    await widgetWin.close();
    await owner.waitForSelector('[data-rdd-widget="wo"] #wo-fill');
    await settle(owner, 300);
    expect(await woFillMarked(owner)).toEqual({ here: true, same: true, count: '1' });
    expect(await page.$('#wo-fill')).toBeNull();
    expect(await woGlAlive(page)).toBe(true);
    await close();
    expect(errors).toEqual([]);
  });

  it("a panel, from a button in another panel's window: its window opens", async () => {
    const { page, errors, close } = await openHarness(`${PO}&po2=1`);
    const pp = await popOutByClick(page);
    await pp.waitForSelector('#po-pop-q');
    await mainActivationExpired();
    await pp.click('#po-pop-q');
    expect(await page.evaluate(() => (window as unknown as { __poqResult: unknown }).__poqResult)).toEqual({ ok: true });
    const pq = await nthPage(page, 3);
    await pq.waitForSelector('[data-rdd-panel="pq"]');
    expect(await pq.evaluate(() => window.opener?.name)).toMatch(/^rdd-popout-pp-/);
    expect(await wmState(page, 'panels.pq.poppedOut')).toBe(true);
    expect(await page.$('[data-rdd-panel="pq"]')).toBeNull();
    await close();
    expect(errors).toEqual([]);
  });
});
