/**
 * @file useFloatingWidgets.tsx
 * @description The hooks that open floating widgets from code: one widget, or a set managed by id.
 */
import { useState, useContext, useCallback, useMemo } from 'react';
import type { ManagedWidget } from './types';
import { PanelManagerContext } from './context';

// ─── usePanelFloatingWindow ───────────────────────────────────────────────────

/** Return type of `usePanelFloatingWindow`. @see usePanelFloatingWindow */
export interface UsePanelFloatingWindowReturn {
  /** Whether the floating window is currently open. */
  isOpen: boolean;
  /** Open the floating window. */
  open(): void;
  /** Close the floating window. */
  close(): void;
}

/**
 * Manages the open/close boolean state for a single `RddFloatingWidget`.
 * Pass `isOpen` to `open`, `close` to `onClose` on the component directly.
 * @returns A stable `UsePanelFloatingWindowReturn` object.
 * @example
 * const info = usePanelFloatingWindow();
 * <RddFloatingWidget id="info" open={info.isOpen} onClose={info.close} ... />
 */
export function usePanelFloatingWindow(): UsePanelFloatingWindowReturn {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback((): void => { setIsOpen(true); }, []);
  const close = useCallback((): void => { setIsOpen(false); }, []);
  return { isOpen, open, close };
}

// ─── usePanelFloatingWindowManager ───────────────────────────────────────────

const EMPTY_IDS: string[] = [];

/**
 * What `useFloatingWidgets()` returns.
 */
export interface FloatingWidgetsApi {
  /** Spawn or reconfigure a named window. Safe to call with an already-open ID to update config. */
  open(id: string, config: ManagedWidget): void;
  /** Close a named window by ID. No-op if the window is not open. */
  close(id: string): void;
  /** Close all managed windows. */
  closeAll(): void;
  /** Returns `true` if the named window is currently open. */
  isOpen(id: string): boolean;
  /** IDs of all currently open managed windows. Changes to this array trigger re-renders. */
  openIds: string[];
}

/**
 * Imperative hook for spawning N named floating windows at runtime from data or event handlers.
 * All widgets share z-ordering, drag, and corner-docking infrastructure of the `RddPanelOverlay`,
 * and accept the same placement options — including {@link ManagedWidget.stretch} to span an
 * axis of the panel.
 *
 * Must be called inside a **descendant** of `RddPanelOverlay`, not in the component that renders it.
 * @returns A stable `FloatingWidgetsApi`.
 * @example
 * const manager = useFloatingWidgets();
 * manager.open('feature-42', { title: 'Feature 42', content: <FeatureDetail id={42} />, anchor: 'top-right' });
 *
 * // A full-width strip along the bottom edge:
 * manager.open('timeline', { title: 'Timeline', content: <Timeline />, anchor: 'bottom-left', stretch: 'width', height: 120 });
 */
export function usePanelFloatingWindowManager(): FloatingWidgetsApi {
  const ctx = useContext(PanelManagerContext);
  const ids = ctx?.managedWindowIds ?? EMPTY_IDS;

  return useMemo(() => ({
    open: (id: string, config: ManagedWidget) => ctx?.openManaged(id, config),
    close: (id: string) => ctx?.closeManaged(id),
    closeAll: () => ctx?.closeAllManaged(),
    isOpen: (id: string) => ids.includes(id),
    openIds: ids,
  }), [ctx, ids]);
}
