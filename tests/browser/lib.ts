/**
 * Helpers for the real-browser suite. Google Chrome (installed on the machine) is driven through
 * playwright-core, so no browser download is needed.
 *
 * Lessons this encodes (see the history of this repo's layout bugs):
 * - jsdom has no layout; anything about geometry, colour, focus or Tab order is checked here.
 * - Each check gets a fresh page: chrome left over from one step occludes the next.
 * - Short action timeouts, so one unreachable control fails in seconds with its own name.
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { inject, afterAll } from 'vitest';

let browser: Browser | undefined;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    afterAll(async () => { await browser?.close(); browser = undefined; });
  }
  return browser;
}

export interface HarnessPage {
  page: Page;
  errors: string[];
  close: () => Promise<void>;
}

/** Opens the harness with the given query string and waits for its initial layout. */
export async function openHarness(query = '', viewport = { width: 1280, height: 800 }): Promise<HarnessPage> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(inject('harnessUrl') + (query ? `?${query}` : ''));
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 15000 });
  await settle(page, 300);
  return { page, errors, close: () => context.close() };
}

/**
 * Waits until the page is still: two consecutive animation frames with no running CSS transition
 * or animation and no DOM change — or `ceiling` ms at most, the fixed sleep this replaces, so a
 * page is never read earlier than the old sleep allowed when something is still moving. Infinite
 * animations (spinners) never finish, so they are not waited for. A timer that changes nothing
 * until it fires is invisible to it: the callers that depend on one keep their fixed wait.
 */
export async function settle(page: Page, ceiling: number): Promise<void> {
  await page.evaluate(async (max) => {
    const start = performance.now();
    let mutated = false;
    const observer = new MutationObserver(() => { mutated = true; });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    const moving = () => document.getAnimations().some(a =>
      (a.playState === 'running' || a.pending) && a.effect?.getComputedTiming().iterations !== Infinity);
    try {
      for (let still = 0; still < 2 && performance.now() - start < max;) {
        await frame();
        still = mutated || moving() ? 0 : still + 1;
        mutated = false;
      }
    } finally {
      observer.disconnect();
    }
  }, ceiling);
}

export interface Rect { x: number; y: number; width: number; height: number; right: number; bottom: number }

export async function rectOf(page: Page, selector: string): Promise<Rect> {
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom };
  }, selector);
  if (!r) throw new Error(`no element matches ${selector}`);
  return r;
}

/** A trusted pointer drag (works with the library's setPointerCapture drag paths). */
export async function drag(page: Page, x0: number, y0: number, x1: number, y1: number, steps = 12): Promise<void> {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + (x1 - x0) * 0.1, y0 + (y1 - y0) * 0.1, { steps: 3 });
  await page.mouse.move(x1, y1, { steps });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/** Workspace actions, run in the page. */
export function actions(page: Page, fn: string, ...args: unknown[]): Promise<void> {
  return page.evaluate(([f, a]) => {
    const wm = (window as unknown as { __wm: { actions: Record<string, (...x: unknown[]) => void> } }).__wm;
    wm.actions[f as string](...(a as unknown[]));
  }, [fn, args] as const);
}

export function wmState<T>(page: Page, pick: string): Promise<T> {
  return page.evaluate((p) => {
    const s = (window as unknown as { __wm: { state: Record<string, unknown> } }).__wm.state;
    return p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], s);
  }, pick) as Promise<T>;
}
