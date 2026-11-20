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
