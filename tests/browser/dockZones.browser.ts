import { describe, it, expect } from 'vitest';
import type { Page } from 'playwright-core';
import { openHarness, rectOf } from './lib';

// Drag-to-dock on every zone, in LTR and RTL (7.9.0): a tab dropped on a zone ends up where the user
// pointed, on screen. Under RTL the move flips left and right internally; what the user sees must
// still match the zone they dropped on. Checked by geometry, not by the stored layout.

type Rect = { x: number; y: number; width: number; height: number };
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The group (leaf) a panel's tab sits in, as an on-screen rect. */
async function groupOf(page: Page, panelId: string): Promise<Rect> {
  return page.evaluate((id) => {
    const tab = document.querySelector(`[data-rdd-tab="${id}"]`);
    const r = tab!.closest('[data-rdd-leaf]')!.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, panelId);
}

/** Drag tab `id` and drop it on the element `target` resolves to once the drop targets are shown. */
async function dropTabOn(page: Page, id: string, target: string): Promise<void> {
  const from = centre(await rectOf(page, `[data-rdd-tab="${id}"]`));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 40, { steps: 4 });   // past the threshold: targets appear
  await page.waitForSelector(target);
  const to = centre(await rectOf(page, target));
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/** Open the harness with p1 and p2 as two tabs of one group (p3 moved away), in LTR or RTL. */
async function setup(dir: 'ltr' | 'rtl') {
  const h = await openHarness(dir === 'rtl' ? 'dir=prov' : '');
  await h.page.waitForSelector('[data-rdd-tab="p2"]');
  return h;
}

const leafIdOf = (page: Page, panelId: string) => page.evaluate((id) =>
  document.querySelector(`[data-rdd-tab="${id}"]`)!.closest('[data-rdd-leaf]')!.getAttribute('data-rdd-leaf')!, panelId);

describe.each(['ltr', 'rtl'] as const)('drag-to-dock on every zone (%s)', (dir) => {
  it.each(['left', 'right', 'top', 'bottom'] as const)("a tab dropped on a group's %s zone lands on that side of it", async (side) => {
    const { page, errors, close } = await setup(dir);
    try {
      const target = await leafIdOf(page, 'p1');
      await dropTabOn(page, 'p2', `[data-drop-zone="${side}"][data-leaf-id="${target}"]`);
      const moved = await groupOf(page, 'p2');
      const stayed = await groupOf(page, 'p1');
      const m = centre(moved), s = centre(stayed);
      if (side === 'left') expect(m.x).toBeLessThan(s.x);
      if (side === 'right') expect(m.x).toBeGreaterThan(s.x);
      if (side === 'top') expect(m.y).toBeLessThan(s.y);
      if (side === 'bottom') expect(m.y).toBeGreaterThan(s.y);
      expect(errors).toEqual([]);
    } finally { await close(); }
  });

  it("a tab dropped on a group's centre zone becomes a tab of that group", async () => {
    const { page, errors, close } = await setup(dir);
    try {
      // p3 starts in its own group; drop it into p1's.
      const target = await leafIdOf(page, 'p1');
      await dropTabOn(page, 'p3', `[data-drop-zone="center"][data-leaf-id="${target}"]`);
      expect(await leafIdOf(page, 'p3')).toBe(await leafIdOf(page, 'p1'));
      expect(errors).toEqual([]);
    } finally { await close(); }
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)('a tab dropped on the %s workspace edge becomes a strip along that edge', async (side) => {
    const { page, errors, close } = await setup(dir);
    try {
      await dropTabOn(page, 'p2', `[data-edge-trigger="${side}"]`);
      const strip = await groupOf(page, 'p2');
      const ws = await rectOf(page, '.rdd-workspace-grid-host');
      const near = (a: number, b: number) => Math.abs(a - b) <= 4;
      if (side === 'left') expect(near(strip.x, ws.x) && near(strip.height, ws.height)).toBe(true);
      if (side === 'right') expect(near(strip.x + strip.width, ws.x + ws.width) && near(strip.height, ws.height)).toBe(true);
      if (side === 'top') expect(near(strip.y, ws.y) && near(strip.width, ws.width)).toBe(true);
      if (side === 'bottom') expect(near(strip.y + strip.height, ws.y + ws.height) && near(strip.width, ws.width)).toBe(true);
      expect(errors).toEqual([]);
    } finally { await close(); }
  });
});
