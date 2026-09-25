import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, actions, rectOf } from './lib';

// Keyboard access in a real browser: the Tab order, the visible focus ring (WCAG 2.4.7), RTL
// arrow keys in the tab strip, and the keyboard context-menu key. jsdom can't check any of these:
// it has no focus-ring rendering, no real Tab traversal and no computed direction.

const focusedInfo = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return null;
  const cs = getComputedStyle(a);
  return { cls: a.className, role: a.getAttribute('role'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
});

/** Tabs forward until `match` is focused; returns its focus info, or null after `max` presses. */
async function tabTo(page: Page, match: (cls: string, role: string | null) => boolean, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await focusedInfo(page);
    if (f && match(String(f.cls), f.role)) return f;
  }
  return null;
}

describe('keyboard focus', () => {
  const targets: Array<[string, (cls: string, role: string | null) => boolean]> = [
    ['a toolbar button', c => c.includes('rdd-toolbar-btn')],
    ['a sidebar tab button', c => c.includes('rdd-sidebar-tab-btn')],
    ['a workspace tab', (c, r) => r === 'tab' && c.includes('rdd-workspace-tab')],
    ['a taskbar item', c => c.includes('rdd-taskbar-glassmorphic-item')],
  ];
  for (const [name, match] of targets) {
    it(`Tab reaches ${name}, and it shows a focus ring`, async () => {
      const { page, close } = await openHarness();
      await actions(page, 'minimizePanel', 'p3'); // gives the taskbar an item
      await page.waitForTimeout(300);
      await page.focus('#before');
      const f = await tabTo(page, match);
      expect(f, `${name} was never reached by Tab`).not.toBeNull();
      expect(f!.outline).toMatch(/^solid [2-9]/);
      await close();
    });
  }

  it('a mouse click does not show the ring', async () => {
    const { page, close } = await openHarness();
    await page.click('.rdd-toolbar-btn >> nth=0');
    const f = await focusedInfo(page);
    expect(f!.outline.startsWith('none')).toBe(true);
    await close();
  });
});

describe('tab strip arrow keys follow the screen', () => {
  for (const dir of ['', 'ws']) {
    it(`ArrowRight moves to the tab physically on the right${dir ? ' (RTL)' : ' (LTR)'}`, async () => {
      const { page, close } = await openHarness(`ntabs=2${dir ? `&dir=${dir}` : ''}`);
      await page.click('[data-tab-id="t0"]');
      await page.focus('[data-tab-id="t0"]');
      const before = await rectOf(page, '[data-tab-id="t0"]');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
      const focusedId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.tabId!);
      const after = await rectOf(page, `[data-tab-id="${focusedId}"]`);
      expect(focusedId).not.toBe('t0');
      expect(after.x).toBeGreaterThan(before.x);
      await close();
    });
  }
});

describe('context menu from the keyboard', () => {
  it('Shift+F10 on a focused tab opens its menu there, with the first item focused', async () => {
    const { page, close } = await openHarness();
    await page.focus('[data-tab-id="p2"]');
    const tab = await rectOf(page, '[data-tab-id="p2"]');
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('.rdd-context-menu');
    const menu = await rectOf(page, '.rdd-context-menu');
    expect(Math.abs(menu.x - tab.x)).toBeLessThan(40);
    expect(Math.abs(menu.y - tab.bottom)).toBeLessThan(40);
    const f = await focusedInfo(page);
    expect(f!.role).toMatch(/^menuitem/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.tabId)).toBe('p2');
    await close();
  });
});

describe('Delete on a focused tab keeps keyboard focus in the workspace', () => {
  const activeTab = (page: Page) => page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    return a === document.body ? 'BODY' : (a.getAttribute('data-tab-id') ?? (a.closest('.rdd-workspace') ? 'workspace' : a.tagName));
  });
  it('closing a tab focuses the tab selected in its place', async () => {
    const { page, close } = await openHarness();
    await page.focus('[data-tab-id="p1"]');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect(await activeTab(page)).toBe('p2');
    await close();
  });
  it('closing the last tab of a group keeps focus inside the workspace', async () => {
    const { page, close } = await openHarness();
    await page.focus('[data-tab-id="p3"]');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    const where = await activeTab(page);
    expect(where).not.toBe('BODY');
    expect(['p1', 'p2', 'workspace']).toContain(where);
    await close();
  });
  it('a tab whose close is refused keeps focus', async () => {
    const { page, close } = await openHarness();
    await page.evaluate(() => (window as unknown as { __wm: { actions: { registerCloseGuard: (id: string, g: () => boolean) => void } } }).__wm.actions.registerCloseGuard('p1', () => false));
    await page.focus('[data-tab-id="p1"]');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect(await activeTab(page)).toBe('p1');
    await close();
  });
});

describe('toolbar group flyout from the keyboard', () => {
  const focused = (page: Page) => page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    return { role: a.getAttribute('role'), label: a.textContent?.trim() ?? '', trigger: a.classList.contains('rdd-toolbar-btn-group') };
  });
  it('opens with focus on an item, moves with the arrow keys, and Escape returns focus to the trigger', async () => {
    const { page, close } = await openHarness();
    await page.focus('.rdd-toolbar-btn-group');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.rdd-toolbar-group-flyout');
    const first = await focused(page);
    expect(first.role).toBe('menuitemradio');
    await page.keyboard.press('ArrowDown');
    const second = await focused(page);
    expect(second.role).toBe('menuitemradio');
    expect(second.label).not.toBe(first.label);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await page.$('.rdd-toolbar-group-flyout')).toBeNull();
    expect((await focused(page)).trigger).toBe(true);
    await close();
  });
  it('choosing an item with Enter closes the flyout and returns focus to the trigger', async () => {
    const { page, close } = await openHarness();
    await page.focus('.rdd-toolbar-btn-group');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.rdd-toolbar-group-flyout');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    expect(await page.$('.rdd-toolbar-group-flyout')).toBeNull();
    expect((await focused(page)).trigger).toBe(true);
    await close();
  });
});
