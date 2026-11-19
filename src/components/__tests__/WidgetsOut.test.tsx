/**
 * Widgets out of the panel (7.11.0, M3): `useFloatingWidgets().move()` / `location()`, through the
 * public API, in a real desktop.
 *
 * WO1: docked beside the owner: a hosted panel shows the same content element; nothing remounts
 * WO2: tabbed, floating at a rect, and minimised report their location
 * WO3: back into the panel: the frame returns where it was, with the same element and state
 * WO4: from one place out of the panel to another, still without a remount
 * WO5: refusals (not-open, owner-not-docked, owner-not-kept-alive, no-workspace) change nothing
 * WO6: ownership: an in-page close of the hosted panel, close(), closeAll() and the owner closing
 *      all close the widget; a layout load sends it back into the panel
 * WO7: the owner minimised: the widget stays out and on screen
 * WO8: the hosted panel follows the widget's title and icon, also on a re-open
 * WO9: canDock / canFloat are the hosted panel's user rules (false by default), and a re-open
 *      changes them while out
 * WO10: in the panel, titleMenu turns the title icon into a button that opens the app's items,
 *       given where the widget is; an item can move it out. Without titleMenu the icon stays plain
 * WO11: out of the panel, the app's items lead the hosted tab's menu, before Minimize and Close;
 *       no built-in Float. An ordinary panel's menu is unchanged
 * WO12: a floating hosted panel's title-bar menu is the app's items, then Close
 * WO13: useWidget(): null outside a widget; id, owner and a location that re-renders on change
 * WO14: onWillMove runs before the element moves, onMoved after it landed, in that order
 * WO15: the user's own moves of the hosted panel (minimise, restore, float) call them too
 * WO16: nothing is called for a no-op, a refusal, or a close; a layout load sending it home is a
 *       move; unsubscribing stops the calls
 * WO17: placement(): null when not open; the panel form; docked, tabbed and floating out of it,
 *       with home; a minimised one remembers where it was
 * WO18: open({ placement }) puts it back in the panel; a broken value uses the config; a re-open
 *       of a live id ignores it; a free position waits for the panel to have a size
 * WO19: open({ placement }) out of the panel moves it out after opening, and back goes home;
 *       refused, it stays in the panel
 * WO20: an active widget panel gives its owner's contribution; an ordinary panel its own (next.1)
 * WO21: a title set on the widget panel is kept across moves out of the panel; a re-open applies
 *       the widget's title (next.1)
 * WO22: useWidget().panelId: null in the panel, the widget panel's id out of it (next.1)
 * WO23: out of the panel, the tab icon and the floating title icon open the widget's menu; an
 *       ordinary panel's icon opens nothing (next.1)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, RddPanelOverlay, useFloatingWidgets,
  type Workspace, type FloatingWidgetsApi, type ManagedWidget, type WidgetMenuContext,
  useWidget, type WidgetHandle, usePanelContribution, useActiveContribution,
} from '../../index';
import type { InternalWindowActions } from '../../types';
import { findLeafIdOf } from '../../core/layoutTree';

let api: FloatingWidgetsApi | null = null;
const mounts = vi.fn();
const unmounts = vi.fn();

/** Widget content with state, and a record of every mount and unmount. */
const Table: React.FC = () => {
  const [n, setN] = useState(0);
  useEffect(() => { mounts(); return () => unmounts(); }, []);
  return <button id="wo-count" onClick={() => setN(x => x + 1)}>{n}</button>;
};
const Grab: React.FC = () => { api = useFloatingWidgets(); return null; };
const Owner: React.FC = () => <RddPanelOverlay><Grab /></RddPanelOverlay>;
const Plain: React.FC = () => <div />;

const table: ManagedWidget = { title: 'Table', content: <Table />, anchor: 'bottom-left', width: 240, height: 160 };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(): Workspace {
  const ws = createWorkspace({
    panels: {
      map: { component: Owner },
      lazy: { component: Owner, defaultOptions: { keepAlive: false } },
      plain: { component: Plain },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>); });
  act(() => { ws.openPanel('map', 'map', { title: 'Map' }); });
  act(() => { api!.open('table', table); });
  return ws;
}
const $ = (sel: string) => container!.querySelector(sel);
const content = () => document.querySelector('.rdd-panel-float__content') as HTMLElement | null;
const frame = () => $('[data-rdd-widget="table"]');
const click = () => act(() => { (document.getElementById('wo-count') as HTMLElement).click(); });
const count = () => document.getElementById('wo-count')?.textContent;
const state = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): import('../../types').WorkspaceState } })._core.getSnapshot();

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null; api = null;
  mounts.mockClear(); unmounts.mockClear();
  document.getElementById('preserved-dom-container')?.remove();
});

