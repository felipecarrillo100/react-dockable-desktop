/**
 * @file Taskbar.tsx
 * @description The taskbar of minimized panels: its items, the hover or long-press preview, scrolling and autohide.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { formatLabel } from '../WindowManagerContext';
import type { MessageDescriptor, MessageFormatter, WorkspaceState, InternalWindowActions } from '../../types';
import type { MessageKey } from '../predefinedMessages';
import type { PanelRegistry } from '../PanelRegistry';
import { isMenuKey, menuEventAt, LONG_PRESS_MS, CANCEL_MOVE_PX } from './helpers';
import { DefaultGridIcon } from './icons';
import { PreviewDOMWrapper } from './panelMount';
import type { TaskbarVisibility } from '../WindowManager';

/** The minimized panel whose preview is showing, and where its taskbar item is. */
export type HoveredMinimized = { id: string; rect: DOMRect; title: WorkspaceState['minimized'][number]['title']; component: string; fromTouch?: boolean };

export interface TaskbarProps extends Pick<InternalWindowActions, 'restorePanel'> {
  state: WorkspaceState;
  registry: PanelRegistry;
  taskbarVisibility: TaskbarVisibility;
  taskbarExpanded: boolean;
  expandTaskbar: () => void;
  leaveTaskbar: () => void;
  scrollTaskbar: (direction: 'left' | 'right') => void;
  taskbarRef: React.RefObject<HTMLDivElement | null>;
  /** This workspace's preview tooltip, so the touch dismissal never tests another workspace's. */
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  defaultPanelIcon?: React.ReactNode;
  messages: Record<MessageKey, MessageDescriptor>;
  formatMessage: MessageFormatter;
  lastTaskbarPointerTypeRef: React.RefObject<string>;
  hoveredMinimized: HoveredMinimized | null;
  setHoveredMinimized: (v: HoveredMinimized | null) => void;
  minimizedTooltipTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  isContextMenuOpen: boolean;
  handleMinimizedRightClick: (id: string, e: React.MouseEvent) => void;
  handleRequestClose: (id: string) => unknown;
}

