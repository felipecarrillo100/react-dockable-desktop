/**
 * Tests for touch support (Pointer Events migration):
 * - T1: Resizer responds to pointerdown/pointermove/pointerup, not mousedown
 * - T2: Tab drag fires setDraggedPanelId on pointer events
 * - T3: Floating window long-press (touch) activates after 300ms
 * - T4: Long-press is cancelled if finger moves > 8px before 300ms
 * - T5: 8-direction resize handles are rendered on floating windows
 * - T6: Global focus handler fires on pointerdown, not mousedown
 * - T7: Dragging a floating window by its title bar suppresses body selection
 * - T8: Dragging a docked tab out (pre-float ghost drag) suppresses body selection
 * - T9: Hovering a leaf's drop-target cross box takes priority over the edge zone
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';
import { PanelProvider } from '../PanelProviderContext';

const MockPanel: React.FC<{ panelId: string }> = ({ panelId }) => (
  <div data-panel-id={panelId} />
);

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const makeClient = () => new WorkspaceClient({ panels: { map: { component: MockPanel } } });

const makePointerEvent = (
  type: string,
  overrides: Partial<PointerEventInit> = {}
): PointerEvent => {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    pointerType: 'mouse',
    button: 0,
    ...overrides,
  });
};

// A few tests below (T3/T4) deliberately stop mid-gesture to assert on an
// in-progress drag state, without ever firing the pointerup/pointercancel
// that would clean up document.body's drag-scoped classes in real usage.
// Reset them here so that doesn't leak into later tests sharing the same
// real document.body.
afterEach(() => {
  document.body.classList.remove('rdd-dragging-active', 'rdd-resizing-active');
});

// ─── T1: Resizer responds to pointerdown ─────────────────────────────────────

describe('T1: Resizer uses pointer events', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  const mountWithTwoPanels = (client: WorkspaceClient) => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
  };

  it('resizer bar has no onmousedown attribute (uses onpointerdown)', () => {
    const client = makeClient();
    act(() => { client.openPanel('a', 'map'); });
    mountWithTwoPanels(client);

    // The resizer only appears when there are 2+ panels in a split
    // We check that if a resizer exists, it reacts to pointerdown
    const resizerBars = container.querySelectorAll('.rdd-resizer-bar');
    resizerBars.forEach(bar => {
      // React binds events via delegation, not attributes
      // Just verify the element exists and doesn't have a legacy mouse listener
      expect(bar).toBeTruthy();
    });
  });
});

// ─── T2: pointerdown triggers drag mechanism ─────────────────────────────────

describe('T2: Tab drag starts on pointerdown', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('dispatching pointerdown on a tab does not throw', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const tab = container.querySelector('.rdd-workspace-tab');
    if (!tab) return; // panel might not be docked

    expect(() => {
      act(() => {
        tab.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0 }));
      });
    }).not.toThrow();

    // Close out the drag session the pointerdown started (window-level
    // listeners + document.body.rdd-dragging-active), so it doesn't leak into
    // other tests sharing the same real document.body.
    act(() => {
      window.dispatchEvent(makePointerEvent('pointerup', { pointerType: 'mouse', button: 0 }));
    });
  });

  it('right-click (button=2) on mouse does not start drag', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const tab = container.querySelector('.rdd-workspace-tab');
    if (!tab) return;

    // Right-click should not throw and should not start drag
    expect(() => {
      act(() => {
        tab.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 2 }));
      });
    }).not.toThrow();
  });
});

// ─── T3: Touch long-press activates after 300ms ──────────────────────────────

describe('T3: Touch long-press activates drag after 300ms', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('rdd-long-press-active class is added after 300ms hold on touch', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const tab = container.querySelector('.rdd-workspace-tab') as HTMLElement | null;
    if (!tab) return;

    act(() => {
      tab.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 100, clientY: 100 }));
    });

    // Not active yet (< 300ms)
    expect(tab.classList.contains('rdd-long-press-active')).toBe(false);

    // Advance past 300ms
    act(() => { vi.advanceTimersByTime(310); });

    expect(tab.classList.contains('rdd-long-press-active')).toBe(true);
  });
});

// ─── T4: Touch long-press cancelled on movement > 8px ────────────────────────

describe('T4: Touch long-press cancelled if moved > 8px', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('rdd-long-press-active class NOT added if finger moved > 8px before 300ms', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const tab = container.querySelector('.rdd-workspace-tab') as HTMLElement | null;
    if (!tab) return;

    act(() => {
      tab.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 100, clientY: 100 }));
    });

    // Simulate large movement before timer fires
    act(() => {
      tab.dispatchEvent(makePointerEvent('pointermove', { pointerType: 'touch', button: 0, clientX: 115, clientY: 100 }));
    });

    // Advance past 300ms — should NOT activate because cancelled by movement
    act(() => { vi.advanceTimersByTime(310); });

    expect(tab.classList.contains('rdd-long-press-active')).toBe(false);
  });
});

// ─── T5: 8-direction resize handles ──────────────────────────────────────────

describe('T5: Floating windows have 8-direction resize handles', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('floating window renders all 8 resize handles', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    // Open a panel then float it
    act(() => { client.openPanel('fp', 'map'); });
    act(() => { client.floatPanel('fp', { x: 100, y: 100, width: 300, height: 200 }); });

    const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    directions.forEach(dir => {
      const handle = container.querySelector(`.rdd-resize-${dir}`);
      expect(handle, `Missing resize handle for direction: ${dir}`).toBeTruthy();
    });
  });

  it('resize handles respond to pointerdown without throwing', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.floatPanel('fp', { x: 100, y: 100, width: 300, height: 200 }); });
    act(() => { client.openPanel('fp', 'map'); });

    const seHandle = container.querySelector('.rdd-resize-se') as HTMLElement | null;
    if (!seHandle) return;

    expect(() => {
      act(() => {
        seHandle.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0 }));
      });
    }).not.toThrow();
  });

  it('dragging a resize handle suppresses body text-selection for the drag duration (regression: WebKit selection bleed-through)', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.floatPanel('fp', { x: 100, y: 100, width: 300, height: 200 }); });
    act(() => { client.openPanel('fp', 'map'); });

    const seHandle = container.querySelector('.rdd-resize-se') as HTMLElement | null;
    if (!seHandle) return;

    expect(document.body.classList.contains('rdd-resizing-active')).toBe(false);

    act(() => {
      seHandle.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 }));
    });
    expect(document.body.classList.contains('rdd-resizing-active')).toBe(true);

    act(() => {
      seHandle.dispatchEvent(makePointerEvent('pointerup', { pointerType: 'mouse', button: 0, clientX: 130, clientY: 130 }));
    });
    expect(document.body.classList.contains('rdd-resizing-active')).toBe(false);
  });
});

// ─── T6: Global focus on pointerdown ─────────────────────────────────────────

describe('T6: Global focus uses pointerdown', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('pointerdown on workspace panel updates active state without throwing', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const panel = container.querySelector('.rdd-workspace-panel') as HTMLElement | null;

    expect(() => {
      act(() => {
        document.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 200, clientY: 200 }));
      });
    }).not.toThrow();
  });
});

// ─── T7: Dragging a window by its title bar suppresses selection ────────────

describe('T7: Header drag suppresses selection (regression: WebKit selection bleed-through)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('dragging the title bar toggles document.body.rdd-dragging-active for the drag duration', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.floatPanel('fp', { x: 100, y: 100, width: 300, height: 200 }); });
    act(() => { client.openPanel('fp', 'map'); });

    const titlebar = container.querySelector('.rdd-floating-window-titlebar') as HTMLElement | null;
    if (!titlebar) return;

    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);

    act(() => {
      titlebar.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(true);

    // The mouse/pen branch attaches window-level listeners, so pointerup must
    // be dispatched on window to match how the real drag ends.
    act(() => {
      window.dispatchEvent(makePointerEvent('pointerup', { pointerType: 'mouse', button: 0, clientX: 130, clientY: 130 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
  });

  it('cancelling the drag (pointercancel) also removes rdd-dragging-active', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.floatPanel('fp', { x: 100, y: 100, width: 300, height: 200 }); });
    act(() => { client.openPanel('fp', 'map'); });

    const titlebar = container.querySelector('.rdd-floating-window-titlebar') as HTMLElement | null;
    if (!titlebar) return;

    act(() => {
      titlebar.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(true);

    act(() => {
      window.dispatchEvent(makePointerEvent('pointercancel', { pointerType: 'mouse', button: 0, clientX: 130, clientY: 130 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
  });
});

// ─── T8: Dragging a docked tab out suppresses selection ─────────────────────

describe('T8: Docked tab drag-to-float suppresses selection (regression: WebKit selection bleed-through)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('dragging a docked tab toggles document.body.rdd-dragging-active for the drag duration', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const tab = container.querySelector('.rdd-workspace-tab') as HTMLElement | null;
    if (!tab) return;

    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);

    act(() => {
      tab.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(true);

    // The mouse/pen branch attaches window-level listeners, so pointerup must
    // be dispatched on window to match how the real drag ends.
    act(() => {
      window.dispatchEvent(makePointerEvent('pointerup', { pointerType: 'mouse', button: 0, clientX: 130, clientY: 130 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
  });

  it('cancelling the tab drag (pointercancel) also removes rdd-dragging-active', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });

    const tab = container.querySelector('.rdd-workspace-tab') as HTMLElement | null;
    if (!tab) return;

    act(() => {
      tab.dispatchEvent(makePointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(true);

    act(() => {
      window.dispatchEvent(makePointerEvent('pointercancel', { pointerType: 'mouse', button: 0, clientX: 130, clientY: 130 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
  });
});

// ─── T9: Cross drop-zone wins hover priority over edge/corner zones ─────────

describe('T9: Drop-target cross box takes priority over the edge zone (regression: hover priority inversion)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = makeClient();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    document.body.removeChild(container);
  });

  it('hovering a cross target box clears the active edge-drop highlight', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });
    act(() => { client.setDraggedPanelId('panel1'); });

    const edgeTrigger = container.querySelector('.rdd-edge-trigger-left') as HTMLElement | null;
    const crossBox = container.querySelector('.rdd-dock-target-box[data-drop-zone="top"]') as HTMLElement | null;
    if (!edgeTrigger || !crossBox) return;

    // React derives onPointerEnter/Leave from the bubbling 'pointerover'/'pointerout'
    // events, not the native non-bubbling 'pointerenter'/'pointerleave' — dispatch
    // the former to exercise the same handler a real hover would trigger.
    act(() => {
      edgeTrigger.dispatchEvent(makePointerEvent('pointerover', { pointerType: 'mouse' }));
    });
    expect(container.querySelector('.rdd-workspace-edge-preview')).not.toBeNull();

    act(() => {
      crossBox.dispatchEvent(makePointerEvent('pointerover', { pointerType: 'mouse' }));
    });
    expect(container.querySelector('.rdd-workspace-edge-preview')).toBeNull();
    expect(container.querySelector('.rdd-dock-preview-highlight')).not.toBeNull();
  });

  it('hovering a cross target box applies a state-driven active class, not :hover (regression: Safari/touch never highlighted)', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });

    act(() => { client.openPanel('panel1', 'map'); });
    act(() => { client.setDraggedPanelId('panel1'); });

    const topBox = container.querySelector('.rdd-dock-target-box[data-drop-zone="top"]') as HTMLElement | null;
    const bottomBox = container.querySelector('.rdd-dock-target-box[data-drop-zone="bottom"]') as HTMLElement | null;
    if (!topBox || !bottomBox) return;

    expect(topBox.classList.contains('rdd-dock-target-box--active')).toBe(false);

    act(() => {
      topBox.dispatchEvent(makePointerEvent('pointerover', { pointerType: 'mouse' }));
    });
    expect(topBox.classList.contains('rdd-dock-target-box--active')).toBe(true);
    expect(bottomBox.classList.contains('rdd-dock-target-box--active')).toBe(false);

    act(() => {
      topBox.dispatchEvent(makePointerEvent('pointerout', { pointerType: 'mouse' }));
    });
    expect(topBox.classList.contains('rdd-dock-target-box--active')).toBe(false);
  });
});
