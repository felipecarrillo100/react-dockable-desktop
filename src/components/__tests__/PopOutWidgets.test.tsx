/**
 * Managed widgets in their own browser window (7.12.0, S5): `useFloatingWidgets().popOut()`,
 * `ManagedWidget.canPopOut`, `useWidget().isPoppedOut`, `WidgetMenuContext.canPopOut / isPoppedOut /
 * popOut()`, and the way back. The pop-out is an `<iframe>`'s window, handed back by a stubbed
 * `window.open`.
 *
 * WG1:  refusals, in order: disabled (with a development warning), not-open, not-allowed (no
 *       canPopOut; an owner type with keepAlive: false), no-gesture, blocked, no-window; each
 *       leaves the widget where it was, with no callback
 * WG2:  from the panel: out of the panel and into the window in one step; the same element, its
 *       state kept, nothing remounts; location 'floating', isPoppedOut, its panel id unchanged
 * WG3:  from docked, tabbed, floating and minimised: its panel pops out
 * WG4:  one onWillMove / onMoved pair around the pop-out, and around every return
 * WG5:  closing the window, its pagehide, or the frame's "Back into the panel" button: back into its
 *       panel, where it was (D17)
 * WG6:  move() from the window to the panel, docked, tabbed and floating: one move, one pair
 * WG7:  workspace.popOutPanel(hostedId) goes through the widget's rules; returnPanel(hostedId) is
 *       the window closing
 * WG8:  placement() while out reopens it floating at its rect before the window
 * WG9:  the owner closing closes the window and the widget; the owner minimised leaves it out
 * WG10: the menu context: canPopOut, isPoppedOut, popOut(); the frame's title icon opens the menu
 * WG11: panel:popped-out / panel:returned for its panel
 * WG12: a widget's content gets its window from usePanelWindow(), and the app's popoutWrapper
 * WG13: canPopOut on a workspace without popOut warns in development
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, RddPanelOverlay, useFloatingWidgets, useWidget,
  usePanelWindow, type Workspace, type FloatingWidgetsApi, type ManagedWidget, type WidgetMenuContext,
  type WidgetHandle, type PopoutWrapperProps,
} from '../../index';
import type { WorkspaceState } from '../../types';

type AnyWindow = Window & typeof globalThis;
const frames: HTMLIFrameElement[] = [];

interface Popup { win: AnyWindow; doc: Document; closeByUser(silent?: boolean): void; closed(): boolean }
function popup(): Popup {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as AnyWindow;
  let closed = false;
  // jsdom tears an iframe's document down on close(); a real pop-out's document stays readable.
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true });
  Object.defineProperty(win, 'close', { value: () => { closed = true; }, configurable: true });
  Object.defineProperty(win, 'focus', { value: () => {}, configurable: true });
  return {
    win, doc: frame.contentDocument!, closed: () => closed,
    closeByUser(silent = false) { closed = true; if (!silent) win.dispatchEvent(new win.Event('pagehide')); },
  };
}
const stubOpen = (p: Popup | null) => vi.spyOn(window, 'open').mockImplementation(() => (p ? p.win : null));

let api: FloatingWidgetsApi | null = null;
let widget: WidgetHandle | null = null;
let menuSeen: WidgetMenuContext | null = null;
const mounts = vi.fn();
const calls: string[] = [];
let docSeen: Document | null = null;
let wrapperDoc: Document | null = null;

/** Widget content with state; records mounts, its handle, its callbacks and its window. */
const Table: React.FC = () => {
  const [n, setN] = useState(0);
  const w = useWidget();
  widget = w;
  docSeen = usePanelWindow().document;
  useEffect(() => { mounts(); }, []);
  useEffect(() => {
    if (!w) return;
    const offWill = w.onWillMove(() => calls.push('will'));
    const offMoved = w.onMoved(() => calls.push('moved'));
    return () => { offWill(); offMoved(); };
  }, [w?.onWillMove, w?.onMoved]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <button className="wg-count" onClick={() => setN(x => x + 1)}>{n}</button>;
};
const Grab: React.FC = () => { api = useFloatingWidgets(); return null; };
const Owner: React.FC = () => <RddPanelOverlay><Grab /></RddPanelOverlay>;
const Wrapper: React.FC<PopoutWrapperProps> = ({ document: doc, children }) => {
  wrapperDoc = doc;
  return <>{children}</>;
};

const table: ManagedWidget = {
  title: 'Table', content: <Table />, anchor: 'bottom-left', width: 240, height: 160,
  canPopOut: true, canDock: true, canFloat: true,
  titleMenu: w => { menuSeen = w; return [{ label: 'Pop it', action: () => { w.popOut(); } }]; },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(opts: { popOut?: boolean; config?: Partial<ManagedWidget>; lazy?: boolean } = {}): Workspace {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: { map: { component: Owner }, lazy: { component: Owner, defaultOptions: { keepAlive: false } } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws} popoutWrapper={Wrapper}><RddDesktop /></DockableDesktopProvider>); });
  act(() => { ws.openPanel('map', opts.lazy ? 'lazy' : 'map', { title: 'Map' }); });
  act(() => { api!.open('table', { ...table, ...opts.config }); });
  calls.length = 0;
  mounts.mockClear();
  return ws;
}
const state = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): WorkspaceState } })._core.getSnapshot();
const content = (doc: Document = document) => doc.querySelector<HTMLElement>('.rdd-panel-float__content');
const count = (doc: Document = document) => doc.querySelector('.wg-count')?.textContent;
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 80)); });
const popOut = () => { let r: ReturnType<FloatingWidgetsApi['popOut']> | undefined; act(() => { r = api!.popOut('table'); }); return r!; };
const HOSTED = 'map/table';

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null; api = null; widget = null; menuSeen = null; docSeen = null; wrapperDoc = null;
  frames.splice(0).forEach(f => f.remove());
  calls.length = 0;
  mounts.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (navigator as unknown as { userActivation?: unknown }).userActivation;
  document.getElementById('preserved-dom-container')?.remove();
  document.querySelectorAll('.rdd-context-menu').forEach(m => m.remove());
});