describe('WO1: docked beside the owner', () => {
  it('opens a hosted panel that shows the same element, and nothing remounts', () => {
    const ws = mount();
    const el = content();
    click(); click();
    let r: ReturnType<FloatingWidgetsApi['move']> | undefined;
    act(() => { r = api!.move('table', { to: 'docked', position: 'bottom', size: 0.3 }); });
    expect(r).toEqual({ ok: true });
    const s = state(ws);
    expect(s.panels['map/table']).toMatchObject({ component: 'rdd:widget', state: 'docked', owner: { panelId: 'map', widgetId: 'table' } });
    expect(findLeafIdOf(s.gridRoot, 'map/table')).not.toBe(findLeafIdOf(s.gridRoot, 'map'));
    expect(content()).toBe(el);
    expect(el!.parentElement!.classList.contains('rdd-hosted-widget')).toBe(true);
    expect(el!.closest('[data-rdd-panel="map/table"]')).not.toBeNull();
    expect(frame()).toBeNull();
    expect(count()).toBe('2');
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(unmounts).not.toHaveBeenCalled();
    expect(api!.location('table')).toBe('docked');
    expect(api!.openIds).toEqual(['table']);
    expect(ws.getOpenPanelIds()).toContain('map/table');
    expect(ws.saveLayout()).not.toContain('map/table');
  });
});

describe('WO2: tabbed, floating and minimised', () => {
  it('floating without a rect, from out of the panel, opens where its panel is on screen', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    const el = document.querySelector('[data-rdd-panel="map/table"]') as HTMLElement;
    const viewport = el.closest('.rdd-workspace-viewport') as HTMLElement;
    el.getBoundingClientRect = () => ({ left: 130, top: 90, width: 410, height: 170, right: 540, bottom: 260, x: 130, y: 90, toJSON() {} }) as DOMRect;
    viewport.getBoundingClientRect = () => ({ left: 10, top: 20, width: 1000, height: 700, right: 1010, bottom: 720, x: 10, y: 20, toJSON() {} }) as DOMRect;
    act(() => { api!.move('table', { to: 'floating' }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ x: 120, y: 70, width: 410, height: 170 });
    // Floating already, it stays where it is.
    act(() => { api!.move('table', { to: 'floating', rect: { x: 33, y: 44, width: 300, height: 200 } }); });
    act(() => { api!.move('table', { to: 'floating' }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ x: 33, y: 44, width: 300, height: 200 });
  });

  it('a tab in the owner\'s group', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'tabbed' }); });
    const s = state(ws);
    expect(findLeafIdOf(s.gridRoot, 'map/table')).toBe(findLeafIdOf(s.gridRoot, 'map'));
    expect(api!.location('table')).toBe('tabbed');
  });

  it('a floating window at the given rect', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 } }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ x: 40, y: 50, width: 300, height: 200 });
    expect(api!.location('table')).toBe('floating');
    expect(content()!.closest('[data-rdd-panel="map/table"]')).not.toBeNull();
  });

  it('a floating window without a rect takes the widget\'s size', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'floating' }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ width: 240, height: 160 });
  });

  it('minimised by the user', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'docked', position: 'right' }); });
    act(() => { ws.minimizePanel('map/table'); });
    expect(api!.location('table')).toBe('minimized');
  });
});

describe('WO3: back into the panel', () => {
  it('the frame returns where it was, with the same element and state; the hosted panel leaves', () => {
    const ws = mount();
    const el = content();
    const style = (frame() as HTMLElement).getAttribute('style');
    click();
    const closed = vi.fn();
    ws.onPanelClose(closed);
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    let r: ReturnType<FloatingWidgetsApi['move']> | undefined;
    act(() => { r = api!.move('table', { to: 'panel' }); });
    expect(r).toEqual({ ok: true });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(closed).toHaveBeenCalledWith('map/table');
    expect(frame()).not.toBeNull();
    expect((frame() as HTMLElement).getAttribute('style')).toBe(style);
    expect(content()).toBe(el);
    expect(el!.parentElement!.classList.contains('rdd-panel-float__body')).toBe(true);
    expect(count()).toBe('1');
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(api!.location('table')).toBe('panel');
    expect(api!.isOpen('table')).toBe(true);
  });

  it('is a no-op success when already in the panel', () => {
    mount();
    expect(api!.move('table', { to: 'panel' })).toEqual({ ok: true });
    expect(frame()).not.toBeNull();
  });
});

