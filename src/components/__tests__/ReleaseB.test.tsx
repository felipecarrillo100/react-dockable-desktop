/**
 * The 7.9.0 docking rules, through the public API and real gestures: `canFloat` / `canDock` per
 * panel type and the workspace's `canDrop` veto. They govern what the user does; the app's own
 * calls always work. Without them nothing changes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, startPointerDrag, type Workspace, type PanelDrop } from '../../index';

const Plain: React.FC = () => <div />;
const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type Config = Parameters<typeof createWorkspace>[0];
function mount(config: Partial<Config> = {}, desktop: React.ComponentProps<typeof RddDesktop> = {}, dir?: 'rtl'): Workspace {
  const ws = createWorkspace({ panels: { plain: { component: Plain } }, ...config } as Config);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws} dir={dir}><RddDesktop {...desktop} /></DockableDesktopProvider>); });
  return ws;
}
const $ = (sel: string) => container!.querySelector(sel);
const $$ = (sel: string) => [...container!.querySelectorAll(sel)];
const core = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): { gridRoot: any; floating: { id: string; anchor: unknown }[]; panels: Record<string, { state: string }> } } })._core.getSnapshot();

/** Start dragging a tab, and move past the drag threshold so the drop targets render. */
function startTabDrag(id: string) {
  act(() => { $(`[data-rdd-tab="${id}"]`)!.dispatchEvent(pointer('pointerdown', 100, 10)); });
  act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
}
/** Start dragging a floating window by its title bar. */
function startWindowDrag(id: string) {
  act(() => { $(`[data-rdd-titlebar="${id}"]`)!.dispatchEvent(pointer('pointerdown', 350, 160)); });
  act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
}
const release = () => act(() => { window.dispatchEvent(pointer('pointerup', 200, 200)); });
const menuLabels = () => [...document.querySelectorAll('.rdd-context-menu__label')].map(e => e.textContent);

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  document.getElementById('preserved-dom-container')?.remove();
  document.body.classList.remove('rdd-dragging-active');
  document.querySelectorAll('.rdd-context-menu').forEach(e => e.remove());
});

describe('canFloat: false', () => {
  it('a tab dropped on nothing stays docked, and no corner is offered', () => {
    const ws = mount({ panels: { plain: { component: Plain }, pinned: { component: Plain, defaultOptions: { canFloat: false } } } });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('p', 'pinned'); });
    startTabDrag('p');
    expect($$('.rdd-corner-zone')).toHaveLength(0);
    expect($$('[data-drop-zone]').length).toBeGreaterThan(0);   // docking targets still offered
    release();
    expect(core(ws).floating.map(f => f.id)).toEqual([]);
    expect(core(ws).panels.p.state).toBe('docked');
  });

  it('its tab menu has no "Float Window"; another panel\'s still does', () => {
    const ws = mount({ panels: { plain: { component: Plain }, pinned: { component: Plain, defaultOptions: { canFloat: false } } } });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('p', 'pinned'); });
    act(() => { $('[data-rdd-tab="p"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); });
    expect(menuLabels()).not.toContain('Float Window');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    act(() => { $('[data-rdd-tab="a"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); });
    expect(menuLabels()).toContain('Float Window');
  });

  it("doesn't restrict the app: floatPanel still floats it", () => {
    const ws = mount({ panels: { pinned: { component: Plain, defaultOptions: { canFloat: false } } } });
    act(() => { ws.openPanel('p', 'pinned'); ws.floatPanel('p'); });
    expect(core(ws).floating.map(f => f.id)).toEqual(['p']);
  });
});

describe('canDock: false', () => {
  it('a window drag offers no group or edge target, only corners, and the panel stays floating', () => {
    const ws = mount({ panels: { plain: { component: Plain }, palette: { component: Plain, defaultOptions: { canDock: false, initialTarget: 'floating' } } } });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('w', 'palette'); });
    startWindowDrag('w');
    expect($$('[data-drop-zone]')).toHaveLength(0);
    expect($$('[data-edge-trigger]')).toHaveLength(0);
    expect($$('.rdd-corner-zone')).toHaveLength(4);
    release();
    expect(core(ws).panels.w.state).toBe('floating');
  });

  it("doesn't restrict the app: dockPanelToGroup still docks it", () => {
    const ws = mount({ panels: { plain: { component: Plain }, palette: { component: Plain, defaultOptions: { canDock: false, initialTarget: 'floating' } } } });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('w', 'palette'); });
    act(() => { ws.dockPanelToGroup('w', core(ws).gridRoot.id, 'right'); });
    expect(core(ws).panels.w.state).toBe('docked');
  });
});

