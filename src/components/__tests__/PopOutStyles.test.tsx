/**
 * Styles in a pop-out window (7.12.0, S3): the main page's stylesheets, `<html>` / `<body>` and the
 * workspace's scope, copied into the child document and kept in step. The child is an `<iframe>`'s
 * document (its own window and DOM constructors, as a real pop-out's).
 *
 * PS1:  the head's stylesheets are cloned in order, after the child's own head content; a link's
 *       href is absolute
 * PS2:  sheets added and removed later follow, in order
 * PS3:  a <style>'s text, and a link's href / media / disabled, follow
 * PS4:  adoptedStyleSheets are copied as text, after the rest, and re-read on a change
 * PS5:  <html> and <body>: attributes (not style), custom properties and color-scheme follow; the
 *       child's own classes and inline layout stay
 * PS6:  the frame repeats the workspace's colour scheme, skin and rdd-no-animations, in step
 * PS7:  ready once every copied link has loaded or failed, or after the limit; at once with none
 * PS8:  stopping disconnects everything: later changes are not copied
 * PS9:  through the workspace: the frame is hidden until ready, is also .rdd-workspace, gets the
 *       page's sheets, and stops following on return; nothing observes the page with popOut off
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { startPopOutStyles, POPOUT_STYLES_TIMEOUT_MS } from '../../core/popOutStyles';
import { createWorkspace, DockableDesktopProvider, RddDesktop, type Workspace } from '../../index';

type AnyWindow = Window & typeof globalThis;
const frames: HTMLIFrameElement[] = [];
const added: Node[] = [];
const stops: (() => void)[] = [];

function child(): { win: AnyWindow; doc: Document } {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as AnyWindow;
  // jsdom tears an iframe's document down on close(); a real pop-out's document stays readable.
  let closed = false;
  Object.defineProperty(win, 'closed', { get: () => closed, configurable: true });
  Object.defineProperty(win, 'close', { value: () => { closed = true; }, configurable: true });
  return { win, doc: frame.contentDocument! };
}
/** Adds `node` to the main <head>, removed after the test. */
function head<T extends Node>(node: T): T { document.head.appendChild(node); added.push(node); return node; }
const style = (text: string, id?: string) => { const s = document.createElement('style'); s.textContent = text; if (id) s.id = id; return s; };
const link = (href: string) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('href', href); return l; };
/** Lets MutationObserver callbacks run. */
const flush = () => new Promise(r => setTimeout(r, 0));
/** The child head's copied sheets: tag and id or href. */
const copied = (doc: Document) => Array.from(doc.head.querySelectorAll('style, link'))
  .map(el => `${el.localName}:${el.id || el.getAttribute('href') || (el.hasAttribute('data-rdd-adopted') ? 'adopted' : el.textContent)}`);

function start(doc: Document, extra: Partial<Parameters<typeof startPopOutStyles>[0]> = {}) {
  const frame = doc.createElement('div');
  doc.body.appendChild(frame);
  const onReady = vi.fn();
  const stop = startPopOutStyles({ child: doc, frame, scope: null, onReady, ...extra });
  stops.push(stop);
  return { frame, onReady, stop };
}

