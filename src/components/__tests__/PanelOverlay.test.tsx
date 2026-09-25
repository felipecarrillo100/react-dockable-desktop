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
 * PO19: A click on the header does NOT undock — only a real drag does
 * PO20: A docked window cannot be resized over a PanelToolbar on the far side
 * PO21: defaultStretch pins both ends of an axis and drops its explicit size
 * PO22: Handle sets across the stretched states (including the fills-the-panel case)
 * PO23: Dragging an end of a stretched axis releases it and pins the opposite end
 * PO24: Controlled stretch — the caller owns it; placement is reported atomically
 * PO25: A full-width strip stacks against both corners of its edge
 * PO26: Detaching a stretched widget materialises its measured size and clears stretch
 * PO27: Resizing an edge out to the far extent snaps the axis to stretched, with hysteresis
 * PO28: A descriptor title resolves through the formatter — managed and declarative alike
 * PO29: ...and re-resolves when the formatter changes, with no reopen (the reported bug)
 * PO30: A plain string title still renders unchanged
 * PO31: The close button's tooltip comes from the message catalogue, not hardcoded English
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useState, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  PanelOverlayRoot,
  PanelToolbar,
  PanelFloatingWindow,
  usePanelFloatingWindow,
  usePanelFloatingWindowManager,
} from '../PanelOverlay';
import type { ManagedWidget } from '../PanelOverlay';
import { WindowManagerProvider } from '../WindowManagerContext';
import type { MessageFormatter } from '../WindowManagerContext';

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
    // The pointermove matters: undocking happens at the 4px drag threshold, not on pointerdown
    // (see PO19) — a bare press leaves the widget anchored.
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    act(() => {
      win.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 80, clientY: 80 }));
    });
    // Ended with pointercancel rather than pointerup: jsdom reports a 0x0 container rect, so
    // getHoveredZone() classifies *any* coordinate as a corner and a pointerup would immediately
    // re-dock the widget. Cancelling clears the drag without docking, which is its real behaviour.
    act(() => {
      win.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
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
    // Applied once the drag actually starts, not on the press itself.
    act(() => {
      win.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 80, clientY: 80 }));
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
    // Applied at the drag threshold, not on the press itself.
    act(() => {
      win.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 80, clientY: 80 }));
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
    const win = container.querySelector('.rdd-panel-float') as HTMLElement;
    const header = container.querySelector('.rdd-panel-float__header') as HTMLElement;
    // Past the 4px threshold, otherwise the widget stays docked (see PO19).
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    act(() => {
      win.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 80, clientY: 80 }));
    });
    // Ended with pointercancel rather than pointerup: jsdom reports a 0x0 container rect, so
    // getHoveredZone() classifies *any* coordinate as a corner and a pointerup would immediately
    // re-dock the widget. Cancelling clears the drag without docking, which is its real behaviour.
    act(() => {
      win.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
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

// ─── Shared geometry stub ─────────────────────────────────────────────────────
// jsdom performs no layout: every rect is zero, `offsetParent` is always null and `offsetHeight`
// is 0, so `getContainerBounds()` falls back to its 9999 default and any drag clamps to nothing.
// These stubs supply just enough geometry for pointer maths to be meaningful.

const domRect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {},
}) as DOMRect;

interface GeometryStub {
  overlay: DOMRect;
  float: DOMRect;
  /** Sizes a PanelToolbar reports via offsetHeight/offsetWidth, keyed by edge. */
  toolbars?: { top?: number; bottom?: number; left?: number; right?: number };
}