describe('WG1: refusals', () => {
  const stays = (ws: Workspace) => {
    expect(api!.location('table')).toBe('panel');
    expect(state(ws).panels[HOSTED]).toBeUndefined();
    expect(calls).toEqual([]);
  };

  it('disabled: the workspace has no popOut, with one development warning', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ws = mount({ popOut: false });
      const open = stubOpen(popup());
      expect(popOut()).toEqual({ ok: false, reason: 'disabled' });
      expect(open).not.toHaveBeenCalled();
      expect(warn.mock.calls.some(c => String(c[0]).includes('was refused'))).toBe(true);
      stays(ws);
    } finally { process.env.NODE_ENV = env; }
  });

  it('disabled comes first, before the widget\'s own rules', () => {
    mount({ popOut: false, config: { canPopOut: false } });
    expect(popOut()).toEqual({ ok: false, reason: 'disabled' });
  });

  it('not-open', () => {
    mount();
    expect(api!.popOut('nope')).toEqual({ ok: false, reason: 'not-open' });
  });

  it('not-allowed: no canPopOut, and an owner whose type unmounts while hidden', () => {
    const ws = mount({ config: { canPopOut: false } });
    const open = stubOpen(popup());
    expect(popOut()).toEqual({ ok: false, reason: 'not-allowed' });
    stays(ws);
    act(() => root!.unmount()); root = null; container?.remove();
    const lazy = mount({ lazy: true });
    expect(popOut()).toEqual({ ok: false, reason: 'not-allowed' });
    expect(open).not.toHaveBeenCalled();
    stays(lazy);
  });

  it('no-gesture', () => {
    const ws = mount();
    const open = stubOpen(popup());
    Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true });
    expect(popOut()).toEqual({ ok: false, reason: 'no-gesture' });
    expect(open).not.toHaveBeenCalled();
    stays(ws);
  });

  it('blocked, and no-window: nothing changed', () => {
    const ws = mount();
    stubOpen(null);
    expect(popOut()).toEqual({ ok: false, reason: 'blocked' });
    stays(ws);
    const p = popup();
    p.closeByUser(true);
    vi.restoreAllMocks();
    stubOpen(p);
    expect(popOut()).toEqual({ ok: false, reason: 'no-window' });
    stays(ws);
  });
});

