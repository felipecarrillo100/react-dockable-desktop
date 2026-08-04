import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelRegistry } from '../PanelRegistry';
import { WorkspaceClient } from '../../WorkspaceClient';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;
PanelRegistry.register('map', MockPanel);
PanelRegistry.register('editor', MockPanel);

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

describe('Layout Serialization (saveLayout / loadLayout)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });
  };

  it('saveLayout returns a valid JSON string', () => {
    mount();
    const json = lastActions.saveLayout();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('saved JSON contains gridRoot, floating, minimized, and panels keys', () => {
    mount();
    const snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot).toHaveProperty('gridRoot');
    expect(snapshot).toHaveProperty('floating');
    expect(snapshot).toHaveProperty('minimized');
    expect(snapshot).toHaveProperty('panels');
  });

  it('loadLayout restores panels that were open before save', () => {
    mount();
    act(() => { lastActions.openPanel('ser-map', 'map', { title: 'Serialized Map' }); });

    const snapshot = lastActions.saveLayout();
    act(() => { lastActions.closePanel('ser-map'); });
    expect(lastState.panels['ser-map']).toBeUndefined();

    act(() => { lastActions.loadLayout(snapshot); });
    expect(lastState.panels['ser-map']).toBeDefined();
    expect(lastState.panels['ser-map'].title).toBe('Serialized Map');
  });

  it('loadLayout restores floating windows with correct position', () => {
    mount();
    act(() => {
      lastActions.openPanel('ser-float', 'map', {
        initialTarget: 'floating',
        title: 'Float Panel',
      });
    });

    act(() => {
      lastActions.updateFloatingPosition('ser-float', { x: 123, y: 456, width: 300, height: 200 });
    });

    const snapshot = lastActions.saveLayout();
    act(() => { lastActions.closePanel('ser-float'); });

    act(() => { lastActions.loadLayout(snapshot); });

    const win = lastState.floating.find((w: any) => w.id === 'ser-float');
    expect(win).toBeDefined();
    expect(win.x).toBe(123);
    expect(win.y).toBe(456);
    expect(win.width).toBe(300);
    expect(win.height).toBe(200);
  });

  it('loadLayout replaces the entire workspace (old panels not in snapshot are gone)', () => {
    mount();
    act(() => { lastActions.openPanel('old-panel', 'editor', { title: 'Old' }); });
    expect(lastState.panels['old-panel']).toBeDefined();

    const freshLayout = JSON.stringify({
      gridRoot: {
        type: 'leaf',
        id: 'fresh-leaf',
        panels: ['new-panel'],
        activePanelId: 'new-panel',
      },
      floating: [],
      minimized: [],
      panels: {
        'new-panel': { id: 'new-panel', title: 'New', component: 'map', state: 'docked' },
      },
    });

    act(() => { lastActions.loadLayout(freshLayout); });

    expect(lastState.panels['old-panel']).toBeUndefined();
    expect(lastState.panels['new-panel']).toBeDefined();
  });

  it('saveLayout round-trip preserves split sizes', () => {
    mount();
    // Establish a branch layout first — updateSplitSizes is a no-op on a leaf root.
    act(() => {
      lastActions.loadLayout(JSON.stringify({
        gridRoot: {
          type: 'branch', orientation: 'vertical', sizes: [0.5, 0.5],
          children: [
            { type: 'leaf', id: 'top',    panels: [], activePanelId: null },
            { type: 'leaf', id: 'bottom', panels: [], activePanelId: null },
          ],
        },
        floating: [], minimized: [], panels: {},
      }));
    });
    act(() => { lastActions.updateSplitSizes([], [0.3, 0.7]); });

    const snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.gridRoot.sizes).toEqual([0.3, 0.7]);

    act(() => { lastActions.loadLayout(JSON.stringify(snapshot)); });
    expect(lastState.gridRoot.sizes).toEqual([0.3, 0.7]);
  });

  it('saveLayout includes minimized panels', () => {
    mount();
    act(() => { lastActions.openPanel('min-panel', 'map', { title: 'Minimized' }); });
    act(() => { lastActions.minimizePanel('min-panel'); });
    expect(lastState.minimized.some((m: any) => m.id === 'min-panel')).toBe(true);

    const snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.minimized.some((m: any) => m.id === 'min-panel')).toBe(true);
  });

  it('loadLayout restores minimized panels to the taskbar', () => {
    mount();
    act(() => { lastActions.openPanel('min-restore', 'map', { title: 'Min Restore' }); });
    act(() => { lastActions.minimizePanel('min-restore'); });

    const snapshot = lastActions.saveLayout();
    act(() => { lastActions.closePanel('min-restore'); });

    act(() => { lastActions.loadLayout(snapshot); });
    expect(lastState.minimized.some((m: any) => m.id === 'min-restore')).toBe(true);
    expect(lastState.panels['min-restore'].state).toBe('minimized');
  });

  it('multiple save-restore cycles are stable and idempotent', () => {
    mount();
    act(() => { lastActions.openPanel('cycle-panel', 'editor', { title: 'Cycle' }); });

    const snap1 = lastActions.saveLayout();
    act(() => { lastActions.loadLayout(snap1); });

    const snap2 = lastActions.saveLayout();
    act(() => { lastActions.loadLayout(snap2); });

    expect(lastState.panels['cycle-panel']).toBeDefined();
    expect(JSON.parse(snap1).panels['cycle-panel'].title)
      .toBe(JSON.parse(snap2).panels['cycle-panel'].title);
  });

  it('saveLayout stamps a version field', () => {
    mount();
    const snapshot = JSON.parse(lastActions.saveLayout());
    // v2: panels may carry `props`/`dedupeKey`, and the payload may omit panels the live
    // workspace still has open (see the "excludes non-serializable panels" tests below).
    expect(snapshot.version).toBe(2);
  });

  it('openPanel props round-trip through saveLayout/loadLayout', () => {
    mount();
    act(() => {
      lastActions.openPanel('props-panel', 'map', { title: 'Props Panel', props: { filename: 'a.md', count: 3 } });
    });
    expect(lastState.panels['props-panel'].props).toEqual({ filename: 'a.md', count: 3 });
    expect(lastState.panels['props-panel'].serializable).toBe(true);

    const snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['props-panel'].props).toEqual({ filename: 'a.md', count: 3 });

    act(() => { lastActions.closePanel('props-panel'); });
    act(() => { lastActions.loadLayout(JSON.stringify(snapshot)); });
    expect(lastState.panels['props-panel'].props).toEqual({ filename: 'a.md', count: 3 });
  });

  it('a panel with no props at all is serializable by default', () => {
    mount();
    act(() => { lastActions.openPanel('no-props-panel', 'map', { title: 'No Props' }); });
    expect(lastState.panels['no-props-panel'].serializable).toBe(true);
    expect(lastState.panels['no-props-panel'].props).toBeUndefined();
  });

  it('a panel opened with non-serializable props is excluded from saveLayout, pruned from ' +
    'gridRoot/floating/minimized, but keeps existing live and unaffected', () => {
    mount();
    act(() => {
      lastActions.openPanel('fn-panel', 'map', {
        title: 'Fn Panel',
        initialTarget: 'floating',
        props: { onSave: () => {} },
      });
    });
    expect(lastState.panels['fn-panel'].serializable).toBe(false);
    expect(lastState.floating.some((w: any) => w.id === 'fn-panel')).toBe(true);

    const snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['fn-panel']).toBeUndefined();
    expect(snapshot.floating.some((w: any) => w.id === 'fn-panel')).toBe(false);

    // The live, on-screen workspace must be completely unaffected by computing a save.
    expect(lastState.panels['fn-panel']).toBeDefined();
    expect(lastState.floating.some((w: any) => w.id === 'fn-panel')).toBe(true);
  });

  it('publishes layout:panels-excluded only when a save actually excludes something', () => {
    mount();
    const excludedCalls: any[] = [];
    lastActions.subscribe('layout:panels-excluded', (data: any) => excludedCalls.push(data));

    act(() => { lastActions.openPanel('clean-panel', 'map', { props: { ok: true } }); });
    lastActions.saveLayout();
    expect(excludedCalls.length).toBe(0);

    act(() => {
      lastActions.openPanel('bad-panel', 'editor', { props: { onSave: () => {} } });
    });
    lastActions.saveLayout();
    expect(excludedCalls.length).toBe(1);
    expect(excludedCalls[0].panels).toEqual([{ id: 'bad-panel', component: 'editor' }]);
  });

  it('dedupeKey redirects to an already-open panel of the same component instead of duplicating', () => {
    mount();
    act(() => {
      lastActions.openPanel('doc-1', 'map', { title: 'Doc', props: { path: '/a.md' }, dedupeKey: '/a.md' });
    });
    act(() => {
      lastActions.openPanel('doc-2', 'map', { title: 'Doc Again', dedupeKey: '/a.md' });
    });

    expect(lastState.panels['doc-2']).toBeUndefined();
    expect(lastState.panels['doc-1']).toBeDefined();
    expect(lastState.panels['doc-1'].title).toBe('Doc'); // the second call's title/props are ignored
    expect(Object.keys(lastState.panels).length).toBe(1);
    expect(lastActions.findPanelId('map', '/a.md')).toBe('doc-1');
  });

  it('registerStateProvider is pulled fresh on every saveLayout call, overriding static props', () => {
    mount();
    act(() => { lastActions.openPanel('dyn-panel', 'map', { props: { initial: true } }); });

    let currentValue: unknown = { scrollLine: 1 };
    act(() => { lastActions.registerStateProvider('dyn-panel', () => currentValue); });

    let snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['dyn-panel'].props).toEqual({ scrollLine: 1 });

    currentValue = { scrollLine: 42 };
    snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['dyn-panel'].props).toEqual({ scrollLine: 42 });

    // Serializability is re-evaluated per save, not cached — a provider can flip a panel's
    // exclusion status from one save to the next.
    currentValue = { onSave: () => {} };
    snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['dyn-panel']).toBeUndefined();

    currentValue = { scrollLine: 7 };
    snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['dyn-panel'].props).toEqual({ scrollLine: 7 });

    act(() => { lastActions.unregisterStateProvider('dyn-panel'); });
    snapshot = JSON.parse(lastActions.saveLayout());
    expect(snapshot.panels['dyn-panel'].props).toEqual({ initial: true }); // falls back to static props
  });

  it('loadLayout accepts a legacy layout with no version field at all', () => {
    mount();
    const legacyLayout = JSON.stringify({
      gridRoot: { type: 'leaf', id: 'legacy-leaf', panels: ['legacy-panel'], activePanelId: 'legacy-panel' },
      floating: [], minimized: [],
      panels: { 'legacy-panel': { id: 'legacy-panel', title: 'Legacy', component: 'map', state: 'docked' } },
    });
    act(() => { lastActions.loadLayout(legacyLayout); });
    expect(lastState.panels['legacy-panel']).toBeDefined();
  });

  it('loadLayout migrates legacy stickyRight/stickyBottom flags to anchor', () => {
    mount();
    const legacyLayout = JSON.stringify({
      gridRoot: { type: 'leaf', id: 'root', panels: [], activePanelId: null },
      floating: [
        { id: 'sticky-1', x: 10, y: 20, width: 300, height: 200, z: 1, stickyRight: true, stickyBottom: false },
      ],
      minimized: [], panels: {},
    });
    act(() => { lastActions.loadLayout(legacyLayout); });
    const win = lastState.floating.find((w: any) => w.id === 'sticky-1');
    expect(win.anchor).toBe('top-right');
    expect(win.stickyRight).toBeUndefined();
    expect(win.stickyBottom).toBeUndefined();
  });

  it('parseInitialState (via WorkspaceClient.initialState) migrates stickyRight/stickyBottom identically to loadLayout', () => {
    // Before this refactor, initialState bypassed the migration loadLayout applied —
    // this test locks in that both entry points now share the same code path.
    const legacyLayout = JSON.stringify({
      gridRoot: { type: 'leaf', id: 'root', panels: [], activePanelId: null },
      floating: [
        { id: 'sticky-initial', x: 10, y: 20, width: 300, height: 200, z: 1, stickyRight: true, stickyBottom: true },
      ],
      minimized: [], panels: {},
    });
    const client = new WorkspaceClient({ panels: { map: { component: MockPanel } }, initialState: legacyLayout });
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });
    const win = lastState.floating.find((w: any) => w.id === 'sticky-initial');
    expect(win.anchor).toBe('bottom-right');
    expect(win.stickyRight).toBeUndefined();
    expect(win.stickyBottom).toBeUndefined();
  });
});
