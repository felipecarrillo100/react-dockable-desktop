import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';

const MockPanel: React.FC<{ panelId: string }> = ({ panelId }) => (
  <div className="mock-panel" data-panel-id={panelId}>
    Content for {panelId}
  </div>
);

PanelRegistry.register('map', MockPanel);
PanelRegistry.register('editor', MockPanel);

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('WindowManager DOM Stability & Preservation', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let consoleErrors: string[] = [];
  let consoleWarnings: string[] = [];
  let errorSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    consoleErrors = [];
    consoleWarnings = [];

    // Capture console errors/warnings to assert zero memory leak warnings (like setState on unmounted components)
    errorSpy = vi.spyOn(console, 'error').mockImplementation((msg) => {
      if (typeof msg === 'string' && msg.includes('testing environment is not configured to support act')) {
        return;
      }
      consoleErrors.push(msg);
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
      consoleWarnings.push(msg);
    });
  });

  afterEach(() => {
    if (root) {
      act(() => { root!.unmount(); });
    }
    if (container) {
      document.body.removeChild(container);
    }
    const preserved = document.getElementById('preserved-dom-container');
    if (preserved && preserved.parentNode) {
      preserved.parentNode.removeChild(preserved);
    }

    // Verify zero console errors and warnings (React warning logs on leaks, keys etc.)
    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <StateExtractor />
          <WindowManager />
        </WindowManagerProvider>
      );
    });
  };

  it('should not crash on grid reset (Regression Test for insertBefore issue)', () => {
    mount();
    expect(lastState).toBeDefined();

    const resetLayout = () => {
      act(() => {
        lastActions.loadLayout(
          JSON.stringify({
            gridRoot: {
              type: 'leaf',
              id: 'new-root',
              panels: ['map-view', 'editor-view'],
              activePanelId: 'map-view',
            },
            floating: [],
            minimized: [],
            panels: {
              'map-view': { id: 'map-view', title: 'Map View', component: 'map', state: 'docked' },
              'editor-view': { id: 'editor-view', title: 'Editor View', component: 'editor', state: 'docked' },
            },
          })
        );
      });
    };

    expect(() => {
      resetLayout();
      resetLayout();
      resetLayout();
    }).not.toThrow();
  });

  it('should preserve DOM state and not crash when a panel is sequentially moved, floated, docked, and grid is reset', () => {
    mount();

    // 1. Spawn a panel and insert some custom state into its DOM input
    act(() => {
      lastActions.openPanel('stress-panel', 'editor', { initialTarget: 'docked' });
    });
    
    // Find the cached portal element for 'stress-panel' in cache
    const portalDivs = document.body.querySelectorAll('[data-panel-id="stress-panel"]');
    expect(portalDivs.length).toBeGreaterThan(0);
    const targetEl = portalDivs[0];

    // Set an input value to check if DOM state persists
    const input = document.createElement('input');
    input.value = 'preserve-me';
    targetEl.appendChild(input);

    // 2. Move to group-left-bottom (Validate layout change and DOM preservation)
    act(() => {
      lastActions.movePanelOrder('stress-panel', 'group-left-bottom', 0);
    });
    expect(lastState.panels['stress-panel'].state).toBe('docked');
    expect(lastState.gridRoot.children[1].panels).toContain('stress-panel');
    expect(input.value).toBe('preserve-me'); // Check state intact

    // 3. Float the panel (Validate floating state & position creation)
    act(() => {
      lastActions.floatPanel('stress-panel');
    });
    expect(lastState.panels['stress-panel'].state).toBe('floating');
    expect(lastState.floating.some((w: any) => w.id === 'stress-panel')).toBe(true);
    expect(input.value).toBe('preserve-me');

    // 4. Dock it back to group-left-top
    act(() => {
      lastActions.dockPanelToGroup('stress-panel', 'group-left-top', 'center');
    });
    expect(lastState.panels['stress-panel'].state).toBe('docked');
    expect(lastState.gridRoot.children[0].panels).toContain('stress-panel');
    expect(input.value).toBe('preserve-me');

    // 5. Reset the grid (Verify no insertBefore / removeChild crashes occur, state intact)
    act(() => {
      lastActions.loadLayout(JSON.stringify({
        gridRoot: {
          type: 'leaf',
          id: 'group-left-top',
          panels: ['stress-panel'],
          activePanelId: 'stress-panel'
        },
        floating: [],
        minimized: [],
        panels: {
          'stress-panel': { id: 'stress-panel', title: 'Editor', component: 'editor', state: 'docked' }
        }
      }));
    });
    expect(lastState.panels['stress-panel']).toBeDefined();
    expect(input.value).toBe('preserve-me');
  });

  it('should clean up cached DOM node when panel is permanently closed and leave no stray elements', () => {
    mount();
    act(() => {
      lastActions.openPanel('disposable-panel', 'map');
    });
    expect(lastState.panels['disposable-panel']).toBeDefined();
    expect(document.body.querySelectorAll('[data-panel-id="disposable-panel"]').length).toBe(1);

    act(() => {
      lastActions.closePanel('disposable-panel');
    });
    expect(lastState.panels['disposable-panel']).toBeUndefined();

    // Verify DOM node is fully removed from document body (no memory leaks in unmanaged DOM list)
    expect(document.body.querySelectorAll('[data-panel-id="disposable-panel"]').length).toBe(0);
  });
});
