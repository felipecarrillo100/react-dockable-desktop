import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DockableDesktopProvider } from '../DockableDesktopProvider';
import { useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { useShowContextMenu } from '../ContextMenu';
import { Toolbar } from '../Toolbar';
import { ToastContainer, toast } from '../Toast';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';

// Keyboard access and ARIA roles, following the WAI-ARIA Authoring Practices tabs and menu
// patterns. Before 6.4.0 tabs were plain <div>s, the context menu handled only Escape, and
// taskbar items were not focusable at all.

let S: any;
let A: any;
let showMenu: any;
const Probe: React.FC = () => { S = useWindowManagerState(); A = useWindowManagerActions(); showMenu = useShowContextMenu(); return null; };
const Plain: React.FC = () => <div />;

let container: HTMLDivElement;
let root: Root | null = null;
const TWO_GROUPS = JSON.stringify({
  gridRoot: {
    type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5],
    children: [
      { type: 'leaf', id: 'L', panels: [], activePanelId: null, keepOnEmpty: true },
      { type: 'leaf', id: 'R', panels: [], activePanelId: null, keepOnEmpty: true },
    ],
  },
  floating: [], minimized: [], panels: {},
});
const mount = (extra: React.ReactNode = null, initialState: string | null = null) => {
  const client = new WorkspaceClient({ panels: { p: { component: Plain } }, initialState });
  act(() => {
    root = createRoot(container);
    root.render(<DockableDesktopProvider workspace={client}><Probe /><WindowManager taskbarVisibility="always" />{extra}</DockableDesktopProvider>);
  });
};
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.getElementById('preserved-dom-container')?.remove();
});

const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const tab = (id: string) => container.querySelector(`[data-tab-id="${id}"]`) as HTMLElement;

describe('tabs (WAI-ARIA tabs pattern)', () => {
  const threeTabs = () => {
    mount();
    act(() => { A.openPanel('a', 'p'); A.openPanel('b', 'p'); A.openPanel('c', 'p'); });
    act(() => { A.focusPanel('a'); });
  };

  it('tablist / tab / tabpanel roles, with one tab stop per group', () => {
    threeTabs();
    const list = container.querySelector('.rdd-tab-headers-container')!;
    expect(list.getAttribute('role')).toBe('tablist');
    const tabs = Array.from(list.querySelectorAll('[data-tab-id]'));
    expect(tabs.map(t => t.getAttribute('role'))).toEqual(['tab', 'tab', 'tab']);
    expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map(t => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const panel = container.querySelector('.rdd-panel-body')!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('a').id);
    expect(tab('a').getAttribute('aria-controls')).toBe(panel.id);
  });

  it('ArrowRight / ArrowLeft select and focus the neighbouring tab, wrapping around', () => {
    threeTabs();
    tab('a').focus();
    key(tab('a'), 'ArrowRight');
    expect(S.activePanelId).toBe('b');
    expect(document.activeElement).toBe(tab('b'));
    key(tab('b'), 'ArrowLeft');
    key(tab('a'), 'ArrowLeft');
    expect(S.activePanelId).toBe('c');
    expect(document.activeElement).toBe(tab('c'));
  });

  it('Home / End jump to the first / last tab', () => {
    threeTabs();
    tab('a').focus();
    key(tab('a'), 'End');
    expect(document.activeElement).toBe(tab('c'));
    key(tab('c'), 'Home');
    expect(document.activeElement).toBe(tab('a'));
  });

  it('Delete requests the close, like the tab\'s ×', () => {
    threeTabs();
    expect(tab('a').getAttribute('aria-keyshortcuts')).toBe('Delete');
    key(tab('a'), 'Delete');
    expect(S.panels.a).toBeUndefined();
  });

  it('the × is hidden from assistive tech; the empty-group close is a real button', () => {
    mount(null, TWO_GROUPS);
    act(() => { A.openPanel('a', 'p'); });
    expect(tab('a').querySelector('.rdd-close-tab-x')!.getAttribute('aria-hidden')).toBe('true');
    const emptyClose = container.querySelector('.rdd-header-close-empty-group')!;
    expect(emptyClose.tagName).toBe('BUTTON');
    expect(emptyClose.getAttribute('aria-label')).toBe('Close empty split group');
  });
});

