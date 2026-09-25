import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, actions } from './lib';

// Panels are never unmounted: their DOM is moved between slots (tab group, floating window,
// the hidden parking container). React state survives that; browser state did not — a detached
// or display:none subtree loses its scroll offsets, and the focused element loses focus. Every
// tab switch, minimize/restore, float and dock went through it.

const scrollOf = (page: Page, id: string) =>
  page.evaluate(i => (document.getElementById(`sc-${i}`) as HTMLElement | null)?.scrollTop ?? -1, id);
const setScroll = async (page: Page, id: string, top: number) => {
  await page.evaluate(([i, t]) => { (document.getElementById(`sc-${i}`) as HTMLElement).scrollTop = Number(t); }, [id, top] as const);
  await page.waitForTimeout(100);
};
const settle = (page: Page) => page.waitForTimeout(250);

describe('scroll position survives every transition', () => {
  const transitions: Array<[string, (p: Page) => Promise<void>]> = [
    ['switch tabs and back', async p => { await p.click('[data-tab-id="p1"]'); await settle(p); await p.click('[data-tab-id="p2"]'); }],
    ['minimize and restore (docked)', async p => { await actions(p, 'minimizePanel', 'p2'); await settle(p); await actions(p, 'restorePanel', 'p2'); }],
    ['float', async p => { await actions(p, 'floatPanel', 'p2'); }],
    ['float, then dock again', async p => { await actions(p, 'floatPanel', 'p2'); await settle(p); await actions(p, 'dockPanel', 'p2'); }],
  ];
  for (const [name, run] of transitions) {
    it(name, async () => {
      const { page, errors, close } = await openHarness();
      await setScroll(page, 'p2', 300);
      expect(await scrollOf(page, 'p2')).toBe(300);
      await run(page);
      await settle(page);
      expect(await scrollOf(page, 'p2')).toBe(300);
      expect(errors).toEqual([]);
      await close();
    });
  }

  it('minimize and restore (floating)', async () => {
    const { page, close } = await openHarness();
    await setScroll(page, 'p4', 300);
    await actions(page, 'minimizePanel', 'p4');
    await settle(page);
    await actions(page, 'restorePanel', 'p4');
    await settle(page);
    expect(await scrollOf(page, 'p4')).toBe(300);
    await close();
  });
});

describe('focus survives transitions of the active panel', () => {
  const focusInput = async (page: Page) => {
    await page.click('#in-p2');
    await page.evaluate(() => { const i = document.getElementById('in-p2') as HTMLInputElement; i.setSelectionRange(5, 5); });
  };
  const focusState = (page: Page) => page.evaluate(() => {
    const a = document.activeElement as HTMLInputElement | null;
    return { id: a?.id ?? a?.tagName, caret: a?.selectionStart ?? null };
  });

  const transitions: Array<[string, (p: Page) => Promise<void>]> = [
    ['float', async p => { await actions(p, 'floatPanel', 'p2'); }],
    ['float, then dock again', async p => { await actions(p, 'floatPanel', 'p2'); await settle(p); await actions(p, 'dockPanel', 'p2'); }],
    ['minimize and restore', async p => { await actions(p, 'minimizePanel', 'p2'); await settle(p); await actions(p, 'restorePanel', 'p2'); }],
  ];
  for (const [name, run] of transitions) {
    it(name, async () => {
      const { page, close } = await openHarness();
      await focusInput(page);
      expect(await focusState(page)).toEqual({ id: 'in-p2', caret: 5 });
      await run(page);
      await settle(page);
      expect(await focusState(page)).toEqual({ id: 'in-p2', caret: 5 });
      await close();
    });
  }

  it('a panel restored in the background does not take focus', async () => {
    const { page, close } = await openHarness();
    await focusInput(page);
    await actions(page, 'minimizePanel', 'p2');
    await settle(page);
    // The user moves on to p3, in the other group (a restore into p2's own group would show p2
    // there and hide whatever tab had focus, whatever the library did).
    await page.click('#in-p3');
    await actions(page, 'restorePanel', 'p2', { focus: false });
    await settle(page);
    expect((await focusState(page)).id).toBe('in-p3');
    await close();
  });

  it('does not take focus back from elsewhere on the page', async () => {
    const { page, close } = await openHarness();
    await focusInput(page);
    await page.click('#before'); // focus leaves the workspace for the host page
    await page.click('[data-tab-id="p1"]');
    await settle(page);
    await page.focus('#before');
    await actions(page, 'focusPanel', 'p2');
    await settle(page);
    expect((await focusState(page)).id).toBe('before');
    await close();
  });
});