describe('canDrop', () => {
  it('is asked with { panelId, component, to }, and a vetoed target is not offered', () => {
    const calls: PanelDrop[] = [];
    // No splitting to the left, and no top edge; everything else allowed.
    const canDrop = (d: PanelDrop) => {
      calls.push(d);
      return !(d.to.kind === 'group' && d.to.position === 'left') && !(d.to.kind === 'edge' && d.to.side === 'top');
    };
    const ws = mount({ canDrop });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
    startTabDrag('b');
    expect($$('[data-drop-zone]').map(e => e.getAttribute('data-drop-zone')).sort()).toEqual(['bottom', 'center', 'right', 'top']);
    expect($$('[data-edge-trigger]').map(e => e.getAttribute('data-edge-trigger')).sort()).toEqual(['bottom', 'left', 'right']);
    expect(calls.some(c => c.panelId === 'b' && c.component === 'plain' && c.to.kind === 'group')).toBe(true);
    release();
  });

  it('under RTL it sees the side the move applies: the zone drawn on the left splits to the right', () => {
    // Forbid splitting to the (applied) right: under RTL that is the zone drawn on the screen's left.
    const ws = mount({ canDrop: d => !(d.to.kind === 'group' && d.to.position === 'right') }, {}, 'rtl');
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
    startTabDrag('b');
    expect($$('[data-drop-zone]').map(e => e.getAttribute('data-drop-zone')).sort()).toEqual(['bottom', 'center', 'right', 'top']);
    release();
  });

  it('a vetoed group refuses tabs inserted among its tabs too', () => {
    const ws = mount({
      initialState: JSON.stringify({ version: 2, gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
        { type: 'leaf', id: 'L', panels: ['a'], activePanelId: 'a' }, { type: 'leaf', id: 'R', panels: ['b', 'c'], activePanelId: 'b' }] },
        floating: [], minimized: [], panels: { a: { id: 'a', title: 'a', component: 'plain', state: 'docked' }, b: { id: 'b', title: 'b', component: 'plain', state: 'docked' }, c: { id: 'c', title: 'c', component: 'plain', state: 'docked' } } }),
      canDrop: d => !(d.to.kind === 'group' && d.to.leafId === 'R'),
    });
    startTabDrag('a');
    act(() => { $('[data-rdd-tab="b"]')!.dispatchEvent(pointer('pointermove', 210, 10)); });
    // Not offered: hovering its tabs shows no insertion marker.
    expect($$('[data-rdd-tab].rdd-drag-hover-left, [data-rdd-tab].rdd-drag-hover-right')).toHaveLength(0);
    release();
    // Not inserted among R's tabs. (Released on no allowed target, it floats, and its emptied group
    // collapses, so R may now be the root itself.)
    const findLeaf = (n: any): any => n.type === 'leaf' ? (n.id === 'R' ? n : null) : n.children.map(findLeaf).find(Boolean) ?? null;
    expect(findLeaf(core(ws).gridRoot).panels).toEqual(['b', 'c']);
    expect(core(ws).panels.a.state).not.toBe('docked');
  });

  it('a rule that changes during a drag is asked again at release', () => {
    let allowRight = true;
    const ws = mount({ canDrop: d => allowRight || !(d.to.kind === 'group' && d.to.position === 'right') });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
    startTabDrag('b');
    const zone = $('[data-drop-zone="right"]')!;
    act(() => { zone.dispatchEvent(pointer('pointerover', 200, 200)); });   // hovered while allowed
    allowRight = false;                                                     // the app changes its mind
    release();
    expect(core(ws).gridRoot.type).toBe('leaf');                            // no split happened
  });

  it('a rule that changes during a drag is asked again at release, for a tab insertion too', () => {
    let allowR = true;
    const ws = mount({
      initialState: JSON.stringify({ version: 2, gridRoot: { type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5], children: [
        { type: 'leaf', id: 'L', panels: ['a', 'x'], activePanelId: 'a' }, { type: 'leaf', id: 'R', panels: ['b'], activePanelId: 'b' }] },
        floating: [], minimized: [], panels: { a: { id: 'a', title: 'a', component: 'plain', state: 'docked' }, x: { id: 'x', title: 'x', component: 'plain', state: 'docked' }, b: { id: 'b', title: 'b', component: 'plain', state: 'docked' } } }),
      canDrop: d => allowR || !(d.to.kind === 'group' && d.to.leafId === 'R'),
    });
    startTabDrag('a');
    act(() => { $('[data-rdd-tab="b"]')!.dispatchEvent(pointer('pointermove', 210, 10)); });   // hovered while allowed
    allowR = false;
    release();
    const findLeaf = (n: any, id: string): any => n.type === 'leaf' ? (n.id === id ? n : null) : n.children.map((c: any) => findLeaf(c, id)).find(Boolean) ?? null;
    expect(findLeaf(core(ws).gridRoot, 'R').panels).toEqual(['b']);
  });

  it('a window drag asks again at release too: a rule changed mid-drag keeps it floating', () => {
    let allow = true;
    const ws = mount({ canDrop: d => allow || d.to.kind === 'float' });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('w', 'plain', { initialTarget: 'floating' }); });
    startWindowDrag('w');
    act(() => { $('[data-drop-zone="right"]')!.dispatchEvent(pointer('pointerover', 200, 200)); });
    allow = false;
    release();
    expect(core(ws).panels.w.state).toBe('floating');
  });

  it('a canDrop that throws allows the move, and says why', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ws = mount({ canDrop: () => { throw new Error('boom'); } });
      act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
      startTabDrag('b');
      expect($$('[data-drop-zone]')).toHaveLength(5);
      expect(error.mock.calls.some(c => String(c[0]).includes('canDrop threw'))).toBe(true);
      release();
    } finally {
      error.mockRestore();
    }
  });

  it('without rules, every target is offered as before', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain'); });
    startTabDrag('b');
    expect($$('[data-drop-zone]')).toHaveLength(5);
    expect($$('[data-edge-trigger]')).toHaveLength(4);
    expect($$('.rdd-corner-zone')).toHaveLength(4);
    release();
  });
});

