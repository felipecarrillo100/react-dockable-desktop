/**
 * 7.11.0, M7: focusPanel(id, { restore }), updatePanelProps, and preserveEmbeds.
 *
 * FE1: focusPanel leaves a minimised panel minimised, as before; { restore: true } restores it
 * FE2: updatePanelProps replaces or derives the props, re-renders, re-checks serializable,
 *      publishes layout:changed; nothing for a panel that isn't open or a hosted one
 * FE3: moveInto uses moveBefore only for a marked element it applies to; leaveSlot parks a marked
 *      element instead of detaching it
 * FE4: a panel type's preserveEmbeds, and a widget's, move their element with moveBefore
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, RddPanelOverlay, useFloatingWidgets,
  type Workspace, type FloatingWidgetsApi,
} from '../../index';
import { moveInto, leaveSlot, setPreserveEmbeds } from '../domMove';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let api: FloatingWidgetsApi | null = null;
const rendered: Record<string, unknown>[] = [];

const Plain: React.FC<Record<string, unknown>> = (props) => { rendered.push(props); return <div className="plain" />; };
const Grab: React.FC = () => { api = useFloatingWidgets(); return null; };
const Owner: React.FC = () => <RddPanelOverlay><Grab /></RddPanelOverlay>;

function mount(): Workspace {
  const ws = createWorkspace({
    panels: {
      plain: { component: Plain },
      embed: { component: Plain, defaultOptions: { preserveEmbeds: true } },
      frame: { component: Embed, defaultOptions: { preserveEmbeds: true } },
      bare: { component: Embed },
      map: { component: Owner },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>); });
  return ws;
}
const frames = () => act(async () => { await new Promise(r => setTimeout(r, 80)); });
const state = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): import('../../types').WorkspaceState } })._core.getSnapshot();

type MB = { moveBefore?: (n: Node, c: Node | null) => void };
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null; api = null; rendered.length = 0;
  document.getElementById('preserved-dom-container')?.remove();
  delete (Element.prototype as MB).moveBefore;
});
/**
 * A moveBefore for jsdom, which has none: records its calls and moves like appendChild, but, as
 * the real one, without "disconnecting" what it moves (see the probe below).
 */
let movingBefore = false;
function stubMoveBefore() {
  const calls: Node[] = [];
  (Element.prototype as MB).moveBefore = function (this: Element, node: Node) {
    calls.push(node);
    movingBefore = true;
    try { this.appendChild(node); } finally { movingBefore = false; }
  };
  return calls;
}
/** Stands in for an iframe: counts every real detach, which is when an iframe would reload. */
let reloads = 0;
if (!customElements.get('rdd-probe')) {
  customElements.define('rdd-probe', class extends HTMLElement {
    disconnectedCallback() { if (!movingBefore) reloads += 1; }
  });
}
const Embed: React.FC = () => React.createElement('rdd-probe');

describe('FE1: focusPanel and a minimised panel', () => {
  it('leaves it minimised without restore, and restores it with', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { initialTarget: 'tabbed' }); });
    act(() => { ws.minimizePanel('a'); });
    act(() => { ws.focusPanel('a'); });
    expect(state(ws).panels.a.state).toBe('minimized');
    const restored = vi.fn();
    ws.subscribe('panel:restored', restored);
    act(() => { ws.focusPanel('a', { restore: true }); });
    expect(state(ws).panels.a.state).toBe('docked');
    expect(state(ws).activePanelId).toBe('a');
    expect(restored).toHaveBeenCalledWith({ id: 'a' });
  });

  it('on an open panel, restore changes nothing', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { initialTarget: 'tabbed' }); });
    act(() => { ws.focusPanel('a', { restore: true }); });
    expect(state(ws).activePanelId).toBe('a');
    expect(state(ws).panels.a.state).toBe('docked');
  });
});

