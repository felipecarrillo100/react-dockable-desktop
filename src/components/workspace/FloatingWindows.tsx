/**
 * @file FloatingWindows.tsx
 * @description The workspace's floating windows: title bar, body slot and resize handles, docked to a corner or free.
 */
import React from 'react';
import { formatLabel } from '../WindowManagerContext';
import type { MessageDescriptor, MessageFormatter, WorkspaceState, InternalWindowActions } from '../../types';
import type { MessageKey } from '../predefinedMessages';
import type { PanelRegistry } from '../PanelRegistry';
import type { ResizeDir } from '../dragResize';
import { initialFocusFor } from './helpers';
import { DefaultGridIcon } from './icons';
import { PreservedDOMWrapper } from './panelMount';

export interface FloatingWindowsProps extends Pick<InternalWindowActions, 'setActivePanel' | 'focusPanel' | 'maximizePanel' | 'minimizePanel' | 'getPanelContextMenuItems' | 'showContextMenu'> {
  state: WorkspaceState;
  registry: PanelRegistry;
  windowClass?: string;
  windowBodyClass?: string;
  defaultPanelIcon?: React.ReactNode;
  messages: Record<MessageKey, MessageDescriptor>;
  formatMessage: MessageFormatter;
  handleRequestClose: (id: string) => unknown;
  startDrag: (id: string, e: React.PointerEvent) => void;
  startResize: (id: string, dir: ResizeDir, e: React.PointerEvent) => void;
}