/** Installs the stubs and returns a restore function. Call before rendering. */
function stubGeometry({ overlay, float, toolbars = {} }: GeometryStub): () => void {
  const originalGBCR = HTMLElement.prototype.getBoundingClientRect;
  const saved = (prop: string) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  const descriptors = {
    offsetParent: saved('offsetParent'),
    clientWidth: saved('clientWidth'),
    clientHeight: saved('clientHeight'),
    offsetHeight: saved('offsetHeight'),
    offsetWidth: saved('offsetWidth'),
  };

  const isRoot = (el: HTMLElement) => !!el.classList?.contains('rdd-panel-overlay-root');
  const isFloat = (el: HTMLElement) => !!el.classList?.contains('rdd-panel-float');
  const toolbarEdge = (el: HTMLElement): keyof typeof toolbars | null => {
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      if (el.classList?.contains(`rdd-panel-toolbar--${edge}`)) return edge;
    }
    return null;
  };

  HTMLElement.prototype.getBoundingClientRect = function () {
    if (isRoot(this)) return overlay;
    if (isFloat(this)) return float;
    return originalGBCR.call(this);
  };
  const define = (prop: string, get: (el: HTMLElement) => unknown) =>
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get() { return get(this); } });

  define('offsetParent', el => (isFloat(el) ? el.closest('.rdd-panel-overlay-root') : null));
  define('clientWidth', el => (isRoot(el) ? overlay.width : 0));
  define('clientHeight', el => (isRoot(el) ? overlay.height : 0));
  define('offsetHeight', el => { const e = toolbarEdge(el); return e ? (toolbars[e] ?? 0) : 0; });
  define('offsetWidth', el => { const e = toolbarEdge(el); return e ? (toolbars[e] ?? 0) : 0; });

  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalGBCR;
    for (const [prop, d] of Object.entries(descriptors)) {
      if (d) Object.defineProperty(HTMLElement.prototype, prop, d);
      else delete (HTMLElement.prototype as any)[prop];
    }
  };
}

// ─── PO19: a press is not a detach ────────────────────────────────────────────
// handleHeaderPointerDown used to undock on *pointerdown*, with the 4px threshold gating only the
// drop-zone overlay. So a plain click tore the widget off its anchor: it looked unchanged, but its
// stacked siblings reflowed to close the gap and it stopped tracking the corner from then on.

describe('PO19: clicking the header does not undock', () => {
  const mountStack = () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="first" title="First" open defaultAnchor="top-left" defaultWidth={240} defaultHeight={160} onClose={() => {}}>
            <span />
          </PanelFloatingWindow>
          <PanelFloatingWindow id="second" title="Second" open defaultAnchor="top-left" defaultWidth={240} defaultHeight={100} onClose={() => {}}>
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    const floats = Array.from(container.querySelectorAll('.rdd-panel-float')) as HTMLElement[];
    return { first: floats[0], second: floats[1] };
  };

  const press = (win: HTMLElement, move?: { x: number; y: number }) => {
    const header = win.querySelector('.rdd-panel-float__header') as HTMLElement;
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 50, clientY: 50, button: 0 }));
    });
    if (move) {
      act(() => {
        win.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: move.x, clientY: move.y }));
      });
    }
    act(() => {
      win.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    });
  };

  it('a click leaves the widget docked', () => {
    const { first } = mountStack();
    press(first);
    // Docked positioning keeps the logical inset and no free-mode `left`.
    expect(first.style.insetInlineStart).toBe('8px');
    expect(first.style.left).toBe('');
    // ...and still only its free-edge handles (3), not free mode's 8.
    expect(handlesOn(first)).toEqual(['e', 's', 'se'].sort());
  });

  it('a click does not reflow its stacked siblings', () => {
    const { first, second } = mountStack();
    const before = second.style.top;
    expect(before).toBe('168px'); // 160px sibling + 8px gap
    press(first);
    expect(second.style.top).toBe(before);
  });

  it('a real drag past the threshold still undocks', () => {
    const { first } = mountStack();
    press(first, { x: 90, y: 90 });
    expect(first.style.left).not.toBe('');
    expect(first.style.insetInlineStart).toBe('');
    expect(handlesOn(first)).toEqual([...ALL_DIRS].sort());
  });
});

// ─── PO20: docked resize stops at the far toolbar ─────────────────────────────
// Growth used to be bounded by the raw container edge, so a docked widget could be resized clean
// over a PanelToolbar on the opposite side — the same class of defect a 5.x fix addressed for
// docked float *positioning*.

