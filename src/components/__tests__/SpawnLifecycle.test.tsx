import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelRegistry } from '../PanelRegistry';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;
PanelRegistry.register('map', MockPanel);
PanelRegistry.register('help', MockPanel, { initialTarget: 'floating' });
PanelRegistry.register('noclose', MockPanel, { canClose: false });

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

describe('WindowManager Panel Spawning & Lifecycle', () => {
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

  it('should spawn a new panel into the grid layout', () => {
    mount();
    act(() => {
      lastActions.openPanel('new-map-instance', 'map', { initialTarget: 'docked' });
    });
    expect(lastState.panels['new-map-instance']).toBeDefined();
    expect(lastState.panels['new-map-instance'].state).toBe('docked');
  });

  it('should spawn a new panel in floating state', () => {
    mount();
    act(() => {
      lastActions.openPanel('floating-help', 'help');
    });
    expect(lastState.panels['floating-help']).toBeDefined();
    expect(lastState.panels['floating-help'].state).toBe('floating');
    expect(lastState.floating.some(w => w.id === 'floating-help')).toBe(true);
  });

  it('should prevent closing panels that are marked canClose: false', () => {
    mount();
    act(() => {
      lastActions.openPanel('permanent-panel', 'noclose');
    });
    expect(lastState.panels['permanent-panel']).toBeDefined();

    act(() => {
      lastActions.closePanel('permanent-panel');
    });
    // Panel should still exist
    expect(lastState.panels['permanent-panel']).toBeDefined();
  });

  it('should correctly format object titles using defaultMessage fallbacks', () => {
    mount();
    act(() => {
      lastActions.openPanel('predefined-title-panel', 'map', {
        title: { id: 'some-id', defaultMessage: 'Predefined Title' }
      });
    });
    expect(lastState.panels['predefined-title-panel'].title).toEqual({
      id: 'some-id',
      defaultMessage: 'Predefined Title'
    });
  });

  it('should support closing empty groups', () => {
    mount();
    // Setup empty keepOnEmpty group
    act(() => {
      const initialConfig = JSON.stringify({
        gridRoot: {
          type: 'branch',
          orientation: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            { type: 'leaf', id: 'group-top', panels: [], activePanelId: null, keepOnEmpty: true },
            { type: 'leaf', id: 'group-bottom', panels: ['system-console'], activePanelId: 'system-console' }
          ]
        },
        floating: [],
        minimized: [],
        panels: {
          'system-console': { id: 'system-console', title: 'Console', component: 'map', state: 'docked' }
        }
      });
      lastActions.loadLayout(initialConfig);
    });

    act(() => {
      lastActions.closeLeafGroup('group-top');
    });

    // Top leaf group closed completely, only bottom left group remains
    expect(lastState.gridRoot.type).toBe('leaf');
    expect(lastState.gridRoot.id).toBe('group-bottom');
  });
});
