/**
 * Tests for the Panel Overlay system: PanelOverlayRoot, PanelToolbar,
 * PanelFloatingWindow, usePanelFloatingWindow, usePanelFloatingWindowManager.
 *
 * PO1:  PanelOverlayRoot renders .rdd-panel-overlay-root container
 * PO2:  PanelFloatingWindow open=true renders .rdd-panel-float in DOM
 * PO3:  PanelFloatingWindow open=false renders nothing
 * PO4:  Close button on a floating window triggers onClose callback
 * PO5:  PanelToolbar renders with the correct position modifier class
 * PO6:  usePanelFloatingWindow — open()/close() control window visibility
 * PO7:  usePanelFloatingWindowManager — openManaged/closeManaged/openIds
 * PO8:  usePanelFloatingWindowManager — closeAll() removes all managed windows
 * PO9:  Focused window gains .rdd-panel-float--active after pointerdown
 * PO10: PanelToolbar does NOT re-render when window focus changes (PanelToolbarCtx isolation)
 * PO11: usePanelFloatingWindowManager consumer does NOT re-render on focus change (PanelManagerCtx isolation)
 * PO12: Resize handle drag toggles document.body.rdd-resizing-active (WebKit selection regression)
 * PO13: Header drag toggles document.body.rdd-dragging-active (WebKit selection regression)
 * PO14: PanelToolbar re-measures via ResizeObserver, not just once on mount (stale-inset regression)
 * PO15: A docked window offers resize handles only on its free edges, per anchor
 * PO16: ...and the inline half of that mirrors under RTL (logical pin vs physical handle classes)
 * PO17: A free-floating window still offers all eight handles
 * PO18: A bottom-anchored window grows upward from its `n` handle (the reported regression)
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
import { WindowManagerProvider } from '../WindowManagerContext';

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
    expect(container.querySelector('.rdd-panel-overlay-root')).not.toBeNull();
  });
});

// ─── PO2 ──────────────────────────────────────────────────────────────────────

describe('PO2: PanelFloatingWindow open=true', () => {
  it('renders .rdd-panel-float in the DOM', () => {
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
    expect(container.querySelector('.rdd-panel-float')).not.toBeNull();
  });
});

// ─── PO2b ─────────────────────────────────────────────────────────────────────

describe('PO2b: PanelFloatingWindow anchor positioning under RTL', () => {
  it('sets dir="rtl" and positions a top-right anchor with insetInlineEnd (not a manually-flipped left/right)', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider dir="rtl">
          <PanelOverlayRoot>
            <PanelFloatingWindow id="po-rtl" title="RTL" open defaultAnchor="top-right" onClose={() => {}}>
              <span>content</span>
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        </WindowManagerProvider>
      );
    });

    const el = container.querySelector('.rdd-panel-float') as HTMLElement;
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(el.style.insetInlineEnd).not.toBe('');
    expect(el.style.insetInlineStart).toBe('');
  });

  it('uses the same insetInlineEnd property under LTR — the logical key does not depend on direction', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider dir="ltr">
          <PanelOverlayRoot>
            <PanelFloatingWindow id="po-ltr" title="LTR" open defaultAnchor="top-right" onClose={() => {}}>
              <span>content</span>
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        </WindowManagerProvider>
      );
    });

    const el = container.querySelector('.rdd-panel-float') as HTMLElement;
    expect(el.getAttribute('dir')).toBe('ltr');
    expect(el.style.insetInlineEnd).not.toBe('');
    expect(el.style.insetInlineStart).toBe('');
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
    expect(container.querySelector('.rdd-panel-float')).toBeNull();
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
    const closeBtn = container.querySelector<HTMLButtonElement>('.rdd-panel-float__close');
    expect(closeBtn).not.toBeNull();
    act(() => { closeBtn!.click(); });
    expect(callCount).toBe(1);
  });
});

// ─── PO5 ──────────────────────────────────────────────────────────────────────

describe('PO5: PanelToolbar position class', () => {
  it('renders .rdd-panel-toolbar--top for position="top"', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelToolbar position="top"><button type="button">Tool</button></PanelToolbar>
        </PanelOverlayRoot>
      );
    });
    expect(container.querySelector('.rdd-panel-toolbar--top')).not.toBeNull();
    expect(container.querySelector('.rdd-panel-toolbar--bottom')).toBeNull();
  });

  it('renders .rdd-panel-toolbar--bottom for position="bottom"', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelToolbar position="bottom"><button type="button">Tool</button></PanelToolbar>
        </PanelOverlayRoot>
      );
    });
    expect(container.querySelector('.rdd-panel-toolbar--bottom')).not.toBeNull();
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
    expect(container.querySelector('.rdd-panel-float')).toBeNull();

    act(() => { hook!.open(); });
    expect(hook!.isOpen).toBe(true);
    expect(container.querySelector('.rdd-panel-float')).not.toBeNull();

    act(() => { hook!.close(); });
    expect(hook!.isOpen).toBe(false);
    expect(container.querySelector('.rdd-panel-float')).toBeNull();
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
    expect(container.querySelector('.rdd-panel-float')).not.toBeNull();
  });

  it('closeManaged removes a window and updates openIds', () => {
    act(() => { mgr!.open('p2', { title: 'Panel 2', content: <span /> }); });
    act(() => { mgr!.close('p2'); });
    expect(mgr!.openIds).not.toContain('p2');
    expect(mgr!.isOpen('p2')).toBe(false);
    expect(container.querySelector('.rdd-panel-float')).toBeNull();
  });

  it('multiple managed windows can coexist', () => {
    act(() => {
      mgr!.open('ma', { title: 'A', content: <span /> });
      mgr!.open('mb', { title: 'B', content: <span /> });
    });
    expect(mgr!.openIds).toHaveLength(2);
    expect(container.querySelectorAll('.rdd-panel-float')).toHaveLength(2);
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
    expect(container.querySelectorAll('.rdd-panel-float')).toHaveLength(0);
  });
});

// ─── PO9 ──────────────────────────────────────────────────────────────────────

describe('PO9: Window focus — active class', () => {
  it('focused window gains .rdd-panel-float--active and other windows lose it', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="focus-a" title="A" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
          <PanelFloatingWindow id="focus-b" title="B" open defaultAnchor="top-right" onClose={() => {}}><span /></PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    const [winA, winB] = Array.from(container.querySelectorAll('.rdd-panel-float'));

    // Focus window B via pointerdown (calls focusWindow('focus-b'))
    act(() => {
      winB.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });

    expect(winB.classList.contains('rdd-panel-float--active')).toBe(true);
    expect(winA.classList.contains('rdd-panel-float--active')).toBe(false);
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
    const winB = container.querySelectorAll('.rdd-panel-float')[1];
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

    const winB = container.querySelectorAll('.rdd-panel-float')[1];
    act(() => {
      winB.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });

    expect(renderCount).toBe(countAfterMount);
  });
});

// ─── PO12 ─────────────────────────────────────────────────────────────────────

describe('PO12: Resize handle drag suppresses selection', () => {
  it('dragging a resize handle toggles document.body.rdd-resizing-active for the drag duration (regression: WebKit selection bleed-through)', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="resize-win" title="Resize" open defaultAnchor="top-right" defaultWidth={300} defaultHeight={200} onClose={() => {}}>
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });

    const win = container.querySelector('.rdd-panel-float') as HTMLElement;
    const header = win.querySelector('.rdd-panel-float__header') as HTMLElement;

    // Undock to 'free' mode first. A docked window only renders handles for its free edges (see
    // PO15), and this one is top-right anchored, so 'se' exists only once it is free-floating.
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });

    const seHandle = container.querySelector('.rdd-resize-se') as HTMLElement | null;
    expect(seHandle).not.toBeNull();

    expect(document.body.classList.contains('rdd-resizing-active')).toBe(false);

    act(() => {
      seHandle!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: 100, clientY: 100, button: 0 }));
    });
    expect(document.body.classList.contains('rdd-resizing-active')).toBe(true);

    act(() => {
      seHandle!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: 130, clientY: 130, button: 0 }));
    });
    expect(document.body.classList.contains('rdd-resizing-active')).toBe(false);
  });
});

// ─── PO13 ─────────────────────────────────────────────────────────────────────

describe('PO13: Header drag suppresses selection (regression: WebKit selection bleed-through)', () => {
  it('dragging the header toggles document.body.rdd-dragging-active for the drag duration', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="drag-win" title="Drag" open defaultAnchor="top-right" defaultWidth={300} defaultHeight={200} onClose={() => {}}>
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });

    const win = container.querySelector('.rdd-panel-float') as HTMLElement;
    const header = win.querySelector('.rdd-panel-float__header') as HTMLElement;

    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);

    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(true);

    act(() => {
      win.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 80, clientY: 80, button: 0 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
  });

  it('cancelling the drag (pointercancel) also removes rdd-dragging-active', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="drag-win-2" title="Drag" open defaultAnchor="top-right" defaultWidth={300} defaultHeight={200} onClose={() => {}}>
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });

    const win = container.querySelector('.rdd-panel-float') as HTMLElement;
    const header = win.querySelector('.rdd-panel-float__header') as HTMLElement;

    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(true);

    act(() => {
      win.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, clientX: 80, clientY: 80, button: 0 }));
    });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
  });
});

// ─── PO14 ─────────────────────────────────────────────────────────────────────

describe('PO14: PanelToolbar re-measures via ResizeObserver (regression: stale layout-restore inset)', () => {
  it('updates a docked float\'s inset when the toolbar element resizes after mount, not just at mount', () => {
    let capturedCallback: (() => void) | null = null;
    const OriginalResizeObserver = global.ResizeObserver;
    class MockResizeObserver {
      constructor(cb: () => void) { capturedCallback = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error - test-local override of the shared jsdom stub
    global.ResizeObserver = MockResizeObserver;

    try {
      act(() => {
        root = createRoot(container);
        root.render(
          <PanelOverlayRoot>
            <PanelToolbar position="top"><button type="button">Tool</button></PanelToolbar>
            <PanelFloatingWindow id="po14-float" title="Float" open defaultAnchor="top-left" onClose={() => {}}>
              <span>content</span>
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        );
      });

      const toolbarEl = container.querySelector('.rdd-panel-toolbar') as HTMLElement;
      const floatEl = container.querySelector('.rdd-panel-float') as HTMLElement;
      expect(capturedCallback).not.toBeNull();

      // jsdom reports offsetHeight as 0 by default — matches the reported bug's "0 baked in"
      // case exactly, since nothing has told the toolbar its real size yet.
      expect(floatEl.style.top).toBe('0px');

      // Simulate the toolbar settling to its real height and the ResizeObserver firing —
      // this re-measurement path is exactly what the fix adds; without it, insetTop would
      // stay wrong (here, 0) for the lifetime of the component.
      Object.defineProperty(toolbarEl, 'offsetHeight', { configurable: true, value: 48 });
      act(() => { capturedCallback?.(); });

      expect(floatEl.style.top).toBe('48px');
    } finally {
      // @ts-expect-error - restoring the shared jsdom stub
      global.ResizeObserver = OriginalResizeObserver;
    }
  });
});

// ─── PO15-PO18: anchor-aware resize handles ───────────────────────────────────
// A docked window has one pinned edge per axis, so a handle on a pinned side moves the *opposite*
// edge and is bounded by that side's own inset — an inert stub wearing a resize cursor. The set
// used to be hardcoded to the five non-northern directions regardless of anchor, which left every
// bottom-anchored window with no working vertical resize: 'n' wasn't rendered and 's' was the stub.

const ALL_DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

/** Which handles the window is currently offering, as a sorted list. */
const handlesOn = (host: HTMLElement): string[] =>
  ALL_DIRS.filter(d => host.querySelector(`.rdd-resize-${d}`) !== null).sort();