describe('WO4: from one place out to another', () => {
  it('docked, then floating, then tabbed: one hosted panel, the same element, no remount', () => {
    const ws = mount();
    const el = content();
    click();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    act(() => { api!.move('table', { to: 'floating', rect: { x: 10, y: 10, width: 200, height: 150 } }); });
    expect(api!.location('table')).toBe('floating');
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(api!.location('table')).toBe('tabbed');
    expect(Object.keys(state(ws).panels).sort()).toEqual(['map', 'map/table']);
    expect(state(ws).floating).toEqual([]);
    expect(content()).toBe(el);
    expect(count()).toBe('1');
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});

describe('WO5: refusals', () => {
  it('not-open', () => {
    mount();
    expect(api!.move('nope', { to: 'tabbed' })).toEqual({ ok: false, reason: 'not-open' });
    expect(api!.location('nope')).toBeNull();
  });

  it('owner-not-docked for docked and tabbed; a floating owner can still float it', () => {
    const ws = mount();
    act(() => { ws.floatPanel('map'); });
    const before = state(ws);
    expect(api!.move('table', { to: 'docked', position: 'left' })).toEqual({ ok: false, reason: 'owner-not-docked' });
    expect(api!.move('table', { to: 'tabbed' })).toEqual({ ok: false, reason: 'owner-not-docked' });
    expect(state(ws)).toBe(before);
    expect(frame()).not.toBeNull();
    let r: ReturnType<FloatingWidgetsApi['move']> | undefined;
    act(() => { r = api!.move('table', { to: 'floating' }); });
    expect(r).toEqual({ ok: true });
  });

  it('owner-not-kept-alive', () => {
    const ws = mount();
    act(() => { ws.closePanel('map'); });
    act(() => { ws.openPanel('lz', 'lazy'); });
    act(() => { api!.open('table', table); });
    const before = state(ws);
    expect(api!.move('table', { to: 'docked', position: 'bottom' })).toEqual({ ok: false, reason: 'owner-not-kept-alive' });
    expect(state(ws)).toBe(before);
  });

  it('no-workspace outside a provider', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<Owner />); });
    act(() => { api!.open('table', table); });
    expect(api!.move('table', { to: 'floating' })).toEqual({ ok: false, reason: 'no-workspace' });
    expect(api!.location('table')).toBe('panel');
  });
  it('no-workspace inside a provider but not in a workspace panel (as in a modal or drawer)', () => {
    const ws = createWorkspace({ panels: { plain: { component: Plain } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<DockableDesktopProvider workspace={ws}><Owner /><RddDesktop /></DockableDesktopProvider>); });
    act(() => { api!.open('table', table); });
    const before = state(ws);
    expect(api!.move('table', { to: 'floating' })).toEqual({ ok: false, reason: 'no-workspace' });
    expect(state(ws)).toBe(before);
  });
});