export const Taskbar = ({
  state, registry, taskbarVisibility, taskbarExpanded, expandTaskbar, leaveTaskbar, scrollTaskbar,
  taskbarRef, tooltipRef, defaultPanelIcon, messages, formatMessage, lastTaskbarPointerTypeRef, hoveredMinimized,
  setHoveredMinimized, minimizedTooltipTimeoutRef, isContextMenuOpen, handleMinimizedRightClick,
  handleRequestClose, restorePanel,
}: TaskbarProps): React.ReactElement | null => {
  if (!((taskbarVisibility === 'always' || state.minimized.length > 0))) return null;
  return (
    <div
      className={[
        'rdd-taskbar-footer-container',
        `rdd-taskbar-mode-${taskbarVisibility}`,
        taskbarVisibility === 'autohide' && taskbarExpanded ? 'rdd-taskbar-expanded' : '',
      ].filter(Boolean).join(' ')}
      onPointerEnter={taskbarVisibility === 'autohide' ? expandTaskbar : undefined}
      onPointerLeave={taskbarVisibility === 'autohide' ? leaveTaskbar : undefined}
    >
      {taskbarVisibility === 'autohide' && <div className="rdd-taskbar-peek-handle" />}
      <button
        type="button"
        onClick={() => scrollTaskbar('left')}
        className="rdd-taskbar-nav-btn"
        aria-label={formatLabel(messages.scrollTaskbarLeft, formatMessage)}
        style={{ display: state.minimized.length > 4 ? 'block' : 'none' }}
      >
        ◀
      </button>

      <div
        ref={taskbarRef}
        className="rdd-taskbar-items-container"
      >
        {state.minimized.map(m => {
          const regEntry = registry.get(m.component);
          const icon = state.panels[m.id]?.icon ?? (regEntry?.defaultOptions?.icon || defaultPanelIcon || DefaultGridIcon);

          return (
            <button
              type="button"
              key={m.id}
              aria-label={formatLabel(m.title, formatMessage)}
              onClick={(e) => {
                // A touch tap is handled by the long-press logic in onPointerDown. A keyboard
                // click (Enter / Space) has detail 0 and always restores.
                if (e.detail !== 0 && lastTaskbarPointerTypeRef.current === 'touch') return;
                setHoveredMinimized(null);
                restorePanel(m.id);
              }}
              onContextMenu={(e) => handleMinimizedRightClick(m.id, e)}
              onKeyDown={(e) => {
                if (!isMenuKey(e)) return;
                e.preventDefault();
                handleMinimizedRightClick(m.id, menuEventAt(e.currentTarget));
              }}
              onPointerDown={(e) => {
                lastTaskbarPointerTypeRef.current = e.pointerType;
                if (e.pointerType !== 'touch') return;
                const el = e.currentTarget as HTMLElement;
                const startX = e.clientX;
                const startY = e.clientY;
                const pointerId = e.pointerId;
                let cancelled = false;
                const cancel = () => {
                  cancelled = true;
                  clearTimeout(timer);
                  el.removeEventListener('pointermove', onPreMove);
                  el.removeEventListener('pointerup', onShortTap);
                  el.removeEventListener('pointercancel', cancel);
                };
                const onShortTap = () => {
                  cancel();
                  const rect = el.getBoundingClientRect();
                  if (hoveredMinimized?.id === m.id) {
                    restorePanel(m.id);
                    setHoveredMinimized(null);
                  } else {
                    setHoveredMinimized({ id: m.id, rect, title: m.title, component: m.component, fromTouch: true });
                  }
                };
                const onPreMove = (me: PointerEvent) => {
                  if (Math.hypot(me.clientX - startX, me.clientY - startY) > CANCEL_MOVE_PX) cancel();
                };
                const timer = setTimeout(() => {
                  if (cancelled) return;
                  el.removeEventListener('pointermove', onPreMove);
                  el.removeEventListener('pointerup', onShortTap);
                  el.removeEventListener('pointercancel', cancel);
                  try { el.setPointerCapture(pointerId); } catch { return; }
                  if (navigator.vibrate) navigator.vibrate(10);
                  const onEnd = (me: PointerEvent) => {
                    el.removeEventListener('pointerup', onEnd);
                    el.removeEventListener('pointercancel', onEnd);
                    handleMinimizedRightClick(m.id, me as unknown as React.MouseEvent);
                  };
                  el.addEventListener('pointerup', onEnd);
                  el.addEventListener('pointercancel', onEnd);
                }, LONG_PRESS_MS);
                el.addEventListener('pointermove', onPreMove);
                el.addEventListener('pointerup', onShortTap);
                el.addEventListener('pointercancel', cancel);
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'touch') return;
                if (isContextMenuOpen) return;
                if (minimizedTooltipTimeoutRef.current) {
                  clearTimeout(minimizedTooltipTimeoutRef.current);
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const isInside = (
                  e.clientX >= rect.left &&
                  e.clientX <= rect.right &&
                  e.clientY >= rect.top &&
                  e.clientY <= rect.bottom
                );
                if (!isInside) return;
                setHoveredMinimized({ id: m.id, rect, title: m.title, component: m.component });
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'touch') return;
                minimizedTooltipTimeoutRef.current = setTimeout(() => {
                  setHoveredMinimized(null);
                }, 150);
              }}
              className="rdd-taskbar-glassmorphic-item"
              data-rdd-taskbar-item={m.id}
            >
              <span className="rdd-taskbar-item-icon" aria-hidden="true">
                {icon}
              </span>
            </button>
          );
        })}
      </div>

      {hoveredMinimized && createPortal(
        <div
          ref={tooltipRef}
          className="rdd-taskbar-item-tooltip"
          dir={state.dir}
          style={{
            left: `${hoveredMinimized.rect.left + hoveredMinimized.rect.width / 2}px`,
            top: `${hoveredMinimized.rect.top - 8}px`,
          }}
          onPointerEnter={() => {
            if (minimizedTooltipTimeoutRef.current) {
              clearTimeout(minimizedTooltipTimeoutRef.current);
            }
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'touch') return;
            setHoveredMinimized(null);
          }}
          onClick={() => {
            restorePanel(hoveredMinimized.id);
            setHoveredMinimized(null);
          }}
          onContextMenu={(e) => handleMinimizedRightClick(hoveredMinimized.id, e)}
          onPointerDown={(e) => {
            if (e.pointerType !== 'touch') return;
            const tooltipId = hoveredMinimized.id;
            const el = e.currentTarget as HTMLElement;
            const startX = e.clientX;
            const startY = e.clientY;
            const pointerId = e.pointerId;
            let cancelled = false;
            const cancel = () => {
              cancelled = true;
              clearTimeout(timer);
              el.removeEventListener('pointermove', onPreMove);
              el.removeEventListener('pointerup', cancel);
              el.removeEventListener('pointercancel', cancel);
            };
            const onPreMove = (me: PointerEvent) => {
              if (Math.hypot(me.clientX - startX, me.clientY - startY) > CANCEL_MOVE_PX) cancel();
            };
            const timer = setTimeout(() => {
              if (cancelled) return;
              el.removeEventListener('pointermove', onPreMove);
              el.removeEventListener('pointerup', cancel);
              el.removeEventListener('pointercancel', cancel);
              try { el.setPointerCapture(pointerId); } catch { return; }
              if (navigator.vibrate) navigator.vibrate(10);
              const onEnd = (me: PointerEvent) => {
                el.removeEventListener('pointerup', onEnd);
                el.removeEventListener('pointercancel', onEnd);
                handleMinimizedRightClick(tooltipId, me as unknown as React.MouseEvent);
              };
              el.addEventListener('pointerup', onEnd);
              el.addEventListener('pointercancel', onEnd);
            }, LONG_PRESS_MS);
            el.addEventListener('pointermove', onPreMove);
            el.addEventListener('pointerup', cancel);
            el.addEventListener('pointercancel', cancel);
          }}
        >
           <div className="rdd-tooltip-header-row">
              <span className="rdd-tooltip-title-text rdd-text-truncate">
                {formatLabel(hoveredMinimized.title, formatMessage)}
                {state.panels[hoveredMinimized.id]?.dirty ? ' *' : ''}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRequestClose(hoveredMinimized.id);
                  setHoveredMinimized(null);
                }}
                title={formatLabel(messages.closePanel, formatMessage)}
                aria-label={formatLabel(messages.closePanel, formatMessage)}
                className="rdd-tooltip-close-x"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
           </div>
           <PreviewDOMWrapper panelId={hoveredMinimized.id} />
        </div>,
        document.body
      )}

      <button
        type="button"
        onClick={() => scrollTaskbar('right')}
        className="rdd-taskbar-nav-btn"
        aria-label={formatLabel(messages.scrollTaskbarRight, formatMessage)}
        style={{ display: state.minimized.length > 4 ? 'block' : 'none' }}
      >
        ▶
      </button>
    </div>
  );
};
