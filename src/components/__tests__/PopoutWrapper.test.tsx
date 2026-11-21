/**
 * The window-change hooks (7.12.0, S4): `<DockableDesktopProvider popoutWrapper>`,
 * `usePanelWindow()`, `usePanel().isPoppedOut`, and the `panel:popped-out` / `panel:returned`
 * events. The pop-out is an `<iframe>`'s window, handed back by a stubbed `window.open`.
 *
 * PW1: with a wrapper, nothing remounts through pop-out and return: the content's state is kept,
 *      and the wrapper itself stays mounted
 * PW2: the wrapper gets the pop-out's document before the element moves in (render, commit, then
 *      move), so the content's effects in the child see it already
 * PW3: back on the main window and document after the return
 * PW4: no wrapper with popOut off; with popOut on, around every panel, canPopOut or not
 * PW5: usePanelWindow() and usePanel().isPoppedOut through the cycle; the main window outside a
 *      panel and with popOut off
 * PW6: panel:popped-out and panel:returned, once each with their payload, on every way back; no
 *      panel:returned for a panel closed while out
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, usePanel, usePanelWindow, type Workspace, type PopoutWrapperProps } from '../../index';

type AnyWindow = Window & typeof globalThis;
const frames: HTMLIFrameElement[] = [];

function popup(): { win: AnyWindow; doc: Document; closeByUser(silent?: boolean): void } {
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
    win, doc: frame.contentDocument!,
    closeByUser(silent = false) { closed = true; if (!silent) win.dispatchEvent(new win.Event('pagehide')); },
  };
}

const log: string[] = [];
const mounts = vi.fn();
const wrapperMounts = vi.fn();
let wrapperDoc: Document | null = null;
const seen: { doc: Document; poppedOut: boolean; wrapperDocThen: Document | null }[] = [];

/** A panel with state, recording its mounts and what usePanelWindow / usePanel say in its effects. */
const Probe: React.FC<{ panelId: string }> = ({ panelId }) => {
  const [n, setN] = useState(0);
  const { document: doc } = usePanelWindow();
  const { isPoppedOut } = usePanel();
  useEffect(() => { mounts(panelId); }, [panelId]);
  useEffect(() => { seen.push({ doc, poppedOut: isPoppedOut, wrapperDocThen: wrapperDoc }); }, [doc, isPoppedOut]);
  return <button className="pw-count" data-id={panelId} onClick={() => setN(x => x + 1)}>{n}</button>;
};

/**
 * A wrapper as an app's CSS-in-JS one: records its mounts, the document it gets, and where the panel
 * element is at commit. Only the one around a panel's content records (next.1 also renders it around
 * a pop-out's frame, menus and toasts).
 */
const Wrapper: React.FC<PopoutWrapperProps> = ({ document: doc, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  wrapperDoc = doc;
  useEffect(() => { if (ref.current?.closest('.rdd-panel-dom')) wrapperMounts(); }, []);
  useLayoutEffect(() => {
    // At commit, before the slot's passive effect moves it: the panel element is still where it was.
    const el = ref.current?.closest('.rdd-panel-dom');
    if (!el) return;
    log.push(`commit ${doc === document ? 'main' : 'child'} element-in ${el?.ownerDocument === document ? 'main' : 'child'}`);
  }, [doc]);
  return <div className="pw-wrapper" ref={ref}>{children}</div>;
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(opts: { popOut?: boolean; wrapper?: boolean } = {}): Workspace {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: {
      probe: { component: Probe, defaultOptions: { canPopOut: true } },
      plain: { component: Probe },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <DockableDesktopProvider workspace={ws} popoutWrapper={opts.wrapper === false ? undefined : Wrapper}>
        <RddDesktop />
      </DockableDesktopProvider>,
    );
  });
  act(() => { ws.openPanel('a', 'probe'); });
  return ws;
}

