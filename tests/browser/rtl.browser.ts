import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, rectOf, drag, type Rect } from './lib';

// Right-to-left, checked physically: what the pointer does versus what moves on screen.
// Pointer deltas are physical, while the sizes, sides and indexes they change are logical, and a
// flex row reverses under RTL — so every one of these went the wrong way before 6.4.0.
//
// Where RTL is set matters, because each piece of chrome reads direction differently:
//   ws   = setDirection('rtl')   (the workspace element gets dir="rtl")
//   prov = provider dir="rtl"
//   html = <html dir="rtl">       (the workspace itself keeps its own dir, ltr by default)
//   wrap = a <div dir="rtl"> around the whole app
//   body = <body dir="rtl">

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));

describe('RTL: split divider (R1)', () => {
  for (const dir of ['', 'ws', 'prov']) {
    it(`follows the pointer${dir ? ` (dir=${dir})` : ' (LTR control)'}`, async () => {
      const { page, close } = await openHarness(dir ? `dir=${dir}` : '');
      const bar = await rectOf(page, '.rdd-split > .rdd-resizer-bar');
      const y = bar.y + bar.height / 2;
      await drag(page, bar.x, y, bar.x + 100, y);
      const after = await rectOf(page, '.rdd-split > .rdd-resizer-bar');
      expect(Math.round(after.x - bar.x)).toBeGreaterThan(90);
      await close();
    });
  }
});

describe('RTL: sidebar drawer resizer (R2)', () => {
  for (const [q, label] of [['', 'LTR control'], ['dir=html', 'html'], ['dir=wrap', 'wrap'], ['dir=body', 'body'], ['dir=html&sb=right', 'html, right sidebar']]) {
    it(`dragging away from the tab strip widens the drawer (${label})`, async () => {
      const { page, close } = await openHarness(q);
      await page.click('.rdd-sidebar-tab-btn');
      await page.waitForTimeout(400);
      const strip = await rectOf(page, '.rdd-sidebar-tabs-strip');
      const drawer = await rectOf(page, '.rdd-sidebar-content-drawer');
      const bar = await rectOf(page, '.rdd-sidebar-layout > .rdd-resizer-bar');
      const away = Math.sign(bar.x - strip.x); // the resizer is on the drawer's far side from the strip
      const y = bar.y + bar.height / 2;
      await drag(page, bar.x, y, bar.x + away * 80, y);
      const after = await rectOf(page, '.rdd-sidebar-content-drawer');
      expect(Math.round(after.width - drawer.width)).toBeGreaterThan(60);
      await close();
    });
  }
});

describe('RTL: toolbar flyout (R3)', () => {
  for (const [q, label] of [['', 'LTR control'], ['dir=html', 'html'], ['dir=body', 'body'], ['dir=wrap', 'wrap'], ['dir=wrap&tbpos=right', 'wrap, right toolbar']]) {
    it(`opens beside its strip, not over it (${label})`, async () => {
      const { page, close } = await openHarness(q);
      await page.click('.rdd-toolbar-btn-group');
      await page.waitForSelector('.rdd-toolbar-group-flyout');
      const strip = await rectOf(page, '.rdd-toolbar-strip');
      const flyout = await rectOf(page, '.rdd-toolbar-group-flyout');
      expect(overlap(strip, flyout)).toBe(0);
      await close();
    });
  }
});

describe('RTL: context-menu submenu (R4)', () => {
  const openSubmenu = async (page: Page, x: number) => {
    await page.evaluate(([cx]) => {
      document.querySelector('#ctx')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: 60 }));
    }, [x]);
    await page.waitForSelector('.rdd-context-menu');
    await page.locator('.rdd-context-menu [role^="menuitem"]', { hasText: 'Sub menu' }).hover();
    await page.waitForTimeout(400);
    const menus = await page.evaluate(() => Array.from(document.querySelectorAll('.rdd-context-menu')).map(e => {
      const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    }));
    return { main: menus[0], sub: menus[1] };
  };
  for (const [q, label] of [['', 'LTR control'], ['dir=html', 'html'], ['dir=wrap', 'wrap']]) {
    for (const x of [300, 900]) {
      it(`opens next to the menu (${label}, menu at x=${x})`, async () => {
        const { page, close } = await openHarness(q);
        const { main, sub } = await openSubmenu(page, x);
        expect(sub, 'submenu did not open').toBeDefined();
        const horizontalOverlap = Math.max(0, Math.min(main.right, sub.right) - Math.max(main.x, sub.x));
        expect(horizontalOverlap, JSON.stringify({ main, sub })).toBeLessThanOrEqual(4); // a shared border at most
        const gap = Math.min(Math.abs(sub.x - main.right), Math.abs(main.x - sub.right));
        expect(gap).toBeLessThan(12);
        expect(sub.x).toBeGreaterThanOrEqual(0);
        expect(sub.right).toBeLessThanOrEqual(1280);
        await close();
      });
    }
  }
});