afterEach(() => {
  stops.splice(0).forEach(s => s());
  added.splice(0).forEach(n => (n as ChildNode).remove());
  frames.splice(0).forEach(f => f.remove());
  for (const el of [document.documentElement, document.body]) {
    for (const name of ['data-test', 'data-bs-theme']) el.removeAttribute(name);
    el.classList.remove('dark', 'mui-theme');
    el.style.removeProperty('--app-accent');
    el.style.removeProperty('color-scheme');
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PS1: the head is copied in order', () => {
  it('clones every stylesheet, in order, after the child\'s own head content; links get an absolute href', () => {
    head(style('a{}', 's1'));
    head(link('/lib.css'));
    head(style('b{}', 's2'));
    head(document.createElement('meta'));
    const { doc } = child();
    const own = doc.createElement('title');
    doc.head.appendChild(own);
    start(doc);
    const mine = copied(doc).filter(c => /s1|s2|lib\.css/.test(c));
    expect(mine).toEqual(['style:s1', `link:${new URL('/lib.css', location.href).href}`, 'style:s2']);
    expect(doc.head.firstElementChild).toBe(own);
    expect(doc.getElementById('s1')!.textContent).toBe('a{}');
  });
});

describe('PS2: sheets added and removed later', () => {
  it('follow, in order', async () => {
    const s1 = head(style('a{}', 's1'));
    const { doc } = child();
    start(doc);
    const s2 = head(style('b{}', 's2'));
    document.head.insertBefore(style('z{}', 's0'), s1);
    added.push(document.getElementById('s0')!);
    await flush();
    expect(copied(doc).filter(c => /s\d/.test(c))).toEqual(['style:s0', 'style:s1', 'style:s2']);
    s1.remove();
    s2.remove();
    await flush();
    expect(copied(doc).filter(c => /s\d/.test(c))).toEqual(['style:s0']);
  });
});

describe('PS3: changes to a sheet', () => {
  it('a <style>\'s text, and a link\'s href, media and disabled', async () => {
    const s = head(style('a{}', 's1'));
    const l = head(link('/one.css'));
    const { doc } = child();
    start(doc);
    s.textContent = 'a{color:red}';
    l.setAttribute('href', '/two.css');
    l.setAttribute('media', 'print');
    l.setAttribute('disabled', '');
    await flush();
    expect(doc.getElementById('s1')!.textContent).toBe('a{color:red}');
    const clone = Array.from(doc.head.querySelectorAll('link')).find(x => x.getAttribute('href')!.endsWith('/two.css'))!;
    expect(clone).toBeDefined();
    expect(clone.getAttribute('media')).toBe('print');
    expect(clone.hasAttribute('disabled')).toBe(true);
    l.removeAttribute('disabled');
    await flush();
    expect(clone.hasAttribute('disabled')).toBe(false);
  });
});

describe('PS4: adoptedStyleSheets', () => {
  it('are copied as text, after the rest, and re-read on a change of the page', async () => {
    let sheets = [{ cssRules: [{ cssText: '.x { color: red; }' }] }];
    Object.defineProperty(document, 'adoptedStyleSheets', { get: () => sheets, configurable: true });
    try {
      head(style('a{}', 's1'));
      const { doc } = child();
      start(doc);
      const last = Array.from(doc.head.children).at(-1)!;
      expect(last.hasAttribute('data-rdd-adopted')).toBe(true);
      expect(last.textContent).toBe('.x { color: red; }');
      sheets = [{ cssRules: [{ cssText: '.y { color: blue; }' }] }];
      document.documentElement.setAttribute('data-test', '1');   // a change of the page re-reads them
      await flush();
      expect(doc.querySelector('[data-rdd-adopted]')!.textContent).toBe('.y { color: blue; }');
    } finally {
      delete (document as unknown as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
    }
  });
});

describe('PS5: <html> and <body>', () => {
  it('attributes, custom properties and color-scheme follow; the child\'s own classes and layout stay', async () => {
    const html = document.documentElement;
    html.setAttribute('data-bs-theme', 'dark');
    html.classList.add('dark');
    html.style.setProperty('--app-accent', 'red');
    html.style.setProperty('color-scheme', 'dark');
    document.body.classList.add('mui-theme');
    const { doc } = child();
    doc.documentElement.classList.add('own');
    doc.body.style.margin = '0px';
    start(doc);
    const ch = doc.documentElement;
    expect(ch.getAttribute('data-bs-theme')).toBe('dark');
    expect(ch.classList.contains('dark')).toBe(true);
    expect(ch.classList.contains('own')).toBe(true);
    expect(ch.style.getPropertyValue('--app-accent')).toBe('red');
    expect(ch.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(doc.body.classList.contains('mui-theme')).toBe(true);
    html.setAttribute('data-bs-theme', 'light');
    html.classList.remove('dark');
    html.style.removeProperty('--app-accent');
    document.body.classList.remove('mui-theme');
    await flush();
    expect(ch.getAttribute('data-bs-theme')).toBe('light');
    expect(ch.classList.contains('dark')).toBe(false);
    expect(ch.classList.contains('own')).toBe(true);
    expect(ch.style.getPropertyValue('--app-accent')).toBe('');
    expect(doc.body.classList.contains('mui-theme')).toBe(false);
    expect(doc.body.style.margin).toBe('0px');
    html.removeAttribute('data-bs-theme');
    await flush();
    expect(ch.hasAttribute('data-bs-theme')).toBe(false);
  });

  it('only custom properties and color-scheme, not the rest of the page\'s inline style', () => {
    document.documentElement.style.setProperty('--app-accent', 'red');
    document.documentElement.style.fontSize = '30px';
    try {
      const { doc } = child();
      start(doc);
      expect(doc.documentElement.style.getPropertyValue('--app-accent')).toBe('red');
      expect(doc.documentElement.style.fontSize).toBe('');
    } finally {
      document.documentElement.style.removeProperty('font-size');
    }
  });
});

describe('PS6: the workspace\'s scope on the frame', () => {
  it('colour scheme, skin and rdd-no-animations, in step', async () => {
    const scope = document.createElement('div');
    scope.setAttribute('data-color-scheme', 'light');
    scope.setAttribute('data-rdd-skin', 'nord');
    scope.className = 'rdd-workspace rdd-no-animations';
    document.body.appendChild(scope);
    added.push(scope);
    const { doc } = child();
    const { frame } = start(doc, { scope });
    expect(frame.getAttribute('data-color-scheme')).toBe('light');
    expect(frame.getAttribute('data-rdd-skin')).toBe('nord');
    expect(frame.classList.contains('rdd-no-animations')).toBe(true);
    scope.setAttribute('data-color-scheme', 'dark');
    scope.removeAttribute('data-rdd-skin');
    scope.classList.remove('rdd-no-animations');
    await flush();
    expect(frame.getAttribute('data-color-scheme')).toBe('dark');
    expect(frame.hasAttribute('data-rdd-skin')).toBe(false);
    expect(frame.classList.contains('rdd-no-animations')).toBe(false);
  });
});

describe('PS7: ready', () => {
  it('at once with no link to wait for', () => {
    head(style('a{}'));
    const { doc } = child();
    const { onReady } = start(doc);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('once every copied link has loaded or failed', () => {
    head(link('/one.css'));
    head(link('/two.css'));
    const { doc } = child();
    const { onReady } = start(doc);
    const clones = Array.from(doc.head.querySelectorAll('link'));
    expect(clones.length).toBeGreaterThanOrEqual(2);
    expect(onReady).not.toHaveBeenCalled();
    clones.forEach((c, i) => { if (i < clones.length - 1) c.dispatchEvent(new Event('load')); });
    expect(onReady).not.toHaveBeenCalled();
    clones.at(-1)!.dispatchEvent(new Event('error'));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('...or after the time limit', () => {
    vi.useFakeTimers();
    head(link('/never.css'));
    const { doc } = child();
    const { onReady } = start(doc);
    vi.advanceTimersByTime(POPOUT_STYLES_TIMEOUT_MS - 10);
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

describe('PS8: stopping', () => {
  it('nothing follows any more', async () => {
    const s = head(style('a{}', 's1'));
    const scope = document.createElement('div');
    document.body.appendChild(scope);
    added.push(scope);
    const { doc } = child();
    const { stop, frame } = start(doc, { scope });
    stop();
    s.textContent = 'changed{}';
    head(style('b{}', 's2'));
    document.documentElement.setAttribute('data-test', 'after');
    scope.setAttribute('data-rdd-skin', 'nord');
    await flush();
    expect(doc.getElementById('s1')!.textContent).toBe('a{}');
    expect(doc.getElementById('s2')).toBeNull();
    expect(doc.documentElement.hasAttribute('data-test')).toBe(false);
    expect(frame.hasAttribute('data-rdd-skin')).toBe(false);
  });
});

// ─── through the workspace ────────────────────────────────────────────────────

const Plain: React.FC<{ panelId: string }> = ({ panelId }) => <div className="ps-panel">{panelId}</div>;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  document.getElementById('preserved-dom-container')?.remove();
});

function mount(popOut: boolean): Workspace {
  const ws = createWorkspace({ popOut, panels: { plain: { component: Plain, defaultOptions: { canPopOut: true } } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop skin="nord" /></DockableDesktopProvider>); });
  act(() => { ws.openPanel('a', 'plain'); });
  return ws;
}

describe('PS9: through the workspace', () => {
  it('the frame waits hidden for the page\'s sheets, is also .rdd-workspace with its scope, and stops on return', async () => {
    head(style('.page{}', 's1'));
    const l = head(link('/lib.css'));
    const ws = mount(true);
    const { win, doc } = child();
    vi.spyOn(window, 'open').mockImplementation(() => win);
    act(() => { ws.popOutPanel('a'); });
    const frame = doc.querySelector<HTMLElement>('.rdd-popout-frame')!;
    expect(frame.classList.contains('rdd-workspace')).toBe(true);
    expect(frame.getAttribute('data-rdd-skin')).toBe('nord');
    expect(frame.style.visibility).toBe('hidden');
    expect(doc.getElementById('s1')).not.toBeNull();
    const clone = Array.from(doc.head.querySelectorAll('link')).find(x => x.getAttribute('href') === l.href)!;
    act(() => { clone.dispatchEvent(new Event('load')); });
    // Other links of the page (if any) settle too; the frame shows once they all have.
    act(() => { doc.head.querySelectorAll('link').forEach(x => x.dispatchEvent(new Event('load'))); });
    expect(frame.style.visibility).toBe('');
    act(() => { ws.returnPanel('a'); });
    head(style('.later{}', 's2'));
    await flush();
    expect(doc.getElementById('s2')).toBeNull();
  });

  it('with popOut off, nothing observes the page', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    mount(false);
    expect(observe.mock.calls.some(c => c[0] === document.head)).toBe(false);
  });

  it('with popOut on, the page is observed only while a panel is out', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const ws = mount(true);
    expect(observe.mock.calls.some(c => c[0] === document.head)).toBe(false);
    const { win } = child();
    vi.spyOn(window, 'open').mockImplementation(() => win);
    act(() => { ws.popOutPanel('a'); });
    expect(observe.mock.calls.some(c => c[0] === document.head)).toBe(true);
    const before = disconnect.mock.calls.length;
    act(() => { ws.returnPanel('a'); });
    expect(disconnect.mock.calls.length).toBeGreaterThan(before);
  });
});