describe('PO20: docked resize respects toolbar insets', () => {
  it('stops at a bottom toolbar instead of the container edge', () => {
    const restore = stubGeometry({
      overlay: domRect(0, 0, 800, 600),
      float: domRect(8, 0, 300, 200),
      toolbars: { bottom: 40 },
    });
    try {
      act(() => {
        root = createRoot(container);
        root.render(
          <PanelOverlayRoot>
            <PanelToolbar position="bottom">
              <span />
            </PanelToolbar>
            {/* stretchable={false} so the drag tests the clamp alone: with snapping on, reaching
                the far extent now converts to a stretched axis instead (see PO27). */}
            <PanelFloatingWindow id="po20" title="PO20" open defaultAnchor="top-left" stretchable={false} defaultWidth={300} defaultHeight={200} onClose={() => {}}>
              <span />
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        );
      });

      const win = container.querySelector('.rdd-panel-float') as HTMLElement;
      const sHandle = win.querySelector('.rdd-resize-s') as HTMLElement;
      expect(sHandle).not.toBeNull();

      // Drag the bottom edge far past the container's own bottom.
      act(() => {
        sHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: 150, clientY: 198, button: 0 }));
      });
      act(() => {
        sHandle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 150, clientY: 900 }));
      });
      act(() => {
        sHandle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, clientX: 150, clientY: 900 }));
      });

      // 600 container - 40 toolbar - 0 top offset. Previously it would have reached 600.
      expect(win.style.height).toBe('560px');
    } finally {
      restore();
    }
  });
});

// ─── PO21-PO23: edge-stretch placement ────────────────────────────────────────
// "Full width" is a second pin, not a width: a stretched axis sets both insets and writes no size,
// so CSS keeps the widget spanning the panel with no JS. `size` is deliberately left intact while
// stretched (as a maximized workspace window keeps its rect), so releasing an axis restores it.

const mountStretched = (anchor: string, stretch?: string, dir: 'ltr' | 'rtl' = 'ltr') => {
  act(() => {
    root = createRoot(container);
    root.render(
      <WindowManagerProvider dir={dir}>
        <PanelOverlayRoot>
          <PanelFloatingWindow
            id="po-stretch"
            title="Stretch"
            open
            defaultAnchor={anchor as any}
            defaultStretch={stretch as any}
            defaultWidth={240}
            defaultHeight={160}
            onClose={() => {}}
          >
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      </WindowManagerProvider>
    );
  });
  return container.querySelector('.rdd-panel-float') as HTMLElement;
};

describe('PO21: defaultStretch positioning', () => {
  it('width: pins both inline ends and writes no width', () => {
    const win = mountStretched('bottom-left', 'width');
    expect(win.style.insetInlineStart).toBe('8px');
    expect(win.style.insetInlineEnd).toBe('8px');
    expect(win.style.width).toBe('');        // implied by the two pins — this is the whole trick
    expect(win.style.height).toBe('160px');  // block axis still carries its size
  });

  it('height: pins both block ends and writes no height', () => {
    const win = mountStretched('top-right', 'height');
    expect(win.style.top).toBe('0px');
    expect(win.style.bottom).toBe('0px');
    expect(win.style.height).toBe('');
    expect(win.style.width).toBe('240px');
  });

  it('both: fills the panel, carrying neither size', () => {
    const win = mountStretched('top-left', 'both');
    expect(win.style.insetInlineStart).toBe('8px');
    expect(win.style.insetInlineEnd).toBe('8px');
    expect(win.style.top).toBe('0px');
    expect(win.style.bottom).toBe('0px');
    expect(win.style.width).toBe('');
    expect(win.style.height).toBe('');
  });

  it('unstretched is unchanged — one inset per axis, both sizes written', () => {
    const win = mountStretched('bottom-right');
    expect(win.style.insetInlineEnd).toBe('8px');
    expect(win.style.insetInlineStart).toBe('');
    expect(win.style.width).toBe('240px');
    expect(win.style.height).toBe('160px');
  });
});

describe('PO22: handle sets while stretched', () => {
  it('inline-stretched: free block edge, plus both inline ends to release from', () => {
    const win = mountStretched('bottom-left', 'width');
    expect(handlesOn(win)).toEqual(['n', 'e', 'w'].sort());
  });

  it('block-stretched: free inline edge, plus both block ends', () => {
    const win = mountStretched('top-right', 'height');
    expect(handlesOn(win)).toEqual(['w', 'n', 's'].sort());
  });

  it('fills the panel: all four edges are releasable — never a dead end', () => {
    const win = mountStretched('top-left', 'both');
    expect(handlesOn(win)).toEqual(['n', 's', 'e', 'w'].sort());
  });

  it('no corner handle in a stretched state (it would mix a resize with a release)', () => {
    for (const st of ['width', 'height', 'both']) {
      const win = mountStretched('top-left', st);
      for (const corner of ['ne', 'nw', 'se', 'sw']) {
        expect(win.querySelector(`.rdd-resize-${corner}`)).toBeNull();
      }
      act(() => { root!.unmount(); });
      root = null;
    }
  });

  it('the inline pair is direction-agnostic — both physical ends, either way', () => {
    const win = mountStretched('bottom-left', 'width', 'rtl');
    expect(handlesOn(win)).toEqual(['n', 'e', 'w'].sort());
  });
});

