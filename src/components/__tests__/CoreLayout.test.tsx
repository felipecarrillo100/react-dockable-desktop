import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;

const STANDARD_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'vertical',
    sizes: [0.75, 0.25],
    children: [
      { type: 'leaf', id: 'group-left-top', panels: ['main-map', 'main-editor'], activePanelId: 'main-map' },
      { type: 'leaf', id: 'group-left-bottom', panels: ['system-console'], activePanelId: 'system-console' },
    ],
  },
  floating: [],
  minimized: [],
  panels: {
    'main-map':      { id: 'main-map',      title: 'Main Map',     component: 'map',    state: 'docked' },
    'main-editor':   { id: 'main-editor',   title: 'Code Editor',  component: 'editor', state: 'docked' },
    'system-console':{ id: 'system-console',title: 'Console',      component: 'editor', state: 'docked' },
  },
});

let client: WorkspaceClient;
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
    client = new WorkspaceClient({
      panels: {
        map:    { component: MockPanel },
        editor: { component: MockPanel },
      },
      initialState: STANDARD_LAYOUT,
    });
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
        <WindowManagerProvider client={client}>
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
      lastActions.closePanel('main-editor');
    });
    expect(lastState.panels['main-editor']).toBeUndefined();
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
    expect(lastState.gridRoot.type).toBe('leaf');
    expect(lastState.gridRoot.id).toBe('group-left-bottom');
  });

  it('should retain empty leaf groups if keepOnEmpty is true', () => {
    mount();
    act(() => {
      const config = JSON.stringify({
        gridRoot: {
          type: 'branch',
          orientation: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            { type: 'leaf', id: 'group-top', panels: ['main-map'], activePanelId: 'main-map', keepOnEmpty: true },
            { type: 'leaf', id: 'group-bottom', panels: ['system-console'], activePanelId: 'system-console' },
          ],
        },
        floating: [],
        minimized: [],
        panels: {
          'main-map':       { id: 'main-map',       title: 'Main Map', component: 'map',    state: 'docked' },
          'system-console': { id: 'system-console', title: 'Console',  component: 'editor', state: 'docked' },
        },
      });
      lastActions.loadLayout(config);
    });

    act(() => {
      lastActions.closePanel('main-map');
    });

    expect(lastState.gridRoot.type).toBe('branch');
    expect(lastState.gridRoot.children[0].panels.length).toBe(0);
  });

  it('should focus correct panel when selecting tabs', () => {
    mount();
    act(() => {
      lastActions.openPanel('main-editor', 'editor');
    });
    expect(lastState.gridRoot.children[0].activePanelId).toBe('main-editor');
  });

  it('grid branch child wrappers set minWidth/minHeight:0 (prevents content from resizing siblings)', () => {
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
    // STANDARD_LAYOUT is a vertical branch with two leaf children — every rendered
    // grid-branch child wrapper must zero its automatic min-size on both axes, so a
    // leaf's content can never inflate its own or a sibling's rendered size (the bug
    // this guards: a docked panel resizing based on which internal tab/content it shows).
    const wrappers = container!.querySelectorAll('.workspace-panel');
    expect(wrappers.length).toBeGreaterThan(0);
    wrappers.forEach(leaf => {
      const wrapper = leaf.parentElement as HTMLElement;
      expect(wrapper.style.minWidth).toBe('0px');
      expect(wrapper.style.minHeight).toBe('0px');
    });
  });
});
