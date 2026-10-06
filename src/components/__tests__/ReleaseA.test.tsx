/**
 * The 7.8.0 additions, through the public API: each is opt-in, and without it nothing changes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, usePanel, usePanelEvents, type Workspace } from '../../index';

const Plain: React.FC = () => <div data-plain />;
const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(desktop: React.ComponentProps<typeof RddDesktop> = {}, panels: Parameters<typeof createWorkspace>[0]['panels'] = { plain: { component: Plain } }): Workspace {
  const ws = createWorkspace({ panels });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop {...desktop} /></DockableDesktopProvider>); });
  return ws;
}
const $ = (sel: string) => container!.querySelector(sel);

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  document.getElementById('preserved-dom-container')?.remove();
  document.body.classList.remove('rdd-dragging-active');
});

describe('emptyWorkspace', () => {
  it('shows the app view while no panel is docked, and the panel once one opens', () => {
    const ws = mount({ emptyWorkspace: <p data-welcome>Open a file to start</p> });
    expect($('[data-welcome]')?.textContent).toBe('Open a file to start');
    expect($('.rdd-empty-leaf-placeholder')).toBeNull();

    act(() => { ws.openPanel('a', 'plain'); });
    expect($('[data-welcome]')).toBeNull();

    act(() => { ws.closePanel('a'); });
    expect($('[data-welcome]')).not.toBeNull();
  });

  it('without it, the built-in message shows as before', () => {
    mount();
    expect($('.rdd-empty-leaf-placeholder')).not.toBeNull();
    expect($('.rdd-empty-workspace')).toBeNull();
  });

  it('a panel floating over an empty grid can still be docked into it', () => {
    const ws = mount({ emptyWorkspace: <p data-welcome /> });
    act(() => { ws.openPanel('a', 'plain', { initialTarget: 'floating' }); });
    expect($('[data-welcome]')).not.toBeNull();
    const bar = $('[data-rdd-titlebar="a"]')!;
    act(() => { bar.dispatchEvent(pointer('pointerdown', 350, 160)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
    // The empty group still offers its drop zones during the drag.
    expect(container!.querySelector('.rdd-workspace-panel [data-drop-zone="center"]')).not.toBeNull();
    act(() => { window.dispatchEvent(pointer('pointerup', 200, 200)); });
  });
});

describe('state attributes', () => {
  const has = (el: Element | null, attr: string) => el?.hasAttribute(attr) ?? false;
  const tab = (id: string) => $(`[data-rdd-tab="${id}"]`);
  const win = (id: string) => $(`[data-rdd-window="${id}"]`);

  it('a tab carries data-rdd-selected, -focused and -dirty only while each is true', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
    // b opened last: shown in the group and focused; a is neither.
    expect([has(tab('b'), 'data-rdd-selected'), has(tab('b'), 'data-rdd-focused')]).toEqual([true, true]);
    expect([has(tab('a'), 'data-rdd-selected'), has(tab('a'), 'data-rdd-focused')]).toEqual([false, false]);

    act(() => { ws.setPanelDirty('a', true); });
    expect(has(tab('a'), 'data-rdd-dirty')).toBe(true);
    expect(has(tab('b'), 'data-rdd-dirty')).toBe(false);
    act(() => { ws.setPanelDirty('a', false); });
    expect(has(tab('a'), 'data-rdd-dirty')).toBe(false);

    // Floating b away: a becomes the group's selected tab, but b stays the focused panel.
    act(() => { ws.floatPanel('b'); });
    expect(has(tab('a'), 'data-rdd-selected')).toBe(true);
    expect(has(tab('a'), 'data-rdd-focused')).toBe(false);
  });

  it('a floating window carries data-rdd-focused and -maximized only while each is true', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain', { initialTarget: 'floating' }); ws.openPanel('b', 'plain', { initialTarget: 'floating' }); });
    expect(has(win('b'), 'data-rdd-focused')).toBe(true);
    expect(has(win('a'), 'data-rdd-focused')).toBe(false);
    expect(has(win('b'), 'data-rdd-maximized')).toBe(false);
    act(() => { ws.maximizePanel('b'); });
    expect(has(win('b'), 'data-rdd-maximized')).toBe(true);
    act(() => { ws.maximizePanel('b'); });
    expect(has(win('b'), 'data-rdd-maximized')).toBe(false);
  });
});

describe('openPanel dockTo', () => {
  const grid = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): { gridRoot: any; floating: { id: string }[] } } })._core.getSnapshot();
  const leafOf = (node: any, id: string): any =>
    node.type === 'leaf' ? (node.panels.includes(id) ? node : null) : node.children.map((c: any) => leafOf(c, id)).find(Boolean) ?? null;

  it('splits beside the target panel, giving the new group the requested share', () => {
    const ws = mount();
    act(() => { ws.openPanel('chart', 'plain'); });
    act(() => { ws.openPanel('legend', 'plain', { dockTo: { panel: 'chart', position: 'right', size: 0.25 } }); });
    const root = grid(ws).gridRoot;
    expect(root.type).toBe('branch');
    expect(root.orientation).toBe('horizontal');
    expect(root.children.map((c: any) => c.panels)).toEqual([['chart'], ['legend']]);
    expect(root.sizes).toEqual([0.75, 0.25]);
  });

  it("'center' adds it as a tab in the target's group", () => {
    const ws = mount();
    // The target sits in the second group, so the usual placement (the first group) can't pass this.
    act(() => { ws.openPanel('a', 'plain'); });
    act(() => { ws.openPanel('c', 'plain', { dockTo: { panel: 'a', position: 'right' } }); });
    act(() => { ws.openPanel('b', 'plain', { dockTo: { panel: 'c', position: 'center' } }); });
    expect(leafOf(grid(ws).gridRoot, 'b').panels).toEqual(['c', 'b']);
    expect(leafOf(grid(ws).gridRoot, 'a').panels).toEqual(['a']);
  });

  it('wins over initialTarget, and clamps size to 0.1–0.9', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain'); });
    act(() => { ws.openPanel('b', 'plain', { initialTarget: 'floating', dockTo: { panel: 'a', position: 'left', size: 5 } }); });
    expect(grid(ws).floating.map(f => f.id)).toEqual([]);
    // position 'left': the new group comes first, with its share clamped from 5 to 0.9.
    const [share, rest] = grid(ws).gridRoot.sizes;
    expect(share).toBe(0.9);
    expect(rest).toBeCloseTo(0.1);
  });

  it('falls back to the usual placement, with a development warning, when the target is not docked', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ws = mount();
      act(() => { ws.openPanel('f', 'plain', { initialTarget: 'floating' }); });
      act(() => { ws.openPanel('b', 'plain', { dockTo: { panel: 'f', position: 'right' } }); });
      expect(grid(ws).gridRoot.type).toBe('leaf');
      expect(leafOf(grid(ws).gridRoot, 'b')).not.toBeNull();
      expect(warn.mock.calls.some(c => String(c[0]).includes('could not dock beside "f"'))).toBe(true);
    } finally {
      process.env.NODE_ENV = original;
      warn.mockRestore();
    }
  });

  it('does nothing for a panel that is already open', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
    const before = JSON.stringify(grid(ws).gridRoot);
    act(() => { ws.openPanel('b', 'plain', { dockTo: { panel: 'a', position: 'right' } }); });
    expect(JSON.stringify(grid(ws).gridRoot)).toBe(before);
  });
});

describe('className and tabClassName per panel type', () => {
  it("adds them to that type's content element and tab only", () => {
    const ws = mount({}, {
      chart: { component: Plain, defaultOptions: { className: 'app-chart', tabClassName: 'app-chart-tab' } },
      plain: { component: Plain },
    });
    // A panel's element is attached to the page once it is shown, so each is checked while shown.
    const content = (id: string) => document.querySelector(`[data-rdd-panel="${id}"]`);
    act(() => { ws.openPanel('p', 'plain'); ws.openPanel('c', 'chart'); });
    expect(content('c')?.className).toBe('rdd-panel-content app-chart');
    act(() => { ws.focusPanel('p'); });
    expect(content('p')?.className).toBe('rdd-panel-content');
    expect($('[data-rdd-tab="c"]')!.classList.contains('app-chart-tab')).toBe(true);
    expect($('[data-rdd-tab="p"]')!.classList.contains('app-chart-tab')).toBe(false);
    // The class travels with the panel: still there once it floats.
    act(() => { ws.floatPanel('c'); });
    expect(content('c')?.className).toBe('rdd-panel-content app-chart');
  });
});

describe('keepAlive: false', () => {
  let mounted = 0;
  let unmounted = 0;
  const closed: string[] = [];
  /** Counts its own mounts, and keeps a counter in state so a remount is visible. */
  const Heavy: React.FC = () => {
    const panel = usePanel();
    const [clicks, setClicks] = React.useState(0);
    React.useEffect(() => { mounted++; return () => { unmounted++; }; }, []);
    usePanelEvents({ onClose: () => closed.push(panel.id) });
    return <button data-heavy={panel.id} onClick={() => setClicks(c => c + 1)}>{clicks}</button>;
  };
  const heavy = (id: string) => document.querySelector(`[data-heavy="${id}"]`) as HTMLButtonElement | null;

  function setup(keepAlive: boolean | undefined) {
    mounted = 0; unmounted = 0; closed.length = 0;
    return mount({}, { heavy: { component: Heavy, defaultOptions: keepAlive === undefined ? {} : { keepAlive } }, plain: { component: Plain } });
  }

  it('unmounts the component while it is an unselected tab, and mounts it afresh when shown', () => {
    const ws = setup(false);
    act(() => { ws.openPanel('h', 'heavy'); });
    act(() => { heavy('h')!.click(); });
    expect(heavy('h')!.textContent).toBe('1');

    act(() => { ws.openPanel('p', 'plain'); });       // p's tab is selected: h is hidden
    expect(unmounted).toBe(1);
    act(() => { ws.focusPanel('h'); });               // shown again: a fresh mount
    expect(mounted).toBe(2);
    expect(heavy('h')!.textContent).toBe('0');
    expect(closed).toEqual([]);                       // hiding is not closing
    act(() => { ws.closePanel('h'); });
    expect(closed).toEqual(['h']);
  });

  it('unmounts while minimized, and its taskbar preview is the placeholder', () => {
    const ws = setup(false);
    act(() => { ws.openPanel('h', 'heavy', { initialTarget: 'floating' }); });
    act(() => { ws.minimizePanel('h'); });
    expect(unmounted).toBe(1);
    // Hovering its taskbar item shows the placeholder, not a (blank) live preview.
    act(() => { $('[data-rdd-taskbar-item="h"]')!.dispatchEvent(pointer('pointerover', 0, 0)); });
    expect(document.querySelector('.rdd-taskbar-item-preview-frame--empty')).not.toBeNull();
    act(() => { ws.restorePanel('h'); });
    expect(mounted).toBe(2);
  });

  it('by default, a hidden panel stays mounted and keeps its state, as before', () => {
    const ws = setup(undefined);
    act(() => { ws.openPanel('h', 'heavy'); });
    act(() => { heavy('h')!.click(); });
    act(() => { ws.openPanel('p', 'plain'); });
    act(() => { ws.focusPanel('h'); });
    expect([mounted, unmounted]).toEqual([1, 0]);
    expect(heavy('h')!.textContent).toBe('1');
  });

  it('leaks nothing across many hide/show cycles', () => {
    const ws = setup(false);
    act(() => { ws.openPanel('h', 'heavy'); ws.openPanel('p', 'plain'); });
    // One full cycle first (two separate renders), so first-show work isn't counted as a leak.
    act(() => { ws.focusPanel('h'); });
    act(() => { ws.focusPanel('p'); });
    const nodesAfterWarmup = document.querySelectorAll('*').length;
    for (let i = 0; i < 50; i++) {
      act(() => { ws.focusPanel('h'); });
      act(() => { ws.focusPanel('p'); });
    }
    expect(mounted - unmounted).toBe(0);               // hidden now: no live instance
    expect(document.querySelectorAll('*').length).toBe(nodesAfterWarmup);
    expect(document.querySelector('[data-rdd-panel="h"]')?.childElementCount ?? 0).toBe(0);
  });
});
