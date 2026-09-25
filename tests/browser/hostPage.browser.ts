import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright-core';
import { inject } from 'vitest';
import { openHarness, rectOf } from './lib';

// The stylesheet no longer styles html, body or #root. Until 7.0 it fixed them to 100% height with
// overflow hidden, which stopped every host page from scrolling; a full-window app now opts in
// with the rdd-fill-viewport class.

describe('the host page is the host page’s business', () => {
  it('a workspace embedded in a card on a long page leaves the page scrollable', async () => {
    const { page, close } = await openHarness('card=1');
    const overflow = await page.evaluate(() => [getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow]);
    expect(overflow).toEqual(['visible', 'visible']);
    await page.mouse.move(640, 600);
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    await close();
  });

  it('rdd-fill-viewport fills the window and the page does not scroll', async () => {
    const { page, close } = await openHarness();
    const ws = await rectOf(page, '.rdd-fill-viewport');
    expect(Math.round(ws.height)).toBe(800);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(800);
    await close();
  });

  it('a full-window app without it gets a development warning naming the fix', async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const warnings: string[] = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.goto(inject('harnessUrl') + '?grow=1&ntabs=40');
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(tall, 'harness: the page should outgrow the window without rdd-fill-viewport').toBe(true);
    expect(warnings.some(w => w.includes('rdd-fill-viewport'))).toBe(true);
    await browser.close();
  });
});

// Layout the library depends on is in its stylesheet, not inline styles, so a host rule wins.
describe('host CSS can override the library\'s structural layout', () => {
  it('the tab bar height and the sidebar strip width', async () => {
    const { page, close } = await openHarness();
    await page.addStyleTag({ content: '.rdd-workspace-tab-bar { min-height: 50px; } .rdd-sidebar-strip-wrap { width: 64px; } .rdd-sidebar-tabs-strip { width: 64px; }' });
    await page.waitForTimeout(400); // the strip wrap animates width changes over 0.25s
    expect(Math.round((await rectOf(page, '.rdd-workspace-tab-bar')).height)).toBeGreaterThanOrEqual(50);
    expect(Math.round((await rectOf(page, '.rdd-sidebar-strip-wrap')).width)).toBe(64);
    await close();
  });
});