describe('FE2: updatePanelProps', () => {
  it('replaces the props, re-renders, and publishes layout:changed', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain', { props: { line: 1 } }); });
    const changed = vi.fn();
    ws.subscribe('layout:changed', changed);
    act(() => { ws.updatePanelProps('a', { line: 2 }); });
    expect(state(ws).panels.a.props).toEqual({ line: 2 });
    expect(rendered.at(-1)).toMatchObject({ line: 2, panelId: 'a' });
    expect(changed).toHaveBeenCalled();
    act(() => { ws.updatePanelProps('a', prev => ({ ...prev, zoom: 3 })); });
    expect(state(ws).panels.a.props).toEqual({ line: 2, zoom: 3 });
  });

  it('re-checks serializable, which decides saveLayout', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain', { props: { line: 1 } }); });
    expect(state(ws).panels.a.serializable).toBe(true);
    act(() => { ws.updatePanelProps('a', { onPick: () => {} }); });
    expect(state(ws).panels.a.serializable).toBe(false);
    expect(ws.saveLayout()).not.toContain('"a"');
    act(() => { ws.updatePanelProps('a', { line: 5 }); });
    expect(state(ws).panels.a.serializable).toBe(true);
    expect(JSON.parse(ws.saveLayout()).panels.a.props).toEqual({ line: 5 });
  });

  it('does nothing for a panel that isn\'t open, or a hosted one', () => {
    const ws = mount();
    act(() => { ws.openPanel('map', 'map'); });
    act(() => { api!.open('t', { title: 'T', content: <i /> }); });
    act(() => { api!.move('t', { to: 'tabbed' }); });
    const before = state(ws);
    const changed = vi.fn();
    ws.subscribe('layout:changed', changed);
    act(() => { ws.updatePanelProps('nope', { x: 1 }); ws.updatePanelProps('map/t', { x: 1 }); });
    expect(state(ws)).toBe(before);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('FE3: moveInto and leaveSlot', () => {
  const connected = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };

  it('uses moveBefore only for a marked, connected element in the same document', () => {
    const calls = stubMoveBefore();
    const from = connected(); const to = connected();
    const el = document.createElement('div');
    from.appendChild(el);
    moveInto(to, el);
    expect(calls).toEqual([]);                     // not marked
    setPreserveEmbeds(el, true);
    moveInto(from, el);
    expect(calls).toEqual([el]);
    expect(el.parentElement).toBe(from);
    const loose = document.createElement('div');
    setPreserveEmbeds(loose, true);
    moveInto(to, loose);                           // its first insertion: not connected yet
    expect(calls).toHaveLength(1);
    const other = document.implementation.createHTMLDocument('x');
    const foreign = other.createElement('div');
    other.body.appendChild(foreign);
    moveInto(foreign, el);                         // another document
    expect(calls).toHaveLength(1);
    from.remove(); to.remove();
  });

  it('falls back to appendChild where there is no moveBefore, or it throws', () => {
    const to = connected(); const from = connected();
    const el = document.createElement('div');
    from.appendChild(el);
    setPreserveEmbeds(el, true);
    moveInto(to, el);
    expect(el.parentElement).toBe(to);
    (Element.prototype as MB).moveBefore = () => { throw new Error('nope'); };
    moveInto(from, el);
    expect(el.parentElement).toBe(from);
    from.remove(); to.remove();
  });

  it('leaveSlot parks a marked element, detaches any other, and leaves one that moved on', () => {
    const slot = connected(); const elsewhere = connected();
    const a = document.createElement('div'); const b = document.createElement('div'); const c = document.createElement('div');
    setPreserveEmbeds(a, true);
    slot.append(a, b);
    elsewhere.appendChild(c);
    leaveSlot(slot, a); leaveSlot(slot, b); leaveSlot(slot, c);
    expect(a.parentElement!.id).toBe('preserved-dom-container');
    expect(b.isConnected).toBe(false);
    expect(c.parentElement).toBe(elsewhere);
    slot.remove(); elsewhere.remove();
  });
});

describe('FE4: preserveEmbeds on a panel type and on a widget', () => {
  it('a panel type with it moves its element with moveBefore; one without does not', () => {
    const calls = stubMoveBefore();
    const ws = mount();
    // One at a time, so each is shown (and so attached) once: a panel never shown has a detached element.
    act(() => { ws.openPanel('e', 'embed'); });
    act(() => { ws.openPanel('p', 'plain', { dockTo: { panel: 'e', position: 'right' } }); });
    const embedEl = document.querySelector('[data-rdd-panel="e"]')!.parentElement!;
    const plainEl = document.querySelector('[data-rdd-panel="p"]')!.parentElement!;
    calls.length = 0;
    act(() => { ws.floatPanel('e'); ws.floatPanel('p'); });
    expect(calls).toContain(embedEl);
    expect(calls).not.toContain(plainEl);
  });

  it('a widget with it moves its content element with moveBefore, out and back', async () => {
    const calls = stubMoveBefore();
    const ws = mount();
    act(() => { ws.openPanel('map', 'map'); });
    act(() => { api!.open('t', { title: 'T', content: <i id="t-content" />, preserveEmbeds: true }); });
    const el = document.getElementById('t-content')!.parentElement!;
    calls.length = 0;
    act(() => { api!.move('t', { to: 'docked', position: 'bottom' }); });
    await frames();
    expect(el.parentElement!.className).toBe('rdd-hosted-widget');
    expect(el.isConnected).toBe(true);
    expect(calls.filter(n => n === el).length).toBeGreaterThan(0);
    expect(calls.length).toBe(calls.filter(n => n !== el).length + calls.filter(n => n === el).length);
    calls.length = 0;
    act(() => { api!.move('t', { to: 'panel' }); });
    await frames();
    expect(calls).toContain(el);
    expect(el.parentElement!.className).toBe('rdd-panel-float__body');
  });

  it('a widget with it: an iframe in it never reloads, out, between places, and back', async () => {
    stubMoveBefore();
    const ws = mount();
    act(() => { ws.openPanel('map', 'map'); });
    act(() => { api!.open('t', { title: 'T', content: <Embed />, preserveEmbeds: true }); });
    reloads = 0;
    const steps: Parameters<FloatingWidgetsApi['move']>[1][] = [
      { to: 'docked', position: 'bottom' }, { to: 'floating', rect: { x: 0, y: 0, width: 200, height: 120 } },
      { to: 'tabbed' }, { to: 'docked', position: 'right' }, { to: 'panel' },
    ];
    for (const to of steps) {
      act(() => { api!.move('t', to); });
      await frames();
      expect(reloads, JSON.stringify(to)).toBe(0);
    }
    expect(document.querySelector('rdd-probe')!.parentElement!.parentElement!.className).toBe('rdd-panel-float__body');
  });

  it('...and without it, it does (the probe sees real detaches)', async () => {
    stubMoveBefore();
    const ws = mount();
    act(() => { ws.openPanel('map', 'map'); });
    act(() => { api!.open('t', { title: 'T', content: <Embed /> }); });
    reloads = 0;
    act(() => { api!.move('t', { to: 'docked', position: 'bottom' }); });
    await frames();
    expect(reloads).toBeGreaterThan(0);
  });

  it('a panel type with it: an iframe in it never reloads as the grid changes around it', async () => {
    stubMoveBefore();
    const ws = mount();
    act(() => { ws.openPanel('e', 'frame'); });
    reloads = 0;
    const steps: [string, () => void][] = [
      ['split beside it', () => ws.openPanel('p', 'plain', { dockTo: { panel: 'e', position: 'bottom' } })],
      ['float', () => ws.floatPanel('e')],
      ['dock', () => ws.dockPanel('e')],
      ['minimize', () => ws.minimizePanel('e')],
      ['restore', () => ws.restorePanel('e')],
      ['the other closes', () => ws.closePanel('p')],
    ];
    for (const [name, step] of steps) {
      act(step);
      await frames();
      expect(reloads, name).toBe(0);
    }
  });

  it('...and a panel type without it reloads, as before', async () => {
    stubMoveBefore();
    const ws = mount();
    act(() => { ws.openPanel('e', 'bare'); });
    reloads = 0;
    act(() => { ws.floatPanel('e'); });
    await frames();
    expect(reloads).toBeGreaterThan(0);
  });

  it('a widget without it never does', () => {
    const calls = stubMoveBefore();
    const ws = mount();
    act(() => { ws.openPanel('map', 'map'); });
    act(() => { api!.open('t', { title: 'T', content: <i id="t-content" /> }); });
    const el = document.getElementById('t-content')!.parentElement!;
    act(() => { api!.move('t', { to: 'docked', position: 'bottom' }); });
    act(() => { api!.move('t', { to: 'panel' }); });
    expect(calls).not.toContain(el);
  });
});
