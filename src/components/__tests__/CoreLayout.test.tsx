import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
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

describe('WindowManager Core Layout Operations', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
  });

  afterEach(() => {
    if (root) {
      act(() => { root!.unmount(); });
    }
    if (container) {
      document.body.removeChild(container);
    }
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

  it('should initialize with default layout config', () => {
    mount();
    expect(lastState.gridRoot).toBeDefined();
    expect(lastState.panels['main-map']).toBeDefined();
  });

  it('should remove panel and normalize parent orientation structure', () => {
    mount();
    act(() => {
      // Close editor from group-left-top
      lastActions.closePanel('main-editor');
    });
    // main-editor should be deleted
    expect(lastState.panels['main-editor']).toBeUndefined();
    // group-left-top should still contain main-map
    expect(lastState.gridRoot.children[0].panels).toContain('main-map');
  });

  it('should support updating split sizes', () => {
    mount();
    act(() => {
      lastActions.updateSplitSizes([], [0.5, 0.5]);
    });
    expect(lastState.gridRoot.sizes).toEqual([0.5, 0.5]);
  });

  it('should auto-remove empty leaf groups if keepOnEmpty is false', () => {
    mount();
    act(() => {
      lastActions.closePanel('main-map');
      lastActions.closePanel('main-editor');
    });
    // Both left-top panels closed, leaf group-left-top should be removed, collapsing layout structure
    expect(lastState.gridRoot.type).toBe('leaf'); // Grid collapsed to single leaf group-left-bottom
    expect(lastState.gridRoot.id).toBe('group-left-bottom');
  });

  it('should retain empty leaf groups if keepOnEmpty is true', () => {
    mount();
    // Make group-left-top persist even when empty
    act(() => {
      const initialConfig = JSON.stringify({
        gridRoot: {
          type: 'branch',
          orientation: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            { type: 'leaf', id: 'group-top', panels: ['main-map'], activePanelId: 'main-map', keepOnEmpty: true },
            { type: 'leaf', id: 'group-bottom', panels: ['system-console'], activePanelId: 'system-console' }
          ]
        },
        floating: [],
        minimized: [],
        panels: {
          'main-map': { id: 'main-map', title: 'Main Map', component: 'map', state: 'docked' },
          'system-console': { id: 'system-console', title: 'Console', component: 'editor', state: 'docked' }
        }
      });
      lastActions.loadLayout(initialConfig);
    });

    act(() => {
      lastActions.closePanel('main-map');
    });

    // Top group is empty but must remain because keepOnEmpty is true
    expect(lastState.gridRoot.type).toBe('branch');
    expect(lastState.gridRoot.children[0].panels.length).toBe(0);
  });

  it('should focus correct panel when selecting tabs', () => {
    mount();
    act(() => {
      // Focus main-editor tab in left-top group
      lastActions.openPanel('main-editor', 'editor');
    });
    expect(lastState.gridRoot.children[0].activePanelId).toBe('main-editor');
  });
});
