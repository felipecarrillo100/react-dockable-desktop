import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';

const MockPanel: React.FC<{ panelId: string }> = ({ panelId }) => (
  <div className="mock-panel" data-panel-id={panelId}>
    Content for {panelId}
  </div>
);

// Standard 2-leaf layout: needed for the stress test that targets group-left-top/bottom by ID.
const STANDARD_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'vertical',
    sizes: [0.75, 0.25],
    children: [
      { type: 'leaf', id: 'group-left-top',    panels: [], activePanelId: null, keepOnEmpty: true },
      { type: 'leaf', id: 'group-left-bottom', panels: [], activePanelId: null, keepOnEmpty: true },
    ],
  },
  floating: [],
  minimized: [],
  panels: {},
});

let client: WorkspaceClient;
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
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    consoleErrors = [];
    consoleWarnings = [];
    client = new WorkspaceClient({
      panels: {
        map:    { component: MockPanel },
        editor: { component: MockPanel },
      },
      initialState: STANDARD_LAYOUT,
    });

    errorSpy = vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
      if (typeof msg === 'string' && msg.includes('testing environment is not configured to support act')) {
        return;
      }
      consoleErrors.push(String(msg));
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((msg: unknown) => {
      consoleWarnings.push(String(msg));
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

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <StateExtractor />
            <WindowManager />
          </PanelProvider>
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
              'map-view':    { id: 'map-view',    title: 'Map View',    component: 'map',    state: 'docked' },
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

    act(() => {
      lastActions.openPanel('stress-panel', 'editor', { initialTarget: 'docked' });
    });

    const portalDivs = document.body.querySelectorAll('[data-panel-id="stress-panel"]');
    expect(portalDivs.length).toBeGreaterThan(0);
    const targetEl = portalDivs[0];

    const input = document.createElement('input');
    input.value = 'preserve-me';
    targetEl.appendChild(input);

    act(() => {
      lastActions.movePanelOrder('stress-panel', 'group-left-bottom', 0);
    });
    expect(lastState.panels['stress-panel'].state).toBe('docked');
    expect(lastState.gridRoot.children[1].panels).toContain('stress-panel');
    expect(input.value).toBe('preserve-me');

    act(() => {
      lastActions.floatPanel('stress-panel');
    });
    expect(lastState.panels['stress-panel'].state).toBe('floating');
    expect(lastState.floating.some((w: any) => w.id === 'stress-panel')).toBe(true);
    expect(input.value).toBe('preserve-me');

    act(() => {
      lastActions.dockPanelToGroup('stress-panel', 'group-left-top', 'center');
    });
    expect(lastState.panels['stress-panel'].state).toBe('docked');
    expect(lastState.gridRoot.children[0].panels).toContain('stress-panel');
    expect(input.value).toBe('preserve-me');

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
    expect(document.body.querySelectorAll('[data-panel-id="disposable-panel"]').length).toBe(0);
  });
});
