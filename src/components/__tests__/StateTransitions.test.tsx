import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelRegistry } from '../PanelRegistry';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;
PanelRegistry.register('map', MockPanel);

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

describe('WindowManager State Transitions', () => {
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

  const transitionScenarios = [
    { start: 'docked', to: 'floating', then: 'docked' },
    { start: 'docked', to: 'minimized', then: 'docked' },
    { start: 'floating', to: 'minimized', then: 'floating' },
    { start: 'floating', to: 'docked', then: 'floating' },
  ];

  const variants = ['default', 'custom-title', 'keep-on-empty', 'can-close-false'];

  // 4 scenarios * 4 variants = 16 core test cases covering transition stability
  transitionScenarios.forEach((scenario, sIdx) => {
    variants.forEach((variant) => {
      it(`[Scenario ${sIdx} - ${variant}] should transition panel from ${scenario.start} to ${scenario.to} then to ${scenario.then}`, () => {
        mount();
        const panelId = 'transition-panel';

        act(() => {
          lastActions.openPanel(panelId, 'map', {
            initialTarget: scenario.start as any,
            title: variant === 'custom-title' ? 'Custom Title' : undefined
          });
        });

        // Intermediate transition
        act(() => {
          if (scenario.to === 'floating') {
            lastActions.floatPanel(panelId);
          } else if (scenario.to === 'minimized') {
            lastActions.minimizePanel(panelId);
          } else if (scenario.to === 'docked') {
            lastActions.dockPanel(panelId);
          }
        });
        expect(lastState.panels[panelId].state).toBe(scenario.to);

        // Final transition
        act(() => {
          if (scenario.then === 'floating') {
            lastActions.floatPanel(panelId);
          } else if (scenario.then === 'minimized') {
            lastActions.minimizePanel(panelId);
          } else if (scenario.then === 'docked') {
            lastActions.dockPanel(panelId);
          }
        });
        expect(lastState.panels[panelId].state).toBe(scenario.then);
      });
    });
  });

  describe('Minimized restore fallback behavior', () => {
    it('should restore as floating if the original leaf group ceased to exist and canDrag is true', () => {
      mount();
      const panelId = 'fallback-test-panel';

      // 1. Open panel (docked by default)
      act(() => {
        lastActions.openPanel(panelId, 'map');
      });

      // 2. Minimize it
      act(() => {
        lastActions.minimizePanel(panelId);
      });
      expect(lastState.panels[panelId].state).toBe('minimized');

      // 3. Destroy the leaf group it belonged to
      act(() => {
        lastActions.closeLeafGroup('group-left-top');
      });

      // 4. Restore it
      act(() => {
        lastActions.restorePanel(panelId);
      });

      // 5. It should restore as floating
      expect(lastState.panels[panelId].state).toBe('floating');
    });

    it('should restore as docked fallback if leaf group ceased to exist but canDrag is false', () => {
      // Register a non-drag component
      const NonDragPanel: React.FC = () => <div />;
      PanelRegistry.register('nondrag', NonDragPanel, { canDrag: false });
      
      mount();
      const panelId = 'fallback-nondrag-panel';

      // 1. Open non-drag panel (docked by default)
      act(() => {
        lastActions.openPanel(panelId, 'nondrag');
      });

      // 2. Minimize it
      act(() => {
        lastActions.minimizePanel(panelId);
      });
      expect(lastState.panels[panelId].state).toBe('minimized');

      // 3. Destroy the leaf group it belonged to
      act(() => {
        lastActions.closeLeafGroup('group-left-top');
      });

      // 4. Restore it
      act(() => {
        lastActions.restorePanel(panelId);
      });

      // 5. It should restore as docked in the first available group
      expect(lastState.panels[panelId].state).toBe('docked');
    });
  });

  describe('Workspace outer edge drop zones', () => {
    it('should split the root branch horizontally when a panel is docked to the left edge', () => {
      mount();
      const panelId = 'edge-dock-left';
      act(() => { lastActions.openPanel(panelId, 'map'); });
      act(() => { lastActions.dockPanelToWorkspaceEdge(panelId, 'left'); });

      expect(lastState.gridRoot.type).toBe('branch');
      expect(lastState.gridRoot.orientation).toBe('horizontal');
      expect(lastState.gridRoot.children[0].type).toBe('leaf');
      expect(lastState.gridRoot.children[0].panels).toContain(panelId);
      expect(lastState.panels[panelId].state).toBe('docked');
    });

    it('should split the root branch horizontally when a panel is docked to the right edge', () => {
      mount();
      const panelId = 'edge-dock-right';
      act(() => { lastActions.openPanel(panelId, 'map'); });
      act(() => { lastActions.dockPanelToWorkspaceEdge(panelId, 'right'); });

      expect(lastState.gridRoot.type).toBe('branch');
      expect(lastState.gridRoot.orientation).toBe('horizontal');
      expect(lastState.gridRoot.children[1].type).toBe('leaf');
      expect(lastState.gridRoot.children[1].panels).toContain(panelId);
      expect(lastState.panels[panelId].state).toBe('docked');
    });

    it('should split the root branch vertically when a panel is docked to the top edge', () => {
      mount();
      const panelId = 'edge-dock-top';
      act(() => { lastActions.openPanel(panelId, 'map'); });
      act(() => { lastActions.dockPanelToWorkspaceEdge(panelId, 'top'); });

      expect(lastState.gridRoot.type).toBe('branch');
      expect(lastState.gridRoot.orientation).toBe('vertical');
      expect(lastState.gridRoot.children[0].type).toBe('leaf');
      expect(lastState.gridRoot.children[0].panels).toContain(panelId);
      expect(lastState.panels[panelId].state).toBe('docked');
    });

    it('should split the root branch vertically when a panel is docked to the bottom edge', () => {
      mount();
      const panelId = 'edge-dock-bottom';
      act(() => { lastActions.openPanel(panelId, 'map'); });
      act(() => { lastActions.dockPanelToWorkspaceEdge(panelId, 'bottom'); });

      expect(lastState.gridRoot.type).toBe('branch');
      expect(lastState.gridRoot.orientation).toBe('vertical');
      expect(lastState.gridRoot.children[1].type).toBe('leaf');
      expect(lastState.gridRoot.children[1].panels).toContain(panelId);
      expect(lastState.panels[panelId].state).toBe('docked');
    });
  });
});