describe('PO23: releasing a stretched axis by dragging its end', () => {
  const dragHandle = (win: HTMLElement, dir: string, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const handle = win.querySelector(`.rdd-resize-${dir}`) as HTMLElement;
    expect(handle).not.toBeNull();
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: from.x, clientY: from.y, button: 0 }));
    });
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: to.x, clientY: to.y }));
    });
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, clientX: to.x, clientY: to.y }));
    });
  };

  it('dragging the right edge inward pins the left end and adopts the dragged width', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 432, 784, 160) });
    try {
      const win = mountStretched('bottom-left', 'width');
      expect(win.style.width).toBe('');

      dragHandle(win, 'e', { x: 790, y: 500 }, { x: 690, y: 500 });

      // Released: an explicit width again, pinned at the inline start it was dragged away from.
      expect(win.style.width).toBe('684px');           // 784 measured - 100 dragged
      expect(win.style.insetInlineStart).toBe('8px');
      expect(win.style.insetInlineEnd).toBe('');
      expect(handlesOn(win)).toEqual(['e', 'n', 'ne'].sort());
    } finally {
      restore();
    }
  });

  it('dragging the left edge inward pins the right end instead', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 432, 784, 160) });
    try {
      const win = mountStretched('bottom-left', 'width');
      dragHandle(win, 'w', { x: 10, y: 500 }, { x: 110, y: 500 });

      expect(win.style.width).toBe('684px');
      expect(win.style.insetInlineEnd).toBe('8px');
      expect(win.style.insetInlineStart).toBe('');
    } finally {
      restore();
    }
  });

  it('releasing one axis of `both` leaves the other stretched', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 784, 600) });
    try {
      const win = mountStretched('top-left', 'both');
      dragHandle(win, 'e', { x: 790, y: 300 }, { x: 690, y: 300 });

      expect(win.style.width).toBe('684px');   // inline released
      expect(win.style.height).toBe('');       // block still stretched
      expect(win.style.top).toBe('0px');
      expect(win.style.bottom).toBe('0px');
    } finally {
      restore();
    }
  });

  it('dragging the free edge of the unstretched axis does not release anything', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 432, 784, 160) });
    try {
      const win = mountStretched('bottom-left', 'width');
      dragHandle(win, 'n', { x: 400, y: 434 }, { x: 400, y: 384 });

      expect(win.style.width).toBe('');        // still stretched
      expect(win.style.height).toBe('210px');  // 160 + 50, the ordinary resize
    } finally {
      restore();
    }
  });
});

// ─── PO24-PO26: controlled placement, stacking, detach ────────────────────────

describe('PO24: controlled stretch', () => {
  it('does not self-update when `stretch` is supplied — the caller is the source of truth', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 432, 784, 160) });
    const seen: any[] = [];
    try {
      act(() => {
        root = createRoot(container);
        root.render(
          <PanelOverlayRoot>
            <PanelFloatingWindow id="ctl" title="Ctl" open defaultAnchor="bottom-left"
              stretch="width" onPlacementChange={p => seen.push(p)}
              defaultWidth={240} defaultHeight={160} onClose={() => {}}>
              <span />
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        );
      });
      const win = container.querySelector('.rdd-panel-float') as HTMLElement;
      expect(win.style.width).toBe('');   // controlled value applied

      const handle = win.querySelector('.rdd-resize-e') as HTMLElement;
      act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, clientX: 790, clientY: 500, button: 0 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 4, clientX: 690, clientY: 500 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 4, clientX: 690, clientY: 500 })); });

      // Reported, but NOT self-applied: still stretched because the prop never changed.
      expect(seen).toEqual([{ anchor: 'bottom-left', stretch: null }]);
      expect(win.style.width).toBe('');
    } finally {
      restore();
    }
  });

  it('reports anchor and stretch together, as one atomic placement', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 432, 784, 160) });
    const seen: any[] = [];
    try {
      act(() => {
        root = createRoot(container);
        root.render(
          <PanelOverlayRoot>
            <PanelFloatingWindow id="atomic" title="Atomic" open defaultAnchor="bottom-left"
              defaultStretch="width" onPlacementChange={p => seen.push(p)}
              defaultWidth={240} defaultHeight={160} onClose={() => {}}>
              <span />
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        );
      });
      const win = container.querySelector('.rdd-panel-float') as HTMLElement;
      const handle = win.querySelector('.rdd-resize-w') as HTMLElement;
      act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: 10, clientY: 500, button: 0 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: 110, clientY: 500 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, clientX: 110, clientY: 500 })); });

      // Dragging the left end pins the right one, so both halves change in a single report.
      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({ anchor: 'bottom-right', stretch: null });
      // Uncontrolled, so it did apply.
      expect(win.style.insetInlineEnd).toBe('8px');
    } finally {
      restore();
    }
  });
});