export const FloatingWindows = ({
  state, registry, windowClass, windowBodyClass, defaultPanelIcon, messages, formatMessage,
  setActivePanel, focusPanel, maximizePanel, minimizePanel, getPanelContextMenuItems, showContextMenu,
  handleRequestClose, startDrag, startResize,
}: FloatingWindowsProps): React.ReactElement => (
  <>
    {state.floating.map(w => {
      const panel = state.panels[w.id];
      if (!panel) return null;

      const isMaximized = w.maximized;
      const isDragged = state.draggedPanelId === w.id;
      const isFocused = state.activePanelId === w.id;

      const registryEntry = registry.get(panel.component);
      const options = registryEntry?.defaultOptions;

      return (
        <div
          key={w.id}
          data-window-id={w.id}
          data-rdd-window={w.id}
          dir={state.dir}
          onPointerDownCapture={() => {
            setActivePanel(w.id);
            focusPanel(w.id);
          }}
          className={`rdd-floating-window ${isMaximized ? 'rdd-maximized' : ''} ${isFocused ? 'rdd-window-focused' : ''} ${windowClass ?? ''}`}
          style={(() => {
            const CORNER_INSET = 8;
            const CORNER_GAP = 8;
            const w_ = typeof w.width === 'number' ? `${w.width}px` : w.width;
            const h_ = typeof w.height === 'number' ? `${w.height}px` : w.height;
            if (isMaximized) {
              return { position: 'absolute' as const, left: 0, top: 0, width: '100%', height: '100%', zIndex: w.z, pointerEvents: isDragged ? 'none' as const : 'auto' as const };
            }
            if (w.anchor) {
              const stack = state.floating.filter(fw => fw.anchor === w.anchor && !fw.maximized);
              const idx = stack.findIndex(fw => fw.id === w.id);
              let stackOffset = CORNER_INSET;
              for (let i = 0; i < idx; i++) {
                const sh = typeof stack[i].height === 'number' ? stack[i].height as number : parseFloat(stack[i].height as string);
                stackOffset += sh + CORNER_GAP;
              }
              const isTop = w.anchor.startsWith('top');
              const isRight = w.anchor.endsWith('-right');
              return {
                position: 'absolute' as const,
                [isRight ? 'insetInlineEnd' : 'insetInlineStart']: CORNER_INSET,
                [isTop ? 'top' : 'bottom']: stackOffset,
                width: w_,
                height: h_,
                zIndex: w.z,
                transition: isDragged ? 'none' : 'top 0.2s ease, bottom 0.2s ease',
                pointerEvents: isDragged ? 'none' as const : 'auto' as const,
              };
            }
            return {
              position: 'absolute' as const,
              left: typeof w.x === 'number' ? `${w.x}px` : w.x,
              top: typeof w.y === 'number' ? `${w.y}px` : w.y,
              width: w_,
              height: h_,
              zIndex: w.z,
              pointerEvents: isDragged ? 'none' as const : 'auto' as const,
            };
          })()}
        >
          {/* The frame clips title bar and body to the rounded corners. It is a separate
              element so the resize handles (siblings below) can straddle the window edge:
              clipping on the window itself cut off their outer half, and the corners. */}
          <div className="rdd-floating-window-frame">
          {/* Title Bar */}
          <div
            onDoubleClick={() => maximizePanel(w.id)}
            onPointerDown={(e) => {
              if (options?.canDrag !== false) {
                startDrag(w.id, e);
              }
            }}
            data-rdd-titlebar={w.id}
            className="rdd-floating-window-titlebar rdd-cursor-move"
            style={{ cursor: isMaximized || options?.canDrag === false ? 'default' : 'move' }}
          >
            <span className="rdd-floating-window-title">
              <span className="rdd-window-title-icon">{panel.icon ?? (options?.icon || defaultPanelIcon || DefaultGridIcon)}</span>
              <span>
                {formatLabel(panel.title, formatMessage)}
                {panel.dirty ? ' *' : ''}
              </span>
            </span>
            <div className="rdd-titlebar-actions" onPointerDown={(e) => e.stopPropagation()}>
              {options?.renderHeaderActions && (
                <div className="rdd-window-header-actions">
                  {options.renderHeaderActions(w.id)}
                </div>
              )}
              {getPanelContextMenuItems(w.id).length > 0 && (
                <button
                  type="button"
                  className="rdd-custom-tab-btn rdd-btn-more-actions"
                  title={formatLabel(messages.moreActions, formatMessage)}
                  aria-label={formatLabel(messages.moreActions, formatMessage)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const customItems = getPanelContextMenuItems(w.id);
                    if (customItems.length === 0) return;
                    showContextMenu({
                      event: e,
                      items: customItems,
                      initialFocus: initialFocusFor(e),
                    });
                  }}
                >
                  <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
              )}
              <button
                type="button"
                title={isMaximized
                  ? formatLabel(messages.restoreSize, formatMessage)
                  : formatLabel(messages.maximize, formatMessage)}
                onClick={() => maximizePanel(w.id)}
                className="rdd-custom-tab-btn rdd-btn-maximize-tab"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="4" y="4" width="16" height="16" rx="1.5"/>
                </svg>
              </button>
              {options?.canMinimize !== false && (
                <button
                  type="button"
                  title={formatLabel(messages.minimize, formatMessage)}
                  onClick={() => minimizePanel(w.id)}
                  className="rdd-custom-tab-btn rdd-btn-minimize-tab"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12h14"/>
                  </svg>
                </button>
              )}
              {options?.canClose !== false && (
                <button
                  type="button"
                  title={formatLabel(messages.close, formatMessage)}
                  onClick={() => handleRequestClose(w.id)}
                  className="rdd-custom-tab-btn rdd-btn-close-tab"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Window Content */}
          <div className={`rdd-floating-window-body${windowBodyClass ? ` ${windowBodyClass}` : ''}`}>
            <PreservedDOMWrapper key={w.id} panelId={w.id} />
          </div>
          </div>

          {/* 8-direction resize handles */}
          {!isMaximized && (
            <>
              <div onPointerDown={(e) => startResize(w.id, 'n',  e)} className="rdd-resize-handle rdd-resize-n"  />
              <div onPointerDown={(e) => startResize(w.id, 'ne', e)} className="rdd-resize-handle rdd-resize-ne" />
              <div onPointerDown={(e) => startResize(w.id, 'e',  e)} className="rdd-resize-handle rdd-resize-e"  />
              <div onPointerDown={(e) => startResize(w.id, 'se', e)} className="rdd-resize-handle rdd-resize-se" />
              <div onPointerDown={(e) => startResize(w.id, 's',  e)} className="rdd-resize-handle rdd-resize-s"  />
              <div onPointerDown={(e) => startResize(w.id, 'sw', e)} className="rdd-resize-handle rdd-resize-sw" />
              <div onPointerDown={(e) => startResize(w.id, 'w',  e)} className="rdd-resize-handle rdd-resize-w"  />
              <div onPointerDown={(e) => startResize(w.id, 'nw', e)} className="rdd-resize-handle rdd-resize-nw" />
            </>
          )}
        </div>
      );
    })}
  </>
);