describe('WO6: ownership', () => {
  const out = (ws: Workspace) => { act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); }); return ws; };

  it('an in-page close of the hosted panel closes the widget', () => {
    const ws = out(mount());
    act(() => { ws.closePanel('map/table'); });
    expect(api!.isOpen('table')).toBe(false);
    expect(unmounts).toHaveBeenCalledTimes(1);
    expect(content()).toBeNull();
  });

  it('the tab\'s × closes it the same way', () => {
    out(mount());
    act(() => { ($('[data-rdd-tab="map/table"] .rdd-close-tab-x') as HTMLElement).click(); });
    expect(api!.isOpen('table')).toBe(false);
  });

  it('close() and closeAll() remove the hosted panel', () => {
    const ws = out(mount());
    act(() => { api!.close('table'); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(unmounts).toHaveBeenCalledTimes(1);
    act(() => { api!.open('table', table); });
    out(ws);
    act(() => { api!.closeAll(); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(unmounts).toHaveBeenCalledTimes(2);
  });

  it('the owner closing closes the widget and removes its hosted panel', () => {
    const ws = out(mount());
    act(() => { ws.closePanel('map'); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(unmounts).toHaveBeenCalledTimes(1);
  });

  it('a layout load drops the hosted panel and the widget goes back into its panel', () => {
    const ws = mount();
    const layout = ws.saveLayout();
    click();
    out(ws);
    act(() => { ws.loadLayout(layout); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(api!.isOpen('table')).toBe(true);
    expect(api!.location('table')).toBe('panel');
    expect(frame()).not.toBeNull();
    expect(content()!.parentElement!.classList.contains('rdd-panel-float__body')).toBe(true);
    expect(count()).toBe('1');
  });
});

describe('WO7: the owner minimised', () => {
  it('leaves the widget out and on screen', () => {
    const ws = mount();
    act(() => { ws.openPanel('other', 'plain', { dockTo: { panel: 'map', position: 'right' } }); });
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    act(() => { ws.minimizePanel('map'); });
    expect(state(ws).panels['map/table'].state).toBe('docked');
    expect(content()!.closest('[data-rdd-panel="map/table"]')).not.toBeNull();
    expect(content()!.isConnected).toBe(true);
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});

describe('WO8: title and icon', () => {
  it('the hosted panel takes the widget\'s title and icon, and a re-open updates them', () => {
    const ws = mount();
    act(() => { api!.open('table', { ...table, icon: <i className="t-icon" /> }); });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(state(ws).panels['map/table'].title).toBe('Table');
    expect($('[data-rdd-tab="map/table"] .t-icon')).not.toBeNull();
    act(() => { api!.open('table', { ...table, title: 'Rows', icon: <i className="r-icon" /> }); });
    expect(state(ws).panels['map/table'].title).toBe('Rows');
    expect($('[data-rdd-tab="map/table"] .r-icon')).not.toBeNull();
    expect(api!.location('table')).toBe('tabbed');            // a re-open doesn't move it
  });
});

// ─── M4: capabilities and titleMenu ───────────────────────────────────────────

const coreActions = (ws: Workspace) => (ws as unknown as { _core: { actions: InternalWindowActions } })._core.actions;
/** The open menu, top level: each item's label, and '---' for a separator. */
const menu = () => {
  const m = document.querySelector('.rdd-context-menu:not(.rdd-context-menu--submenu)');
  return m ? [...m.children].map(c => c.tagName === 'HR' ? '---' : c.querySelector('.rdd-context-menu__label')?.textContent ?? '?') : null;
};
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('.rdd-context-menu__item')]
  .find(b => b.querySelector('.rdd-context-menu__label')?.textContent === label)!;
const rightClick = (sel: string) => act(() => {
  $(sel)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
});

describe('WO9: canDock / canFloat', () => {
  it('are false by default, and a re-open changes them while out', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    const a = coreActions(ws);
    expect(a.isDropAllowed('map/table', { kind: 'float', anchor: null })).toBe(false);
    expect(a.isDropAllowed('map/table', { kind: 'edge', side: 'left' })).toBe(false);
    act(() => { api!.open('table', { ...table, canFloat: true }); });
    expect(a.isDropAllowed('map/table', { kind: 'float', anchor: null })).toBe(true);
    expect(a.isDropAllowed('map/table', { kind: 'edge', side: 'left' })).toBe(false);
    act(() => { api!.open('table', { ...table, canFloat: true, canDock: true }); });
    expect(a.isDropAllowed('map/table', { kind: 'edge', side: 'left' })).toBe(true);
  });

  it('a widget opened with them carries them out', () => {
    const ws = mount();
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, canDock: true }); });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(coreActions(ws).isDropAllowed('map/table', { kind: 'edge', side: 'left' })).toBe(true);
    expect(coreActions(ws).isDropAllowed('map/table', { kind: 'float', anchor: null })).toBe(false);
  });
});

describe('WO10: titleMenu in the panel', () => {
  it('turns the title icon into a button that opens the app\'s items, given where the widget is', () => {
    mount();
    let seen: WidgetMenuContext | null = null;
    act(() => {
      api!.open('table', {
        ...table, canDock: true, icon: <i className="t-icon" />,
        titleMenu: w => { seen = w; return [{ label: 'Dock below', action: () => w.move({ to: 'docked', position: 'bottom' }) }, { label: 'Close it', action: () => w.close() }]; },
      });
    });
    const button = $('[data-rdd-widget="table"] button.rdd-panel-float__menu') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.querySelector('.t-icon')).not.toBeNull();
    act(() => { button.click(); });
    expect(menu()).toEqual(['Dock below', 'Close it']);
    expect(seen).toMatchObject({ id: 'table', location: 'panel', canDock: true, canFloat: false });
    act(() => { menuItem('Dock below').click(); });
    expect(api!.location('table')).toBe('docked');
  });

  it('a "Close" item closes the widget for real', () => {
    mount();
    act(() => { api!.open('table', { ...table, titleMenu: w => [{ label: 'Close it', action: () => w.close() }] }); });
    act(() => { ($('button.rdd-panel-float__menu') as HTMLElement).click(); });
    act(() => { menuItem('Close it').click(); });
    expect(api!.isOpen('table')).toBe(false);
  });

  it('without titleMenu the icon stays plain, and with no icon there is no button', () => {
    mount();
    expect($('.rdd-panel-float__menu')).toBeNull();
    act(() => { api!.open('table', { ...table, icon: <i className="t-icon" /> }); });
    expect($('span.rdd-panel-float__icon .t-icon')).not.toBeNull();
    expect($('.rdd-panel-float__menu')).toBeNull();
  });

  it('with titleMenu and no icon, the button shows a menu glyph', () => {
    mount();
    act(() => { api!.open('table', { ...table, titleMenu: () => [{ label: 'x' }] }); });
    expect($('button.rdd-panel-float__menu svg')).not.toBeNull();
  });
});

describe('WO11: the hosted tab\'s menu', () => {
  it('leads with the app\'s items, then Minimize and Close; no built-in Float', () => {
    const ws = mount();
    let seen: WidgetMenuContext | null = null;
    act(() => { api!.open('table', { ...table, canFloat: true, titleMenu: w => { seen = w; return [{ label: 'Back into the map', action: () => w.move({ to: 'panel' }) }]; } }); });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    rightClick('[data-rdd-tab="map/table"]');
    expect(menu()).toEqual(['Back into the map', '---', 'Minimize Panel', '---', 'Close Tab']);
    expect(seen).toMatchObject({ location: 'tabbed', canFloat: true });
    act(() => { menuItem('Back into the map').click(); });
    expect(api!.location('table')).toBe('panel');
    expect(ws.isOpen('map/table')).toBe(false);
    // Back home, nothing is left registered under the hosted panel's id.
    expect(coreActions(ws).getPanelContextMenuItems('map/table')).toEqual([]);
  });

  it('without titleMenu it is the built-in items only, still without Float', () => {
    mount();
    act(() => { api!.open('table', { ...table, canFloat: true }); });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    rightClick('[data-rdd-tab="map/table"]');
    expect(menu()).toEqual(['Minimize Panel', '---', 'Close Tab']);
  });

  it('an ordinary panel\'s menu is unchanged: Float first', () => {
    mount();
    rightClick('[data-rdd-tab="map"]');
    expect(menu()![0]).toBe('Float Window');
  });
});

describe('WO12: a floating hosted panel\'s title-bar menu', () => {
  it('is the app\'s items, then Close, which closes the widget', () => {
    mount();
    act(() => { api!.open('table', { ...table, titleMenu: () => [{ label: 'Back into the map' }] }); });
    act(() => { api!.move('table', { to: 'floating', rect: { x: 10, y: 10, width: 200, height: 150 } }); });
    act(() => { ($('[data-rdd-window="map/table"] .rdd-btn-more-actions') as HTMLElement).click(); });
    const labels = menu()!;
    expect(labels.slice(0, 2)).toEqual(['Back into the map', '---']);
    expect(labels).toEqual(['Back into the map', '---', 'Close Panel']);
    act(() => { menuItem('Close Panel').click(); });
    expect(api!.isOpen('table')).toBe(false);
  });

  it('without titleMenu there is no menu button', () => {
    mount();
    act(() => { api!.move('table', { to: 'floating' }); });
    expect($('[data-rdd-window="map/table"] .rdd-btn-more-actions')).toBeNull();
  });
});

// ─── M5: useWidget() and the move callbacks ───────────────────────────────────

let widget: WidgetHandle | null = null;
const calls: string[] = [];
/** Records its handle, and what each callback saw: where the content element was at that moment. */
const Probe: React.FC = () => {
  widget = useWidget();
  const w = widget;
  useEffect(() => {
    if (!w) return;
    const where = () => content()?.parentElement?.className ?? 'nowhere';
    const offWill = w.onWillMove(() => calls.push(`will@${where()}`));
    const offMoved = w.onMoved(() => calls.push(`moved@${where()}`));
    return () => { offWill(); offMoved(); };
  }, [w?.onWillMove, w?.onMoved]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <span id="wo-loc">{w?.location ?? 'none'}</span>;
};
const probed: ManagedWidget = { ...table, content: <Probe /> };
const frames = () => act(async () => { await new Promise(r => setTimeout(r, 80)); });
const loc = () => document.getElementById('wo-loc')?.textContent;
function mountProbe(): Workspace {
  const ws = mount();
  act(() => { api!.close('table'); });
  act(() => { api!.open('table', probed); });
  calls.length = 0;
  return ws;
}
afterEach(() => { widget = null; calls.length = 0; });

describe('WO13: useWidget()', () => {
  it('is null outside a managed widget', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<Probe />); });
    expect(widget).toBeNull();
  });

  it('gives the id, the owner panel, and a location that re-renders when it changes', () => {
    const ws = mountProbe();
    expect(widget).toMatchObject({ id: 'table', ownerPanelId: 'map', location: 'panel' });
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    expect(loc()).toBe('docked');
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(loc()).toBe('tabbed');
    act(() => { ws.minimizePanel('map/table'); });
    expect(loc()).toBe('minimized');
    act(() => { api!.move('table', { to: 'panel' }); });
    expect(loc()).toBe('panel');
  });

  it('has no owner panel outside a workspace panel', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<Owner />); });
    act(() => { api!.open('table', probed); });
    expect(widget).toMatchObject({ id: 'table', ownerPanelId: null, location: 'panel' });
  });
});