describe('startPointerDrag ends on blur and on a lost capture', () => {
  function drag(opts: { onCancel?: boolean } = {}) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const log: string[] = [];
    startPointerDrag({
      element: el, pointerId: 7, startClientX: 0, startClientY: 0,
      captureStart: () => ({}),
      onMove: (dx) => log.push(`move ${dx}`),
      onEnd: () => log.push('end'),
      ...(opts.onCancel ? { onCancel: () => log.push('cancel') } : {}),
      activeClasses: [{ el: document.body, classes: ['probe-dragging'] }],
    });
    const move = (x: number) => el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: x, bubbles: true }));
    return { el, log, move };
  }
  afterEach(() => { document.body.classList.remove('probe-dragging'); });

  it('a window blur cancels it: classes removed, onCancel once, no more moves', () => {
    const { log, move } = drag({ onCancel: true });
    move(5);
    expect(document.body.classList.contains('probe-dragging')).toBe(true);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
    move(9);
    expect(log).toEqual(['move 5', 'cancel']);
    expect(document.body.classList.contains('probe-dragging')).toBe(false);
  });

  it("a lost capture at the document (the element was removed) ends it; another pointer's does not", () => {
    const { el, log } = drag({ onCancel: true });
    document.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 99, bubbles: true }));
    expect(log).toEqual([]);
    el.remove();
    document.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 7, bubbles: true }));
    expect(log).toEqual(['cancel']);
    expect(document.body.classList.contains('probe-dragging')).toBe(false);
  });

  it('without onCancel, a cut-short drag calls onEnd; a normal release calls onEnd once', () => {
    const a = drag();
    window.dispatchEvent(new Event('blur'));
    expect(a.log).toEqual(['end']);
    const b = drag();
    b.el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
    document.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 7, bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(b.log).toEqual(['end']);
  });
});