const counter = (doc: Document = document) => doc.querySelector<HTMLButtonElement>('.pw-count[data-id="a"]');

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  frames.splice(0).forEach(f => f.remove());
  log.length = 0; seen.length = 0; wrapperDoc = null;
  mounts.mockClear(); wrapperMounts.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.getElementById('preserved-dom-container')?.remove();
});

describe('PW1: nothing remounts', () => {
  it('through pop-out and return, the content keeps its state and the wrapper stays mounted', () => {
    const ws = mount();
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    act(() => { counter()!.click(); counter()!.click(); });
    mounts.mockClear(); wrapperMounts.mockClear();
    act(() => { ws.popOutPanel('a'); });
    expect(counter(p.doc)!.textContent).toBe('2');
    expect(p.doc.querySelector('.pw-wrapper')).not.toBeNull();
    act(() => { ws.returnPanel('a'); });
    expect(counter()!.textContent).toBe('2');
    expect(mounts).not.toHaveBeenCalled();
    expect(wrapperMounts).not.toHaveBeenCalled();
  });
});

describe('PW2: the document first, then the move', () => {
  it('the wrapper commits with the pop-out\'s document while the element is still in the page; the content\'s effects then see it', () => {
    const ws = mount();
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    log.length = 0;
    seen.length = 0;
    act(() => { ws.popOutPanel('a'); });
    expect(log).toEqual(['commit child element-in main']);
    expect(counter(p.doc)).not.toBeNull();                       // ...and then it moved in
    const inChild = seen.find(s => s.doc === p.doc)!;
    expect(inChild).toBeDefined();
    expect(inChild.wrapperDocThen).toBe(p.doc);
  });
});

describe('PW3: back on the main document', () => {
  it('after the return, the wrapper and usePanelWindow give the main ones again', () => {
    const ws = mount();
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    act(() => { ws.popOutPanel('a'); });
    expect(wrapperDoc).toBe(p.doc);
    act(() => { ws.returnPanel('a'); });
    expect(wrapperDoc).toBe(document);
    expect(seen.at(-1)!.doc).toBe(document);
    expect(container!.querySelector('.pw-wrapper .pw-count')).not.toBeNull();
  });
});

describe('PW4: where the wrapper is rendered', () => {
  it('none with popOut off', () => {
    mount({ popOut: false });
    expect(document.querySelector('.pw-wrapper')).toBeNull();
    expect(counter()).not.toBeNull();
  });

  it('around every panel with popOut on, canPopOut or not', () => {
    const ws = mount();
    act(() => { ws.openPanel('b', 'plain', { initialTarget: 'floating' }); });
    expect(document.querySelectorAll('.pw-wrapper .pw-count').length).toBe(2);
  });
});

describe('PW5: usePanelWindow and isPoppedOut', () => {
  it('through pop-out and return', () => {
    const ws = mount();
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    expect(seen.at(-1)).toMatchObject({ doc: document, poppedOut: false });
    act(() => { ws.popOutPanel('a'); });
    expect(seen.at(-1)).toMatchObject({ doc: p.doc, poppedOut: true });
    act(() => { ws.returnPanel('a'); });
    expect(seen.at(-1)).toMatchObject({ doc: document, poppedOut: false });
  });

  it('the main window outside a panel, and with popOut off', () => {
    let outside: ReturnType<typeof usePanelWindow> | null = null;
    const Outside = () => { outside = usePanelWindow(); return null; };
    const host = document.createElement('div');
    const r = createRoot(host);
    act(() => { r.render(<Outside />); });
    expect(outside).toEqual({ window, document });
    act(() => r.unmount());
    mount({ popOut: false });
    expect(seen.at(-1)).toMatchObject({ doc: document, poppedOut: false });
  });
});