describe('WO14: the order of the callbacks', () => {
  it('floating to floating, and tabbed to tabbed, are moves too: one will, one moved', async () => {
    mountProbe();
    act(() => { api!.move('table', { to: 'floating', rect: { x: 0, y: 0, width: 200, height: 100 } }); });
    await frames();
    calls.length = 0;
    act(() => { api!.move('table', { to: 'floating', rect: { x: 50, y: 40, width: 320, height: 200 } }); });
    await frames();
    expect(calls.map(c => c.split('@')[0])).toEqual(['will', 'moved']);
    act(() => { api!.move('table', { to: 'tabbed' }); });
    await frames();
    calls.length = 0;
    act(() => { api!.move('table', { to: 'tabbed' }); });
    await frames();
    expect(calls.map(c => c.split('@')[0])).toEqual(['will', 'moved']);
  });

  it('onWillMove before the element moves, onMoved after it landed', async () => {
    mountProbe();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    expect(calls).toEqual(['will@rdd-panel-float__body']);
    await frames();
    expect(calls).toEqual(['will@rdd-panel-float__body', 'moved@rdd-hosted-widget']);
    act(() => { api!.move('table', { to: 'panel' }); });
    await frames();
    expect(calls.slice(2)).toEqual(['will@rdd-hosted-widget', 'moved@rdd-panel-float__body']);
  });

  it('out to out is one move: one will, one moved', async () => {
    mountProbe();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    await frames();
    calls.length = 0;
    act(() => { api!.move('table', { to: 'floating', rect: { x: 0, y: 0, width: 200, height: 100 } }); });
    await frames();
    expect(calls).toEqual(['will@rdd-hosted-widget', 'moved@rdd-hosted-widget']);
  });
});

