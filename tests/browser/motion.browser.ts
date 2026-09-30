import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness } from './lib';

// Reduced motion (7.4.0): when the system asks for less motion, the library's own transitions and
// animations stop — the same rule `animations={false}` applies — and the page's own do not.

/** Every rdd- element (and pseudo) whose computed transition or animation is not "none / 0s". */
const moving = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  const dur = (v: string) => v.split(',').some(t => parseFloat(t) > 0);
  for (const el of document.querySelectorAll('[class*="rdd-"]')) {
    for (const pseudo of ['', '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo || null);
      if (dur(cs.transitionDuration) || (cs.animationName !== 'none' && dur(cs.animationDuration))) {
        out.push(`${(el as HTMLElement).className}${pseudo}`);
      }
    }
  }
  return out;
});

describe('prefers-reduced-motion', () => {
  it('stops every library transition and animation when the user asks for reduced motion', async () => {
    const { page, errors, close } = await openHarness('ov=1');
    const before = await moving(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const after = await moving(page);
    await close();
    expect(errors).toEqual([]);
    expect(before.length, 'nothing in the scene animates, so the check proves nothing').toBeGreaterThan(5);
    expect(after).toEqual([]);
  });

  it("leaves the page's own transitions alone", async () => {
    const { page, close } = await openHarness('');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const own = await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.transition = 'opacity 0.3s';
      document.body.appendChild(d);
      const v = getComputedStyle(d).transitionDuration;
      d.remove();
      return v;
    });
    await close();
    expect(own).toBe('0.3s');
  });
});
