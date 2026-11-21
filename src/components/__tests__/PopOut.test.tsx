/**
 * Pop-out windows for panels (7.12.0, S2): `createWorkspace({ popOut })`, `defaultOptions.canPopOut`,
 * `workspace.popOutPanel(id)` / `returnPanel(id)`, the "Open in new window" menu item. The child
 * window is an `<iframe>`'s window (its own document and DOM constructors, as a real pop-out's),
 * handed back by a stubbed `window.open`; closing it and its `pagehide` are simulated.
 *
 * PO1:  disabled: 'disabled' and one development warning; nothing opens, no menu item
 * PO2:  a type with canPopOut on a workspace without popOut warns in development
 * PO3:  refusals in order: not-open, not-allowed (type, hosted panel), no-gesture, blocked,
 *       no-window; each changes nothing
 * PO4:  a docked panel pops out as floating with the flag, remembering its group; no frame in
 *       the workspace; the window's name, title, lang and dir
 * PO5:  the same element moves into the child's frame and back, with no remount and its state kept
 * PO6:  return: into the same group; floating when the group is gone; a floating panel stays floating
 * PO7:  return paths: the frame's button, the child's pagehide (element back inside the handler),
 *       the closed poll, the main page's pagehide
 * PO8:  the windows follow the store: closePanel, loadLayout and dockPanel from code close them
 * PO9:  saveLayout writes the panel floating without the flag; a loaded flag is ignored
 * PO10: a second call is idempotent: one window, brought forward; StrictMode-safe
 * PO11: the child document is registered while open (document-wide listeners reach it)
 * PO12: with popoutUrl, the element moves in only once the page has loaded
 * PO13: the menu item: in the tab menu and the floating ⋮ menu, only with popOut and canPopOut
 * PO14: a blocked pop-up shows a toast from the menu, nothing from code
 * PO15: unmounting the provider brings every panel back and closes its window (S2.1)
 * PO16: maximizePanel and floatPanel are ignored while a panel is out (S2.1)
 * PO17: the hidden entry is left out of the cascade and the on-screen clamp (S2.1)
 * PO18: each window opened gets a name of its own (S2.1)
 * PO19: the frame lays itself out without the stylesheet (S2.1)
 * PO20: placesBeside / returnBeside: edge dock, nested split, 3-child split, first child, neighbours
 *       moved or gone (S2.2)
 * PO21: the edge case through the workspace: the tree comes back exactly, sizes too (S2.2)
 * PO22: minimizing (or docking) a popped-out panel from code returns it to its place first (S2.2)
 * PO23: a page failing at once leaves no timer behind (S2.2)
 * PO24: a return and a new pop-out of the same panel in one batch fill the new window (S2.2)
 * PO25: no provider mounted: 'no-window', and nothing opens (S2.2)
 * PO26: the window's position is the panel's real screen position, negative too (S2.2)
 * PO27: neighbours out at once: back in either order, the layout is the original; also a split of
 *       three and two tabs of one group (S2.3)
 * PO28: saveLayout with several panels out writes the layout from before they left (S2.3)
 * PO29: a panel that was the whole grid returns into the empty grid, whatever its group id (S2.3)
 * PO30: a kept-empty neighbour group: the neighbour on the other side is used (S2.3)
 * PO31: the share comes back exact, under 10% and over 90% too (S2.3)
 * PO32: popoutUrl: a page ready without a load event is found by the poll's check (S2.3)
 * PO33: every docked panel out at once: the first back goes into the empty grid; the groups
 *       returns make have ids of their own (S2.4)
 * PO34: all tabs of one group out: they come back as one group (S2.4)
 * PO35: tab order is kept relative to the group-mates, whatever the orders (S2.4)
 * PO36: a split's old sizes apply only to a split holding the same panels (S2.4)
 * PO37: the matrix: 13 layouts (three built through the public API, with group-default), every
 *       set of 2 and 3 panels, every pop and return order: back to the original, and a save while
 *       all are out writes the original (S2.4)
 * PO38: group-default reused by the empty grid is not "its own group" (S2.4 finish)
 * PO39: a split's old sizes come back while a tab-mate is still out (S2.4 finish)
 * PO40: the empty-grid rule with only kept-empty groups left (S2.4 finish)
 * PO41: interleaved pop-outs and returns end in the original layout (S2.4 finish)
 * PO42: a kept group waiting for a panel still out stands in for it (D1)
 * PO43: popping out a minimized panel works out its place on the put-back copy (D2)
 */
import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, toast, type Workspace, type PopOutResult } from '../../index';
import type { InternalWindowActions, WorkspaceState } from '../../types';
import { findLeafIdOf, placesBeside, returnBeside, removePanelFromTree } from '../../core/layoutTree';
import type { LayoutNode } from '../../types';
import { listenOnDocuments } from '../../utils/documentRegistry';
import { POPOUT_PLACED_TIMEOUT_MS } from '../../core/popOutWindows';

type AnyWindow = Window & typeof globalThis;

const mounts = vi.fn();
/** A panel with state, recording every mount. */
const Counter: React.FC<{ panelId: string }> = ({ panelId }) => {
  const [n, setN] = useState(0);
  useEffect(() => { mounts(panelId); }, [panelId]);
  return <button className="po-count" data-id={panelId} onClick={() => setN(x => x + 1)}>{n}</button>;
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const frames: HTMLIFrameElement[] = [];
const cleanups: (() => void)[] = [];

interface Popup {
  win: AnyWindow;
  doc: Document;
  /** The user closes the window: `closed` turns true; `pagehide` fires unless `silent`. */
  closeByUser(silent?: boolean): void;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/** A child window: an iframe's, with `closed`, `close()` and `focus()` under the test's control. */
function popup(): Popup {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as AnyWindow;
  let closed = false;
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true });
  const close = vi.fn(() => { closed = true; });
  const focus = vi.fn();
  Object.defineProperty(win, 'close', { value: close, configurable: true });
  Object.defineProperty(win, 'focus', { value: focus, configurable: true });
  return {
    win, doc: frame.contentDocument!, close, focus,
    closeByUser(silent = false) {
      closed = true;
      if (!silent) win.dispatchEvent(new win.Event('pagehide'));
    },
  };
}

/** `window.open` hands back `p` (or null: a blocked pop-up). */
const stubOpen = (p: Popup | null) => vi.spyOn(window, 'open').mockImplementation(() => (p ? p.win : null));

function mount(opts: { popOut?: boolean; strict?: boolean; popoutUrl?: string } = {}): Workspace {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: {
      counter: { component: Counter, defaultOptions: { canPopOut: true } },
      fixed: { component: Counter, defaultOptions: { canPopOut: true, canFloat: false } },
      plain: { component: Counter },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const tree = <DockableDesktopProvider workspace={ws} popoutUrl={opts.popoutUrl}><RddDesktop /></DockableDesktopProvider>;
  act(() => { root!.render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree); });
  act(() => {
    ws.openPanel('a', 'counter', { title: 'Alpha' });
    ws.openPanel('b', 'counter', { title: 'Beta' });
  });
  // 'a' is the shown tab of the group, so its element is on the page.
  act(() => { ws.focusPanel('a'); });
  return ws;
}

const core = (ws: Workspace) => (ws as unknown as { _core: { actions: InternalWindowActions; getSnapshot(): WorkspaceState } })._core;
const state = (ws: Workspace) => core(ws).getSnapshot();
const counter = (id: string, doc: Document = document) => doc.querySelector<HTMLButtonElement>(`.po-count[data-id="${id}"]`);
const panelEl = (id: string, doc: Document = document) => counter(id, doc)?.closest('.rdd-panel-dom') as HTMLElement | null;
const popOut = (ws: Workspace, id: string) => { let r: PopOutResult | undefined; act(() => { r = ws.popOutPanel(id); }); return r!; };

/** The open menu's labels, and '---' for a separator. */
const menu = () => {
  const m = document.querySelector('.rdd-context-menu:not(.rdd-context-menu--submenu)');
  return m ? [...m.children].map(c => c.tagName === 'HR' ? '---' : c.querySelector('.rdd-context-menu__label')?.textContent ?? '?') : null;
};
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('.rdd-context-menu__item')]
  .find(b => b.querySelector('.rdd-context-menu__label')?.textContent === label);
const rightClickTab = (id: string) => act(() => {
  document.querySelector(`[data-tab-id="${id}"]`)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
});
const closeMenu = () => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  cleanups.splice(0).forEach(f => f());
  frames.splice(0).forEach(f => f.remove());
  mounts.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.getElementById('preserved-dom-container')?.remove();
  document.querySelectorAll('.rdd-context-menu').forEach(m => m.remove());
});

describe('PO1: disabled', () => {
  it('refuses with "disabled", opens nothing, and warns once in development', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ws = mount({ popOut: false });
      const open = stubOpen(popup());
      expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'disabled' });
      expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'disabled' });
      expect(open).not.toHaveBeenCalled();
      expect(state(ws).panels.a.state).toBe('docked');
      expect(warn.mock.calls.filter(c => String(c[0]).includes('popOutPanel("a") was refused'))).toHaveLength(1);
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it('shows no menu item', () => {
    mount({ popOut: false });
    rightClickTab('a');
    expect(menu()).not.toContain('Open in new window');
  });

  it('is not on workspace.config (owner, S2.1)', () => {
    expect('popOut' in createWorkspace({ popOut: true }).config).toBe(false);
  });
});

