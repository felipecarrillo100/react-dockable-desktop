/**
 * What the library renders into a pop-out besides the panel (7.12.0-next.1): the app's
 * popoutWrapper around the frame, a menu and toasts shown there; toasts in the window the user is
 * in; and the panel:popping-out / panel:returning events. The pop-out is an `<iframe>`'s window,
 * handed back by a stubbed `window.open`.
 *
 * PC1: the wrapper is around the frame and a menu shown in the pop-out, with that window; not
 *      around a menu in the page; none without a wrapper
 * PC2: a toast raised while the pop-out has focus shows there (inside the wrapper); otherwise in
 *      the page; the same id updates in place, in its window; the window closing removes it
 * PC3: panel:popping-out before panel:popped-out, with the element still in the page;
 *      panel:returning before panel:returned, with it still in the window; none for a refused
 *      pop-out, none with popOut off; with popoutUrl, popping-out waits for the page too
 * PC4: a toolbar flyout opened in a popped-out panel is in the panel's own tree: the wrapper's
 *      context (the pop-out's document) reaches its items' icons, with nothing added for it
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, RddToasts, toast, type Workspace, type PopoutWrapperProps } from '../../index';
import { ToolbarProvider } from '../ToolbarContext';
import { Toolbar, type ToolbarItem } from '../Toolbar';

type AnyWindow = Window & typeof globalThis;
const frames: HTMLIFrameElement[] = [];

function popup(): { win: AnyWindow; doc: Document; focused(on: boolean): void } {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as AnyWindow;
  const doc = frame.contentDocument!;
  let closed = false;
  let focused = false;
  // jsdom tears an iframe's document down on close(); a real pop-out's document stays readable.
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true });
  Object.defineProperty(win, 'close', { value: () => { closed = true; }, configurable: true });
  Object.defineProperty(win, 'focus', { value: () => {}, configurable: true });
  // Whether the user is in this window, as the browser reports it.
  Object.defineProperty(doc, 'hasFocus', { value: () => focused, configurable: true });
  return { win, doc, focused(on) { focused = on; } };
}

/** The document the wrapper got, as a CSS-in-JS cache provider would pass its cache down. */
const WrapperDoc = React.createContext<Document | null>(null);

/** A wrapper as an app's CSS-in-JS one, marking what it is around and the document it got. */
const Wrapper: React.FC<PopoutWrapperProps> = ({ document: doc, window: win, children }) => (
  <WrapperDoc.Provider value={doc}>
    <div className="pc-wrapper" data-doc-ok={doc === win.document ? '' : undefined}>{children}</div>
  </WrapperDoc.Provider>
);

/** An icon that says whether the wrapper's document is the one it is rendered in. */
const CtxIcon: React.FC = () => {
  const doc = React.useContext(WrapperDoc);
  return <svg className="pc-icon" ref={el => { if (el) el.dataset.same = String(el.ownerDocument === doc); }} />;
};

