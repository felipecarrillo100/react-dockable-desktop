/**
 * Focus across windows (7.12.0, S6): `workspace.focusPanelWindow(id)`, `focusPanel` on a panel in
 * its own window, activation from inside a pop-out, Escape scoped per window, and the taskbar's
 * entries for panels in their own window. The pop-out is an `<iframe>`'s window.
 *
 * PF1: focusPanelWindow: false for an unknown id; a popped-out panel's window, or the main window,
 *      is focused, and the panel becomes the active one; a widget's panel's window too
 * PF2: focusPanel on a popped-out panel brings its window forward; not on a panel in the page
 * PF3: a pointerdown or a focusin inside a pop-out activates its panel (a widget's too), and its
 *      frame shows it; a focusin in the page doesn't change what it did before
 * PF4: Escape: a menu opened in a pop-out renders there and closes on Escape there, not on Escape
 *      in the page; a menu in the page stays open on Escape in a pop-out; a toolbar flyout in a
 *      pop-out closes on Escape there only
 * PF5: the taskbar lists a panel in its own window with a marker; a click brings its window
 *      forward; gone on return; none with popOut off
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, RddPanelOverlay, useFloatingWidgets, type Workspace, type FloatingWidgetsApi } from '../../index';
import { ToolbarProvider } from '../ToolbarContext';
import { Toolbar, type ToolbarItem } from '../Toolbar';
import { registerDocument } from '../../utils/documentRegistry';
import type { WorkspaceState } from '../../types';

type AnyWindow = Window & typeof globalThis;
const frames: HTMLIFrameElement[] = [];

function popup(): { win: AnyWindow; doc: Document; focus: ReturnType<typeof vi.fn> } {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as AnyWindow;
  let closed = false;
  const focus = vi.fn();
  // jsdom tears an iframe's document down on close(); a real pop-out's document stays readable.
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true });
  Object.defineProperty(win, 'close', { value: () => { closed = true; }, configurable: true });
  Object.defineProperty(win, 'focus', { value: focus, configurable: true });
  return { win, doc: frame.contentDocument!, focus };
}

let api: FloatingWidgetsApi | null = null;
const Grab: React.FC = () => { api = useFloatingWidgets(); return null; };
const Panel: React.FC<{ panelId: string }> = ({ panelId }) => (
  <div><input className="pf-input" data-id={panelId} /><RddPanelOverlay><Grab /></RddPanelOverlay></div>
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(popOut = true): Workspace {
  const ws = createWorkspace({ popOut, panels: { p: { component: Panel, defaultOptions: { canPopOut: true } } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>); });
  act(() => { ws.openPanel('a', 'p'); ws.openPanel('b', 'p', { dockTo: { panel: 'a', position: 'right' } }); });
  return ws;
}
const state = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): WorkspaceState } })._core.getSnapshot();
const popOutA = (ws: Workspace) => {
  const p = popup();
  vi.spyOn(window, 'open').mockImplementation(() => p.win);
  act(() => { ws.popOutPanel('a'); });
  return p;
};
const menuIn = (doc: Document) => doc.querySelector('.rdd-context-menu');

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null; api = null;
  frames.splice(0).forEach(f => f.remove());
  vi.restoreAllMocks();
  document.getElementById('preserved-dom-container')?.remove();
  document.querySelectorAll('.rdd-context-menu').forEach(m => m.remove());
});

describe('PF1: focusPanelWindow', () => {
  it('false for an unknown id', () => {
    const ws = mount();
    expect(ws.focusPanelWindow('nope')).toEqual({ ok: false });
  });

  it('a popped-out panel: its window is focused and it becomes the active one', () => {
    const ws = mount();
    const p = popOutA(ws);
    act(() => { ws.focusPanel('b'); });
    p.focus.mockClear();
    let r: unknown;
    act(() => { r = ws.focusPanelWindow('a'); });
    expect(r).toEqual({ ok: true });
    expect(p.focus).toHaveBeenCalledTimes(1);
    expect(state(ws).activePanelId).toBe('a');
  });

  it('a panel in the page: the main window is focused, and it becomes the active one', () => {
    const ws = mount();
    popOutA(ws);
    const main = vi.spyOn(window, 'focus').mockImplementation(() => {});
    act(() => { ws.focusPanelWindow('b'); });
    expect(main).toHaveBeenCalledTimes(1);
    expect(state(ws).activePanelId).toBe('b');
  });

  it('a refused focus() is no error', () => {
    const ws = mount();
    const p = popOutA(ws);
    p.focus.mockImplementation(() => { throw new Error('refused'); });
    expect(() => act(() => { ws.focusPanelWindow('a'); })).not.toThrow();
    vi.spyOn(window, 'focus').mockImplementation(() => { throw new Error('refused'); });
    expect(ws.focusPanelWindow('b')).toEqual({ ok: true });
  });

  it('a widget\'s panel in its own window', () => {
    const ws = mount();
    act(() => { api!.open('w', { title: 'W', content: <span className="pf-w">w</span>, canPopOut: true }); });
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    act(() => { api!.popOut('w'); });
    p.focus.mockClear();
    const hosted = Object.keys(state(ws).panels).find(id => state(ws).panels[id].owner)!;
    act(() => { ws.focusPanelWindow(hosted); });
    expect(p.focus).toHaveBeenCalledTimes(1);
    expect(state(ws).activePanelId).toBe(hosted);
  });
});

describe('PF2: focusPanel', () => {
  it('on a popped-out panel brings its window forward; on a panel in the page it doesn\'t', () => {
    const ws = mount();
    const p = popOutA(ws);
    p.focus.mockClear();
    act(() => { ws.focusPanel('a'); });
    expect(p.focus).toHaveBeenCalledTimes(1);
    act(() => { ws.focusPanel('b'); });
    expect(p.focus).toHaveBeenCalledTimes(1);
  });
});

describe('PF3: activation from inside a pop-out', () => {
  it('a pointerdown activates its panel, and its frame shows it', () => {
    const ws = mount();
    const p = popOutA(ws);
    act(() => { ws.focusPanel('b'); });
    const frame = p.doc.querySelector<HTMLElement>('.rdd-popout-frame')!;
    expect(frame.hasAttribute('data-rdd-focused')).toBe(false);
    const input = p.doc.querySelector('.pf-input')!;
    act(() => { input.dispatchEvent(new p.win.PointerEvent('pointerdown', { bubbles: true, button: 0 })); });
    expect(state(ws).activePanelId).toBe('a');
    expect(frame.hasAttribute('data-rdd-focused')).toBe(true);
  });

  it('a focusin activates its panel', () => {
    const ws = mount();
    const p = popOutA(ws);
    act(() => { ws.focusPanel('b'); });
    act(() => { p.doc.querySelector('.pf-input')!.dispatchEvent(new p.win.FocusEvent('focusin', { bubbles: true })); });
    expect(state(ws).activePanelId).toBe('a');
  });

  it('in a widget\'s window, its panel', () => {
    const ws = mount();
    act(() => { api!.open('w', { title: 'W', content: <span className="pf-w">w</span>, canPopOut: true }); });
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    act(() => { api!.popOut('w'); });
    act(() => { ws.focusPanel('b'); });
    act(() => { p.doc.querySelector('.pf-w')!.dispatchEvent(new p.win.PointerEvent('pointerdown', { bubbles: true, button: 0 })); });
    expect(state(ws).panels[state(ws).activePanelId!].owner).toBeDefined();
  });

  it('a focusin in the page changes nothing it didn\'t before', () => {
    const ws = mount();
    act(() => { ws.focusPanel('b'); });
    act(() => { container!.querySelector('.pf-input[data-id="a"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    expect(state(ws).activePanelId).toBe('b');
  });
});

describe('PF4: Escape, per window', () => {
  const showIn = (ws: Workspace, doc: Document) => act(() => {
    ws.showContextMenu({ event: { target: doc.body, clientX: 5, clientY: 5 } as unknown as MouseEvent, items: [{ label: 'One', action: () => {} }] });
  });
  const escape = (doc: Document) => act(() => {
    const view = doc.defaultView as AnyWindow;
    doc.body.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  it('a menu opened in a pop-out renders there; Escape in the page leaves it, Escape there closes it', () => {
    const ws = mount();
    const p = popOutA(ws);
    showIn(ws, p.doc);
    expect(menuIn(p.doc)).not.toBeNull();
    expect(menuIn(document)).toBeNull();
    escape(document);
    expect(menuIn(p.doc)).not.toBeNull();
    escape(p.doc);
    expect(menuIn(p.doc)).toBeNull();
  });

  it('a menu in the page stays open on Escape in a pop-out', () => {
    const ws = mount();
    const p = popOutA(ws);
    showIn(ws, document);
    expect(menuIn(document)).not.toBeNull();
    escape(p.doc);
    expect(menuIn(document)).not.toBeNull();
    escape(document);
    expect(menuIn(document)).toBeNull();
  });
});

describe('PF4b: a toolbar flyout in a pop-out', () => {
  it('closes on Escape there, not on Escape in the page', () => {
    const p = popup();
    const off = registerDocument(p.doc);
    const host = p.doc.createElement('div');
    p.doc.body.appendChild(host);
    const items: ToolbarItem[] = [{ type: 'group', id: 'g', label: 'Group', defaultIcon: <svg />, items: [{ id: 'x', label: 'X', icon: <svg /> }] }];
    const r = createRoot(host);
    act(() => { r.render(<ToolbarProvider><Toolbar items={items} /></ToolbarProvider>); });
    const btn = host.querySelector<HTMLButtonElement>('button.rdd-toolbar-btn-group')!;
    act(() => { btn.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true })); });
    const flyout = () => p.doc.body.querySelector('.rdd-toolbar-group-flyout');
    expect(flyout()).not.toBeNull();
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(flyout()).not.toBeNull();
    act(() => { p.doc.body.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(flyout()).toBeNull();
    act(() => r.unmount());
    off();
  });
});

describe('PF5: the taskbar', () => {
  const entry = (id: string) => container!.querySelector<HTMLButtonElement>(`[data-rdd-taskbar-popout="${id}"]`);

  it('lists a panel in its own window with a marker; a click brings its window forward; gone on return', () => {
    const ws = mount();
    expect(entry('a')).toBeNull();
    const p = popOutA(ws);
    const item = entry('a')!;
    expect(item).not.toBeNull();
    expect(item.querySelector('.rdd-taskbar-item-popout-marker')).not.toBeNull();
    expect(item.getAttribute('aria-label')).toMatch(/in its own window$/);
    act(() => { ws.focusPanel('b'); });
    p.focus.mockClear();
    act(() => { item.click(); });
    expect(p.focus).toHaveBeenCalledTimes(1);
    expect(state(ws).activePanelId).toBe('a');
    act(() => { ws.returnPanel('a'); });
    expect(entry('a')).toBeNull();
  });

  it('none with popOut off', () => {
    const ws = mount(false);
    act(() => { ws.minimizePanel('b'); });
    expect(container!.querySelector('[data-rdd-taskbar-popout]')).toBeNull();
    expect(container!.querySelector('[data-rdd-taskbar-item="b"]')).not.toBeNull();   // minimised as before
  });
});