const mountAnchored = (anchor: string, dir: 'ltr' | 'rtl' = 'ltr') => {
  act(() => {
    root = createRoot(container);
    root.render(
      <WindowManagerProvider dir={dir}>
        <PanelOverlayRoot>
          <PanelFloatingWindow
            id="po-handles"
            title="Handles"
            open
            defaultAnchor={anchor as any}
            defaultWidth={300}
            defaultHeight={200}
            onClose={() => {}}
          >
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      </WindowManagerProvider>
    );
  });
};

describe('PO15: docked resize handles follow the anchor', () => {
  it.each([
    ['top-left',     ['e', 's', 'se']],
    ['top-right',    ['s', 'sw', 'w']],
    ['bottom-left',  ['e', 'n', 'ne']],
    ['bottom-right', ['n', 'nw', 'w']],
  ])('%s offers exactly its free edges plus their corner', (anchor, expected) => {
    mountAnchored(anchor as string);
    expect(handlesOn(container)).toEqual([...(expected as string[])].sort());
  });

  it('never offers a handle on a pinned edge (bottom-right pins bottom and right)', () => {
    mountAnchored('bottom-right');
    // The two that used to be rendered and could not work.
    expect(container.querySelector('.rdd-resize-s')).toBeNull();
    expect(container.querySelector('.rdd-resize-e')).toBeNull();
    expect(container.querySelector('.rdd-resize-se')).toBeNull();
  });
});