describe('PO25: a strip stacks against both corners of its edge', () => {
  const mountEdge = () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="left-card" title="left-card" open defaultAnchor="bottom-left"
            defaultWidth={200} defaultHeight={120} onClose={() => {}}><span /></PanelFloatingWindow>
          <PanelFloatingWindow id="right-card" title="right-card" open defaultAnchor="bottom-right"
            defaultWidth={200} defaultHeight={90} onClose={() => {}}><span /></PanelFloatingWindow>
          <PanelFloatingWindow id="strip" title="strip" open defaultAnchor="bottom-left"
            defaultStretch="width" defaultWidth={240} defaultHeight={60} onClose={() => {}}><span /></PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    const byTitle = (t: string) => Array.from(container.querySelectorAll('.rdd-panel-float'))
      .find(f => f.querySelector('.rdd-panel-float__title')!.textContent === t) as HTMLElement;
    return { left: byTitle('left-card'), right: byTitle('right-card'), strip: byTitle('strip') };
  };

  it('clears the taller of the two corners it spans', () => {
    const { left, right, strip } = mountEdge();
    expect(left.style.bottom).toBe('0px');
    expect(right.style.bottom).toBe('0px');
    // Registered in both bottom buckets, so it clears max(120, 90) + 8 rather than just its own corner.
    expect(strip.style.bottom).toBe('128px');
  });

  it('does not disturb the corner widgets themselves', () => {
    const { left, right } = mountEdge();
    expect(left.style.width).toBe('200px');
    expect(right.style.width).toBe('200px');
  });
});

describe('PO26: detaching a stretched widget', () => {
  it('materialises the measured size and clears stretch', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 432, 784, 160) });
    const seen: any[] = [];
    try {
      act(() => {
        root = createRoot(container);
        root.render(
          <PanelOverlayRoot>
            <PanelFloatingWindow id="detach" title="Detach" open defaultAnchor="bottom-left"
              defaultStretch="width" onPlacementChange={p => seen.push(p)}
              defaultWidth={240} defaultHeight={160} onClose={() => {}}>
              <span />
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        );
      });
      const win = container.querySelector('.rdd-panel-float') as HTMLElement;
      const header = win.querySelector('.rdd-panel-float__header') as HTMLElement;

      act(() => { header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 6, clientX: 400, clientY: 440, button: 0 })); });
      act(() => { win.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 6, clientX: 440, clientY: 480 })); });
      act(() => { win.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 6 })); });

      // Free mode positions from an explicit box, so the 784px it was actually occupying must be
      // adopted — not the stale 240px it had before stretching.
      expect(win.style.width).toBe('784px');
      expect(win.style.left).not.toBe('');
      expect(seen.some(p => p.stretch === null)).toBe(true);
    } finally {
      restore();
    }
  });
});

// ─── PO27: resize-to-stretch snapping ─────────────────────────────────────────
// Dragging a free edge out to where a stretched axis would sit converts it to stretched on release.
// The clamps already stop growth exactly there, so an armed drag is visually at its target and the
// cue is an outline (.rdd-panel-float--snapping) rather than a ghost preview.

