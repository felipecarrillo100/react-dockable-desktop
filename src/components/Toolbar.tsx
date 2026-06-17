/**
 * @file Toolbar.tsx
 * @description Vertical or horizontal toolbar strip hosting action buttons,
 * mutually-exclusive radio tool groups, independent toggle modifiers,
 * and collapsible sub-tool group flyouts.
 * State is library-wide via DockableDesktopProvider / ToolbarContext.
 */

import React, { forwardRef, useImperativeHandle, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToolbar } from './ToolbarContext';
import type { ToolbarContextValue } from './ToolbarContext';

// ==========================================
// Item type definitions
// ==========================================

/** A one-shot action button. */
export interface ToolbarActionItem {
  type: 'action';
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** A mutually-exclusive radio button within a named group. */
export interface ToolbarRadioItem {
  type: 'radio';
  id: string;
  group: string;
  label: string;
  icon: React.ReactNode;
  /** Keyboard shortcut hint — displayed in the group flyout; reserved for future custom tooltip. */
  shortcut?: string;
  /** Called when this item becomes active. */
  onActivate?: (id: string) => void;
  disabled?: boolean;
}

/** An independent on/off toggle modifier (e.g. snap-to-grid). */
export interface ToolbarToggleItem {
  type: 'toggle';
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Keyboard shortcut hint — reserved for future custom tooltip. */
  shortcut?: string;
  /** Called after the toggle flips; receives the new active state. */
  onToggle?: (active: boolean) => void;
  disabled?: boolean;
}

/** A visual divider between button groups. */
export interface ToolbarSeparator {
  type: 'separator';
}

// ==========================================
// Group item types (sub-tool flyout)
// ==========================================

/**
 * A single selectable sub-tool inside a group flyout.
 * All sub-items in the same ToolbarGroupItem share one radio group
 * keyed by the parent ToolbarGroupItem's `id`.
 */
export interface ToolbarGroupSubItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Keyboard shortcut displayed in the flyout panel. */
  shortcut?: string;
  disabled?: boolean;
  /** Called when this sub-item is selected. */
  onActivate?: (id: string) => void;
}

/** An entry inside a group flyout — either a sub-item or a separator. */
export type ToolbarGroupEntry = ToolbarGroupSubItem | { type: 'separator' };

/**
 * A collapsed tool-family button that opens a flyout panel listing all
 * sub-tools. Only one sub-tool may be active at a time (radio semantics).
 * The parent button's icon morphs to show the currently active sub-tool.
 *
 * Supports both uncontrolled mode (omit activeItemId — state lives in
 * ToolbarContext) and controlled mode (provide activeItemId — the caller
 * is the single source of truth and must update the prop in response to
 * onActiveItemChange).
 */
export interface ToolbarGroupItem {
  type: 'group';
  /** Serves as both the button ID and the radio group key in ToolbarContext. */
  id: string;
  /** Tooltip / aria-label shown when no sub-item is active. */
  label: string;
  /** Icon shown when no sub-item is active. */
  defaultIcon: React.ReactNode;
  items: ToolbarGroupEntry[];
  disabled?: boolean;
  /**
   * Controlled active sub-item id. When provided (even as null), the
   * component reads this prop instead of ToolbarContext and fires
   * onActiveItemChange on click instead of updating context.
   * Omit (undefined) for uncontrolled behaviour.
   */
  activeItemId?: string | null;
  /**
   * Called when the user selects a sub-item in controlled mode.
   * The toolbar does not update itself — the caller must update activeItemId.
   */
  onActiveItemChange?: (id: string) => void;
}

export type ToolbarItem =
  | ToolbarActionItem
  | ToolbarRadioItem
  | ToolbarToggleItem
  | ToolbarGroupItem
  | ToolbarSeparator;

// ==========================================
// Props and Handle
// ==========================================