describe('WO15: the user\'s own moves', () => {
  it('minimising and restoring the hosted panel call both', async () => {
    const ws = mountProbe();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    await frames();
    calls.length = 0;
    act(() => { ws.minimizePanel('map/table'); });
    expect(calls).toEqual(['will@rdd-hosted-widget']);
    await frames();
    expect(calls).toHaveLength(2);
    act(() => { ws.restorePanel('map/table'); });
    expect(calls[2]).toMatch(/^will@/);
    await frames();
    expect(calls).toHaveLength(4);
    expect(calls[3]).toBe('moved@rdd-hosted-widget');
  });

  it('floating it from the grid calls both', async () => {
    const ws = mountProbe();
    act(() => { api!.move('table', { to: 'tabbed' }); });
    await frames();
    calls.length = 0;
    act(() => { ws.floatPanel('map/table'); });
    await frames();
    expect(calls).toEqual(['will@rdd-hosted-widget', 'moved@rdd-hosted-widget']);
    expect(loc()).toBe('floating');
  });
});

describe('WO16: when nothing is called, and the rest', () => {
  it('a no-op, a refusal and a close call nothing', async () => {
    const ws = mountProbe();
    act(() => { api!.move('table', { to: 'panel' }); });
    act(() => { ws.floatPanel('map'); });
    act(() => { api!.move('table', { to: 'tabbed' }); });          // refused: owner floating
    await frames();
    expect(calls).toEqual([]);
    act(() => { ws.dockPanel('map'); });
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    await frames();
    calls.length = 0;
    act(() => { ws.closePanel('map/table'); });
    await frames();
    expect(calls).toEqual([]);
  });

  it('a layout load sending it home is a move', async () => {
    const ws = mountProbe();
    const layout = ws.saveLayout();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    await frames();
    calls.length = 0;
    act(() => { ws.loadLayout(layout); });
    await frames();
    expect(calls).toEqual(['will@rdd-hosted-widget', 'moved@rdd-panel-float__body']);
  });

  it('unsubscribing stops the calls', async () => {
    mountProbe();
    const extra = vi.fn();
    const off = widget!.onWillMove(extra);
    off();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    await frames();
    expect(extra).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
  });
});

// ─── M6: WidgetPlacement ──────────────────────────────────────────────────────

