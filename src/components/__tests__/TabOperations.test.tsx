import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { WorkspaceClient } from '../../WorkspaceClient';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;

const STANDARD_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'vertical',
    sizes: [0.75, 0.25],
    children: [
      { type: 'leaf', id: 'group-left-top',    panels: ['main-map', 'main-editor'], activePanelId: 'main-map' },
      { type: 'leaf', id: 'group-left-bottom', panels: ['system-console'],          activePanelId: 'system-console' },
    ],
  },
  floating: [],
  minimized: [],
  panels: {
    'main-map':      { id: 'main-map',       title: 'Main Map',    component: 'map',    state: 'docked' },
    'main-editor':   { id: 'main-editor',    title: 'Code Editor', component: 'editor', state: 'docked' },
    'system-console':{ id: 'system-console', title: 'Console',     component: 'editor', state: 'docked' },
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

describe('WindowManager Tab Operations', () => {
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

  it('should change order of tabs in a group', () => {
    mount();
    expect(lastState.gridRoot.children[0].panels).toEqual(['main-map', 'main-editor']);

    act(() => {
      lastActions.movePanelOrder('main-map', 'group-left-top', 1);
    });

    expect(lastState.gridRoot.children[0].panels).toEqual(['main-editor', 'main-map']);
  });

  it('should split group by docking a panel to a specific side', () => {
    mount();
    act(() => {
      lastActions.dockPanelToGroup('main-editor', 'group-left-bottom', 'right');
    });

    const leftBottomBranch = lastState.gridRoot.children[1];
    expect(leftBottomBranch.type).toBe('branch');
    expect(leftBottomBranch.orientation).toBe('horizontal');
  });

  it('should support moving a tab to a different group', () => {
    mount();
    act(() => {
      lastActions.movePanelOrder('main-editor', 'group-left-bottom', 1);
    });

    expect(lastState.gridRoot.children[0].panels).not.toContain('main-editor');
    expect(lastState.gridRoot.children[1].panels).toContain('main-editor');
  });

  it('should support dragging custom header elements without errors', () => {
    mount();
    act(() => {
      lastState.draggedPanelId = 'main-map';
    });
    expect(lastState.draggedPanelId).toBe('main-map');
  });
});
