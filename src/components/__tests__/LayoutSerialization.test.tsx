import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelRegistry } from '../PanelRegistry';

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
});