describe('WG2: from the panel', () => {
  it('leaves the panel into the window in one step: the same element, its state, its panel id', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const el = content()!;
    act(() => { (el.querySelector('.wg-count') as HTMLElement).click(); });
    mounts.mockClear();
    expect(popOut()).toEqual({ ok: true });
    expect(content(p.doc)).toBe(el);
    expect(count(p.doc)).toBe('1');
    expect(mounts).not.toHaveBeenCalled();
    expect(api!.location('table')).toBe('floating');
    expect(widget).toMatchObject({ isPoppedOut: true, panelId: HOSTED, location: 'floating' });
    expect(state(ws).panels[HOSTED]).toMatchObject({ state: 'floating', poppedOut: true, owner: { panelId: 'map', widgetId: 'table' } });
    expect(container!.querySelector('[data-rdd-widget="table"]')).toBeNull();   // no frame in the panel
  });
});

describe('WG3: from each place out of the panel', () => {
  const places: [string, () => void][] = [
    ['docked', () => { api!.move('table', { to: 'docked', position: 'bottom' }); }],
    ['tabbed', () => { api!.move('table', { to: 'tabbed' }); }],
    ['floating', () => { api!.move('table', { to: 'floating', rect: { x: 10, y: 10, width: 200, height: 100 } }); }],
    ['minimized', () => { api!.move('table', { to: 'floating' }); }],
  ];
  for (const [where, go] of places) {
    it(`${where}: its panel pops out, the same element`, () => {
      const ws = mount();
      const p = popup();
      stubOpen(p);
      act(go);
      if (where === 'minimized') act(() => { ws.minimizePanel(HOSTED); });
      expect(api!.location('table')).toBe(where);
      const el = content()!;
      expect(popOut()).toEqual({ ok: true });
      expect(content(p.doc)).toBe(el);
      expect(api!.location('table')).toBe('floating');
      expect(widget!.isPoppedOut).toBe(true);
      expect(widget!.panelId).toBe(HOSTED);
    });
  }
});

describe('WG4: callbacks', () => {
  it('one pair around the pop-out from the panel, and one around the window closing', async () => {
    mount();
    const p = popup();
    stubOpen(p);
    popOut();
    await settle();
    expect(calls).toEqual(['will', 'moved']);
    calls.length = 0;
    act(() => { p.closeByUser(); });
    await settle();
    expect(calls).toEqual(['will', 'moved']);
  });

  it('one pair around a pop-out from floating (same location, another container)', async () => {
    mount();
    stubOpen(popup());
    act(() => { api!.move('table', { to: 'floating' }); });
    await settle();
    calls.length = 0;
    popOut();
    await settle();
    expect(calls).toEqual(['will', 'moved']);
  });

  it('none for a refusal', async () => {
    mount();
    stubOpen(null);
    popOut();
    await settle();
    expect(calls).toEqual([]);
  });
});

describe('WG5: closing the window sends it back into its panel (D17)', () => {
  const ways: [string, (ws: Workspace, p: Popup) => void][] = [
    ['the window closing', (_ws, p) => { p.closeByUser(); }],
    ['the frame\'s "Back into the panel"', (_ws, p) => { p.doc.querySelector<HTMLButtonElement>('.rdd-popout-frame__return')!.click(); }],
    ['returnPanel on its panel id', ws => { ws.returnPanel(HOSTED); }],
  ];
  for (const [name, close] of ways) {
    it(`${name}: back in the panel, where it was, the same element and state`, () => {
      const ws = mount();
      const p = popup();
      stubOpen(p);
      const el = content()!;
      act(() => { (el.querySelector('.wg-count') as HTMLElement).click(); });
      const before = (container!.querySelector('[data-rdd-widget="table"]') as HTMLElement).getAttribute('style');
      popOut();
      if (name.includes('Back')) expect(p.doc.querySelector('.rdd-popout-frame__return')!.getAttribute('aria-label')).toBe('Back into the panel');
      act(() => { close(ws, p); });
      expect(api!.location('table')).toBe('panel');
      expect(state(ws).panels[HOSTED]).toBeUndefined();
      expect(content()).toBe(el);
      expect(count()).toBe('1');
      expect(p.closed()).toBe(true);
      const frame = container!.querySelector('[data-rdd-widget="table"]') as HTMLElement;
      expect(frame).not.toBeNull();
      expect(frame.getAttribute('style')).toBe(before);              // its old place in the panel
    });
  }
});

