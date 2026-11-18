import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, rectOf, drag } from './lib';

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
    // Free first, then onto the top-left drop zone.
    await drag(page, title.x + 20, title.y + 8, title.x - 60, title.y - 60);
    await drag(page, title.x - 40, title.y - 52, overlay.x + 20, overlay.y + 20);
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