const flyoutItems: ToolbarItem[] = [{ type: 'group', id: 'g', label: 'Group', defaultIcon: <svg />, items: [{ id: 'x', label: 'X', icon: <CtxIcon /> }] }];
const Content: React.FC = () => (
  <div className="pc-content">content<ToolbarProvider><Toolbar items={flyoutItems} /></ToolbarProvider></div>
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(opts: { popOut?: boolean; wrapper?: boolean; popoutUrl?: string } = {}): Workspace {
  const ws = createWorkspace({
    popOut: opts.popOut ?? true,
    panels: { c: { component: Content, defaultOptions: { canPopOut: true } }, plain: { component: Content } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <DockableDesktopProvider workspace={ws} popoutUrl={opts.popoutUrl} popoutWrapper={opts.wrapper === false ? undefined : Wrapper}>
        <RddDesktop />
        <RddToasts animation="none" defaultDuration={0} />
      </DockableDesktopProvider>,
    );
  });
  act(() => { ws.openPanel('a', 'c'); ws.openPanel('b', 'plain', { initialTarget: 'floating' }); });
  return ws;
}

const popOutA = (ws: Workspace) => {
  const p = popup();
  vi.spyOn(window, 'open').mockImplementation(() => p.win);
  act(() => { ws.popOutPanel('a'); });
  return p;
};
const showMenuIn = (ws: Workspace, doc: Document) => act(() => {
  ws.showContextMenu({ event: { target: doc.body, clientX: 5, clientY: 5 } as unknown as MouseEvent, items: [{ label: 'One', action: () => {} }] });
});
const toastsIn = (doc: Document) => Array.from(doc.querySelectorAll('.rdd-toast')).map(t => t.textContent);

afterEach(() => {
  act(() => { toast.dismiss(); });
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  frames.splice(0).forEach(f => f.remove());
  vi.restoreAllMocks();
  document.getElementById('preserved-dom-container')?.remove();
  document.querySelectorAll('.rdd-context-menu').forEach(m => m.remove());
});

describe('PC1: the app\'s wrapper around what the library renders in a pop-out', () => {
  it('around the whole frame, with the pop-out\'s window and document', () => {
    const ws = mount();
    const p = popOutA(ws);
    const frame = p.doc.querySelector('.rdd-popout-frame')!;
    expect(frame).not.toBeNull();
    const wrapper = frame.parentElement!;
    expect(wrapper.classList.contains('pc-wrapper')).toBe(true);
    expect(wrapper.hasAttribute('data-doc-ok')).toBe(true);
    // The frame's icon and title are inside it; the panel's content is still where it was (its own wrapper).
    expect(wrapper.querySelector('.rdd-popout-frame__icon')).not.toBeNull();
    expect(p.doc.querySelector('.pc-content')).not.toBeNull();
  });

  it('around a menu shown in the pop-out; not around a menu in the page', () => {
    const ws = mount();
    const p = popOutA(ws);
    showMenuIn(ws, p.doc);
    const menu = p.doc.querySelector('.rdd-context-menu')!;
    expect(menu).not.toBeNull();
    expect(menu.parentElement!.classList.contains('pc-wrapper')).toBe(true);
    expect(menu.parentElement!.hasAttribute('data-doc-ok')).toBe(true);
    act(() => { p.doc.body.dispatchEvent(new (p.win as AnyWindow).Event('pointerdown', { bubbles: true })); });

    showMenuIn(ws, document);
    const inPage = document.querySelector('.rdd-context-menu')!;
    expect(inPage).not.toBeNull();
    expect(inPage.closest('.pc-wrapper')).toBeNull();
  });

  it('without a wrapper, the frame and a menu render as before', () => {
    const ws = mount({ wrapper: false });
    const p = popOutA(ws);
    expect(p.doc.querySelector('.rdd-popout-frame')!.parentElement).toBe(p.doc.body);
    showMenuIn(ws, p.doc);
    expect(p.doc.querySelector('.rdd-context-menu')!.parentElement).toBe(p.doc.body);
  });
});

describe('PC2: toasts in the window the user is in', () => {
  it('in the page with no pop-out', () => {
    mount();
    act(() => { toast('hello'); });
    expect(toastsIn(document)).toEqual(['hello']);
  });

  it('in the pop-out while it has focus, inside the wrapper; in the page when it hasn\'t', () => {
    const ws = mount();
    const p = popOutA(ws);
    p.focused(true);
    act(() => { toast('there'); });
    expect(toastsIn(p.doc)).toEqual(['there']);
    expect(toastsIn(document)).toEqual([]);
    expect(p.doc.querySelector('.rdd-toast-container')!.parentElement!.classList.contains('pc-wrapper')).toBe(true);
    p.focused(false);
    act(() => { toast('here'); });
    expect(toastsIn(document)).toEqual(['here']);
    expect(toastsIn(p.doc)).toEqual(['there']);
    // The page's container is not wrapped.
    expect(document.querySelector('.rdd-toast-container')!.closest('.pc-wrapper')).toBeNull();
  });

  it('the same id updates in place, in the window it was shown in', () => {
    const ws = mount();
    const p = popOutA(ws);
    p.focused(true);
    act(() => { toast('first', { id: 'x' }); });
    p.focused(false);
    act(() => { toast('second', { id: 'x' }); });
    expect(toastsIn(p.doc)).toEqual(['second']);
    expect(toastsIn(document)).toEqual([]);
  });

  it('its window closing removes it (onClose runs); the page\'s toasts stay', () => {
    const ws = mount();
    const p = popOutA(ws);
    const onClose = vi.fn();
    p.focused(true);
    act(() => { toast('there', { onClose }); });
    p.focused(false);
    act(() => { toast('here'); });
    act(() => { ws.returnPanel('a'); });
    expect(toastsIn(p.doc)).toEqual([]);
    expect(toastsIn(document)).toEqual(['here']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PC3: panel:popping-out and panel:returning', () => {
  /**
   * Records the events in order, with the document the panel's element is in when each arrives
   * (the very node, kept from the start: a tab not shown is out of the DOM, but still the page's).
   */
  function record(ws: Workspace) {
    const log: string[] = [];
    const el = document.querySelector('[data-rdd-panel="a"]');
    const where = () => (!el ? 'nowhere' : el.ownerDocument === document ? 'page' : 'window');
    for (const type of ['panel:popping-out', 'panel:popped-out', 'panel:returning', 'panel:returned'] as const) {
      ws.subscribe(type, (e: { id: string }) => { log.push(`${type} ${e.id} ${where()}`); });
    }
    return log;
  }

  it('popping-out then popped-out; returning then returned; each before the element moves', () => {
    const ws = mount();
    const log = record(ws);
    const p = popOutA(ws);
    expect(log[0]).toBe('panel:popping-out a page');
    expect(log.map(l => l.split(' ')[0])).toEqual(['panel:popping-out', 'panel:popped-out']);
    expect(p.doc.querySelector('[data-rdd-panel="a"]')).not.toBeNull();   // ...and then it moved
    log.length = 0;
    act(() => { ws.returnPanel('a'); });
    expect(log).toEqual(['panel:returning a window', 'panel:returned a page']);
  });

  it('returning on every way back: the frame\'s button, the window closing', () => {
    for (const how of ['button', 'pagehide'] as const) {
      const ws = mount();
      const log = record(ws);
      const p = popOutA(ws);
      log.length = 0;
      act(() => {
        if (how === 'button') p.doc.querySelector<HTMLButtonElement>('.rdd-popout-frame__return')!.click();
        else p.win.dispatchEvent(new p.win.Event('pagehide'));
      });
      expect(log, how).toEqual(['panel:returning a window', 'panel:returned a page']);
      act(() => root?.unmount());
      container?.remove();
      root = null;
    }
  });

  it('none for a refused pop-out, a panel closed while out, or with popOut off', () => {
    const ws = mount();
    const log = record(ws);
    expect(ws.popOutPanel('b')).toEqual({ ok: false, reason: 'not-allowed' });   // no canPopOut
    expect(ws.popOutPanel('nope').ok).toBe(false);
    vi.spyOn(window, 'open').mockImplementation(() => null);                   // a blocked pop-up
    expect(ws.popOutPanel('a')).toEqual({ ok: false, reason: 'blocked' });
    expect(log).toEqual([]);
    vi.restoreAllMocks();
    popOutA(ws);
    log.length = 0;
    act(() => { ws.closePanel('a'); });
    expect(log).toEqual([]);
    act(() => root?.unmount());
    container?.remove();

    const off = mount({ popOut: false });
    const offLog = record(off);
    expect(off.popOutPanel('a')).toEqual({ ok: false, reason: 'disabled' });
    expect(offLog).toEqual([]);
  });

  it('with popoutUrl, popping-out waits for the page, then comes just before popped-out', () => {
    const ws = mount({ popoutUrl: '/popout.html' });
    const log = record(ws);
    const p = popup();
    let url = 'about:blank';
    Object.defineProperty(p.doc, 'URL', { get: () => url, configurable: true });
    Object.defineProperty(p.doc, 'readyState', { get: () => 'complete', configurable: true });
    vi.spyOn(window, 'open').mockImplementation(() => p.win);
    act(() => { ws.popOutPanel('a'); });
    expect(log).toEqual([]);
    url = 'http://localhost/popout.html';
    act(() => { p.win.dispatchEvent(new p.win.Event('load')); });
    expect(log[0]).toBe('panel:popping-out a page');
    expect(log.map(l => l.split(' ')[0])).toEqual(['panel:popping-out', 'panel:popped-out']);
  });
});

describe('PC4: a toolbar flyout in a popped-out panel', () => {
  it('gets the wrapper\'s context with the pop-out\'s document', () => {
    const ws = mount();
    const p = popOutA(ws);
    const btn = p.doc.querySelector<HTMLButtonElement>('button.rdd-toolbar-btn-group')!;
    act(() => { btn.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true })); });
    const icon = p.doc.querySelector<SVGElement>('.rdd-toolbar-group-flyout .pc-icon')!;
    expect(icon).not.toBeNull();
    expect(icon.dataset.same).toBe('true');
  });
});