describe('WG6: move() from the window', () => {
  const targets: [string, Parameters<FloatingWidgetsApi['move']>[1], string][] = [
    ['the panel', { to: 'panel' }, 'panel'],
    ['docked', { to: 'docked', position: 'right' }, 'docked'],
    ['tabbed', { to: 'tabbed' }, 'tabbed'],
    ['floating', { to: 'floating', rect: { x: 20, y: 20, width: 220, height: 140 } }, 'floating'],
  ];
  for (const [name, to, where] of targets) {
    it(`to ${name}: the window closes and it moves, as one move with one pair`, async () => {
      const ws = mount();
      const p = popup();
      stubOpen(p);
      const el = content()!;
      popOut();
      await settle();
      calls.length = 0;
      let r: unknown;
      act(() => { r = api!.move('table', to); });
      await settle();
      expect(r).toEqual({ ok: true });
      expect(api!.location('table')).toBe(where);
      expect(widget!.isPoppedOut).toBe(false);
      expect(p.closed()).toBe(true);
      expect(content()).toBe(el);
      expect(calls).toEqual(['will', 'moved']);
      if (where !== 'panel') expect(state(ws).panels[HOSTED].poppedOut).toBeUndefined();
    });
  }
});

describe('WG7: workspace calls on its panel id', () => {
  it('popOutPanel(hostedId) goes through the widget\'s rules; returnPanel(hostedId) is the window closing', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    let r: unknown;
    act(() => { r = ws.popOutPanel(HOSTED); });
    expect(r).toEqual({ ok: true });
    expect(widget!.isPoppedOut).toBe(true);
    act(() => { ws.returnPanel(HOSTED); });
    expect(api!.location('table')).toBe('panel');
    // Its rules: without canPopOut, the workspace call is refused too.
    act(() => { api!.open('table', { ...table, canPopOut: false }); });
    act(() => { api!.move('table', { to: 'floating' }); });
    act(() => { r = ws.popOutPanel(HOSTED); });
    expect(r).toEqual({ ok: false, reason: 'not-allowed' });
  });
});

describe('WG8: placement() while out', () => {
  it('reopens it floating, at its rect before the window', () => {
    const ws = mount();
    stubOpen(popup());
    act(() => { api!.move('table', { to: 'floating', rect: { x: 30, y: 40, width: 250, height: 150 } }); });
    popOut();
    const saved = api!.placement('table')!;
    expect(saved).toMatchObject({ v: 1, at: 'floating', rect: { x: 30, y: 40, width: 250, height: 150 } });
    act(() => { ws.returnPanel(HOSTED); });
    act(() => { api!.close('table'); });
    act(() => { api!.open('table', { ...table, placement: saved }); });
    expect(api!.location('table')).toBe('floating');
    expect(state(ws).floating.find(w => w.id === HOSTED)).toMatchObject({ x: 30, y: 40, width: 250, height: 150 });
    expect(state(ws).panels[HOSTED].poppedOut).toBeUndefined();
  });
});

describe('WG9: ownership', () => {
  it('the owner closing closes the window and the widget', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut();
    act(() => { ws.closePanel('map'); });
    expect(p.closed()).toBe(true);
    expect(state(ws).panels[HOSTED]).toBeUndefined();
    expect(p.doc.querySelector('.rdd-popout-frame')).toBeNull();
  });

  it('the owner minimised: the widget stays in its window', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut();
    act(() => { ws.minimizePanel('map'); });
    expect(p.closed()).toBe(false);
    expect(widget!.isPoppedOut).toBe(true);
    expect(content(p.doc)).not.toBeNull();
  });
});

describe('WG9b: moved from code while out', () => {
  it('minimising its panel from code minimises it (it is not sent into its panel)', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    popOut();
    act(() => { ws.minimizePanel(HOSTED); });
    expect(p.closed()).toBe(true);
    expect(api!.location('table')).toBe('minimized');
  });
});