describe('WO17: placement()', () => {
  it('is null for a widget that isn\'t open, and the panel form in the panel', () => {
    mount();
    expect(api!.placement('nope')).toBeNull();
    expect(api!.placement('table')).toEqual({ v: 1, at: 'panel', anchor: 'bottom-left', stretch: null, mode: 'docked', width: 240, height: 160 });
  });

  it('out of the panel: where, plus home', () => {
    const ws = mount();
    const home = api!.placement('table');
    act(() => { api!.move('table', { to: 'docked', position: 'right', size: 0.3 }); });
    expect(api!.placement('table')).toEqual({ v: 1, at: 'docked', position: 'right', size: 0.3, home });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(api!.placement('table')).toEqual({ v: 1, at: 'tabbed', home });
    act(() => { api!.move('table', { to: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 } }); });
    expect(api!.placement('table')).toEqual({ v: 1, at: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 }, home });
    // The user moves the window, then minimises it: it remembers the window as it was last.
    act(() => { ws.updateFloatingPosition('map/table', { x: 90, y: 70 }); });
    act(() => { ws.minimizePanel('map/table'); });
    expect(api!.placement('table')).toEqual({ v: 1, at: 'floating', rect: { x: 90, y: 70, width: 300, height: 200 }, home });
  });

  it('is plain JSON', () => {
    mount();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    const p = api!.placement('table');
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe('WO18: open({ placement }) in the panel', () => {
  const saved = { v: 1, at: 'panel', anchor: 'top-right', stretch: 'height', mode: 'docked', width: 280, height: 190 } as const;

  it('puts it where it was saved', () => {
    mount();
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: saved }); });
    expect(api!.placement('table')).toEqual(saved);
    expect((frame() as HTMLElement).style.insetInlineEnd).toBe('8px');   // top-right
  });

  it('a value it can\'t read falls back to the config', () => {
    mount();
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: { ...saved, v: 2 } as never }); });
    expect(api!.placement('table')).toMatchObject({ anchor: 'bottom-left', width: 240, height: 160 });
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: { ...saved, anchor: 'nowhere' } as never }); });
    expect(api!.placement('table')).toMatchObject({ anchor: 'bottom-left' });
  });

  it('a re-open of a live id ignores it, in or out of the panel', () => {
    mount();
    act(() => { api!.open('table', { ...table, placement: saved }); });
    expect(api!.placement('table')).toMatchObject({ anchor: 'bottom-left' });
    act(() => { api!.open('table', { ...table, placement: { v: 1, at: 'tabbed', home: saved } as never }); });
    expect(api!.location('table')).toBe('panel');
  });

  it('a free position waits for the panel to have a size, and is kept meanwhile', () => {
    // jsdom lays nothing out: the overlay measures 0x0, as a hidden panel does.
    mount();
    const freeSaved = { v: 1, at: 'panel', anchor: 'top-left', stretch: null, mode: 'free', offset: { corner: 'bottom-right', inline: 16, block: 24 }, width: 200, height: 100 };
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: freeSaved as never }); });
    expect(api!.placement('table')).toEqual(freeSaved);          // not re-measured against 0x0
    expect((frame() as HTMLElement).style.left).toBe('');         // shown docked meanwhile
  });

  it('a free position is placed at once when the panel has a size', () => {
    // jsdom defines these on Element.prototype; shadow them on HTMLElement and delete afterwards.
    const sized = (dim: number) => ({ configurable: true, get(this: HTMLElement) { return this.classList.contains('rdd-panel-overlay-root') ? dim : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', sized(800));
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', sized(600));
    try {
      mount();
      act(() => { api!.close('table'); });
      act(() => { api!.open('table', { ...table, placement: { v: 1, at: 'panel', anchor: 'top-left', stretch: null, mode: 'free', offset: { corner: 'bottom-right', inline: 16, block: 24 }, width: 200, height: 100 } as never }); });
      expect((frame() as HTMLElement).style.left).toBe(`${800 - 200 - 16}px`);
      expect((frame() as HTMLElement).style.top).toBe(`${600 - 100 - 24}px`);
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  });
});

describe('WO19: open({ placement }) out of the panel', () => {
  const home = { v: 1, at: 'panel', anchor: 'top-right', stretch: null, mode: 'docked', width: 280, height: 190 };

  it('moves it out after opening, and going back goes home', () => {
    const ws = mount();
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: { v: 1, at: 'docked', position: 'bottom', size: 0.4, home } as never }); });
    expect(api!.location('table')).toBe('docked');
    expect(state(ws).panels['map/table']).toBeDefined();
    expect(api!.placement('table')).toEqual({ v: 1, at: 'docked', position: 'bottom', size: 0.4, home });
    act(() => { api!.move('table', { to: 'panel' }); });
    expect(api!.placement('table')).toEqual(home);
  });

  it('closed and re-opened out of the panel in one go, the same panel id shows the new content', () => {
    mount();
    act(() => { api!.move('table', { to: 'tabbed' }); });
    const saved = api!.placement('table');
    const old = content();
    act(() => { api!.close('table'); api!.open('table', { ...table, placement: saved! }); });
    expect(content()).not.toBe(old);
    expect(content()!.parentElement!.classList.contains('rdd-hosted-widget')).toBe(true);
    expect(content()!.querySelector('#wo-count')).not.toBeNull();
  });

  it('floating at its saved rect', () => {
    const ws = mount();
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: { v: 1, at: 'floating', rect: { x: 20, y: 30, width: 300, height: 200 }, home } as never }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ x: 20, y: 30, width: 300, height: 200 });
  });

  it('refused (the owner is floating), it stays in the panel', () => {
    const ws = mount();
    act(() => { ws.floatPanel('map'); });
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: { v: 1, at: 'tabbed', home } as never }); });
    expect(api!.location('table')).toBe('panel');
    expect(api!.placement('table')).toEqual(home);
  });
});

// ─── 7.11.0-next.1: MapEvolution's feedback on next.0 ─────────────────────────