export interface ToolbarProps {
  /** Side the strip is attached to. Controls strip orientation. Default: 'left' */
  position?: 'left' | 'right' | 'top' | 'bottom';
  /** Ordered list of items to render. */
  items: ToolbarItem[];
  /** Collapse the strip to zero width/height. State is preserved — no unmount. */
  visible?: boolean;
  /** Called when show/hide/toggle is invoked on the imperative handle. */
  onVisibilityChange?: (visible: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

export interface ToolbarHandle {
  show(): void;
  hide(): void;
  toggle(): void;
}

// ==========================================
// ToolbarGroupButton — internal sub-component
// Manages its own open/close state and renders the flyout via a portal
// so it is never clipped by the strip's overflow:hidden.
// ==========================================

interface ToolbarGroupButtonProps {
  item: ToolbarGroupItem;
  position: 'left' | 'right' | 'top' | 'bottom';
  toolbar: ToolbarContextValue;
}

function flyoutPosition(
  rect: DOMRect,
  position: 'left' | 'right' | 'top' | 'bottom',
  isRtl = false,
  gap = 8,
): React.CSSProperties {
  switch (position) {
    case 'left':
      // RTL: flex-row reverses, so 'left' toolbar sits on the right → open leftward
      return isRtl
        ? { right: window.innerWidth - rect.left + gap, top: rect.top }
        : { left: rect.right + gap, top: rect.top };
    case 'right':
      // RTL: 'right' toolbar sits on the left → open rightward
      return isRtl
        ? { left: rect.right + gap, top: rect.top }
        : { right: window.innerWidth - rect.left + gap, top: rect.top };
    case 'top':
      return isRtl
        ? { top: rect.bottom + gap, right: window.innerWidth - rect.right }
        : { top: rect.bottom + gap, left: rect.left };
    case 'bottom':
      return isRtl
        ? { bottom: window.innerHeight - rect.top + gap, right: window.innerWidth - rect.right }
        : { bottom: window.innerHeight - rect.top + gap, left: rect.left };
  }
}

function ToolbarGroupButton({ item, position, toolbar }: ToolbarGroupButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [btnRect, setBtnRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  const isControlled = item.activeItemId !== undefined;
  const activeId = isControlled ? item.activeItemId : toolbar.getActiveInGroup(item.id);
  const activeSubItem = item.items.find(
    (e): e is ToolbarGroupSubItem => !('type' in e) && e.id === activeId,
  );
  const isActive = activeId !== null;
  const displayIcon = activeSubItem?.icon ?? item.defaultIcon;
  const displayLabel = activeSubItem?.label ?? item.label;

  const handleClick = () => {
    if (item.disabled) return;
    if (!isOpen && btnRef.current) {
      setBtnRect(btnRef.current.getBoundingClientRect());
    }
    setIsOpen(prev => !prev);
  };

  // Clamp flyout to viewport after it renders (runs before paint to avoid jitter)
  useLayoutEffect(() => {
    if (!isOpen || !flyoutRef.current) return;
    const el = flyoutRef.current;
    const r = el.getBoundingClientRect();
    const PAD = 8;
    if (r.right > window.innerWidth - PAD) {
      el.style.left = `${Math.max(PAD, window.innerWidth - r.width - PAD)}px`;
      el.style.right = 'auto';
    }
    if (r.left < PAD) {
      el.style.left = `${PAD}px`;
      el.style.right = 'auto';
    }
    if (r.bottom > window.innerHeight - PAD) {
      el.style.top = `${Math.max(PAD, window.innerHeight - r.height - PAD)}px`;
      el.style.bottom = 'auto';
    }
    if (r.top < PAD) {
      el.style.top = `${PAD}px`;
      el.style.bottom = 'auto';
    }
  }, [isOpen]);

  // Close flyout on click-away (exclude clicks inside the button or flyout itself)
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen]);

  // Close flyout on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`toolbar-btn toolbar-btn-group${isActive ? ' active' : ''}`}
        title={displayLabel}
        aria-label={displayLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        disabled={item.disabled}
        onClick={handleClick}
      >
        {displayIcon}
      </button>

      {isOpen && btnRect && createPortal(
        <div
          ref={flyoutRef}
          className={`toolbar-group-flyout ${position}`}
          style={flyoutPosition(btnRect, position, document.documentElement.dir === 'rtl')}
          role="menu"
        >
          {item.items.map((entry, i) => {
            if ('type' in entry) {
              return <div key={`sep-${i}`} className="toolbar-group-flyout-sep" role="separator" />;
            }
            const isSubActive = activeId === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={`toolbar-group-flyout-item${isSubActive ? ' active' : ''}`}
                disabled={entry.disabled}
                role="menuitem"
                aria-pressed={isSubActive}
                onClick={() => {
                  if (isControlled) {
                    item.onActiveItemChange?.(entry.id);
                  } else {
                    toolbar.setActiveInGroup(item.id, entry.id);
                  }
                  entry.onActivate?.(entry.id);
                  setIsOpen(false);
                }}
              >
                <span className="toolbar-group-flyout-icon">{entry.icon}</span>
                <span className="toolbar-group-flyout-label">{entry.label}</span>
                {entry.shortcut && (
                  <span className="toolbar-group-flyout-shortcut">{entry.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ==========================================
// renderItem — pure helper outside component
// ==========================================

function renderItem(
  item: ToolbarItem,
  index: number,
  toolbar: ToolbarContextValue,
  position: 'left' | 'right' | 'top' | 'bottom',
): React.ReactNode {
  switch (item.type) {
    case 'separator':
      return <div key={`sep-${index}`} className="toolbar-separator" role="separator" />;

    case 'action':
      return (
        <button
          key={item.id}
          type="button"
          className="toolbar-btn toolbar-btn-action"
          title={item.label}
          aria-label={item.label}
          disabled={item.disabled}
          onClick={item.onClick}
        >
          {item.icon}
        </button>
      );

    case 'radio': {
      const isActive = toolbar.getActiveInGroup(item.group) === item.id;
      return (
        <button
          key={item.id}
          type="button"
          className={`toolbar-btn toolbar-btn-radio${isActive ? ' active' : ''}`}
          title={item.label}
          aria-label={item.label}
          aria-pressed={isActive}
          disabled={item.disabled}
          onClick={() => {
            toolbar.setActiveInGroup(item.group, item.id);
            item.onActivate?.(item.id);
          }}
        >
          {item.icon}
        </button>
      );
    }

    case 'toggle': {
      const isActive = toolbar.isModifierActive(item.id);
      return (
        <button
          key={item.id}
          type="button"
          className={`toolbar-btn toolbar-btn-toggle${isActive ? ' active' : ''}`}
          title={item.label}
          aria-label={item.label}
          aria-pressed={isActive}
          disabled={item.disabled}
          onClick={() => {
            toolbar.toggleModifier(item.id);
            item.onToggle?.(!isActive);
          }}
        >
          {item.icon}
        </button>
      );
    }

    case 'group':
      return (
        <ToolbarGroupButton
          key={item.id}
          item={item}
          position={position}
          toolbar={toolbar}
        />
      );
  }
}

// ==========================================
// Component
// ==========================================

export const Toolbar: React.ForwardRefExoticComponent<ToolbarProps & React.RefAttributes<ToolbarHandle>> = forwardRef<ToolbarHandle, ToolbarProps>(function Toolbar(
  { position = 'left', items, visible, onVisibilityChange, className, style },
  ref
) {
  const toolbar = useToolbar();
  const isVertical = position === 'left' || position === 'right';

  useImperativeHandle(ref, () => ({
    show: () => onVisibilityChange?.(true),
    hide: () => onVisibilityChange?.(false),
    toggle: () => onVisibilityChange?.(visible === false ? true : false),
  }), [visible, onVisibilityChange]);

  // CSS owns the open-state dimensions (including the touch @media 56px override).
  // Inline style only forces 0px when collapsed so the transition animates correctly.
  const collapseStyle: React.CSSProperties = visible !== false
    ? {}
    : isVertical
      ? { width: '0px' }
      : { height: '0px' };

  return (
    <div
      className={`toolbar-strip ${position}${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      style={{ ...collapseStyle, ...style }}
    >
      {items.map((item, i) => renderItem(item, i, toolbar, position))}
    </div>
  );
});

// ==========================================
// Barrel re-exports from ToolbarContext
// ==========================================

export { useToolbar, ToolbarProvider } from './ToolbarContext';
export type { ToolbarContextValue } from './ToolbarContext';
