/**
 * @file PanelToolbar.tsx
 * @description A toolbar on a panel edge, and its buttons, toggles and layout primitives.
 */
import React, { useContext, useRef, useLayoutEffect } from 'react';
import type { ToolbarPosition } from './types';
import { PanelToolbarContext } from './context';

// ─── PanelToolbar ─────────────────────────────────────────────────────────────

/** Background style of a `PanelToolbar`. */
export type ToolbarVariant = 'transparent' | 'frosted' | 'solid';

/** Visual style applied to `ToolbarButton` and `ToolbarToggle` components. */
export type ButtonVariant = 'ghost' | 'soft' | 'outlined' | 'filled';

/** Props for `<RddPanelToolbar>`. */
export interface RddPanelToolbarProps {
  /** Edge of the panel overlay to attach to. @see ToolbarPosition */
  position: ToolbarPosition;
  /** Background style of the toolbar strip. @default 'transparent' */
  variant?: ToolbarVariant;
  /** Default button style inherited by `ToolbarButton` and `ToolbarToggle` children. @default 'ghost' */
  buttonVariant?: ButtonVariant;
  /** Button size in pixels for all buttons in this toolbar (sets `--rdd-panel-toolbar-btn-size`). The icon inside follows `--rdd-panel-toolbar-icon-size`. Falls back to the stylesheet when unset. */
  buttonSize?: number;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Toolbar strip that attaches to any edge of an `RddPanelOverlay`.
 * Left/right toolbars inset automatically to avoid overlapping top/bottom toolbars.
 * RTL layouts are detected and handled automatically.
 * @example
 * <RddPanelToolbar position="top" variant="frosted">
 *   <RddToolbarButton icon={<SaveIcon />} title="Save" onClick={save} />
 *   <RddToolbarToggle icon={<GridIcon />} title="Grid" active={grid} onToggle={() => setGrid(v => !v)} />
 * </RddPanelToolbar>
 */
export function PanelToolbar({ position, variant = 'transparent', buttonVariant = 'ghost', buttonSize, style, className, children }: RddPanelToolbarProps): React.ReactElement {
  const ctx = useContext(PanelToolbarContext);
  const ref = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!ctx) return;
    const measure = () => {
      const size = (position === 'top' || position === 'bottom') ? el.offsetHeight : el.offsetWidth;
      cleanupRef.current?.();
      cleanupRef.current = ctx.registerToolbar(position, size);
    };
    measure();
    // A one-shot measurement is correct for a live mount (already at final size), but during a
    // layout restore (loadLayout()/initialState) the panel's DOM isn't necessarily settled yet at
    // this exact instant — without re-measuring, a wrong size (often 0) is baked in permanently,
    // and every docked float ends up positioned at the toolbar's own y/x, covering it. This also
    // catches any later size change (button wrapping, a buttonSize/variant change, content change).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // ctx?.registerToolbar is a stable useCallback — depending on ctx directly
    // would re-run on every toolbarSizes update, causing an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, ctx?.registerToolbar]);

  const posStyle: React.CSSProperties = { position: 'absolute', zIndex: 5, pointerEvents: 'none', boxSizing: 'border-box' };

  if (position === 'top') {
    posStyle.top = 0; posStyle.left = 0; posStyle.right = 0;
  } else if (position === 'bottom') {
    posStyle.bottom = 0; posStyle.left = 0; posStyle.right = 0;
  } else if (position === 'left') {
    posStyle.insetInlineStart = 0;
    posStyle.top = ctx?.insetTop ?? 0;
    posStyle.bottom = ctx?.insetBottom ?? 0;
  } else {
    posStyle.insetInlineEnd = 0;
    posStyle.top = ctx?.insetTop ?? 0;
    posStyle.bottom = ctx?.insetBottom ?? 0;
  }