describe('PO2: canPopOut without popOut', () => {
  it('warns in development, naming the types', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      createWorkspace({ panels: { chart: { component: Counter, defaultOptions: { canPopOut: true } }, plain: { component: Counter } } });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('"chart"');
      warn.mockClear();
      createWorkspace({ popOut: true, panels: { chart: { component: Counter, defaultOptions: { canPopOut: true } } } });
      createWorkspace({ panels: { plain: { component: Counter } } });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});

describe('PO3: refusals', () => {
  it('not-open: no such panel', () => {
    const ws = mount();
    const open = stubOpen(popup());
    expect(popOut(ws, 'nope')).toEqual({ ok: false, reason: 'not-open' });
    expect(open).not.toHaveBeenCalled();
  });

  it('not-allowed: a type without canPopOut, and a widget\'s hosted panel', () => {
    const ws = mount();
    const open = stubOpen(popup());
    act(() => { ws.openPanel('p', 'plain'); });
    expect(popOut(ws, 'p')).toEqual({ ok: false, reason: 'not-allowed' });
    act(() => {
      core(ws).actions.openHostedPanel('a/w', { panelId: 'a', widgetId: 'w' }, 'W', { kind: 'float', rect: { x: 0, y: 0, width: 100, height: 100 } });
    });
    expect(popOut(ws, 'a/w')).toEqual({ ok: false, reason: 'not-allowed' });
    expect(open).not.toHaveBeenCalled();
  });

  it('no-gesture: not inside a user activation; a browser without the API counts as one', () => {
    const ws = mount();
    const open = stubOpen(popup());
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true });
    cleanups.push(() => { delete (navigator as unknown as { userActivation?: unknown }).userActivation; });
    const before = state(ws);
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'no-gesture' });
    expect(open).not.toHaveBeenCalled();
    expect(state(ws)).toBe(before);
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: true }, configurable: true });
    expect(popOut(ws, 'a')).toEqual({ ok: true });
  });

  it('blocked: window.open returns null', () => {
    const ws = mount();
    stubOpen(null);
    const before = state(ws);
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'blocked' });
    expect(state(ws)).toBe(before);
  });

  it('no-window: the window is closed already', () => {
    const ws = mount();
    const p = popup();
    p.closeByUser(true);
    stubOpen(p);
    const before = state(ws);
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'no-window' });
    expect(state(ws)).toBe(before);
  });

  it('checks in order: not-allowed before no-gesture, no-gesture before opening', () => {
    const ws = mount();
    const open = stubOpen(null);
    act(() => { ws.openPanel('p', 'plain'); });
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true });
    cleanups.push(() => { delete (navigator as unknown as { userActivation?: unknown }).userActivation; });
    expect(popOut(ws, 'p')).toEqual({ ok: false, reason: 'not-allowed' });
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'no-gesture' });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('PO4: state', () => {
  it('a docked panel is floating with the flag, remembering its group, and has no frame in the workspace', () => {
    const ws = mount();
    const p = popup();
    const open = stubOpen(p);
    const leaf = findLeafIdOf(state(ws).gridRoot, 'a');
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    const s = state(ws);
    expect(s.panels.a).toMatchObject({ state: 'floating', poppedOut: true, previousState: 'docked', lastLeafId: leaf });
    expect(s.floating.some(w => w.id === 'a')).toBe(true);
    expect(findLeafIdOf(s.gridRoot, 'a')).toBeNull();
    expect(container!.querySelector('[data-rdd-window="a"]')).toBeNull();
    // An empty URL: the window keeps its initial document (Firefox may replace an about:blank one).
    expect(open).toHaveBeenCalledWith('', expect.stringMatching(/^rdd-popout-a-/), expect.stringMatching(/^popup=yes,left=\d+,top=\d+,width=\d+,height=\d+$/));
  });

  it('the window\'s title follows the panel\'s; lang and dir are copied', () => {
    document.documentElement.lang = 'nl';
    cleanups.push(() => { document.documentElement.removeAttribute('lang'); });
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    expect(p.doc.title).toBe('Alpha');
    expect(p.doc.documentElement.lang).toBe('nl');
    expect(p.doc.documentElement.dir).toBe('ltr');
    act(() => { ws.updatePanelTitle('a', 'Renamed'); });
    expect(p.doc.title).toBe('Renamed');
    expect(p.doc.querySelector('.rdd-popout-frame__title')!.textContent).toBe('Renamed');
    act(() => { ws.setDirection('rtl'); });
    expect(p.doc.documentElement.dir).toBe('rtl');
  });
});

describe('PO5: the same element, no remount', () => {
  it('moves the panel\'s element into the frame and back, keeping its state', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const el = panelEl('a')!;
    act(() => { counter('a')!.click(); counter('a')!.click(); });
    mounts.mockClear();
    popOut(ws, 'a');
    expect(panelEl('a', p.doc)).toBe(el);
    expect(el.ownerDocument).toBe(p.doc);
    expect(el.closest('.rdd-popout-frame')?.getAttribute('data-rdd-popout')).toBe('a');
    expect(counter('a', p.doc)!.textContent).toBe('2');
    act(() => { counter('a', p.doc)!.click(); });               // React events work in the child
    expect(counter('a', p.doc)!.textContent).toBe('3');
    act(() => { ws.returnPanel('a'); });
    expect(panelEl('a')).toBe(el);
    expect(el.ownerDocument).toBe(document);
    expect(container!.contains(el)).toBe(true);
    expect(counter('a')!.textContent).toBe('3');
    expect(mounts).not.toHaveBeenCalled();
  });
});

describe('PO6: where it returns', () => {
  it('a docked panel goes back into its group', () => {
    const ws = mount();
    stubOpen(popup());
    const leaf = findLeafIdOf(state(ws).gridRoot, 'a');
    popOut(ws, 'a');
    let r: { ok: boolean } | undefined;
    act(() => { r = ws.returnPanel('a'); });
    expect(r).toEqual({ ok: true });
    const s = state(ws);
    expect(s.panels.a.state).toBe('docked');
    expect(s.panels.a.poppedOut).toBeUndefined();
    expect(findLeafIdOf(s.gridRoot, 'a')).toBe(leaf);
    expect(s.floating.some(w => w.id === 'a')).toBe(false);
  });

  it('a panel alone in its group comes back beside its neighbour, on the same side, at the same share', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.dockPanelToWorkspaceEdge('b', 'right'); });     // [a | b], b takes 0.2
    const before = state(ws).gridRoot;
    expect(before).toMatchObject({ type: 'branch', orientation: 'horizontal' });
    popOut(ws, 'a');                      // 'a' was alone in its group: the group goes with it
    expect(state(ws).gridRoot.type).toBe('leaf');
    act(() => { ws.returnPanel('a'); });
    const s = state(ws);
    expect(s.panels.a.state).toBe('docked');
    expect(s.panels.a.poppedOut).toBeUndefined();
    const root = s.gridRoot as import('../../types').LayoutGridNode;
    expect(root).toMatchObject({ type: 'branch', orientation: 'horizontal' });
    expect(root.children.map(c => (c.type === 'leaf' ? c.panels : null))).toEqual([['a'], ['b']]);
    expect(root.sizes[0]).toBeCloseTo(0.8);
    expect(counter('a')).not.toBeNull();
  });

  it('...below a neighbour above it, in a vertical split', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.dockPanelToWorkspaceEdge('a', 'bottom'); });    // [b / a]
    popOut(ws, 'a');
    act(() => { ws.returnPanel('a'); });
    const root = state(ws).gridRoot as import('../../types').LayoutGridNode;
    expect(root).toMatchObject({ type: 'branch', orientation: 'vertical' });
    expect(root.children.map(c => (c.type === 'leaf' ? c.panels : null))).toEqual([['b'], ['a']]);
    expect(root.sizes[1]).toBeCloseTo(0.2);
  });

  it('...into the grid when nothing of its old layout is docked and the grid is empty (S2.4)', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('x', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    popOut(ws, 'x');
    act(() => { ws.closePanel('a'); ws.closePanel('b'); });     // its neighbour's group goes too
    act(() => { ws.returnPanel('x'); });
    expect(state(ws).panels.x.state).toBe('docked');
    expect(state(ws).gridRoot).toMatchObject({ type: 'leaf', panels: ['x'] });
  });

  it('...and stays floating, with a frame, when nothing of its old layout is docked but other panels are', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('x', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    popOut(ws, 'x');
    act(() => { ws.closePanel('a'); ws.closePanel('b'); });
    act(() => { ws.openPanel('z', 'counter'); });
    act(() => { ws.returnPanel('x'); });
    expect(state(ws).panels.x).toMatchObject({ state: 'floating' });
    expect(state(ws).panels.x.poppedOut).toBeUndefined();
    expect(container!.querySelector('[data-rdd-window="x"]')).not.toBeNull();
    expect(counter('x')).not.toBeNull();
  });

  it('...or goes into the first group when its type can\'t float', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('x', 'fixed', { dockTo: { panel: 'a', position: 'right' } }); });
    popOut(ws, 'x');
    act(() => { ws.closePanel('a'); ws.closePanel('b'); });     // its neighbour and the rest go
    act(() => { ws.openPanel('c', 'counter'); });
    act(() => { ws.returnPanel('x'); });
    expect(state(ws).panels.x.state).toBe('docked');
    expect(findLeafIdOf(state(ws).gridRoot, 'x')).toBe(findLeafIdOf(state(ws).gridRoot, 'c'));
  });

  it('a floating panel stays floating at its rect', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('f', 'counter', { initialTarget: 'floating' }); });
    const rect = state(ws).floating.find(w => w.id === 'f')!;
    popOut(ws, 'f');
    expect(state(ws).panels.f).toMatchObject({ state: 'floating', poppedOut: true, previousState: 'floating' });
    act(() => { ws.returnPanel('f'); });
    const back = state(ws).floating.find(w => w.id === 'f')!;
    expect({ x: back.x, y: back.y, width: back.width, height: back.height }).toEqual({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    expect(container!.querySelector('[data-rdd-window="f"]')).not.toBeNull();
  });

  it('returnPanel on a panel that is not out is { ok: false }', () => {
    const ws = mount();
    expect(ws.returnPanel('a')).toEqual({ ok: false });
    expect(ws.returnPanel('nope')).toEqual({ ok: false });
  });
});