describe('context menu (WAI-ARIA menu pattern)', () => {
  const items = [
    { label: 'One', action: () => {} },
    { label: 'Disabled', action: () => {}, disabled: true },
    { label: 'Sub', items: [{ label: 'Child A', action: () => {} }, { label: 'Child B', action: () => {} }] },
    { label: 'Check', action: () => {}, checkbox: { value: true } },
  ];
  const open = (extra: Record<string, unknown> = {}) => {
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    act(() => { showMenu({ x: 10, y: 10, items, ...extra }); });
    return opener;
  };
  const rootMenu = () => document.body.querySelector('.rdd-context-menu:not(.rdd-context-menu--submenu)') as HTMLElement;
  const menuItems = (sel = '.rdd-context-menu:not(.rdd-context-menu--submenu)') =>
    Array.from(document.body.querySelectorAll(`${sel} [role^="menuitem"]`)) as HTMLElement[];
  /** The label of the focused menu item, or null when focus is not on an item (the menu itself, say). */
  const label = (el: Element | null) =>
    el?.matches('[role^="menuitem"]') ? el.querySelector('.rdd-context-menu__label')?.textContent : null;

  afterEach(() => { document.getElementById('opener')?.remove(); });

  // 7.6.0: a menu opens with nothing highlighted, the same however it was opened. Focusing the
  // first item made the browser's focus ring come and go with the user's previous interaction.
  it('opens with the menu itself focused and no item highlighted', () => {
    mount();
    open();
    expect(document.activeElement).toBe(rootMenu());
    expect(rootMenu().getAttribute('role')).toBe('menu');
    expect(rootMenu().tabIndex).toBe(-1);
    expect(label(document.activeElement)).toBeNull();
  });

  it('from the menu itself, ArrowDown reaches the first item and ArrowUp the last', () => {
    mount();
    open();
    key(rootMenu(), 'ArrowDown');
    expect(label(document.activeElement)).toBe('One');
    act(() => { rootMenu().focus(); });
    key(rootMenu(), 'ArrowUp');
    expect(label(document.activeElement)).toBe('Check');
  });

  it("initialFocus: 'first-item' opens on the first enabled item", () => {
    mount();
    open({ initialFocus: 'first-item' });
    expect(label(document.activeElement)).toBe('One');
  });

  it('a keyboard contextmenu event (no pointer position) opens on the first item', () => {
    mount();
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    act(() => { showMenu({ event: new MouseEvent('contextmenu', { clientX: 0, clientY: 0 }), items }); });
    expect(label(document.activeElement)).toBe('One');
  });

  it('a mouse contextmenu event opens on the menu itself', () => {
    mount();
    act(() => { showMenu({ event: new MouseEvent('contextmenu', { clientX: 40, clientY: 30 }), items }); });
    expect(document.activeElement).toBe(rootMenu());
  });

  it('ArrowDown / ArrowUp skip disabled items and wrap; Home / End jump', () => {
    mount();
    open({ initialFocus: 'first-item' });
    const menu = rootMenu();
    key(menu, 'ArrowDown');
    expect(label(document.activeElement)).toBe('Sub');
    key(menu, 'ArrowDown');
    key(menu, 'ArrowDown');
    expect(label(document.activeElement)).toBe('One');
    key(menu, 'ArrowUp');
    expect(label(document.activeElement)).toBe('Check');
    key(menu, 'Home');
    expect(label(document.activeElement)).toBe('One');
    key(menu, 'End');
    expect(label(document.activeElement)).toBe('Check');
  });

  it('ArrowRight opens a submenu and focuses its first item; ArrowLeft goes back', () => {
    mount();
    open();
    const menu = rootMenu();
    key(menu, 'ArrowDown');
    key(document.activeElement!, 'ArrowDown');
    expect(label(document.activeElement)).toBe('Sub');
    key(document.activeElement!, 'ArrowRight');
    expect(label(document.activeElement)).toBe('Child A');
    key(document.activeElement!, 'ArrowDown');
    expect(label(document.activeElement)).toBe('Child B');
    key(document.activeElement!, 'ArrowLeft');
    expect(label(document.activeElement)).toBe('Sub');
    expect(document.body.querySelector('.rdd-context-menu--submenu')).toBeNull();
  });

  it("the library's own keyboard opener (the Menu key on a tab) opens on the first item", () => {
    mount();
    act(() => { A.openPanel('a', 'p'); });
    // A real box, so the menu event lands at the tab and not at 0,0 (which would open on the first
    // item through the "no pointer position" rule instead of the opener's own choice).
    tab('a').getBoundingClientRect = () => ({ left: 40, top: 10, right: 120, bottom: 34, width: 80, height: 24, x: 40, y: 10, toJSON() {} }) as DOMRect;
    act(() => { tab('a').focus(); });
    key(tab('a'), 'ContextMenu');
    expect(rootMenu()).not.toBeNull();
    expect(label(document.activeElement)).toBe(menuItems().map(i => label(i))[0]);
    expect(document.activeElement).not.toBe(rootMenu());
  });

  it('a right-click on a tab opens its menu on the menu itself', () => {
    mount();
    act(() => { A.openPanel('a', 'p'); });
    act(() => { tab('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 20 })); });
    expect(document.activeElement).toBe(rootMenu());
  });

  it('a submenu opened by hovering takes no focus, even after one opened from the keyboard', () => {
    vi.useFakeTimers();
    try {
      mount();
      const twoSubs = [
        { label: 'Sub', items: [{ label: 'Child A', action: () => {} }] },
        { label: 'Other', items: [{ label: 'Child X', action: () => {} }] },
      ];
      act(() => { showMenu({ x: 10, y: 10, items: twoSubs, initialFocus: 'first-item' }); });
      key(document.activeElement!, 'ArrowRight');
      expect(label(document.activeElement)).toBe('Child A');
      const other = menuItems().find(i => label(i) === 'Other')!;
      act(() => { other.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      act(() => { vi.advanceTimersByTime(200); });
      expect(document.body.querySelector('.rdd-context-menu--submenu')?.textContent).toContain('Child X');
      expect(label(document.activeElement)).not.toBe('Child X');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a click (or tap) on a submenu item opens it', () => {
    mount();
    open();
    act(() => { (menuItems().find(i => label(i) === 'Sub') as HTMLButtonElement).click(); });
    expect(document.body.querySelector('.rdd-context-menu--submenu')).not.toBeNull();
  });

  it('Escape closes and returns focus to the opener', () => {
    mount();
    const opener = open();
    key(document.activeElement!, 'Escape');
    expect(document.body.querySelector('.rdd-context-menu')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Tab closes and returns focus to the opener', () => {
    mount();
    const opener = open();
    key(document.activeElement!, 'Tab');
    expect(document.body.querySelector('.rdd-context-menu')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('checkbox items are menuitemcheckbox; plain items carry no aria-checked', () => {
    mount();
    open();
    const byLabel = Object.fromEntries(menuItems().map(i => [label(i), i]));
    expect(byLabel.Check.getAttribute('role')).toBe('menuitemcheckbox');
    expect(byLabel.Check.getAttribute('aria-checked')).toBe('true');
    expect(byLabel.One.getAttribute('role')).toBe('menuitem');
    expect(byLabel.One.hasAttribute('aria-checked')).toBe(false);
  });
});

describe('taskbar', () => {
  it('minimized items are buttons named after their panel; Enter restores', () => {
    mount();
    act(() => { A.openPanel('a', 'p', { title: 'Alpha' }); });
    act(() => { A.minimizePanel('a'); });
    const item = container.querySelector('.rdd-taskbar-glassmorphic-item') as HTMLButtonElement;
    expect(item.tagName).toBe('BUTTON');
    expect(item.getAttribute('aria-label')).toBe('Alpha');
    // A keyboard-activated button click has detail 0.
    act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); });
    expect(S.panels.a.state).not.toBe('minimized');
  });
});

describe('ARIA roles', () => {
  it('toolbar flyout items are menuitemradio with aria-checked', () => {
    mount(<Toolbar items={[{ type: 'group', id: 'g', label: 'G', defaultIcon: <span />, activeItemId: 's2', items: [
      { id: 's1', label: 'S1', icon: <span /> }, { id: 's2', label: 'S2', icon: <span /> },
    ] }]} />);
    act(() => { (document.body.querySelector('.rdd-toolbar-btn-group') as HTMLButtonElement).click(); });
    const flyoutItems = Array.from(document.body.querySelectorAll('.rdd-toolbar-group-flyout [role]'))
      .filter(e => e.getAttribute('role') !== 'separator');
    expect(flyoutItems.map(e => e.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio']);
    expect(flyoutItems.map(e => e.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(flyoutItems.some(e => e.hasAttribute('aria-pressed'))).toBe(false);
  });

  it('the toast container is a labelled region; each toast is its own live region', async () => {
    mount(<ToastContainer />);
    await act(async () => { toast('saved'); });
    const region = document.body.querySelector('.rdd-toast-container')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.hasAttribute('aria-live')).toBe(false);
    expect(document.body.querySelector('.rdd-toast')!.getAttribute('role')).toBe('status');
  });
});
