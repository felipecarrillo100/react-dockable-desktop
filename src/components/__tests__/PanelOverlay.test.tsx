/**
 * Tests for the Panel Overlay system: PanelOverlayRoot, PanelToolbar,
 * PanelFloatingWindow, usePanelFloatingWindow, usePanelFloatingWindowManager.
 *
 * PO1:  PanelOverlayRoot renders .dw-panel-overlay-root container
 * PO2:  PanelFloatingWindow open=true renders .dw-panel-float in DOM
 * PO3:  PanelFloatingWindow open=false renders nothing
 * PO4:  Close button on a floating window triggers onClose callback
 * PO5:  PanelToolbar renders with the correct position modifier class
 * PO6:  usePanelFloatingWindow — open()/close() control window visibility
 * PO7:  usePanelFloatingWindowManager — openManaged/closeManaged/openIds
 * PO8:  usePanelFloatingWindowManager — closeAll() removes all managed windows
 * PO9:  Focused window gains .dw-panel-float--active after pointerdown
 * PO10: PanelToolbar does NOT re-render when window focus changes (PanelToolbarCtx isolation)
 * PO11: usePanelFloatingWindowManager consumer does NOT re-render on focus change (PanelManagerCtx isolation)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  PanelOverlayRoot,
  PanelToolbar,
  PanelFloatingWindow,
  usePanelFloatingWindow,
  usePanelFloatingWindowManager,
} from '../PanelOverlay';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  container.style.cssText = 'width:800px;height:600px;position:relative';
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); root = null; });
  if (document.body.contains(container)) document.body.removeChild(container);
});

// ─── PO1 ──────────────────────────────────────────────────────────────────────

describe('PO1: PanelOverlayRoot', () => {
  it('renders the overlay root container', () => {
    act(() => {
      root = createRoot(container);
      root.render(<PanelOverlayRoot><span /></PanelOverlayRoot>);
    });
    expect(container.querySelector('.dw-panel-overlay-root')).not.toBeNull();
  });
});

// ─── PO2 ──────────────────────────────────────────────────────────────────────

describe('PO2: PanelFloatingWindow open=true', () => {
  it('renders .dw-panel-float in the DOM', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="win-open" title="Open" open defaultAnchor="top-right" onClose={() => {}}>
            <span>content</span>
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    expect(container.querySelector('.dw-panel-float')).not.toBeNull();
  });
});

// ─── PO3 ──────────────────────────────────────────────────────────────────────

describe('PO3: PanelFloatingWindow open=false', () => {
  it('renders nothing when closed', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="win-closed" title="Closed" open={false} onClose={() => {}}>
            <span>content</span>
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    expect(container.querySelector('.dw-panel-float')).toBeNull();
  });
});

// ─── PO4 ──────────────────────────────────────────────────────────────────────

describe('PO4: Close button triggers onClose', () => {
  it('calls onClose when the close button is clicked', () => {
    let callCount = 0;
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow
            id="win-close-btn"
            title="Closeable"
            open
            defaultAnchor="top-right"
            onClose={() => { callCount++; }}
          >
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    const closeBtn = container.querySelector<HTMLButtonElement>('.dw-panel-float__close');
    expect(closeBtn).not.toBeNull();
    act(() => { closeBtn!.click(); });
    expect(callCount).toBe(1);
  });
});

// ─── PO5 ──────────────────────────────────────────────────────────────────────

describe('PO5: PanelToolbar position class', () => {
  it('renders .dw-panel-toolbar--top for position="top"', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelToolbar position="top"><button type="button">Tool</button></PanelToolbar>
        </PanelOverlayRoot>
      );
    });
    expect(container.querySelector('.dw-panel-toolbar--top')).not.toBeNull();
    expect(container.querySelector('.dw-panel-toolbar--bottom')).toBeNull();
  });

  it('renders .dw-panel-toolbar--bottom for position="bottom"', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelToolbar position="bottom"><button type="button">Tool</button></PanelToolbar>
        </PanelOverlayRoot>
      );
    });
    expect(container.querySelector('.dw-panel-toolbar--bottom')).not.toBeNull();
  });
});

// ─── PO6 ──────────────────────────────────────────────────────────────────────

describe('PO6: usePanelFloatingWindow', () => {
  let hook: ReturnType<typeof usePanelFloatingWindow> | null = null;

  const Harness: React.FC = () => {
    hook = usePanelFloatingWindow();
    return (
      <PanelOverlayRoot>
        <PanelFloatingWindow id="hook-win" title="Hooked" open={hook!.isOpen} defaultAnchor="top-right" onClose={hook!.close}>
          <span />
        </PanelFloatingWindow>
      </PanelOverlayRoot>
    );
  };

  it('isOpen starts false; open() makes window visible; close() hides it', () => {
    act(() => {
      root = createRoot(container);
      root.render(<Harness />);
    });
    expect(hook!.isOpen).toBe(false);
    expect(container.querySelector('.dw-panel-float')).toBeNull();

    act(() => { hook!.open(); });
    expect(hook!.isOpen).toBe(true);
    expect(container.querySelector('.dw-panel-float')).not.toBeNull();

    act(() => { hook!.close(); });
    expect(hook!.isOpen).toBe(false);
    expect(container.querySelector('.dw-panel-float')).toBeNull();
  });
});

// ─── PO7 ──────────────────────────────────────────────────────────────────────

describe('PO7: usePanelFloatingWindowManager — open / close', () => {
  let mgr: ReturnType<typeof usePanelFloatingWindowManager> | null = null;

  const ManagerProbe: React.FC = () => {
    mgr = usePanelFloatingWindowManager();
    return null;
  };

  beforeEach(() => {
    act(() => {
      root = createRoot(container);
      root.render(<PanelOverlayRoot><ManagerProbe /></PanelOverlayRoot>);
    });
  });

  it('starts with no open windows', () => {
    expect(mgr!.openIds).toEqual([]);
  });

  it('openManaged shows a window and updates openIds', () => {
    act(() => { mgr!.open('p1', { title: 'Panel 1', content: <span /> }); });
    expect(mgr!.openIds).toContain('p1');
    expect(mgr!.isOpen('p1')).toBe(true);
    expect(container.querySelector('.dw-panel-float')).not.toBeNull();
  });

  it('closeManaged removes a window and updates openIds', () => {
    act(() => { mgr!.open('p2', { title: 'Panel 2', content: <span /> }); });
    act(() => { mgr!.close('p2'); });
    expect(mgr!.openIds).not.toContain('p2');
    expect(mgr!.isOpen('p2')).toBe(false);
    expect(container.querySelector('.dw-panel-float')).toBeNull();
  });

  it('multiple managed windows can coexist', () => {
    act(() => {
      mgr!.open('ma', { title: 'A', content: <span /> });
      mgr!.open('mb', { title: 'B', content: <span /> });
    });
    expect(mgr!.openIds).toHaveLength(2);
    expect(container.querySelectorAll('.dw-panel-float')).toHaveLength(2);
  });
});

// ─── PO8 ──────────────────────────────────────────────────────────────────────

describe('PO8: usePanelFloatingWindowManager — closeAll', () => {
  let mgr: ReturnType<typeof usePanelFloatingWindowManager> | null = null;

  const ManagerProbe: React.FC = () => {
    mgr = usePanelFloatingWindowManager();
    return null;
  };

  it('closeAll() removes every managed window at once', () => {
    act(() => {
      root = createRoot(container);
      root.render(<PanelOverlayRoot><ManagerProbe /></PanelOverlayRoot>);
    });
    act(() => {
      mgr!.open('ca-1', { title: 'CA-1', content: <span /> });
      mgr!.open('ca-2', { title: 'CA-2', content: <span /> });
      mgr!.open('ca-3', { title: 'CA-3', content: <span /> });
    });
    expect(mgr!.openIds).toHaveLength(3);

    act(() => { mgr!.closeAll(); });
    expect(mgr!.openIds).toHaveLength(0);
    expect(container.querySelectorAll('.dw-panel-float')).toHaveLength(0);
  });
});

// ─── PO9 ──────────────────────────────────────────────────────────────────────

describe('PO9: Window focus — active class', () => {
  it('focused window gains .dw-panel-float--active and other windows lose it', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="focus-a" title="A" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
          <PanelFloatingWindow id="focus-b" title="B" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    const [winA, winB] = Array.from(container.querySelectorAll('.dw-panel-float'));

    // Focus window B via pointerdown (calls focusWindow('focus-b'))
    act(() => {
      winB.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });

    expect(winB.classList.contains('dw-panel-float--active')).toBe(true);
    expect(winA.classList.contains('dw-panel-float--active')).toBe(false);
  });
});

// ─── PO10 ─────────────────────────────────────────────────────────────────────

describe('PO10: PanelToolbar render isolation', () => {
  it('does NOT re-render when a window gains focus (PanelToolbarCtx is stable)', () => {
    let renderCount = 0;
    const ToolbarProbe: React.FC = () => { renderCount++; return null; };

    // TestApp is stable — no state of its own, so PanelOverlayRoot.children reference is stable
    const TestApp: React.FC = () => (
      <PanelOverlayRoot>
        <PanelToolbar position="top"><ToolbarProbe /></PanelToolbar>
        <PanelFloatingWindow id="tb-a" title="A" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
        <PanelFloatingWindow id="tb-b" title="B" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
      </PanelOverlayRoot>
    );

    act(() => {
      root = createRoot(container);
      root.render(<TestApp />);
    });
    const countAfterMount = renderCount;
    expect(countAfterMount).toBeGreaterThan(0);

    // Focus win B — triggers setTopId + setZOrders in PanelOverlayRoot, but
    // toolbarCtxValue is stable (useMemo with unrelated deps), so PanelToolbar
    // and its children must NOT re-render.
    const winB = container.querySelectorAll('.dw-panel-float')[1];
    act(() => {
      winB.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });

    expect(renderCount).toBe(countAfterMount);
  });
});

// ─── PO11 ─────────────────────────────────────────────────────────────────────

describe('PO11: Manager consumer render isolation', () => {
  it('does NOT re-render when a window gains focus (PanelManagerCtx is stable)', () => {
    let renderCount = 0;
    const ManagerProbe: React.FC = () => {
      usePanelFloatingWindowManager();
      renderCount++;
      return null;
    };

    const TestApp: React.FC = () => (
      <PanelOverlayRoot>
        <ManagerProbe />
        <PanelFloatingWindow id="iso-a" title="A" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
        <PanelFloatingWindow id="iso-b" title="B" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
      </PanelOverlayRoot>
    );

    act(() => {
      root = createRoot(container);
      root.render(<TestApp />);
    });
    const countAfterMount = renderCount;
    expect(countAfterMount).toBeGreaterThan(0);

    const winB = container.querySelectorAll('.dw-panel-float')[1];
    act(() => {
      winB.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });

    expect(renderCount).toBe(countAfterMount);
  });
});