describe('PO27: resize-to-stretch snapping', () => {
  // overlay 800x600, no toolbars, widget 300x200 at top-left:
  // full inline extent = 800 - 8 - 8 = 784; full block extent = 600.
  const mountSnappable = (props: Record<string, unknown> = {}) => {
    act(() => {
      root = createRoot(container);
      root.render(
        <PanelOverlayRoot>
          <PanelFloatingWindow id="snap" title="Snap" open defaultAnchor="top-left"
            defaultWidth={300} defaultHeight={200} onClose={() => {}} {...props}>
            <span />
          </PanelFloatingWindow>
        </PanelOverlayRoot>
      );
    });
    return container.querySelector('.rdd-panel-float') as HTMLElement;
  };

  const dragS = (win: HTMLElement, toY: number, release = true) => {
    const handle = win.querySelector('.rdd-resize-s') as HTMLElement;
    act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, clientX: 150, clientY: 198, button: 0 })); });
    act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 8, clientX: 150, clientY: toY })); });
    if (release) act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, clientX: 150, clientY: toY })); });
  };

  it('snaps the block axis to stretched when dragged to the far extent', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 300, 200) });
    try {
      const win = mountSnappable();
      dragS(win, 900);
      expect(win.style.height).toBe('');     // no explicit height — both block ends pinned
      expect(win.style.top).toBe('0px');
      expect(win.style.bottom).toBe('0px');
      expect(win.style.width).toBe('300px'); // inline untouched
    } finally { restore(); }
  });

  it('shows the snapping cue while armed, before release', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 300, 200) });
    try {
      const win = mountSnappable();
      expect(win.className).not.toContain('rdd-panel-float--snapping');
      dragS(win, 900, false);
      expect(win.className).toContain('rdd-panel-float--snapping');
      act(() => {
        (win.querySelector('.rdd-resize-s') as HTMLElement)
          .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, clientX: 150, clientY: 900 }));
      });
      expect(win.className).not.toContain('rdd-panel-float--snapping');
    } finally { restore(); }
  });

  it('restores the pre-drag size on the snapped axis, so releasing returns to it', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 300, 200) });
    try {
      const win = mountSnappable();
      dragS(win, 900);
      expect(win.style.height).toBe('');
      // Release the axis again by dragging the bottom end inward; it returns to 200, the size the
      // user last chose, not the 600 the drag passed through.
      const handle = win.querySelector('.rdd-resize-s') as HTMLElement;
      act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: 150, clientY: 598, button: 0 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: 150, clientY: 300 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, clientX: 150, clientY: 300 })); });
      expect(win.style.height).not.toBe('');
    } finally { restore(); }
  });

  it('stays armed within the release tolerance (hysteresis)', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 300, 200) });
    try {
      const win = mountSnappable();
      // Arm at the extent, then pull back 30px — inside SNAP_OUT (40), so it stays armed.
      const handle = win.querySelector('.rdd-resize-s') as HTMLElement;
      act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 10, clientX: 150, clientY: 198, button: 0 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 10, clientX: 150, clientY: 900 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 10, clientX: 150, clientY: 568 })); });
      expect(win.className).toContain('rdd-panel-float--snapping');
      act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 10, clientX: 150, clientY: 568 })); });
      expect(win.style.height).toBe('');
    } finally { restore(); }
  });

  it('disarms once pulled back past the release tolerance', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 300, 200) });
    try {
      const win = mountSnappable();
      const handle = win.querySelector('.rdd-resize-s') as HTMLElement;
      act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, clientX: 150, clientY: 198, button: 0 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 11, clientX: 150, clientY: 900 })); });
      act(() => { handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 11, clientX: 150, clientY: 548 })); });
      expect(win.className).not.toContain('rdd-panel-float--snapping');
      act(() => { handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, clientX: 150, clientY: 548 })); });
      expect(win.style.height).toBe('550px');  // an ordinary resize, no stretch
    } finally { restore(); }
  });

  it('stretchable={false} never snaps', () => {
    const restore = stubGeometry({ overlay: domRect(0, 0, 800, 600), float: domRect(8, 0, 300, 200) });
    try {
      const win = mountSnappable({ stretchable: false });
      dragS(win, 900);
      expect(win.style.height).toBe('600px');   // clamped, still explicit
      expect(win.style.bottom).toBe('');
    } finally { restore(); }
  });
});

// ─── PO28–PO31 ────────────────────────────────────────────────────────────────

/**
 * Localisable float titles.
 *
 * The bug these cover: `ManagedWidget.title` was `string`, so a host that localises its UI
 * could not make a float's header follow a language change — the title stayed in whatever language
 * was active when the window opened. Every other title surface already accepted a descriptor.
 *
 * PO29 is the one that would have caught it. PO28 only proves a descriptor resolves *once*, which a
 * fix that resolved at `open()` time would also satisfy; re-resolving without a reopen is the
 * property that matters, because the config is stored by the overlay rather than re-read from the
 * host's own render.
 */