describe('WO20: a widget\'s panel brings its owner\'s contribution', () => {
  const OwnerWithTools: React.FC = () => {
    usePanelContribution(React.useMemo(() => ({ sidebarSections: [{ id: 'tools', label: 'Tools', content: null }] }), []));
    return <RddPanelOverlay><Grab /></RddPanelOverlay>;
  };
  const PlainWithOwn: React.FC = () => {
    usePanelContribution(React.useMemo(() => ({ sidebarSections: [{ id: 'own', label: 'Own', content: null }] }), []));
    return <div />;
  };
  const Shell: React.FC = () => {
    const active = useActiveContribution();
    return <span id="wo-contrib">{active?.sidebarSections?.map(s => s.id).join(',') ?? 'none'}</span>;
  };
  const contrib = () => document.getElementById('wo-contrib')?.textContent;
  function mountTools(): Workspace {
    const ws = createWorkspace({ panels: { map: { component: OwnerWithTools }, other: { component: PlainWithOwn } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop /><Shell /></DockableDesktopProvider>); });
    act(() => { ws.openPanel('map', 'map', { title: 'Map' }); });
    act(() => { api!.open('table', table); });
    return ws;
  }

  it('the active widget panel shows the owner\'s; an ordinary panel shows its own', () => {
    const ws = mountTools();
    act(() => { ws.focusPanel('map'); });
    expect(contrib()).toBe('tools');
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    act(() => { ws.focusPanel('map/table'); });
    expect(state(ws).activePanelId).toBe('map/table');
    expect(contrib()).toBe('tools');
    act(() => { ws.openPanel('other', 'other', { title: 'Other' }); });
    act(() => { ws.focusPanel('other'); });
    expect(contrib()).toBe('own');
    act(() => { api!.move('table', { to: 'floating' }); });
    act(() => { ws.focusPanel('map/table'); });
    expect(contrib()).toBe('tools');
  });
});

describe('WO21: the widget panel\'s title across moves', () => {
  it('a title set with updatePanelTitle is kept from one place out of the panel to another', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    act(() => { ws.updatePanelTitle('map/table', 'Table · Map 1'); });
    act(() => { api!.move('table', { to: 'floating' }); });
    expect(state(ws).panels['map/table'].title).toBe('Table · Map 1');
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(state(ws).panels['map/table'].title).toBe('Table · Map 1');
  });

  it('a first move out takes the widget\'s title, and a re-open still applies a new one', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    expect(state(ws).panels['map/table'].title).toBe('Table');
    act(() => { ws.updatePanelTitle('map/table', 'Custom'); });
    act(() => { api!.open('table', { ...table, title: 'Table · Map 2' }); });
    expect(state(ws).panels['map/table'].title).toBe('Table · Map 2');
  });
});

describe('WO22: useWidget().panelId', () => {
  it('is null in the panel, the widget panel\'s id out of it, and null again back home', () => {
    const ws = mountProbe();
    expect(widget!.panelId).toBeNull();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    expect(widget!.panelId).toBe('map/table');
    act(() => { api!.move('table', { to: 'floating' }); });
    expect(widget!.panelId).toBe('map/table');
    act(() => { ws.minimizePanel('map/table'); });
    expect(widget!.panelId).toBe('map/table');
    act(() => { api!.move('table', { to: 'panel' }); });
    expect(widget!.panelId).toBeNull();
  });
});

describe('WO23: the title icon opens the menu out of the panel', () => {
  const withMenu: ManagedWidget = { ...table, titleMenu: () => [{ label: 'Back into the map' }] };

  it('the tab icon of a widget panel opens the same menu as a right-click on its tab', () => {
    mount();
    act(() => { api!.open('table', withMenu); });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    const icon = $('[data-rdd-tab="map/table"] .rdd-workspace-tab-icon') as HTMLElement;
    expect(icon.classList.contains('rdd-workspace-tab-icon--menu')).toBe(true);
    act(() => { icon.click(); });
    expect(menu()).toEqual(['Back into the map', '---', 'Minimize Panel', '---', 'Close Tab']);
  });

  it('an ordinary panel\'s tab icon opens nothing', () => {
    mount();
    const icon = $('[data-rdd-tab="map"] .rdd-workspace-tab-icon') as HTMLElement;
    expect(icon.classList.contains('rdd-workspace-tab-icon--menu')).toBe(false);
    act(() => { icon.click(); });
    expect(menu()).toBeNull();
  });

  it('the floating title-bar icon opens the ⋮ menu; without a titleMenu it is plain', () => {
    mount();
    act(() => { api!.move('table', { to: 'floating' }); });
    const plain = $('[data-rdd-window="map/table"] .rdd-window-title-icon') as HTMLElement;
    expect(plain.classList.contains('rdd-window-title-icon--menu')).toBe(false);
    act(() => { plain.click(); });
    expect(menu()).toBeNull();
    act(() => { api!.move('table', { to: 'panel' }); });
    act(() => { api!.open('table', withMenu); });
    act(() => { api!.move('table', { to: 'floating' }); });
    const icon = $('[data-rdd-window="map/table"] .rdd-window-title-icon') as HTMLElement;
    expect(icon.classList.contains('rdd-window-title-icon--menu')).toBe(true);
    act(() => { icon.click(); });
    expect(menu()).toEqual(['Back into the map', '---', 'Close Panel']);
  });
});
