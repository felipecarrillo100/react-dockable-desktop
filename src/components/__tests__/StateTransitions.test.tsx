import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { WorkspaceClient } from '../../WorkspaceClient';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;
const NonDragPanel: React.FC = () => <div />;

// Standard 2-leaf layout. Provides group-left-top for the restore-fallback tests.
const STANDARD_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'vertical',
    sizes: [0.75, 0.25],
    children: [
      { type: 'leaf', id: 'group-left-top',    panels: [], activePanelId: null },
      { type: 'leaf', id: 'group-left-bottom', panels: [], activePanelId: null },
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

describe('WindowManager State Transitions', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    client = new WorkspaceClient({
      panels: {
        map:     { component: MockPanel },
        nondrag: { component: NonDragPanel, defaultOptions: { canDrag: false } },
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

  const transitionScenarios = [
    { start: 'docked', to: 'floating', then: 'docked' },
    { start: 'docked', to: 'minimized', then: 'docked' },
    { start: 'floating', to: 'minimized', then: 'floating' },
    { start: 'floating', to: 'docked', then: 'floating' },
  ];

  const variants = ['default', 'custom-title', 'keep-on-empty', 'can-close-false'];

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

      act(() => { lastActions.openPanel(panelId, 'map'); });
      act(() => { lastActions.minimizePanel(panelId); });
      expect(lastState.panels[panelId].state).toBe('minimized');

      act(() => { lastActions.closeLeafGroup('group-left-top'); });
      act(() => { lastActions.restorePanel(panelId); });

      expect(lastState.panels[panelId].state).toBe('floating');
    });

    it('should restore as docked fallback if leaf group ceased to exist but canDrag is false', () => {
      mount();
      const panelId = 'fallback-nondrag-panel';

      act(() => { lastActions.openPanel(panelId, 'nondrag'); });
      act(() => { lastActions.minimizePanel(panelId); });
      expect(lastState.panels[panelId].state).toBe('minimized');

      act(() => { lastActions.closeLeafGroup('group-left-top'); });
      act(() => { lastActions.restorePanel(panelId); });

      expect(lastState.panels[panelId].state).toBe('docked');
    });
  });

  describe('openPanel() activation (focus) behavior', () => {
    it('sets activePanelId when opening a brand-new docked panel', () => {
      mount();
      expect(lastState.activePanelId).toBeNull();
      act(() => { lastActions.openPanel('new-docked', 'map'); });
      expect(lastState.activePanelId).toBe('new-docked');
    });

    it('sets activePanelId when opening a brand-new floating panel', () => {
      mount();
      act(() => { lastActions.openPanel('new-floating', 'map', { initialTarget: 'floating' }); });
      expect(lastState.activePanelId).toBe('new-floating');
    });

    it('sets activePanelId when opening (restoring) an already-minimized panel', () => {
      mount();
      act(() => { lastActions.openPanel('to-minimize', 'map'); });
      act(() => { lastActions.minimizePanel('to-minimize'); });
      act(() => { lastActions.openPanel('other', 'map'); }); // steal focus away first
      expect(lastState.activePanelId).toBe('other');

      act(() => { lastActions.openPanel('to-minimize', 'map'); }); // re-open the minimized one
      expect(lastState.panels['to-minimize'].state).not.toBe('minimized');
      expect(lastState.activePanelId).toBe('to-minimize');
    });

    it('sets activePanelId when re-opening an already-open docked panel', () => {
      mount();
      act(() => { lastActions.openPanel('docked-a', 'map'); });
      act(() => { lastActions.openPanel('docked-b', 'map'); });
      expect(lastState.activePanelId).toBe('docked-b');

      act(() => { lastActions.openPanel('docked-a', 'map'); }); // re-open the first one
      expect(lastState.activePanelId).toBe('docked-a');
    });

    it('{ focus: false } opens the panel without changing activePanelId', () => {
      mount();
      act(() => { lastActions.openPanel('already-active', 'map'); });
      expect(lastState.activePanelId).toBe('already-active');

      act(() => { lastActions.openPanel('background-panel', 'map', { focus: false }); });
      expect(lastState.panels['background-panel']).toBeDefined();
      expect(lastState.activePanelId).toBe('already-active'); // unchanged
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