  const isSide = position === 'left' || position === 'right';
  const sideStyle: React.CSSProperties = isSide ? {
    ...(ctx?.insetTop ?? 0) > 0 ? { paddingTop: 0 } : {},
    ...(ctx?.insetBottom ?? 0) > 0 ? { paddingBottom: 0 } : {},
  } : {};

  const sizeStyle: React.CSSProperties = buttonSize != null
    ? { ['--rdd-panel-toolbar-btn-size' as string]: `${buttonSize}px` }
    : {};

  return (
    <div
      ref={ref}
      className={`rdd-panel-toolbar rdd-panel-toolbar--${position}${className ? ' ' + className : ''}`}
      data-variant={variant}
      data-btn-variant={buttonVariant}
      style={{ ...posStyle, ...sideStyle, ...sizeStyle, ...style }}
    >
      {children}
    </div>
  );
}

// ─── ToolbarButton ────────────────────────────────────────────────────────────

/** Props for `<RddToolbarButton>`. */
export interface RddToolbarButtonProps {
  /** Button icon: an SVG, an icon component or an icon-font glyph. Pass no size: the library sizes it with `--rdd-panel-toolbar-icon-size`. */
  icon: React.ReactNode;
  /** Click handler. */
  onClick(): void;
  disabled?: boolean;
  /** Tooltip text and accessible `aria-label`. */
  title?: string;
  /** Visual style override. Falls back to the parent `PanelToolbar`'s `buttonVariant`. */
  variant?: ButtonVariant;
}

/** Icon button for use inside a `PanelToolbar`. */
export function ToolbarButton({ icon, onClick, disabled, title, variant }: RddToolbarButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="rdd-panel-toolbar-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      {...(variant ? { 'data-variant': variant } : {})}
    >
      {icon}
    </button>
  );
}

// ─── ToolbarToggle ────────────────────────────────────────────────────────────

/** Props for `<RddToolbarToggle>`. */
export interface RddToolbarToggleProps {
  /** Button icon: an SVG, an icon component or an icon-font glyph. Pass no size: the library sizes it with `--rdd-panel-toolbar-icon-size`. */
  icon: React.ReactNode;
  /** Whether the toggle is in the active/pressed state. Sets `aria-pressed` automatically. */
  active: boolean;
  /** Called when the button is clicked. Toggle `active` in response. */
  onToggle(): void;
  disabled?: boolean;
  /** Tooltip text and accessible `aria-label`. */
  title?: string;
  /** Visual style override. Falls back to the parent `PanelToolbar`'s `buttonVariant`. */
  variant?: ButtonVariant;
}

/** Two-state icon toggle button for use inside a `PanelToolbar`. Sets `aria-pressed` automatically. */
export function ToolbarToggle({ icon, active, onToggle, disabled, title, variant }: RddToolbarToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`rdd-panel-toolbar-btn${active ? ' rdd-panel-toolbar-btn--active' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      {...(variant ? { 'data-variant': variant } : {})}
    >
      {icon}
    </button>
  );
}

// ─── ToolbarSeparator ─────────────────────────────────────────────────────────

/** Vertical (or horizontal) divider line between groups of toolbar items. */
export function ToolbarSeparator(): React.ReactElement {
  return <span className="rdd-panel-toolbar__sep" aria-hidden="true" />;
}

// ─── ToolbarSpacer ────────────────────────────────────────────────────────────

/** Flex-grow spacer that pushes subsequent toolbar items to the far edge. */
export function ToolbarSpacer(): React.ReactElement {
  return <span className="rdd-panel-toolbar__spacer" aria-hidden="true" />;
}

// ─── ToolbarItem (custom control wrapper) ────────────────────────────────────

/** Wrapper for a custom non-button control (e.g. a dropdown or input) inside a `PanelToolbar`. */
export function ToolbarItem({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span className="rdd-panel-toolbar__item">{children}</span>;
}

// ─── ToolbarCenter ────────────────────────────────────────────────────────────

/** Centers its children within the toolbar using absolute positioning. */
export function ToolbarCenter({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="rdd-panel-toolbar__center">{children}</div>;
}