describe('WG2b: the window\'s place', () => {
  it('opens over the widget\'s frame in the panel, at its size', () => {
    mount();
    const open = stubOpen(popup());
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isFrame = this.getAttribute('data-rdd-widget') === 'table';
      const w = isFrame ? 400 : 0;
      const h = isFrame ? 300 : 0;
      return { left: 50, top: 60, right: 50 + w, bottom: 60 + h, width: w, height: h, x: 50, y: 60, toJSON() {} } as DOMRect;
    });
    popOut();
    expect(String(open.mock.calls[0][2])).toMatch(/width=400,height=300/);
  });
});

describe('WG10: the menu', () => {
  it('the context says canPopOut and isPoppedOut, and popOut() works; the frame\'s icon opens the menu', () => {
    mount();
    const p = popup();
    stubOpen(p);
    act(() => { api!.move('table', { to: 'floating' }); });
    act(() => { (container!.querySelector('[data-rdd-window="map/table"] .rdd-btn-more-actions') as HTMLElement).click(); });
    expect(menuSeen).toMatchObject({ canPopOut: true, isPoppedOut: false, location: 'floating' });
    const item = [...document.querySelectorAll<HTMLElement>('.rdd-context-menu__item')].find(b => b.textContent?.includes('Pop it'))!;
    act(() => { item.click(); });
    expect(widget!.isPoppedOut).toBe(true);
    menuSeen = null;
    const icon = p.doc.querySelector<HTMLButtonElement>('.rdd-popout-frame__icon--menu')!;
    expect(icon).not.toBeNull();
    act(() => { icon.click(); });
    expect(menuSeen).toMatchObject({ isPoppedOut: true, location: 'floating' });
    expect(p.doc.querySelector('.rdd-context-menu')).not.toBeNull();
  });

  it('canPopOut is false without the opt-in, or with popOut off', () => {
    mount({ config: { canPopOut: false } });
    act(() => { api!.move('table', { to: 'floating' }); });
    act(() => { (container!.querySelector('[data-rdd-window="map/table"] .rdd-btn-more-actions') as HTMLElement).click(); });
    expect(menuSeen).toMatchObject({ canPopOut: false });
    act(() => root!.unmount()); root = null; container?.remove();
    menuSeen = null;
    mount({ popOut: false });
    act(() => { api!.move('table', { to: 'floating' }); });
    act(() => { (container!.querySelector('[data-rdd-window="map/table"] .rdd-btn-more-actions') as HTMLElement).click(); });
    expect(menuSeen).toMatchObject({ canPopOut: false });
  });
});

describe('WG11: events for its panel', () => {
  it('panel:popped-out and panel:returned, once each', () => {
    const ws = mount();
    const p = popup();
    stubOpen(p);
    const out = vi.fn();
    const back = vi.fn();
    ws.subscribe('panel:popped-out', out);
    ws.subscribe('panel:returned', back);
    popOut();
    expect(out).toHaveBeenCalledTimes(1);
    expect(out).toHaveBeenCalledWith({ id: HOSTED, window: p.win });
    act(() => { p.closeByUser(); });
    expect(back).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledWith({ id: HOSTED });
  });
});

describe('WG12: the widget\'s window', () => {
  it('usePanelWindow() and the app\'s popoutWrapper give the widget\'s window, and the page\'s again', () => {
    mount();
    const p = popup();
    stubOpen(p);
    expect(docSeen).toBe(document);
    popOut();
    expect(docSeen).toBe(p.doc);
    expect(wrapperDoc).toBe(p.doc);
    act(() => { p.closeByUser(); });
    expect(docSeen).toBe(document);
    expect(wrapperDoc).toBe(document);
  });
});

describe('WG13: canPopOut without popOut', () => {
  it('warns in development, once per widget', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount({ popOut: false });
      act(() => { api!.open('table', table); });
      const mine = warn.mock.calls.filter(c => String(c[0]).includes('Widget "table" sets canPopOut'));
      expect(mine).toHaveLength(1);
    } finally { process.env.NODE_ENV = env; }
  });
});