describe('PO7: return paths', () => {
  it('the frame\'s "Return to desktop" button', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    const button = p.doc.querySelector<HTMLButtonElement>('.rdd-popout-frame__return')!;
    // A title-bar button in the skin (next.1): its label is the tooltip and the accessible name.
    expect(button.classList.contains('rdd-custom-tab-btn')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Return to desktop');
    expect(button.title).toBe('Return to desktop');
    act(() => { button.click(); });
    expect(state(ws).panels.a.state).toBe('docked');
    expect(p.close).toHaveBeenCalled();
    expect(counter('a')).not.toBeNull();
  });

  it('the child\'s pagehide: the element is back in the main document inside the handler', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    const el = panelEl('a', p.doc)!;
    let docInHandler: Document | null = null;
    // Runs after the library's own listener, still inside the same event.
    p.win.addEventListener('pagehide', () => { docInHandler = el.ownerDocument; });
    act(() => { p.closeByUser(); });
    expect(docInHandler).toBe(document);
    expect(state(ws).panels.a.state).toBe('docked');
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
  });

  it('the closed poll, when no pagehide comes', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    act(() => { vi.advanceTimersByTime(600); });
    expect(state(ws).panels.a.poppedOut).toBe(true);
    p.closeByUser(true);
    act(() => { vi.advanceTimersByTime(600); });
    expect(state(ws).panels.a.state).toBe('docked');
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(counter('a')).not.toBeNull();
  });

  it('the main page\'s pagehide closes every child window', () => {
    const ws = mount();
    const p1 = popup();
    const p2 = popup();
    const open = vi.spyOn(window, 'open').mockImplementationOnce(() => p1.win).mockImplementationOnce(() => p2.win);
    popOut(ws, 'a');
    popOut(ws, 'b');
    expect(open).toHaveBeenCalledTimes(2);
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(p1.close).toHaveBeenCalled();
    expect(p2.close).toHaveBeenCalled();
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(state(ws).panels.b.poppedOut).toBeUndefined();
    // Back where they were (P1), so whatever the page saves on its way out is that layout.
    expect(state(ws).panels.a.state).toBe('docked');
    expect(state(ws).panels.b.state).toBe('docked');
  });

  it('nothing is left listening or polling after a return', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const remove = vi.spyOn(p.win, 'removeEventListener');
    const mainRemove = vi.spyOn(window, 'removeEventListener');
    popOut(ws, 'a');
    act(() => { ws.returnPanel('a'); });
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(mainRemove).toHaveBeenCalledWith('pagehide', expect.any(Function));
  });
});

describe('PO8: the windows follow the store', () => {
  it('closePanel on a popped-out panel closes its window', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    act(() => { ws.closePanel('a'); });
    expect(p.close).toHaveBeenCalled();
    expect(ws.isOpen('a')).toBe(false);
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();
  });

  it('loadLayout closes every window', () => {
    const ws = mount();
    const saved = ws.saveLayout();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    act(() => { ws.loadLayout(saved); });
    expect(p.close).toHaveBeenCalled();
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(state(ws).panels.a.state).toBe('docked');
    expect(counter('a')).not.toBeNull();
  });

  it('dockPanel from code closes the window and clears the flag', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    act(() => { ws.dockPanel('a'); });
    expect(p.close).toHaveBeenCalled();
    expect(state(ws).panels.a).toMatchObject({ state: 'docked' });
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(counter('a')).not.toBeNull();
  });

  it('a minimized panel pops out from where it would restore', () => {
    const ws = mount();
    stubOpen(popup());
    const leaf = findLeafIdOf(state(ws).gridRoot, 'a');
    act(() => { ws.minimizePanel('a'); });
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    expect(state(ws).panels.a).toMatchObject({ state: 'floating', poppedOut: true, lastLeafId: leaf });
    expect(state(ws).minimized.some(m => m.id === 'a')).toBe(false);
  });
});

describe('PO9: saved layouts (P1: where it would come back to)', () => {
  const tree = (ws: Workspace) => JSON.parse(JSON.stringify(state(ws).gridRoot)) as WorkspaceState['gridRoot'];
  /** The tree's shape: panels per group and sizes, without the generated group ids. */
  const shape = (n: WorkspaceState['gridRoot']): unknown =>
    n.type === 'leaf' ? n.panels : { o: n.orientation, sizes: n.sizes.map(x => Math.round(x * 100)), c: n.children.map(shape) };

  it('a docked panel is saved docked in its group, without the flag; the live state is untouched', () => {
    const ws = mount();
    stubOpen(popup());
    const leaf = findLeafIdOf(state(ws).gridRoot, 'a');
    popOut(ws, 'a');
    const live = state(ws);
    const saved = JSON.parse(ws.saveLayout());
    expect(state(ws)).toBe(live);
    expect(saved.panels.a.state).toBe('docked');
    expect('poppedOut' in saved.panels.a).toBe(false);
    expect(saved.floating.some((w: { id: string }) => w.id === 'a')).toBe(false);
    act(() => { ws.returnPanel('a'); });
    act(() => { ws.closePanel('a'); });
    act(() => { ws.loadLayout(JSON.stringify(saved)); });
    expect(state(ws).panels.a.state).toBe('docked');
    expect(findLeafIdOf(state(ws).gridRoot, 'a')).toBe(leaf);
  });

  it('a panel alone in its group is saved beside the same panels: the layout it had', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('c', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    act(() => { ws.dockPanelToWorkspaceEdge('b', 'right'); });      // [[a | c] | b], 80/20
    const before = shape(tree(ws));
    popOut(ws, 'b');
    const saved = JSON.parse(ws.saveLayout());
    expect(shape(saved.gridRoot)).toEqual(before);
    expect(saved.panels.b.state).toBe('docked');
  });

  it('it comes back at its own tab position: in the page, and in a saved layout, where the group keeps its selected tab', () => {
    const ws = mount();
    stubOpen(popup());
    const leafOf = (src: WorkspaceState['gridRoot']) => {
      const find = (n: WorkspaceState['gridRoot']): { panels: string[]; activePanelId: string | null } | null =>
        n.type === 'leaf' ? (n.panels.includes('b') ? n : null) : n.children.map(find).find(Boolean) ?? null;
      return find(src)!;
    };
    expect(leafOf(state(ws).gridRoot).panels).toEqual(['a', 'b']);
    popOut(ws, 'a');
    act(() => { ws.focusPanel('b'); });
    const saved = JSON.parse(ws.saveLayout());
    expect(leafOf(saved.gridRoot)).toMatchObject({ panels: ['a', 'b'], activePanelId: 'b' });
    act(() => { ws.returnPanel('a'); });
    expect(leafOf(state(ws).gridRoot)).toMatchObject({ panels: ['a', 'b'], activePanelId: 'a' });
  });

  it('the saved active panel is the one active on the page, not the popped-out one', () => {
    const ws = mount();
    stubOpen(popup());
    popOut(ws, 'a');
    act(() => { ws.focusPanel('b'); });
    expect(state(ws).activePanelId).toBe('b');
    expect(JSON.parse(ws.saveLayout()).activePanelId).toBe('b');
  });

  it('a floating panel is saved floating at its rect', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('f', 'counter', { initialTarget: 'floating' }); });
    const rect = state(ws).floating.find(w => w.id === 'f')!;
    popOut(ws, 'f');
    const saved = JSON.parse(ws.saveLayout());
    expect(saved.panels.f.state).toBe('floating');
    expect(saved.floating.find((w: { id: string }) => w.id === 'f')).toMatchObject({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  });

  it('a type that can\'t float is never saved floating', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('x', 'fixed', { dockTo: { panel: 'a', position: 'right' } }); });
    popOut(ws, 'x');
    act(() => { ws.closePanel('a'); ws.closePanel('b'); });
    act(() => { ws.openPanel('c', 'counter'); });
    const saved = JSON.parse(ws.saveLayout());
    expect(saved.panels.x.state).toBe('docked');
    expect(saved.floating.some((w: { id: string }) => w.id === 'x')).toBe(false);
  });

  it('a flag in a loaded layout is ignored', () => {
    const ws = mount();
    const raw = JSON.parse(ws.saveLayout());
    raw.panels.a.poppedOut = true;
    act(() => { ws.loadLayout(JSON.stringify(raw)); });
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(state(ws).panels.a.state).toBe('docked');
    const fresh = createWorkspace({ popOut: true, panels: { counter: { component: Counter } }, initialState: JSON.stringify(raw) });
    expect(state(fresh).panels.a.poppedOut).toBeUndefined();
  });
});

describe('PO10: idempotent', () => {
  it('a second call opens no second window and brings the first forward', () => {
    const ws = mount();
    const p = popup();
    const open = stubOpen(p);
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    expect(open).toHaveBeenCalledTimes(1);
    expect(p.focus).toHaveBeenCalledTimes(1);
    expect(p.doc.querySelectorAll('.rdd-popout-frame')).toHaveLength(1);
  });

  it('under StrictMode, the element moves in once and back', () => {
    const ws = mount({ strict: true });
    const p = popup();
    stubOpen(p);
    const el = panelEl('a')!;
    act(() => { counter('a')!.click(); });
    popOut(ws, 'a');
    expect(p.doc.querySelectorAll('.rdd-popout-frame')).toHaveLength(1);
    expect(panelEl('a', p.doc)).toBe(el);
    act(() => { ws.returnPanel('a'); });
    expect(panelEl('a')).toBe(el);
    expect(counter('a')!.textContent).toBe('1');
  });
});

