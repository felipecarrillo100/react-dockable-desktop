/**
 * A pop-out from a click inside a pop-out window (7.12.1). A click there activates that window,
 * not the main page, and a browser blocks a window opened from a window the user didn't click: so
 * the window in a click opens the new one. The pop-outs are iframes' windows, handed back by
 * stubbed `open`s; each window's `navigator.userActivation` is stubbed on its own.
 *
 * PF1: active only in a pop-out: opened through that pop-out's open, { ok: true }
 * PF2: active only in the main page: opened through the main window's open, as before
 * PF3: active nowhere: 'no-gesture', nothing opened
 * PF4: no API in the main page: the main window, as before
 * PF5: a pop-out whose navigator can't be read is skipped
 * PF6: a widget whose owner is in a pop-out: left/top from that window's screen origin
 * PF7: a relative popoutUrl opened from a pop-out is resolved against the main page
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, RddPanelOverlay, useFloatingWidgets,
  type Workspace, type PopOutResult, type FloatingWidgetsApi,
} from '../../index';

type AnyWindow = Window & typeof globalThis;
const frames: HTMLIFrameElement[] = [];
const cleanups: (() => void)[] = [];

interface Popup { win: AnyWindow; doc: Document }
/** A child window: an iframe's, with `closed`, `close()` and `focus()` under the test's control. */
function popup(): Popup {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as AnyWindow;
  let closed = false;
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true });
  Object.defineProperty(win, 'close', { value: () => { closed = true; }, configurable: true });
  Object.defineProperty(win, 'focus', { value: () => {}, configurable: true });
  return { win, doc: frame.contentDocument! };
}

/** The window's `navigator.userActivation.isActive`; undefined removes the API. */
function activate(win: Window, isActive: boolean | undefined): void {
  const nav = win.navigator as Navigator & { userActivation?: unknown };
  if (isActive === undefined) delete nav.userActivation;
  else Object.defineProperty(nav, 'userActivation', { value: { isActive }, configurable: true });
  cleanups.push(() => { delete nav.userActivation; });
}
/** `win.open` hands back `next`. */
const stubOpen = (win: Window, next: Popup) => vi.spyOn(win, 'open').mockImplementation(() => next.win);

let api: FloatingWidgetsApi | null = null;
const Grab: React.FC = () => { api = useFloatingWidgets(); return null; };
const Owner: React.FC = () => <RddPanelOverlay><Grab /></RddPanelOverlay>;
const Plain: React.FC = () => <div className="pf-plain">plain</div>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(opts: { popoutUrl?: string } = {}): Workspace {
  const ws = createWorkspace({
    popOut: true,
    panels: {
      plain: { component: Plain, defaultOptions: { canPopOut: true } },
      map: { component: Owner, defaultOptions: { canPopOut: true } },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws} popoutUrl={opts.popoutUrl}><RddDesktop /></DockableDesktopProvider>); });
  act(() => {
    ws.openPanel('a', 'plain', { title: 'Alpha' });
    ws.openPanel('b', 'plain', { title: 'Beta', initialTarget: 'floating' });
  });
  return ws;
}
const popOut = (ws: Workspace, id: string) => { let r: PopOutResult | undefined; act(() => { r = ws.popOutPanel(id); }); return r!; };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 80)); });

/** Pops `a` out from a click in the main page, into a first window; returns it. */
async function firstOut(ws: Workspace): Promise<Popup> {
  const p1 = popup();
  const mainOpen = stubOpen(window, p1);
  activate(window, true);
  expect(popOut(ws, 'a')).toEqual({ ok: true });
  await settle();
  mainOpen.mockClear();
  return p1;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null; api = null;
  cleanups.splice(0).reverse().forEach(f => f());
  frames.splice(0).forEach(f => f.remove());
  vi.restoreAllMocks();
  document.getElementById('preserved-dom-container')?.remove();
});