describe('PW6: the events', () => {
  const paths: [string, (ws: Workspace, p: ReturnType<typeof popup>) => void][] = [
    ['returnPanel', ws => { ws.returnPanel('a'); }],
    ['the frame\'s button', (_ws, p) => { p.doc.querySelector<HTMLButtonElement>('.rdd-popout-frame__return')!.click(); }],
    ['the window\'s pagehide', (_ws, p) => { p.closeByUser(); }],
    ['the main page\'s pagehide', () => { window.dispatchEvent(new Event('pagehide')); }],
    ['minimizing from code', ws => { ws.minimizePanel('a'); }],
    ['docking from code', ws => { ws.dockPanel('a'); }],
    ['a layout load that keeps it', ws => { ws.loadLayout(JSON.stringify({ gridRoot: { type: 'leaf', id: 'g', panels: ['a'], activePanelId: 'a' }, floating: [], minimized: [], panels: { a: { id: 'a', title: 'a', component: 'probe', state: 'docked', serializable: true } } })); }],
  ];
  for (const [name, back] of paths) {
    it(`popped-out once with its window; returned once, by ${name}`, () => {
      const ws = mount();
      const p = popup();
      vi.spyOn(window, 'open').mockImplementation(() => p.win);
      const out = vi.fn();
      const returned = vi.fn();
      ws.subscribe('panel:popped-out', out);
      ws.subscribe('panel:returned', returned);
      act(() => { ws.popOutPanel('a'); });
      expect(out).toHaveBeenCalledTimes(1);
      expect(out).toHaveBeenCalledWith({ id: 'a', window: p.win });
      expect(returned).not.toHaveBeenCalled();
      act(() => { back(ws, p); });
      expect(returned).toHaveBeenCalledTimes(1);
      expect(returned).toHaveBeenCalledWith({ id: 'a' });
      expect(out).toHaveBeenCalledTimes(1);
    });
  }

  it('returned once by the closed poll, and by unmounting the provider', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    for (const how of ['poll', 'unmount'] as const) {
      const ws = mount();
      const p = popup();
      vi.spyOn(window, 'open').mockImplementation(() => p.win);
      const returned = vi.fn();
      ws.subscribe('panel:returned', returned);
      act(() => { ws.popOutPanel('a'); });
      if (how === 'poll') { p.closeByUser(true); act(() => { vi.advanceTimersByTime(600); }); }
      else { act(() => root!.unmount()); root = null; }
      expect(returned, how).toHaveBeenCalledTimes(1);
      act(() => root?.unmount());
      container?.remove();
      root = null;
    }
  });

  it('no panel:returned for a panel closed while out (panel:closed is sent)', () => {
    const ws = mount();
    const p = popup();
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    const returned = vi.fn();
    const closed = vi.fn();
    ws.subscribe('panel:returned', returned);
    ws.subscribe('panel:closed', closed);
    act(() => { ws.popOutPanel('a'); });
    act(() => { ws.closePanel('a'); });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(returned).not.toHaveBeenCalled();
  });

  it('with popoutUrl, popped-out is sent once the page is ready, not before', () => {
    const ws = createWorkspace({ popOut: true, panels: { probe: { component: Probe, defaultOptions: { canPopOut: true } } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<DockableDesktopProvider workspace={ws} popoutUrl="/popout.html" popoutWrapper={Wrapper}><RddDesktop /></DockableDesktopProvider>); });
    act(() => { ws.openPanel('a', 'probe'); });
    const p = popup();
    let url = 'about:blank';
    Object.defineProperty(p.doc, 'URL', { get: () => url, configurable: true });
    Object.defineProperty(p.doc, 'readyState', { get: () => 'complete', configurable: true });
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    const out = vi.fn();
    ws.subscribe('panel:popped-out', out);
    act(() => { ws.popOutPanel('a'); });
    expect(out).not.toHaveBeenCalled();
    expect(wrapperDoc).toBe(document);
    url = 'http://localhost/popout.html';
    act(() => { p.win.dispatchEvent(new p.win.Event('load')); });
    expect(out).toHaveBeenCalledTimes(1);
    expect(wrapperDoc).toBe(p.doc);
  });
});
