/**
 * The 7.0 public API, used exactly as an app would: everything imported from src/index.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, useWorkspace, useWorkspaceState, DockableDesktopProvider, RddDesktop,
  usePanel, usePanelEvents, useBeforeClose, useSaveState, useModals, useSidePanels,
  RddSidePanels, RddModals, RddContextMenu, useContextMenu, PanelRegistry,
  type Workspace, type PanelHandle, type ModalsApi, type SidePanelsApi, type ContextMenuHandle,
} from '../../index';

let container: HTMLDivElement;
let root: Root | null = null;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.getElementById('preserved-dom-container')?.remove();
});
const render = (el: React.ReactElement) => act(() => { root = createRoot(container); root.render(el); });
const tab = (id: string) => container.querySelector(`[data-tab-id="${id}"]`) as HTMLElement | null;

describe('createWorkspace', () => {
  it('is live before any provider mounts, and a provider shows what was already done', () => {
    const Plain = () => <div />;
    const ws = createWorkspace({ panels: { p: { component: Plain } } });
    ws.openPanel('a', 'p', { title: 'Alpha' });
    expect(ws.getOpenPanelIds()).toEqual(['a']);
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    expect(tab('a')?.textContent).toContain('Alpha');
  });

  it('applies the messages option', () => {
    const ws = createWorkspace({ messages: { emptyGroup: { id: 'x', defaultMessage: 'Nothing here' } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    expect(container.querySelector('.rdd-empty-leaf-placeholder')?.textContent).toBe('Nothing here');
  });

  it('its registry is a PanelRegistry', () => {
    const ws = createWorkspace();
    expect(ws.registry).toBeInstanceOf(PanelRegistry);
  });
});

describe('DockableDesktopProvider and useWorkspace', () => {
  it('useWorkspace returns the workspace passed in, the same object on every render', () => {
    const ws = createWorkspace();
    const seen: Workspace[] = [];
    const Probe = () => { seen.push(useWorkspace()); useWorkspaceState(); return null; };
    render(<DockableDesktopProvider workspace={ws}><Probe /></DockableDesktopProvider>);
    act(() => { ws.setDirection('rtl'); });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every(w => w === ws)).toBe(true);
  });

  it('without a workspace prop the provider creates one; panels register through its registry', () => {
    const Plain = () => <div id="made-here" />;
    let ws: Workspace | undefined;
    const Probe = () => { ws = useWorkspace(); return null; };
    render(<DockableDesktopProvider><Probe /><RddDesktop /></DockableDesktopProvider>);
    act(() => { ws!.registry.register('p', Plain); ws!.openPanel('a', 'p'); });
    expect(tab('a')).not.toBeNull();
  });

  it('destructured workspace methods keep working', () => {
    const ws = createWorkspace({ panels: { p: { component: () => <div /> } } });
    const { openPanel, isOpen, publish, subscribe, getOpenPanelIds } = ws;
    const seen: unknown[] = [];
    subscribe('ping', d => seen.push(d));
    openPanel('a', 'p');
    publish('ping', { n: 1 });
    expect(isOpen('a')).toBe(true);
    expect(getOpenPanelIds()).toEqual(['a']);
    expect(seen).toEqual([{ n: 1 }]);
    let fromHook: Workspace | undefined;
    const Probe = () => { fromHook = useWorkspace(); return null; };
    render(<DockableDesktopProvider workspace={ws}><Probe /></DockableDesktopProvider>);
    const { closePanel } = fromHook!;
    act(() => { closePanel('a'); });
    expect(ws.isOpen('a')).toBe(false);
  });

  it('useWorkspaceState with a selector', () => {
    const ws = createWorkspace();
    let count = -1;
    const Probe = () => { count = useWorkspaceState(s => Object.keys(s.panels).length); return null; };
    ws.registry.register('p', () => <div />);
    render(<DockableDesktopProvider workspace={ws}><Probe /></DockableDesktopProvider>);
    expect(count).toBe(0);
    act(() => { ws.openPanel('a', 'p'); });
    expect(count).toBe(1);
  });
});

describe('panel-side hooks', () => {
  const handles: Record<string, PanelHandle> = {};
  const events: string[] = [];
  let veto = false;
  let reportState: (() => unknown) | null = null;
  const Probe: React.FC = () => {
    const panel = usePanel();
    handles[panel.id] = panel;
    usePanelEvents({
      onActivate: () => events.push(`${panel.id}:activate`),
      onDeactivate: () => events.push(`${panel.id}:deactivate`),
      onMinimize: () => events.push(`${panel.id}:minimize`),
      onRestore: () => events.push(`${panel.id}:restore`),
    });
    useBeforeClose(veto ? () => false : null);
    useSaveState(reportState);
    return <div />;
  };
  let ws: Workspace;
  const mount = () => {
    ws = createWorkspace({ panels: { probe: { component: Probe } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
  };
  beforeEach(() => { for (const k of Object.keys(handles)) delete handles[k]; events.length = 0; veto = false; reportState = null; });

  it('usePanel: id, where it is (live), and whether it is active', () => {
    mount();
    act(() => { ws.openPanel('a', 'probe'); });
    expect(handles.a.id).toBe('a');
    expect(handles.a.containerType).toBe('dockable-panel');
    expect(handles.a.isActive).toBe(true);
    act(() => { ws.floatPanel('a'); });
    expect(handles.a.containerType).toBe('floating-window');
    expect(handles.a.isFloating).toBe(true);
    act(() => { ws.openPanel('b', 'probe'); });
    expect(handles.a.isActive).toBe(false);
  });

  it('usePanel: setTitle and close act on the container', () => {
    mount();
    act(() => { ws.openPanel('a', 'probe'); });
    act(() => { handles.a.setTitle('Renamed'); });
    expect(tab('a')?.textContent).toContain('Renamed');
    act(() => { handles.a.close({ force: true }); });
    expect(ws.isOpen('a')).toBe(false);
  });

  it('usePanelEvents: activate, deactivate, minimize, restore', () => {
    mount();
    act(() => { ws.openPanel('a', 'probe'); ws.openPanel('b', 'probe'); });
    events.length = 0;
    act(() => { ws.focusPanel('a'); });
    expect(events).toContain('a:activate');
    expect(events).toContain('b:deactivate');
    act(() => { ws.minimizePanel('a'); });
    expect(events).toContain('a:minimize');
    act(() => { ws.restorePanel('a'); });
    expect(events).toContain('a:restore');
  });

  it('useBeforeClose: a guard that refuses keeps the panel; null registers none', async () => {
    veto = true;
    mount();
    act(() => { ws.openPanel('a', 'probe'); });
    await act(async () => { await ws.requestClosePanel('a'); });
    expect(ws.isOpen('a')).toBe(true);
    veto = false;
    act(() => { ws.openPanel('b', 'probe'); }); // re-render with the guard switched off
    act(() => { ws.focusPanel('a'); });
    await act(async () => { await ws.requestClosePanel('a'); });
    expect(ws.isOpen('a')).toBe(false);
  });

  it('useSaveState: saveLayout stores what the panel reports', () => {
    reportState = () => ({ query: 'roads' });
    mount();
    act(() => { ws.openPanel('a', 'probe'); });
    expect(JSON.parse(ws.saveLayout()).panels.a.props).toEqual({ query: 'roads' });
  });
});

describe('modals and side drawers', () => {
  let modals: ModalsApi;
  let sides: SidePanelsApi;
  const Probe = () => { modals = useModals(); sides = useSidePanels(); return null; };
  const Body = () => <div className="overlay-body" />;

  it('useModals: open, stack, topmost, close', () => {
    render(<DockableDesktopProvider><Probe /><RddModals /></DockableDesktopProvider>);
    let first = '';
    act(() => { first = modals.open(Body, {}, { title: 'One' }); modals.open(Body, {}, { title: 'Two' }); });
    expect(modals.stack.map(m => m.options.title)).toEqual(['One', 'Two']);
    expect(modals.topmost?.options.title).toBe('Two');
    act(() => { modals.close(first); });
    expect(modals.stack.map(m => m.options.title)).toEqual(['Two']);
    act(() => { modals.closeAll(); });
    expect(modals.stack).toEqual([]);
  });

  it('useSidePanels and RddSidePanels side="left" render only the left drawer', async () => {
    render(<DockableDesktopProvider><Probe /><RddSidePanels side="left" /></DockableDesktopProvider>);
    await act(async () => { await sides.openLeft(Body, {}, { title: 'L' }); await sides.openRight(Body, {}, { title: 'R' }); });
    expect(sides.left?.options.title).toBe('L');
    expect(sides.right?.options.title).toBe('R');
    expect(document.body.querySelector('.rdd-side-panel-left')).not.toBeNull();
    expect(document.body.querySelector('.rdd-side-panel-right')).toBeNull();
    act(() => { sides.closeAll(); });
    expect(sides.left).toBeNull();
    expect(sides.right).toBeNull();
  });
});

describe('RddContextMenu', () => {
  it('with children, provides the menu to useContextMenu() outside any workspace', () => {
    let show: ReturnType<typeof useContextMenu> | undefined;
    const Probe = () => { show = useContextMenu(); return null; };
    render(<RddContextMenu><Probe /></RddContextMenu>);
    act(() => { show!({ x: 5, y: 5, items: [{ label: 'Item', action: () => {} }] }); });
    expect(document.body.querySelector('.rdd-context-menu')?.textContent).toContain('Item');
  });

  it('without children, is a single menu driven through its ref', () => {
    let ref: React.RefObject<ContextMenuHandle | null> | undefined;
    const Host = () => { ref = useRef<ContextMenuHandle>(null); const [n] = useState(0); return <RddContextMenu ref={ref} key={n} />; };
    render(<Host />);
    act(() => { ref!.current!.show({ x: 5, y: 5, items: [{ label: 'Direct', action: () => {} }] }); });
    expect(document.body.querySelector('.rdd-context-menu')?.textContent).toContain('Direct');
  });
});

describe('usePanel identity', () => {
  // The pattern a mechanical 6.x → 7.0 port produces: the handle in the dependency array of an
  // effect that writes title and dirty state. 7.0.0 looped on it. The counter stops a regression
  // at 50 runs, so it fails here instead of hanging the suite.
  let effectRuns = 0;
  let setProbeTitle: (t: string) => void = () => {};
  const LoopProbe: React.FC = () => {
    const panel = usePanel();
    const [title, setTitle] = useState('First');
    setProbeTitle = setTitle;
    useEffect(() => {
      if (++effectRuns > 50) return;
      panel.setTitle(title);
      panel.setDirty(title !== 'First');
    }, [panel, title]);
    return <div className="loop-probe">{title}</div>;
  };
  beforeEach(() => { effectRuns = 0; });

  it('an effect that lists the handle and writes title and dirty settles in a docked panel', () => {
    const ws = createWorkspace({ panels: { loop: { component: LoopProbe } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    act(() => { ws.openPanel('a', 'loop'); });
    act(() => { setProbeTitle('Second'); });
    expect(effectRuns).toBeLessThanOrEqual(4);
    expect(tab('a')?.textContent).toContain('Second');
  });

  it('the same effect settles in a modal and in a drawer', async () => {
    let modals: ModalsApi | undefined;
    let sides: SidePanelsApi | undefined;
    const Opener = () => { modals = useModals(); sides = useSidePanels(); return null; };
    render(<DockableDesktopProvider><Opener /><RddModals /><RddSidePanels /></DockableDesktopProvider>);
    act(() => { modals!.open(LoopProbe, {}, { title: 'Modal' }); });
    act(() => { setProbeTitle('Second'); });
    expect(effectRuns).toBeLessThanOrEqual(4);
    act(() => { setProbeTitle('First'); });
    act(() => { modals!.closeAll(); });
    effectRuns = 0;
    await act(async () => { await sides!.openRight(LoopProbe, {}, { title: 'Drawer' }); });
    act(() => { setProbeTitle('Third'); });
    expect(effectRuns).toBeLessThanOrEqual(4);
  });

  it('mutators never change identity; title and dirty writes leave the handle as it is', () => {
    const seen: PanelHandle[] = [];
    const Probe = () => { seen.push(usePanel()); return null; };
    const ws = createWorkspace({ panels: { p: { component: Probe } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    act(() => { ws.openPanel('a', 'p'); });
    const handlesOfA = () => seen.filter(h => h.id === 'a');
    const first = handlesOfA().at(-1)!;
    act(() => { first.setTitle('Renamed'); first.setDirty(true); });
    expect(handlesOfA().at(-1)).toBe(first);
    act(() => { ws.openPanel('b', 'p'); });
    act(() => { ws.floatPanel('a'); });
    act(() => { ws.minimizePanel('a'); });
    act(() => { ws.restorePanel('a'); });
    const last = handlesOfA().at(-1)!;
    expect(last).not.toBe(first);
    for (const k of ['close', 'minimize', 'setDirty', 'setTitle', 'setIcon'] as const) {
      expect(last[k]).toBe(first[k]);
    }
  });

  it('in a modal, whose container changes with its title and dirty flag, the mutators still keep their identity', () => {
    let modals: ModalsApi | undefined;
    const seen: PanelHandle[] = [];
    const Opener = () => { modals = useModals(); return null; };
    const Body = () => { seen.push(usePanel()); return null; };
    render(<DockableDesktopProvider><Opener /><RddModals /></DockableDesktopProvider>);
    act(() => { modals!.open(Body, {}, { title: 'T' }); });
    const first = seen.at(-1)!;
    act(() => { first.setTitle('Changed'); });
    act(() => { first.setDirty(true); });
    act(() => { first.setDirty(false); });
    expect(seen.length).toBeGreaterThan(1);
    for (const k of ['close', 'minimize', 'setDirty', 'setTitle', 'setIcon'] as const) {
      expect(seen.at(-1)![k]).toBe(first[k]);
    }
  });

  it('writing the title or dirty state a panel already has changes nothing', () => {
    let handle: PanelHandle | undefined;
    const Probe = () => { handle = usePanel(); return null; };
    const ws = createWorkspace({ panels: { p: { component: Probe } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    act(() => { ws.openPanel('a', 'p'); });
    act(() => { handle!.setTitle('T'); handle!.setDirty(true, { message: 'Unsaved' }); });
    const before = ws._core.getSnapshot();
    act(() => { handle!.setTitle('T'); handle!.setDirty(true, { message: 'Unsaved' }); });
    expect(ws._core.getSnapshot()).toBe(before);
    act(() => { handle!.setTitle({ id: 'k', defaultMessage: 'K' }); });
    const withDescriptor = ws._core.getSnapshot();
    act(() => { handle!.setTitle({ id: 'k', defaultMessage: 'K' }); });
    expect(ws._core.getSnapshot()).toBe(withDescriptor);
  });

  it('in a modal, writing the title or dirty state it already has changes nothing', () => {
    let modals: ModalsApi | undefined;
    let handle: PanelHandle | undefined;
    const Opener = () => { modals = useModals(); return null; };
    const Body = () => { handle = usePanel(); return null; };
    render(<DockableDesktopProvider><Opener /><RddModals /></DockableDesktopProvider>);
    act(() => { modals!.open(Body, {}, { title: 'T' }); });
    act(() => { handle!.setTitle('T'); handle!.setDirty(false); });
    const stack = modals!.stack;
    act(() => { handle!.setTitle('T'); handle!.setDirty(false); });
    expect(modals!.stack).toBe(stack);
  });

  it('setDirty options reach the close confirmation of a docked panel', async () => {
    let handle: PanelHandle | undefined;
    const Probe = () => { handle = usePanel(); return null; };
    const ws = createWorkspace({ panels: { p: { component: Probe } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    act(() => { ws.openPanel('a', 'p'); });
    act(() => { handle!.setDirty(true, { message: 'Custom' }); });
    let received: unknown;
    await act(async () => {
      await ws.requestClosePanel('a', { onConfirm: async opts => { received = opts; return true; } });
    });
    expect(received).toEqual({ message: 'Custom' });
  });

});

describe('panel icons (7.1)', () => {
  const RegIcon = () => <i className="reg-icon" />;
  let handle: PanelHandle | undefined;
  const Probe = () => { handle = usePanel(); return <div />; };
  const mount = () => {
    const ws = createWorkspace({ panels: { p: { component: Probe, defaultOptions: { icon: <RegIcon /> } } } });
    render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>);
    act(() => { ws.openPanel('a', 'p', { title: 'A' }); });
    return ws;
  };
  const tabIcon = () => tab('a')?.querySelector('.rdd-workspace-tab-icon');

  it('usePanel().setIcon changes a docked tab, a floating title bar and a taskbar button; null restores the registration icon', () => {
    const ws = mount();
    expect(tabIcon()?.querySelector('.reg-icon')).not.toBeNull();
    act(() => { handle!.setIcon(<b className="live-icon" />); });
    expect(tabIcon()?.querySelector('.live-icon')).not.toBeNull();
    act(() => { ws.floatPanel('a'); });
    expect(container.querySelector('[data-window-id="a"] .rdd-window-title-icon .live-icon')).not.toBeNull();
    act(() => { ws.minimizePanel('a'); });
    expect(container.querySelector('.rdd-taskbar-item-icon .live-icon')).not.toBeNull();
    act(() => { ws.restorePanel('a'); ws.dockPanel('a'); });
    act(() => { handle!.setIcon(null); });
    expect(tabIcon()?.querySelector('.reg-icon')).not.toBeNull();
    expect(tabIcon()?.querySelector('.live-icon')).toBeNull();
  });

  it('workspace.setPanelIcon does the same from outside the panel', () => {
    const ws = mount();
    act(() => { ws.setPanelIcon('a', <b className="outside-icon" />); });
    expect(tabIcon()?.querySelector('.outside-icon')).not.toBeNull();
  });

  it('the icon is never saved, and a loaded layout keeps it for a panel that is still open', () => {
    const ws = mount();
    act(() => { handle!.setIcon(<b className="live-icon" />); });
    const saved = ws.saveLayout();
    expect(JSON.parse(saved).panels.a).not.toHaveProperty('icon');
    act(() => { ws.loadLayout(saved); });
    expect(tabIcon()?.querySelector('.live-icon')).not.toBeNull();
  });

  it('setting the icon a panel already has changes nothing', () => {
    const ws = mount();
    const icon = <b className="live-icon" />;
    act(() => { handle!.setIcon(icon); });
    const before = ws._core.getSnapshot();
    act(() => { handle!.setIcon(icon); });
    expect(ws._core.getSnapshot()).toBe(before);
  });
});