describe('PF1-PF5: which window opens it', () => {
  it('PF1: active only in a pop-out: that pop-out opens the new window', async () => {
    const ws = mount();
    const p1 = await firstOut(ws);
    expect(p1.win.navigator).not.toBe(navigator);   // each window has its own activation
    const p2 = popup();
    const mainOpen = vi.mocked(window.open);
    const fromPopup = stubOpen(p1.win, p2);
    activate(window, false);
    activate(p1.win, true);
    expect(popOut(ws, 'b')).toEqual({ ok: true });
    expect(fromPopup).toHaveBeenCalledTimes(1);
    expect(fromPopup).toHaveBeenCalledWith('', expect.stringMatching(/^rdd-popout-b-/), expect.stringMatching(/^popup=yes,/));
    expect(mainOpen).not.toHaveBeenCalled();
  });

  it('PF2: active only in the main page: the main window opens it', async () => {
    const ws = mount();
    const p1 = await firstOut(ws);
    const mainOpen = vi.mocked(window.open).mockImplementation(() => popup().win);
    const fromPopup = vi.spyOn(p1.win, 'open');
    activate(p1.win, false);
    expect(popOut(ws, 'b')).toEqual({ ok: true });
    expect(mainOpen).toHaveBeenCalledTimes(1);
    expect(fromPopup).not.toHaveBeenCalled();
  });

  it("PF3: active nowhere: 'no-gesture', and nothing is opened", async () => {
    const ws = mount();
    const p1 = await firstOut(ws);
    const mainOpen = vi.mocked(window.open);
    const fromPopup = vi.spyOn(p1.win, 'open');
    activate(window, false);
    activate(p1.win, false);
    expect(popOut(ws, 'b')).toEqual({ ok: false, reason: 'no-gesture' });
    expect(mainOpen).not.toHaveBeenCalled();
    expect(fromPopup).not.toHaveBeenCalled();
  });

  it('PF4: no API in the main page: the main window, as before', async () => {
    const ws = mount();
    const p1 = await firstOut(ws);
    const mainOpen = vi.mocked(window.open).mockImplementation(() => popup().win);
    const fromPopup = vi.spyOn(p1.win, 'open');
    activate(window, undefined);
    activate(p1.win, true);
    expect(popOut(ws, 'b')).toEqual({ ok: true });
    expect(mainOpen).toHaveBeenCalledTimes(1);
    expect(fromPopup).not.toHaveBeenCalled();
  });

  it("PF5: a pop-out whose navigator can't be read is skipped", async () => {
    const ws = mount();
    const p1 = await firstOut(ws);
    Object.defineProperty(p1.win, 'navigator', { get: () => { throw new Error('gone'); }, configurable: true });
    activate(window, false);
    expect(popOut(ws, 'b')).toEqual({ ok: false, reason: 'no-gesture' });
  });
});

describe("PF6: a widget's window, its owner in a pop-out", () => {
  it("left/top use the owner's window's screen origin, not the main page's", async () => {
    const ws = mount();
    act(() => { ws.openPanel('m', 'map', { title: 'Map' }); });
    act(() => { api!.open('table', { title: 'Table', content: <div>t</div>, anchor: 'bottom-left', width: 240, height: 160, canPopOut: true }); });
    // The owner pops out, from the page.
    const p1 = popup();
    stubOpen(window, p1);
    activate(window, true);
    expect(popOut(ws, 'm')).toEqual({ ok: true });
    await settle();
    expect(p1.doc.querySelector('[data-rdd-widget="table"]')).not.toBeNull();

    // Screens: the main page at 3000,2000; the owner's window at 100,200 with 30px of chrome.
    const place = (w: Window, x: number, y: number, chrome: number) => {
      for (const [k, v] of [['screenX', x], ['screenY', y], ['outerHeight', 800 + chrome], ['innerHeight', 800]] as const) {
        Object.defineProperty(w, k, { value: v, configurable: true });
        cleanups.push(() => { delete (w as unknown as Record<string, unknown>)[k]; });
      }
    };
    place(window, 3000, 2000, 80);
    place(p1.win, 100, 200, 30);
    const rect = function (this: HTMLElement) {
      const isFrame = this.getAttribute('data-rdd-widget') === 'table';
      const w = isFrame ? 400 : 0;
      const h = isFrame ? 300 : 0;
      return { left: 50, top: 60, right: 50 + w, bottom: 60 + h, width: w, height: h, x: 50, y: 60, toJSON() {} } as DOMRect;
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(rect);
    vi.spyOn(p1.win.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(rect);

    // A click in the owner's window pops the widget out.
    const p2 = popup();
    const fromPopup = stubOpen(p1.win, p2);
    activate(window, false);
    activate(p1.win, true);
    let r: PopOutResult | undefined;
    act(() => { r = api!.popOut('table'); });
    expect(r).toEqual({ ok: true });
    expect(fromPopup).toHaveBeenCalledTimes(1);
    expect(String(fromPopup.mock.calls[0][2])).toBe('popup=yes,left=150,top=290,width=400,height=300');
  });
});

describe('PF7: popoutUrl', () => {
  it('a relative popoutUrl opened from a pop-out is resolved against the main page', async () => {
    const ws = mount({ popoutUrl: '/popout.html' });
    const p1 = await firstOut(ws);
    const fromPopup = stubOpen(p1.win, popup());
    activate(window, false);
    activate(p1.win, true);
    popOut(ws, 'b');
    expect(fromPopup).toHaveBeenCalledWith(new URL('/popout.html', document.baseURI).href, expect.any(String), expect.any(String));
    expect(String(fromPopup.mock.calls[0][0])).toMatch(/^https?:\/\/[^/]+\/popout\.html$/);
  });
});