describe('PO11: the child document is registered while open', () => {
  it('a document-wide listener reaches it, and stops after the return', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const seen = vi.fn();
    cleanups.push(listenOnDocuments('keydown', e => seen(e.target)));
    popOut(ws, 'a');
    p.doc.body.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    act(() => { ws.returnPanel('a'); });
    p.doc.body.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

/** A child window under the test's control, whose document can turn unreadable (another origin). */
function fakeWindow(doc: Document) {
  const target = new EventTarget() as EventTarget & Record<string, unknown>;
  let current: Document | 'cross-origin' = doc;
  let closed = false;
  Object.assign(target, { focus: vi.fn(), close: vi.fn(() => { closed = true; }) });
  Object.defineProperty(target, 'closed', { get: () => closed });
  Object.defineProperty(target, 'document', {
    configurable: true,
    get: () => { if (current === 'cross-origin') throw new DOMException('Blocked', 'SecurityError'); return current; },
  });
  return { win: target as unknown as Window, goCrossOrigin() { current = 'cross-origin'; }, close: target.close as ReturnType<typeof vi.fn> };
}

describe('PO12: popoutUrl', () => {
  it('opens the app\'s page and moves the element in on its load, not before', () => {
    const ws = mount({ popoutUrl: '/popout.html' });
    const p = popup();
    const open = stubOpen(p);
    // The child shows its initial blank document, already complete, until the page replaces it.
    let url = 'about:blank';
    let readyState: DocumentReadyState = 'complete';
    Object.defineProperty(p.doc, 'URL', { get: () => url, configurable: true });
    Object.defineProperty(p.doc, 'readyState', { get: () => readyState, configurable: true });
    const el = panelEl('a')!;
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    // Resolved against the main page (7.12.1): the same page whichever window opens it.
    expect(open).toHaveBeenCalledWith(new URL('/popout.html', document.baseURI).href, expect.stringMatching(/^rdd-popout-a-/), expect.any(String));
    expect(state(ws).panels.a.poppedOut).toBe(true);
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();     // still the initial blank document
    act(() => { p.win.dispatchEvent(new p.win.Event('load')); });    // a load of the blank one: not yet
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();
    url = 'http://localhost/popout.html';
    readyState = 'loading';
    act(() => { p.win.dispatchEvent(new p.win.Event('load')); });    // the app's page, not loaded yet
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();
    readyState = 'complete';
    act(() => { p.win.dispatchEvent(new p.win.Event('load')); });
    expect(panelEl('a', p.doc)).toBe(el);
  });

  it('a page that never loads: after the time limit the panel comes back and the window closes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ws = mount({ popoutUrl: '/popout.html' });
      const p = popup();
      stubOpen(p);
      Object.defineProperty(p.doc, 'URL', { get: () => 'about:blank', configurable: true });
      expect(popOut(ws, 'a')).toEqual({ ok: true });
      act(() => { vi.advanceTimersByTime(9_000); });
      expect(state(ws).panels.a.poppedOut).toBe(true);
      act(() => { vi.advanceTimersByTime(1_500); });
      expect(state(ws).panels.a.poppedOut).toBeUndefined();
      expect(state(ws).panels.a.state).toBe('docked');
      expect(p.close).toHaveBeenCalled();
      expect(counter('a')).not.toBeNull();
      expect(warn.mock.calls.some(c => String(c[0]).includes('did not load'))).toBe(true);
      // Its panel:returned waits for the layout (7.12.0): at most this long, then nothing is left.
      act(() => { vi.advanceTimersByTime(POPOUT_PLACED_TIMEOUT_MS); });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it('a page of another origin: on its load the panel comes back and the window closes', () => {
    const ws = mount({ popoutUrl: 'https://elsewhere.example/popout.html' });
    const blank = document.implementation.createHTMLDocument('');
    const f = fakeWindow(blank);
    vi.spyOn(window, 'open').mockImplementation(() => f.win);
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    expect(state(ws).panels.a.poppedOut).toBe(true);
    f.goCrossOrigin();
    act(() => { f.win.dispatchEvent(new Event('load')); });
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(state(ws).panels.a.state).toBe('docked');
    expect(f.close).toHaveBeenCalled();
  });

  it('a window that can\'t be read at once is "no-window"', () => {
    const ws = mount({ popoutUrl: '/popout.html' });
    const f = fakeWindow(document.implementation.createHTMLDocument(''));
    f.goCrossOrigin();
    vi.spyOn(window, 'open').mockImplementation(() => f.win);
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'no-window' });
    expect(f.close).toHaveBeenCalled();
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
  });

  it('...also when it turns unreadable while being set up, leaving no flag behind', () => {
    const ws = mount();
    const f = fakeWindow(document.implementation.createHTMLDocument(''));
    let reads = 0;
    const doc = Object.getOwnPropertyDescriptor(f.win, 'document')!.get!;
    Object.defineProperty(f.win, 'document', { get: () => { if (++reads > 1) f.goCrossOrigin(); return doc(); } });
    vi.spyOn(window, 'open').mockImplementation(() => f.win);
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'no-window' });
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(state(ws).panels.a.state).toBe('docked');
  });
});

describe('PO13: the menu item', () => {
  it('is in the tab menu of a canPopOut type, and pops the panel out', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    rightClickTab('a');
    expect(menu()).toEqual(['Float Window', 'Open in new window', 'Minimize Panel', '---', 'Close Tab']);
    act(() => { menuItem('Open in new window')!.click(); });
    expect(state(ws).panels.a.poppedOut).toBe(true);
    expect(panelEl('a', p.doc)).not.toBeNull();
  });

  it('is not there for a type without canPopOut', () => {
    const ws = mount();
    act(() => { ws.openPanel('p', 'plain'); });
    rightClickTab('p');
    expect(menu()).toEqual(['Float Window', 'Minimize Panel', '---', 'Close Tab']);
  });

  it('is in a floating window\'s ⋮ menu, which it brings', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    act(() => {
      ws.openPanel('f', 'counter', { initialTarget: 'floating' });
      ws.openPanel('g', 'plain', { initialTarget: 'floating' });
    });
    expect(container!.querySelector('[data-rdd-window="g"] .rdd-btn-more-actions')).toBeNull();
    const more = container!.querySelector<HTMLElement>('[data-rdd-window="f"] .rdd-btn-more-actions')!;
    expect(more).not.toBeNull();
    act(() => { more.click(); });
    expect(menu()).toEqual(['Open in new window']);
    act(() => { menuItem('Open in new window')!.click(); });
    expect(state(ws).panels.f.poppedOut).toBe(true);
    expect(container!.querySelector('[data-rdd-window="f"]')).toBeNull();
    closeMenu();
  });
});

describe('PO14: a blocked pop-up', () => {
  it('shows a toast from the menu', () => {
    const ws = mount();
    stubOpen(null);
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 't');
    rightClickTab('a');
    act(() => { menuItem('Open in new window')!.click(); });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(String(warning.mock.calls[0][0])).toContain('blocked');
    expect(state(ws).panels.a.state).toBe('docked');
  });

  it('shows nothing from code', () => {
    const ws = mount();
    stubOpen(null);
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 't');
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'blocked' });
    expect(warning).not.toHaveBeenCalled();
  });
});

describe('PO15: unmounting the provider', () => {
  it('brings every panel back and closes its window; nothing is left running', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const seen = vi.fn();
    cleanups.push(listenOnDocuments('keydown', () => seen()));
    popOut(ws, 'a');
    act(() => { root!.unmount(); });
    root = null;
    expect(p.close).toHaveBeenCalled();
    expect(state(ws).panels.a.poppedOut).toBeUndefined();
    expect(state(ws).panels.a.state).toBe('docked');
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    p.doc.body.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('PO16: ignored while out', () => {
  it('maximizePanel and floatPanel leave the hidden entry alone', () => {
    const ws = mount();
    stubOpen(popup());
    popOut(ws, 'a');
    const entry = state(ws).floating.find(w => w.id === 'a');
    act(() => { ws.maximizePanel('a'); });
    act(() => { ws.floatPanel('a', { x: 1, y: 2, width: 300, height: 200 }); });
    expect(state(ws).floating.find(w => w.id === 'a')).toBe(entry);
    expect(state(ws).panels.a.poppedOut).toBe(true);
  });
});

describe('PO17: the hidden entry is not in the way', () => {
  it('a new floating window is not cascaded off it', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('f', 'counter', { initialTarget: 'floating' }); });
    const at = state(ws).floating.find(w => w.id === 'f')!;
    popOut(ws, 'f');
    act(() => { ws.openPanel('g', 'counter', { initialTarget: 'floating' }); });
    const g = state(ws).floating.find(w => w.id === 'g')!;
    expect({ x: g.x, y: g.y }).toEqual({ x: at.x, y: at.y });
  });

  it('the workspace\'s on-screen clamp leaves it alone', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('f', 'counter', { initialTarget: 'floating' }); });
    popOut(ws, 'f');
    act(() => { ws.updateFloatingPosition('f', { x: 5000, y: 5000 }); });
    act(() => { ws.updatePanelTitle('b', 'Re-render'); });
    expect(state(ws).floating.find(w => w.id === 'f')).toMatchObject({ x: 5000, y: 5000 });
  });
});