describe('RTL: tab drop side (R5)', () => {
  for (const dir of ['', 'ws']) {
    it(`a tab dropped on the physical left half of another lands on its left${dir ? ' (RTL)' : ' (LTR control)'}`, async () => {
      const { page, close } = await openHarness(`ntabs=2${dir ? `&dir=${dir}` : ''}`);
      const target = await rectOf(page, '[data-tab-id="p2"]');
      const src = await rectOf(page, '[data-tab-id="t1"]');
      await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
      await page.mouse.down();
      await page.mouse.move(src.x + src.width / 2 + 10, src.y + src.height / 2, { steps: 3 });
      await page.mouse.move(target.x + target.width * 0.2, target.y + target.height / 2, { steps: 12 });
      await page.waitForTimeout(80);
      await page.mouse.up();
      await page.waitForTimeout(300);
      const moved = await rectOf(page, '[data-tab-id="t1"]');
      const p2 = await rectOf(page, '[data-tab-id="p2"]');
      expect(moved.x).toBeLessThan(p2.x);
      expect(Math.abs(moved.right - p2.x)).toBeLessThan(6); // immediately to its left
      await close();
    });
  }
});

describe('RTL: tab-strip scroll buttons (R6)', () => {
  const buttons = (page: Page) => page.evaluate(() => {
    const container = document.querySelector('.rdd-tab-headers-container')!;
    const strip = container.getBoundingClientRect();
    return Array.from(container.parentElement!.querySelectorAll<HTMLElement>('.rdd-tab-scroll-btn'))
      .filter(b => b.getBoundingClientRect().width > 0)
      .map(b => (b.getBoundingClientRect().x < strip.x ? 'left' : 'right'));
  });
  // Whether tabs are hidden off each physical edge of the strip.
  const hidden = (page: Page) => page.evaluate(() => {
    const container = document.querySelector('.rdd-tab-headers-container')!; // the first group's strip only
    const strip = container.getBoundingClientRect();
    const tabs = Array.from(container.querySelectorAll('[data-tab-id]')).map(t => t.getBoundingClientRect());
    return { left: tabs.some(t => t.x < strip.x - 2), right: tabs.some(t => t.right > strip.right + 2) };
  });

  // The buttons scroll smoothly: wait until the strip stops moving before measuring.
  const settled = async (page: Page) => {
    let last = NaN;
    let stable = 0;
    for (let i = 0; i < 40 && stable < 3; i++) {
      await page.waitForTimeout(100);
      const now = await page.evaluate(() => (document.querySelector('.rdd-tab-headers-container') as HTMLElement).scrollLeft);
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
    await page.waitForTimeout(80); // one more frame for the button state to follow
  };

  for (const dir of ['', 'ws']) {
    it(`show on the side with hidden tabs, and scroll toward them${dir ? ' (RTL)' : ' (LTR control)'}`, async () => {
      const { page, close } = await openHarness(`ntabs=12${dir ? `&dir=${dir}` : ''}`);
      // Tabs start at the reading-start edge, so the overflow is off the far edge.
      const far = dir ? 'left' : 'right';
      const near = dir ? 'right' : 'left';
      let h = await hidden(page);
      expect(h[far], 'tabs should be hidden off the far edge at start').toBe(true);
      expect(h[near]).toBe(false);
      expect(await buttons(page)).toEqual([far]);
      for (let i = 0; i < 20 && h[far]; i++) {
        await page.locator('.rdd-workspace-tab-bar').first().locator('.rdd-tab-scroll-btn').locator('visible=true').nth((await buttons(page)).indexOf(far)).click();
        await settled(page);
        h = await hidden(page);
        const b = await buttons(page);
        expect(b.includes('left'), `step ${i}: left button vs hidden-left`).toBe(h.left);
        const dbg = await page.evaluate(() => { const c = document.querySelector('.rdd-tab-headers-container') as HTMLElement; const r = c.getBoundingClientRect(); const t = Array.from(c.querySelectorAll('[data-tab-id]')).map(x => x.getBoundingClientRect()); return JSON.stringify({ sl: c.scrollLeft, sw: c.scrollWidth, cw: c.clientWidth, x: r.x, right: r.right, firstX: t[0].x, lastR: t[t.length - 1].right }); });
        expect(b.includes('right'), `step ${i}: right button vs hidden-right ${dbg}`).toBe(h.right);
      }
      expect(h[far], 'the far-edge button never reached the end').toBe(false);
      expect(await buttons(page)).toEqual([near]);
      await close();
    });
  }
});