describe('PO16: the inline half mirrors under RTL', () => {
  // The pin is logical (insetInlineEnd) but the handle classes are physical
  // (.rdd-resize-e { right: -4px }), so the physical free side flips with direction.
  it('top-right under RTL pins the physical left, so the free inline handle is `e`', () => {
    mountAnchored('top-right', 'rtl');
    expect(handlesOn(container)).toEqual(['e', 's', 'se'].sort());
  });

  it('bottom-left under RTL pins the physical right, so the free inline handle is `w`', () => {
    mountAnchored('bottom-left', 'rtl');
    expect(handlesOn(container)).toEqual(['n', 'nw', 'w'].sort());
  });

  it('the block axis is unaffected by direction', () => {
    mountAnchored('bottom-right', 'rtl');
    expect(container.querySelector('.rdd-resize-n')).not.toBeNull();
    expect(container.querySelector('.rdd-resize-s')).toBeNull();
  });
});

describe('PO17: a free-floating window keeps all eight handles', () => {
  it('offers every direction once undocked', () => {
    mountAnchored('bottom-right');
    const header = container.querySelector('.rdd-panel-float__header') as HTMLElement;
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    expect(handlesOn(container)).toEqual([...ALL_DIRS].sort());
  });
});

describe('PO18: a bottom-anchored window resizes from the top', () => {
  // jsdom does no layout: offsetParent is always null and every rect is zero, which would make
  // getContainerBounds fall back to 9999 and clamp the drag to nothing. Stub just enough geometry
  // for an 800x600 overlay holding a 300x200 window pinned to the bottom-right (so its top edge
  // sits at y=400). Same spirit as V3Diagnostics.test.tsx's getComputedStyle proxy.
  const rect = (left: number, top: number, width: number, height: number) => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {},
  }) as DOMRect;

  it('dragging the `n` handle upward makes it taller, leaving the pinned bottom edge alone', () => {
    const originalGBCR = HTMLElement.prototype.getBoundingClientRect;
    const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

    const isRoot = (el: HTMLElement) => el.classList?.contains('rdd-panel-overlay-root');
    const isFloat = (el: HTMLElement) => el.classList?.contains('rdd-panel-float');

    try {
      HTMLElement.prototype.getBoundingClientRect = function () {
        if (isRoot(this)) return rect(0, 0, 800, 600);
        if (isFloat(this)) return rect(492, 400, 300, 200);
        return originalGBCR.call(this);
      };
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() { return isFloat(this) ? this.closest('.rdd-panel-overlay-root') : null; },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() { return isRoot(this) ? 600 : 0; },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() { return isRoot(this) ? 800 : 0; },
      });

      mountAnchored('bottom-right');

      const win = container.querySelector('.rdd-panel-float') as HTMLElement;
      const pinnedBefore = win.style.bottom;
      expect(win.style.height).toBe('200px');

      const nHandle = container.querySelector('.rdd-resize-n') as HTMLElement | null;
      expect(nHandle).not.toBeNull();

      // Grab the top edge (y=400) and drag it up 50px.
      act(() => {
        nHandle!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: 640, clientY: 400, button: 0 }));
      });
      act(() => {
        nHandle!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 640, clientY: 350 }));
      });

      expect(win.style.height).toBe('250px');
      // The anchored edge must not move — growth comes out of the top.
      expect(win.style.bottom).toBe(pinnedBefore);

      act(() => {
        nHandle!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 640, clientY: 350 }));
      });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGBCR;
      if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
      if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
  });
});
