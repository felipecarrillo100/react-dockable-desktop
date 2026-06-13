/**
 * @file Toolbar.tsx
 * @description Vertical or horizontal toolbar strip hosting action buttons,
 * mutually-exclusive radio tool groups, and independent toggle modifiers.
 * State is library-wide via DockableDesktopProvider / ToolbarContext.
 */

import React, { forwardRef, useImperativeHandle } from 'react';
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
  /** Called after the toggle flips; receives the new active state. */
  onToggle?: (active: boolean) => void;
  disabled?: boolean;
}

/** A visual divider between button groups. */
export interface ToolbarSeparator {
  type: 'separator';
}

export type ToolbarItem =
  | ToolbarActionItem
  | ToolbarRadioItem
  | ToolbarToggleItem
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
// renderItem — pure helper outside component
// ==========================================

function renderItem(item: ToolbarItem, index: number, toolbar: ToolbarContextValue): React.ReactNode {
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

  const collapseStyle: React.CSSProperties = isVertical
    ? {
        width: visible !== false ? '48px' : '0px',
        overflow: 'hidden',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }
    : {
        height: visible !== false ? '48px' : '0px',
        overflow: 'hidden',
        transition: 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      };

  return (
    <div
      className={`toolbar-strip ${position}${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      style={{ ...collapseStyle, ...style }}
    >
      {items.map((item, i) => renderItem(item, i, toolbar))}
    </div>
  );
});

// ==========================================
// Barrel re-exports from ToolbarContext
// ==========================================

export { useToolbar, ToolbarProvider } from './ToolbarContext';
export type { ToolbarContextValue } from './ToolbarContext';
