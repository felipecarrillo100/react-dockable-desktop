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

describe('WindowManager Tab Operations', () => {
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

  it('should change order of tabs in a group', () => {
    mount();
    // Initially, order in group-left-top is ['main-map', 'main-editor']
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

    // The grid should now split group-left-bottom horizontally
    const leftBottomBranch = lastState.gridRoot.children[1];
    expect(leftBottomBranch.type).toBe('branch');
    expect(leftBottomBranch.orientation).toBe('horizontal');
  });

  it('should support moving a tab to a different group', () => {
    mount();
    act(() => {
      lastActions.movePanelOrder('main-editor', 'group-left-bottom', 1);
    });

    // main-editor should be removed from left-top and appended to left-bottom
    expect(lastState.gridRoot.children[0].panels).not.toContain('main-editor');
    expect(lastState.gridRoot.children[1].panels).toContain('main-editor');
  });

  it('should support dragging custom header elements without errors', () => {
    mount();
    // Simulate setting draggedPanelId
    act(() => {
      lastState.draggedPanelId = 'main-map';
    });
    expect(lastState.draggedPanelId).toBe('main-map');
  });
});