describe('PO18: window names', () => {
  it('each window opened has a name of its own, also for the same panel id in another workspace', () => {
    const ws = mount();
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup().win);
    popOut(ws, 'a');
    act(() => { ws.returnPanel('a'); });
    popOut(ws, 'a');
    const other = createWorkspace({ popOut: true, panels: { counter: { component: Counter, defaultOptions: { canPopOut: true } } } });
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const root2 = createRoot(host2);
    act(() => { root2.render(<DockableDesktopProvider workspace={other}><RddDesktop /></DockableDesktopProvider>); });
    cleanups.push(() => { act(() => root2.unmount()); host2.remove(); });
    act(() => { other.openPanel('a', 'counter'); });
    act(() => { other.popOutPanel('a'); });
    const names = open.mock.calls.map(c => c[1]);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    names.forEach(n => expect(n).toMatch(/^rdd-popout-a-/));
    act(() => { other.returnPanel('a'); });
  });
});

describe('PO19: the frame without the stylesheet', () => {
  it('fills the window, and the panel\'s elements fill its body while out', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut(ws, 'a');
    expect(p.doc.body.style.margin).toBe('0px');
    expect(p.doc.body.style.height).toBe('100%');
    expect(p.doc.documentElement.style.height).toBe('100%');
    const frame = p.doc.querySelector<HTMLElement>('.rdd-popout-frame')!;
    expect(frame.style).toMatchObject({ position: 'fixed', display: 'flex', flexDirection: 'column' });
    const body = p.doc.querySelector<HTMLElement>('.rdd-popout-frame__body')!;
    expect(body.style.minHeight).toBe('0px');
    const el = panelEl('a', p.doc)!;
    const chain = [el.parentElement!, el, el.querySelector<HTMLElement>('.rdd-panel-content')!];
    chain.forEach(e => expect(e.style.height).toBe('100%'));
    act(() => { ws.returnPanel('a'); });
    chain.forEach(e => expect(e.style.height).toBe(''));
  });
});

// ─── S2.2 ─────────────────────────────────────────────────────────────────────

const L = (...panels: string[]): LayoutNode => ({ type: 'leaf', id: `g-${panels.join('')}`, panels, activePanelId: panels[0] ?? null });
const H = (sizes: number[], ...children: LayoutNode[]): LayoutNode => ({ type: 'branch', orientation: 'horizontal', sizes, children });
const V = (sizes: number[], ...children: LayoutNode[]): LayoutNode => ({ type: 'branch', orientation: 'vertical', sizes, children });
/** Panels per group and sizes (rounded), without group ids. */
const shapeOf = (n: LayoutNode): unknown =>
  n.type === 'leaf' ? n.panels : { o: n.orientation, sizes: n.sizes.map(x => Math.round(x * 1000) / 1000), c: n.children.map(shapeOf) };
/** Records P's place, takes it out, optionally edits the tree, and puts it back. */
const roundTrip = (tree: LayoutNode, edit: (t: LayoutNode) => LayoutNode = t => t) => {
  const places = placesBeside(tree, 'P');
  const out = edit(removePanelFromTree(tree, 'P')!);
  for (const place of places) {
    const back = returnBeside(out, 'P', place, 'g-new');
    if (back) return back;
  }
  return null;
};
const norm = (t: LayoutNode) => shapeOf(t);

describe('PO20: placesBeside / returnBeside', () => {
  it('edge dock: [[p1 p2 | p3] | P] at 80/20 comes back exactly', () => {
    const t = H([0.8, 0.2], H([0.6, 0.4], L('p1', 'p2'), L('p3')), L('P'));
    expect(placesBeside(t, 'P')[0]).toMatchObject({ panels: ['p1', 'p2', 'p3'], position: 'right', size: 0.2, sizes: null });
    expect(norm(roundTrip(t)!)).toEqual(norm(t));
  });

  it('a nested split of the other direction', () => {
    const t = V([0.6, 0.4], H([0.7, 0.3], L('A'), L('P')), L('B'));
    expect(norm(roundTrip(t)!)).toEqual(norm(t));
  });

  it('a split of three: back between the two, at its own size', () => {
    const t = H([0.2, 0.3, 0.5], L('A'), L('P'), L('B'));
    expect(norm(roundTrip(t)!)).toEqual(norm(t));
  });

  it('a first child goes back before its following sibling', () => {
    const t = V([0.25, 0.75], L('P'), H([0.5, 0.5], L('A'), L('B')));
    expect(placesBeside(t, 'P')[0]).toMatchObject({ position: 'top', size: 0.25 });
    expect(norm(roundTrip(t)!)).toEqual(norm(t));
    const three = H([0.3, 0.3, 0.4], L('P'), L('A'), L('B'));
    expect(norm(roundTrip(three)!)).toEqual(norm(three));
  });

  it('a neighbour moved away: beside the panels still there', () => {
    const t = H([0.8, 0.2], H([0.6, 0.4], L('p1', 'p2'), L('p3')), L('P'));
    const back = roundTrip(t, out => removePanelFromTree(out, 'p3')!);
    expect(norm(back!)).toEqual(norm(H([0.8, 0.2], L('p1', 'p2'), L('P'))));
  });

  it('the neighbours went elsewhere in the grid: beside the smallest part that holds them', () => {
    const t = H([0.5, 0.5], L('A'), L('P'));
    // A now shares a split with a new group C: P goes beside that split, not inside it.
    const back = roundTrip(t, out => H([0.5, 0.5], out, L('C')));
    expect(norm(back!)).toEqual(norm(H([0.5, 0.5], H([0.5, 0.5], L('A'), L('P')), L('C'))));
  });

  it('it goes back beside the preceding sibling: with that one there, the following one may go', () => {
    const t = H([0.4, 0.3, 0.3], L('A'), L('P'), L('B'));
    const back = roundTrip(t, out => removePanelFromTree(out, 'B')!);
    expect(norm(back!)).toEqual(norm(H([0.7, 0.3], L('A'), L('P'))));
  });

  it('none of them docked any more: null (the caller falls back)', () => {
    const t = H([0.5, 0.5], L('A'), L('P'));
    expect(roundTrip(t, () => L('Z'))).toBeNull();
  });
});

describe('PO21: the edge case through the workspace', () => {
  it('[[a b | c] | e] at 80/20 comes back exactly after a pop-out', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('c', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    act(() => { ws.openPanel('e', 'counter'); });
    act(() => { ws.dockPanelToWorkspaceEdge('e', 'right'); });
    const before = shapeOf(state(ws).gridRoot);
    expect(before).toMatchObject({ o: 'horizontal', sizes: [0.8, 0.2] });
    popOut(ws, 'e');
    act(() => { ws.returnPanel('e'); });
    expect(shapeOf(state(ws).gridRoot)).toEqual(before);
  });
});

describe('PO22: moved from code while out', () => {
  it('minimizing returns it to its group first, so a restore docks it there', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const leaf = findLeafIdOf(state(ws).gridRoot, 'a');
    popOut(ws, 'a');
    act(() => { ws.minimizePanel('a'); });
    expect(p.close).toHaveBeenCalled();
    expect(state(ws).panels.a).toMatchObject({ state: 'minimized', previousState: 'docked', lastLeafId: leaf });
    act(() => { ws.restorePanel('a'); });
    expect(state(ws).panels.a.state).toBe('docked');
    expect(findLeafIdOf(state(ws).gridRoot, 'a')).toBe(leaf);
  });

  it('a lone panel minimized while out ends as if it had been minimized where it was', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.dockPanelToWorkspaceEdge('b', 'right'); });
    popOut(ws, 'b');
    expect(state(ws).gridRoot.type).toBe('leaf');            // its group went with it
    act(() => { ws.minimizePanel('b'); });
    // Back first (its own split again), then minimized from there, as minimizing it in place does.
    const out = state(ws).panels.b;
    act(() => { ws.restorePanel('b'); });
    const first = { root: root!, container: container! };
    cleanups.push(() => { act(() => first.root.unmount()); first.container.remove(); });
    const control = mount();
    act(() => { control.dockPanelToWorkspaceEdge('b', 'right'); });
    act(() => { control.minimizePanel('b'); });
    expect(out).toMatchObject({ state: 'minimized', previousState: 'docked' });
    expect(out.previousState).toBe(state(control).panels.b.previousState);
    act(() => { control.restorePanel('b'); });
    expect(state(ws).panels.b.state).toBe(state(control).panels.b.state);
  });
});

describe('PO23: a page failing at once', () => {
  it('leaves no timer behind that could close a later window', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const ws = mount();
    const f = fakeWindow(document.implementation.createHTMLDocument(''));
    let reads = 0;
    const doc = Object.getOwnPropertyDescriptor(f.win, 'document')!.get!;
    Object.defineProperty(f.win, 'document', { get: () => { if (++reads > 1) f.goCrossOrigin(); return doc(); } });
    const open = vi.spyOn(window, 'open').mockImplementation(() => f.win);
    expect(popOut(ws, 'a')).toEqual({ ok: false, reason: 'no-window' });
    expect(vi.getTimerCount()).toBe(0);
    // A new window for the same panel is not closed by anything left over.
    const p = popup();
    open.mockImplementation(() => p.win);
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(state(ws).panels.a.poppedOut).toBe(true);
  });
});

describe('PO24: return and pop out again in one batch', () => {
  it('the new window gets the element, laid out', () => {
    const ws = mount();
    const p1 = popup();
    const p2 = popup();
    vi.spyOn(window, 'open').mockImplementationOnce(() => p1.win).mockImplementationOnce(() => p2.win);
    popOut(ws, 'a');
    act(() => { ws.returnPanel('a'); ws.popOutPanel('a'); });
    const el = panelEl('a', p2.doc)!;
    expect(el).not.toBeNull();
    expect(el.style.height).toBe('100%');
    expect(el.parentElement!.style.height).toBe('100%');
  });
});

