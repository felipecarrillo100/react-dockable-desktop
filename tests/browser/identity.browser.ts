import { describe, it, expect } from 'vitest';
import { openHarness, actions } from './lib';

// DOM identity (7.4.0): every part of the desktop carries a data-rdd-* attribute naming what it is
// and whose it is, the scheme vue- and angular-dockable-desktop already use — so a test can find
// a panel's tab, window, content and taskbar button by its id, without reading class names.

describe('identity attributes', () => {
  it('names each tab, group, panel, window, taskbar item, widget and sidebar tab by its id', async () => {
    const { page, errors, close } = await openHarness('ov=1&anim=0');
    await actions(page, 'minimizePanel', 'p2');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s);
      const tab = q('[data-rdd-tab="p1"]');
      return {
        tab: tab?.classList.contains('rdd-workspace-tab') ?? false,
        leaf: tab?.closest('[data-rdd-leaf]')?.getAttribute('data-rdd-leaf') === tab?.getAttribute('data-leaf-id'),
        panel: q('[data-rdd-panel="p1"]')?.classList.contains('rdd-panel-content') ?? false,
        window: q('[data-rdd-window="p4"]')?.classList.contains('rdd-floating-window') ?? false,
        titlebar: !!q('[data-rdd-window="p4"] [data-rdd-titlebar="p4"]'),
        floatContent: !!q('[data-rdd-window="p4"] [data-rdd-panel="p4"]'),
        taskbar: q('[data-rdd-taskbar-item="p2"]')?.classList.contains('rdd-taskbar-glassmorphic-item') ?? false,
        widget: !!q('[data-rdd-panel="p3"] .rdd-panel-float[data-rdd-widget]:not([data-rdd-widget=""])'),
        sidebarTab: q('[data-rdd-sidebar-tab="st1"]')?.classList.contains('rdd-sidebar-tab-btn') ?? false,
      };
    });
    await close();
    expect(errors).toEqual([]);
    expect(r).toEqual({ tab: true, leaf: true, panel: true, window: true, titlebar: true, floatContent: true, taskbar: true, widget: true, sidebarTab: true });
  });
});