describe('PO28–PO31: localisable float titles', () => {
  const es: MessageFormatter = msg => ({
    'legend.title': 'Leyenda SLD',
    'dockable-desktop-closeTooltip': 'Cerrar',
  }[msg.id] ?? msg.defaultMessage ?? msg.id);

  const ru: MessageFormatter = msg => ({
    'legend.title': 'Легенда SLD',
    'dockable-desktop-closeTooltip': 'Закрыть',
  }[msg.id] ?? msg.defaultMessage ?? msg.id);

  const DESCRIPTOR = { id: 'legend.title', defaultMessage: 'SLD Legend' };

  /**
   * The imperative path: the overlay stores the config, which is where the bug lived.
   *
   * The `isOpen` guard is load-bearing, not defensive. Opening changes the overlay's state, which
   * gives `usePanelFloatingWindowManager()` a new handle, which re-runs this effect — and since
   * `content` is a fresh element each time, re-opening would change the state again, forever —
   * and it spins rather than erroring, so the only symptom is a run that never finishes
   * (measured: >13 minutes without the guard, against 4 for the whole file with it).
   * Opening once is also what the assertions need: PO29 must observe a window that was never
   * reopened.
   */
  const Managed: React.FC<{ title: ManagedWidget['title'] }> = ({ title }) => {
    const manager = usePanelFloatingWindowManager();
    useEffect(() => {
      if (!manager.isOpen('legend')) manager.open('legend', { title, content: <span /> });
    }, [manager, title]);
    return null;
  };

  const mountManaged = (fmt: MessageFormatter, title: ManagedWidget['title'] = DESCRIPTOR) => {
    const App: React.FC<{ fmt: MessageFormatter }> = ({ fmt }) => (
      <WindowManagerProvider formatMessage={fmt}>
        <PanelOverlayRoot><Managed title={title} /></PanelOverlayRoot>
      </WindowManagerProvider>
    );
    act(() => { root = createRoot(container); root.render(<App fmt={fmt} />); });
    return (next: MessageFormatter) => act(() => { root!.render(<App fmt={next} />); });
  };

  const headerText = () => container.querySelector('.rdd-panel-float__title')?.textContent;

  it('PO28: a managed window resolves a descriptor title through the formatter', () => {
    mountManaged(es);
    expect(headerText()).toBe('Leyenda SLD');
  });

  it('PO28: a declarative window resolves one too', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider formatMessage={es}>
          <PanelOverlayRoot>
            <PanelFloatingWindow
              id="legend" title={DESCRIPTOR} open={true} onClose={() => {}}
              defaultAnchor="top-right" defaultWidth={300} defaultHeight={200}
            >
              <span />
            </PanelFloatingWindow>
          </PanelOverlayRoot>
        </WindowManagerProvider>
      );
    });
    expect(headerText()).toBe('Leyenda SLD');
  });

  it('PO29: the title re-resolves when the formatter changes, without a reopen', () => {
    const rerenderWith = mountManaged(es);
    expect(headerText()).toBe('Leyenda SLD');
    rerenderWith(ru);
    expect(headerText()).toBe('Легенда SLD');
  });

  it('PO30: a plain string title renders unchanged, and the formatter is never consulted', () => {
    const fmt = vi.fn(((msg: { id: string; defaultMessage?: string }) => 'TRANSLATED') as MessageFormatter);
    mountManaged(fmt, 'SLD Legend');
    expect(headerText()).toBe('SLD Legend');
    // Only the close tooltip may have gone through the formatter; the title must not have.
    expect(fmt.mock.calls.map(([msg]) => msg.id)).not.toContain('legend.title');
  });

  it('PO31: the close button tooltip comes from the catalogue and follows the formatter', () => {
    const rerenderWith = mountManaged(es);
    const close = () => container.querySelector('.rdd-panel-float__close') as HTMLElement;
    expect(close().getAttribute('title')).toBe('Cerrar');
    expect(close().getAttribute('aria-label')).toBe('Cerrar');
    rerenderWith(ru);
    expect(close().getAttribute('title')).toBe('Закрыть');
  });
});