describe('PO25: no provider', () => {
  it('before any provider mounts, and after it unmounts: no-window, and nothing opens', () => {
    const open = stubOpen(popup());
    const ws = createWorkspace({ popOut: true, panels: { counter: { component: Counter, defaultOptions: { canPopOut: true } } } });
    ws.openPanel('a', 'counter');
    expect(ws.popOutPanel('a')).toEqual({ ok: false, reason: 'no-window' });
    const mounted = mount();
    act(() => { root!.unmount(); });
    root = null;
    expect(mounted.popOutPanel('a')).toEqual({ ok: false, reason: 'no-window' });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('PO26: screen position', () => {
  it('a second monitor left of and above the primary: negative coordinates are kept', () => {
    Object.defineProperty(window, 'screenX', { value: -1920, configurable: true });
    Object.defineProperty(window, 'screenY', { value: -1080, configurable: true });
    cleanups.push(() => {
      delete (window as unknown as { screenX?: number }).screenX;
      delete (window as unknown as { screenY?: number }).screenY;
    });
    const ws = mount();
    const open = stubOpen(popup());
    popOut(ws, 'a');
    const features = String(open.mock.calls[0][2]);
    expect(features).toMatch(/left=-\d+/);
    expect(features).toMatch(/top=-\d+/);
  });
});

// ─── S2.3 ─────────────────────────────────────────────────────────────────────

/** Two layouts with two neighbouring panels that can pop out (c and e). */
const layouts: [string, (ws: Workspace) => void][] = [
  // [[a b | c] | e] at 80/20: c and e in different splits.
  ['an edge dock beside a split', ws => {
    act(() => { ws.openPanel('c', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    act(() => { ws.openPanel('e', 'counter'); });
    act(() => { ws.dockPanelToWorkspaceEdge('e', 'right'); });
  }],
  // [a b | [c | e]]: c and e the two sides of one split.
  ['two sides of one split', ws => {
    act(() => { ws.openPanel('c', 'counter', { dockTo: { panel: 'a', position: 'right', size: 0.4 } }); });
    act(() => { ws.openPanel('e', 'counter', { dockTo: { panel: 'c', position: 'bottom', size: 0.3 } }); });
  }],
];

describe('PO27: neighbours out at once', () => {
  for (const [name, build] of layouts) {
    for (const order of [['c', 'e'], ['e', 'c']]) {
      it(`${name}: c and e out, back ${order.join(' then ')}: the original layout`, () => {
        const ws = mount();
        vi.spyOn(window, 'open').mockImplementation(() => popup().win);
        build(ws);
        const before = shapeOf(state(ws).gridRoot);
        expect(popOut(ws, 'c')).toEqual({ ok: true });
        expect(popOut(ws, 'e')).toEqual({ ok: true });
        act(() => { ws.returnPanel(order[0]); });
        expect(state(ws).panels[order[0]].state).toBe('docked');     // never floats with its layout still docked
        act(() => { ws.returnPanel(order[1]); });
        expect(shapeOf(state(ws).gridRoot)).toEqual(before);
      });
    }
  }
});

describe('PO28: saving with several panels out', () => {
  for (const [name, build] of layouts) {
    for (const popOrder of [['c', 'e'], ['e', 'c']]) {
      it(`${name}, out ${popOrder.join(' then ')}: the saved layout is the one from before`, () => {
        const ws = mount();
        vi.spyOn(window, 'open').mockImplementation(() => popup().win);
        build(ws);
        const before = shapeOf(state(ws).gridRoot);
        popOrder.forEach(id => popOut(ws, id));
        const live = state(ws);
        const saved = JSON.parse(ws.saveLayout());
        expect(state(ws)).toBe(live);
        expect(shapeOf(saved.gridRoot)).toEqual(before);
        expect(saved.panels.c.state).toBe('docked');
        expect(saved.panels.e.state).toBe('docked');
      });
    }
  }
});

describe('PO29: the whole grid', () => {
  it('a panel that was alone in the grid comes back into the empty grid, whatever its group id', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { ws.openPanel('x', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    act(() => { ws.closePanel('a'); ws.closePanel('b'); });
    const root = state(ws).gridRoot;
    expect(root).toMatchObject({ type: 'leaf', panels: ['x'] });
    expect((root as { id: string }).id).not.toBe('group-default');
    popOut(ws, 'x');
    act(() => { ws.returnPanel('x'); });
    expect(state(ws).panels.x.state).toBe('docked');
    expect(state(ws).gridRoot).toMatchObject({ type: 'leaf', panels: ['x'] });
    expect(state(ws).floating.some(w => w.id === 'x')).toBe(false);
  });
});

describe('PO30: a kept-empty neighbour group', () => {
  it('the panel goes back beside the neighbour on its other side, in its old split', () => {
    const ws = mount();
    stubOpen(popup());
    const layout = {
      version: 2,
      gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.3, 0.3, 0.4], children: [
        { type: 'leaf', id: 'kept', panels: [], activePanelId: null, keepOnEmpty: true },
        { type: 'leaf', id: 'ga', panels: ['a'], activePanelId: 'a' },
        { type: 'leaf', id: 'gb', panels: ['b'], activePanelId: 'b' },
      ] },
      floating: [], minimized: [],
      panels: {
        a: { id: 'a', title: 'Alpha', component: 'counter', state: 'docked', serializable: true },
        b: { id: 'b', title: 'Beta', component: 'counter', state: 'docked', serializable: true },
      },
    };
    act(() => { ws.loadLayout(JSON.stringify(layout)); });
    const before = shapeOf(state(ws).gridRoot);
    expect(before).toEqual({ o: 'horizontal', sizes: [0.3, 0.3, 0.4], c: [[], ['a'], ['b']] });
    popOut(ws, 'a');
    act(() => { ws.returnPanel('a'); });
    expect(state(ws).panels.a.state).toBe('docked');
    expect(shapeOf(state(ws).gridRoot)).toEqual(before);
  });

  it('(the tree helpers) an empty preceding group is skipped for the following one', () => {
    const t = H([0.3, 0.3, 0.4], L(), L('P'), L('B'));
    expect(norm(roundTrip(t)!)).toEqual(norm(t));
  });
});

describe('PO31: the share is exact', () => {
  it('under 10% and over 90% come back as they were', () => {
    const small = H([0.95, 0.05], L('A'), L('P'));
    expect(placesBeside(small, 'P')[0].size).toBeCloseTo(0.05);
    expect(norm(roundTrip(small)!)).toEqual(norm(small));
    const big = V([0.04, 0.96], L('A'), L('P'));
    expect(norm(roundTrip(big)!)).toEqual(norm(big));
  });
});

describe('PO32: popoutUrl without a load event', () => {
  it('the poll finds the page ready and moves the panel in', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const ws = mount({ popoutUrl: '/popout.html' });
    const p = popup();
    stubOpen(p);
    let url = 'about:blank';
    Object.defineProperty(p.doc, 'URL', { get: () => url, configurable: true });
    Object.defineProperty(p.doc, 'readyState', { get: () => 'complete', configurable: true });
    const el = panelEl('a')!;
    expect(popOut(ws, 'a')).toEqual({ ok: true });
    act(() => { vi.advanceTimersByTime(600); });
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();
    url = 'http://localhost/popout.html';             // loaded, and no load event reached us
    act(() => { vi.advanceTimersByTime(600); });
    expect(panelEl('a', p.doc)).toBe(el);
    act(() => { vi.advanceTimersByTime(15_000); });   // the time limit no longer applies
    expect(state(ws).panels.a.poppedOut).toBe(true);
  });
});

describe('PO27b: more neighbours out at once', () => {
  const threeWide = {
    version: 2,
    gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.25, 0.25], children: [
      { type: 'leaf', id: 'ga', panels: ['a'], activePanelId: 'a' },
      { type: 'leaf', id: 'gc', panels: ['c'], activePanelId: 'c' },
      { type: 'leaf', id: 'ge', panels: ['e'], activePanelId: 'e' },
    ] },
    floating: [], minimized: [],
    panels: Object.fromEntries(['a', 'c', 'e'].map(id => [id, { id, title: id, component: 'counter', state: 'docked', serializable: true }])),
  };
  for (const order of [['c', 'e'], ['e', 'c']]) {
    it(`a split of three, c and e out, back ${order.join(' then ')}: [a, c, e] at its sizes`, () => {
      const ws = mount();
      vi.spyOn(window, 'open').mockImplementation(() => popup().win);
      act(() => { ws.loadLayout(JSON.stringify(threeWide)); });
      const before = shapeOf(state(ws).gridRoot);
      popOut(ws, 'c');
      popOut(ws, 'e');
      expect(shapeOf(JSON.parse(ws.saveLayout()).gridRoot)).toEqual(before);
      act(() => { ws.returnPanel(order[0]); });
      expect(state(ws).panels[order[0]].state).toBe('docked');
      act(() => { ws.returnPanel(order[1]); });
      expect(shapeOf(state(ws).gridRoot)).toEqual(before);
    });

    const tabsOut: Record<string, string> = { c: 'b', e: 'c' };
    it(`two tabs of one group out, back ${order.map(o => tabsOut[o]).join(' then ')}: the same tab order, saved too`, () => {
      const ws = mount();
      vi.spyOn(window, 'open').mockImplementation(() => popup().win);
      act(() => { ws.openPanel('c', 'counter', { dockTo: { panel: 'a', position: 'center' } }); });
      const tabs = () => { const l = state(ws).gridRoot; return l.type === 'leaf' ? l.panels : null; };
      expect(tabs()).toEqual(['a', 'b', 'c']);
      popOut(ws, 'b');
      popOut(ws, 'c');
      const saved = JSON.parse(ws.saveLayout()).gridRoot;
      expect(saved.panels).toEqual(['a', 'b', 'c']);
      act(() => { ws.returnPanel(tabsOut[order[0]]); });
      act(() => { ws.returnPanel(tabsOut[order[1]]); });
      expect(tabs()).toEqual(['a', 'b', 'c']);
    });
  }
});

// ─── S2.4 ─────────────────────────────────────────────────────────────────────

/** A layout, as loadLayout takes it, of `counter` panels. */
const layoutOf = (gridRoot: LayoutNode) => {
  const ids = (n: LayoutNode): string[] => (n.type === 'leaf' ? n.panels : n.children.flatMap(ids));
  return JSON.stringify({
    version: 2, gridRoot, floating: [], minimized: [],
    panels: Object.fromEntries(ids(gridRoot).map(id => [id, { id, title: id, component: 'counter', state: 'docked', serializable: true }])),
  });
};
/**
 * A workspace store with no provider: the state rules alone (the windows are tested above). From a
 * tree, or built through the public API (which uses `group-default` for the first group).
 */
const storeOf = (from: LayoutNode | ((ws: Workspace) => void)) => {
  const ws = createWorkspace({
    popOut: true,
    panels: { counter: { component: Counter, defaultOptions: { canPopOut: true } } },
    ...(typeof from === 'function' ? {} : { initialState: layoutOf(from) }),
  });
  if (typeof from === 'function') from(ws);
  const c = core(ws);
  return {
    ws,
    out: (id: string) => { expect(c.actions.setPoppedOut(id)).toBe(true); },
    back: (id: string) => { c.actions.clearPoppedOut(id, true); },
    shape: () => shapeOf(c.getSnapshot().gridRoot),
    state: () => c.getSnapshot(),
  };
};
/** A leaf with an id of its own (not group-default). */
const T = (id: string, ...panels: string[]): LayoutNode => ({ type: 'leaf', id, panels, activePanelId: panels[0] });
/** ...that is kept when it empties (`keepOnEmpty`, from a loaded layout). */
const K = (id: string, ...panels: string[]): LayoutNode => ({ ...T(id, ...panels), keepOnEmpty: true } as LayoutNode);

describe('PO33: every docked panel out at once', () => {
  const cases: [string, LayoutNode][] = [
    ['H[a | b] at 0.3/0.7', H([0.3, 0.7], T('ga', 'a'), T('gb', 'b'))],
    ['H[a | b | c]', H([0.2, 0.3, 0.5], T('ga', 'a'), T('gb', 'b'), T('gc', 'c'))],
    ['H[[a b] | c]', H([0.4, 0.6], T('gab', 'a', 'b'), T('gc', 'c'))],
  ];
  for (const [name, tree] of cases) {
    it(`${name}: back in every order, live and saved, is the original`, () => {
      const ids = (n: LayoutNode): string[] => (n.type === 'leaf' ? n.panels : n.children.flatMap(ids));
      const all = ids(tree);
      for (const order of permutations(all)) {
        const st = storeOf(tree);
        const before = st.shape();
        all.forEach(st.out);
        expect(shapeOf(JSON.parse(st.ws.saveLayout()).gridRoot)).toEqual(before);
        order.forEach(st.back);
        expect(st.shape(), order.join(',')).toEqual(before);
        expect(all.every(id => st.state().panels[id].state === 'docked')).toBe(true);
      }
    });
  }
});

describe('PO34: all tabs of one group out', () => {
  it('H[[a b] | c] at 0.4/0.6, a and b out, back in either order: one group again', () => {
    for (const order of [['a', 'b'], ['b', 'a']]) {
      const st = storeOf(H([0.4, 0.6], T('gab', 'a', 'b'), T('gc', 'c')));
      const before = st.shape();
      st.out('a'); st.out('b');
      order.forEach(st.back);
      expect(st.shape()).toEqual(before);
    }
  });

  it('H[V[a | b] | [c d]], c and d out: back as one group beside the split', () => {
    for (const order of [['c', 'd'], ['d', 'c']]) {
      const st = storeOf(H([0.5, 0.5], V([0.5, 0.5], T('ga', 'a'), T('gb', 'b')), T('gcd', 'c', 'd')));
      const before = st.shape();
      st.out('c'); st.out('d');
      order.forEach(st.back);
      expect(st.shape()).toEqual(before);
    }
  });

  it('a 3-tab group filling the grid (not group-default): all three come back docked, in order', () => {
    for (const order of permutations(['a', 'b', 'c'])) {
      const st = storeOf(T('g1', 'a', 'b', 'c'));
      ['a', 'b', 'c'].forEach(st.out);
      order.forEach(st.back);
      expect(st.shape(), order.join(',')).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('PO35: tab order', () => {
  it('group [a, b, c]: out a then b, back b then a: [a, b, c]; a save in between too', () => {
    const st = storeOf(T('g1', 'a', 'b', 'c'));
    st.out('a'); st.out('b');
    expect(JSON.parse(st.ws.saveLayout()).gridRoot.panels).toEqual(['a', 'b', 'c']);
    st.back('b'); st.back('a');
    expect(st.shape()).toEqual(['a', 'b', 'c']);
  });
});

describe('PO35b: tabs reordered while out', () => {
  it('it goes after its nearest earlier group-mate, before a later one only when no earlier one is there', () => {
    const st = storeOf(T('g1', 'a', 'b', 'c'));
    st.out('b');
    act(() => { st.ws.movePanelOrder('c', 'g1', 0); });          // [c, a]
    expect(st.shape()).toEqual(['c', 'a']);
    st.back('b');
    expect(st.shape()).toEqual(['c', 'a', 'b']);
  });
});

describe('PO33b: groups made by returns have ids of their own', () => {
  it('in one millisecond too: a save with every panel out lists each panel once, in groups with distinct ids', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = storeOf(H([0.35, 0.65], T('gab', 'a', 'b'), V([0.5, 0.5], T('gc', 'c'), T('gd', 'd'))));
    ['a', 'c', 'b'].forEach(st.out);
    const saved = JSON.parse(st.ws.saveLayout()).gridRoot as LayoutNode;
    const leaves = (n: LayoutNode): { id: string; panels: string[] }[] => (n.type === 'leaf' ? [n] : n.children.flatMap(leaves));
    const ids = leaves(saved).map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(leaves(saved).flatMap(l => l.panels).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('PO36: old sizes only in the old split', () => {
  it('H[x | y | p]: p out, n docked beside y, p back: the new split does not get the old sizes', () => {
    const st = storeOf(H([0.2, 0.3, 0.5], T('gx', 'x'), T('gy', 'y'), T('gp', 'p')));
    st.out('p');
    act(() => { st.ws.openPanel('n', 'counter', { dockTo: { panel: 'y', position: 'right' } }); });
    st.back('p');
    const root = st.state().gridRoot as Extract<LayoutNode, { type: 'branch' }>;
    const inner = root.children.find(c => c.type === 'branch') as Extract<LayoutNode, { type: 'branch' }>;
    expect(inner).toBeDefined();
    expect(inner.sizes.map(x => Math.round(x * 100) / 100)).not.toEqual([0.2, 0.3, 0.5]);
    expect(inner.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

/** Every ordering of `xs`. */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map(rest => [x, ...rest]));
}
/** Every set of `k` of `xs`. */
function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map(rest => [x, ...rest]));
}

describe('PO37: the matrix', () => {
  const layouts: [string, LayoutNode | ((ws: Workspace) => void)][] = [
    ['H[a | b] through the API (group-default)', ws => {
      ws.openPanel('a', 'counter');
      ws.openPanel('b', 'counter', { dockTo: { panel: 'a', position: 'right' } });
    }],
    ['three panels through the API (group-default)', ws => {
      ws.openPanel('a', 'counter');
      ws.openPanel('b', 'counter', { dockTo: { panel: 'a', position: 'right', size: 0.4 } });
      ws.openPanel('c', 'counter', { dockTo: { panel: 'b', position: 'bottom', size: 0.3 } });
    }],
    ['a tab group inside a split of three', H([0.2, 0.3, 0.5], T('ga', 'a'), T('gby', 'b', 'y'), T('gc', 'c'))],
    ['a kept group in a nested split (D1)', H([0.5, 0.5], H([0.7, 0.3], K('ga', 'a'), T('gb', 'b')), T('gc', 'c'))],
    ['a kept group beside a leaf (D1)', H([0.4, 0.6], K('ga', 'a'), T('gb', 'b'))],
    ['nested mixed split', H([0.6, 0.4], V([0.4, 0.6], T('ga', 'a'), H([0.3, 0.7], T('gb', 'b'), T('gc', 'c'))), T('gd', 'd'))],
    ['split of three', H([0.2, 0.3, 0.5], T('ga', 'a'), T('gb', 'b'), T('gc', 'c'))],
    ['two rows', V([0.45, 0.55], H([0.3, 0.7], T('ga', 'a'), T('gb', 'b')), H([0.6, 0.4], T('gc', 'c'), T('gd', 'd')))],
    ['tabs inside a split', H([0.35, 0.65], T('gab', 'a', 'b'), V([0.5, 0.5], T('gc', 'c'), T('gd', 'd')))],
    ['one tab group filling the grid', T('g1', 'a', 'b', 'c', 'd')],
    ['a tab group beside a leaf', V([0.7, 0.3], T('gabc', 'a', 'b', 'c'), T('gd', 'd'))],
    ['two leaves', H([0.3, 0.7], T('ga', 'a'), T('gb', 'b'))],
    ['a split of four', H([0.1, 0.2, 0.3, 0.4], T('ga', 'a'), T('gb', 'b'), T('gc', 'c'), T('gd', 'd'))],
  ];
  const ids = (n: LayoutNode): string[] => (n.type === 'leaf' ? n.panels : n.children.flatMap(ids));
  let cases = 0;
  for (const [name, tree] of layouts) {
    it(`${name}: every set of 2 and 3, every pop and return order`, () => {
      const all = ids(storeOf(tree).state().gridRoot);
      const failures: string[] = [];
      for (const k of [2, 3]) {
        if (k > all.length) continue;
        for (const set of combinations(all, k)) {
          for (const popOrder of permutations(set)) {
            for (const returnOrder of permutations(set)) {
              cases++;
              const st = storeOf(tree);
              const before = st.shape();
              popOrder.forEach(st.out);
              const live = st.state();
              const saved = shapeOf(JSON.parse(st.ws.saveLayout()).gridRoot);
              if (st.state() !== live) failures.push(`${popOrder} save touched the live state`);
              if (JSON.stringify(saved) !== JSON.stringify(before)) failures.push(`out ${popOrder}: saved ${JSON.stringify(saved)}`);
              returnOrder.forEach(st.back);
              const after = st.shape();
              if (JSON.stringify(after) !== JSON.stringify(before)) failures.push(`out ${popOrder}, back ${returnOrder}: ${JSON.stringify(after)}`);
            }
          }
        }
      }
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }
  afterAll(() => { expect(cases).toBeGreaterThan(1000); });
});

describe('PO38: group-default, reused by the empty grid', () => {
  for (const order of [['b', 'a'], ['a', 'b']]) {
    it(`H[a | b] through the API, a and b out, back ${order.join(' then ')}: H[a | b], saved too`, () => {
      const st = storeOf(ws => {
        ws.openPanel('a', 'counter');
        ws.openPanel('b', 'counter', { dockTo: { panel: 'a', position: 'right' } });
      });
      const before = st.shape();
      expect(before).toMatchObject({ o: 'horizontal', c: [['a'], ['b']] });
      st.out('a'); st.out('b');
      expect(shapeOf(JSON.parse(st.ws.saveLayout()).gridRoot)).toEqual(before);
      order.forEach(st.back);
      expect(st.shape()).toEqual(before);
    });
  }

  it('a group with its old id, refilled with other panels, is not its own group', () => {
    const st = storeOf(ws => { ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter', { dockTo: { panel: 'a', position: 'right' } }); });
    st.out('a');                                    // a's group-default goes; b fills the grid
    act(() => { st.ws.closePanel('b'); });           // the grid is group-default again, empty
    act(() => { st.ws.openPanel('z', 'counter'); });  // ...and refilled with z
    st.back('a');
    // Not a tab beside z: nothing of its old layout is there, so it floats.
    expect(st.state().panels.a.state).toBe('floating');
    expect(st.shape()).toEqual(['z']);
  });
});

describe('PO39: split sizes with a tab-mate still out', () => {
  it('H(0.2, 0.3, 0.5)[a | (b, y) | c]: out c, b, y; back y, c, b: the sizes too', () => {
    const st = storeOf(H([0.2, 0.3, 0.5], T('ga', 'a'), T('gby', 'b', 'y'), T('gc', 'c')));
    const before = st.shape();
    ['c', 'b', 'y'].forEach(st.out);
    ['y', 'c'].forEach(st.back);
    expect(st.shape()).toMatchObject({ sizes: [0.2, 0.3, 0.5] });     // b still out
    st.back('b');
    expect(st.shape()).toEqual(before);
  });
});

describe('PO40: only kept-empty groups left', () => {
  it('H[a | b | c] with b and c kept: a out, b and c closed, a back docked into the first group', () => {
    const tree = H([0.2, 0.3, 0.5], T('ga', 'a'), { ...T('gb', 'b'), keepOnEmpty: true } as LayoutNode, { ...T('gc', 'c'), keepOnEmpty: true } as LayoutNode);
    const st = storeOf(tree);
    st.out('a');
    act(() => { st.ws.closePanel('b'); st.ws.closePanel('c'); });
    expect(shapeOf(st.state().gridRoot)).toMatchObject({ c: [[], []] });
    st.back('a');
    expect(st.state().panels.a.state).toBe('docked');
    expect(shapeOf(st.state().gridRoot)).toMatchObject({ c: [['a'], []] });
  });
});

describe('PO40b: its own kept group', () => {
  it('a panel alone in a kept group goes back into that group, which waited empty', () => {
    const st = storeOf(H([0.3, 0.7], { ...T('ga', 'a'), keepOnEmpty: true } as LayoutNode, T('gb', 'b')));
    const before = st.shape();
    st.out('a');
    expect(st.shape()).toEqual({ o: 'horizontal', sizes: [0.3, 0.7], c: [[], ['b']] });
    st.back('a');
    expect(st.shape()).toEqual(before);
  });
});

describe('PO41: interleaved pop-outs and returns', () => {
  const run = (tree: LayoutNode | ((ws: Workspace) => void), steps: string) => {
    const st = storeOf(tree);
    const before = st.shape();
    for (const step of steps.split(' ')) (step[0] === '+' ? st.out : st.back)(step.slice(1));
    return { before, after: st.shape(), st };
  };
  it('H(0.2, 0.3, 0.5)[a | b | c]: +a +b +c -b +b -c -b -a', () => {
    const { before, after } = run(H([0.2, 0.3, 0.5], T('ga', 'a'), T('gb', 'b'), T('gc', 'c')), '+a +b +c -b +b -c -b -a');
    expect(after).toEqual(before);
  });
  it('the same through the API, with group-default; and a save in the middle', () => {
    const build = (ws: Workspace) => {
      ws.openPanel('a', 'counter');
      ws.openPanel('b', 'counter', { dockTo: { panel: 'a', position: 'right', size: 0.4 } });
      ws.openPanel('c', 'counter', { dockTo: { panel: 'b', position: 'right', size: 0.3 } });
    };
    const { before, after } = run(build, '+a +b +c -b +b -c -b -a');
    expect(after).toEqual(before);
    const mid = run(build, '+a +b +c -b +b');
    expect(shapeOf(JSON.parse(mid.st.ws.saveLayout()).gridRoot)).toEqual(mid.before);
  });
  it('H[a | b] through the API: +a -a +b +a -b -a', () => {
    const { before, after } = run(ws => {
      ws.openPanel('a', 'counter');
      ws.openPanel('b', 'counter', { dockTo: { panel: 'a', position: 'right' } });
    }, '+a -a +b +a -b -a');
    expect(after).toEqual(before);
  });
});

describe('PO42: a kept group stands in for its panel while it is out (D1)', () => {
  const tree = H([0.5, 0.5], H([0.7, 0.3], K('ga', 'a'), T('gb', 'b')), T('gc', 'c'));
  for (const popOrder of [['a', 'b'], ['b', 'a']]) {
    for (const backOrder of [['a', 'b'], ['b', 'a']]) {
      it(`H[H[ga(kept):a | b] | c]: out ${popOrder}, back ${backOrder}: the original, saved too`, () => {
        const st = storeOf(tree);
        const before = st.shape();
        popOrder.forEach(st.out);
        expect(shapeOf(JSON.parse(st.ws.saveLayout()).gridRoot)).toEqual(before);
        backOrder.forEach(st.back);
        expect(st.shape()).toEqual(before);
      });
    }
  }

  it('the quieter form, H[ga(kept):a | b]: back b first, b does not take over a\'s kept group', () => {
    const st = storeOf(H([0.4, 0.6], K('ga', 'a'), T('gb', 'b')));
    const before = st.shape();
    st.out('a'); st.out('b');
    st.back('b');
    const leaves = (n: LayoutNode): LayoutNode[] => (n.type === 'leaf' ? [n] : n.children.flatMap(leaves));
    const ga = leaves(st.state().gridRoot).find(l => l.type === 'leaf' && l.id === 'ga') as Extract<LayoutNode, { type: 'leaf' }>;
    expect(ga.panels).toEqual([]);                          // still waiting for a
    st.back('a');
    expect(st.shape()).toEqual(before);
  });
});

describe('PO43: a minimized panel popped out while its group is empty (D2)', () => {
  for (const order of [['a', 'b'], ['b', 'a']]) {
    it(`group-default [a, b]: b minimized, a out, b out; back ${order.join(' then ')}: tabs [a, b]; saved too`, () => {
      const st = storeOf(ws => { ws.openPanel('a', 'counter'); ws.openPanel('b', 'counter'); });
      expect(st.shape()).toEqual(['a', 'b']);
      act(() => { st.ws.minimizePanel('b'); });
      st.out('a');
      st.out('b');
      expect(st.state().minimized).toEqual([]);
      expect(st.state().panels.b).toMatchObject({ state: 'floating', poppedOut: true, previousState: 'docked' });
      const saved = JSON.parse(st.ws.saveLayout());
      expect(shapeOf(saved.gridRoot)).toEqual(['a', 'b']);
      expect(saved.panels.a.state).toBe('docked');
      order.forEach(st.back);
      expect(st.shape()).toEqual(['a', 'b']);
      expect(st.state().panels.a.state).toBe('docked');
      expect(st.state().panels.b.state).toBe('docked');
    });
  }
});
