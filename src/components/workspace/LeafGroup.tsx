/**
 * @file LeafGroup.tsx
 * @description A leaf group: its tab strip (keyboard, scroll, drag and drop) and the selected panel's body.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { isComputedRtl } from '../../utils/rtl';
import { useWindowManagerState, useWindowManagerActionsInternal, useFormatMessage, formatLabel, usePredefinedMessages, useStyleClasses, useRegistry } from '../WindowManagerContext';
import type { LayoutLeafNode, DropPosition } from '../../types';
import { tabDropSide, isMenuKey, menuEventAt, refocusAfterTabClose, domIdPart } from './helpers';
import { DefaultGridIcon } from './icons';
import { PreservedDOMWrapper } from './panelMount';
import type { TabContentProps } from '../../types';

export interface LeafGroupProps {
  leaf: LayoutLeafNode;
  onTabRightClick: (id: string, e: React.MouseEvent) => void;
  activeDropZone: { leafId: string; position: DropPosition } | null;
  onHoverDropZone: (leafId: string, position: DropPosition | null) => void;
  onTabDragStart: (id: string, e: React.PointerEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  defaultPanelIcon?: React.ReactNode;
  /** Set on the root group only: shown in place of the built-in message while it has no panels. */
  emptyWorkspace?: React.ReactNode;
  /** The app's tab content (7.10.0). */
  renderTabContent?: (tab: TabContentProps) => React.ReactNode;
  onRequestClosePanel: (id: string) => Promise<void> | void;
}

export const LeafGroup: React.FC<LeafGroupProps> = ({ leaf, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover, defaultPanelIcon, onRequestClosePanel, emptyWorkspace, renderTabContent }) => {
  const state = useWindowManagerState();
  const registry = useRegistry();
  const { openPanel, closeLeafGroup, setActivePanel, isDropAllowed } = useWindowManagerActionsInternal();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const { windowClass, windowBodyClass } = useStyleClasses();

  const tabContainerRef = useRef<HTMLDivElement>(null);
  // Overflow tracked in reading order: `start` = tabs hidden before the first visible one, `end`
  // = after the last. Under RTL, scrollLeft runs from 0 down to negative values, so the physical
  // `scrollLeft > 0` test that used to be here never saw the start overflow and always the end.
  const [tabScroll, setTabScroll] = useState({ start: false, end: false, rtl: false });

  const updateTabScroll = useCallback(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    const travelled = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: travelled > 1, end: travelled < max - 1, rtl: isComputedRtl(el) };
    setTabScroll(prev => (prev.start === next.start && prev.end === next.end && prev.rtl === next.rtl ? prev : next));
  }, []);

  useEffect(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateTabScroll, { passive: true });
    const ro = new ResizeObserver(updateTabScroll);
    ro.observe(el);
    updateTabScroll();
    return () => { el.removeEventListener('scroll', updateTabScroll); ro.disconnect(); };
  }, [updateTabScroll]);

  const scrollTabs = (toward: 'start' | 'end') => {
    // In reading order: toward the end is +x in LTR and −x in RTL.
    const forward = toward === 'end' ? 120 : -120;
    tabContainerRef.current?.scrollBy({ left: tabScroll.rtl ? -forward : forward, behavior: 'smooth' });
  };
  // The start button comes first in the DOM, so it sits on the physical left in LTR and on the
  // physical right in RTL. Class, glyph and label follow the physical side.
  const startSide = tabScroll.rtl ? 'right' : 'left';
  const endSide = tabScroll.rtl ? 'left' : 'right';
  const scrollGlyph = { left: '\u2039', right: '\u203A' } as const;
  const scrollLabel = { left: messages.scrollTabsLeft, right: messages.scrollTabsRight } as const;

  const selectTab = (id: string) => {
    openPanel(id, state.panels[id].component);
    setActivePanel(id);
  };

  // WAI-ARIA tabs pattern: one tab stop per group (the selected tab); the arrow keys move the
  // selection and focus along the strip — mirrored under RTL, where the strip runs right to left.
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLElement>, id: string, closable: boolean) => {
    if (isMenuKey(e)) {
      e.preventDefault();
      onTabRightClick(id, menuEventAt(e.currentTarget));
      return;
    }
    const ids = leaf.panels.filter(p => state.panels[p]);
    const i = ids.indexOf(id);
    const step = isComputedRtl(e.currentTarget) ? -1 : 1;
    let next: string | undefined;
    switch (e.key) {
      case 'ArrowRight': next = ids[(i + step + ids.length) % ids.length]; break;
      case 'ArrowLeft': next = ids[(i - step + ids.length) % ids.length]; break;
      case 'Home': next = ids[0]; break;
      case 'End': next = ids[ids.length - 1]; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectTab(id);
        return;
      case 'Delete': {
        if (!closable) return;
        e.preventDefault();
        const workspaceEl = e.currentTarget.closest<HTMLElement>('.rdd-workspace');
        void Promise.resolve(onRequestClosePanel(id)).then(() => requestAnimationFrame(() => {
          refocusAfterTabClose(id, tabContainerRef.current, workspaceEl);
        }));
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    if (!next || next === id) return;
    selectTab(next);
    tabContainerRef.current
      ?.querySelector<HTMLElement>(`[data-tab-id="${next.replace(/["\\]/g, '\\$&')}"]`)
      ?.focus();
  };
  const tabPanelId = `rdd-tabpanel-${domIdPart(leaf.id)}`;
  const tabIdFor = (panelId: string) => `rdd-tab-${domIdPart(panelId)}`;

  return (
    <div
      data-active-panel-id={leaf.activePanelId || ''}
      data-rdd-leaf={leaf.id}
      className={`rdd-workspace-panel ${windowClass ?? ''}`}
    >
      {/* Tab Headers */}
      <div className="rdd-workspace-tab-bar">
        {tabScroll.start && (
          <button
            className={`rdd-tab-scroll-btn rdd-tab-scroll-btn-${startSide}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => scrollTabs('start')}
            tabIndex={-1}
            aria-label={formatLabel(scrollLabel[startSide], formatMessage)}
          >{scrollGlyph[startSide]}</button>
        )}
        <div
          ref={tabContainerRef}
          className="rdd-tab-headers-container"
          role="tablist"
          aria-orientation="horizontal"
          onPointerMove={(e) => {
            if (state.draggedPanelId && e.target === e.currentTarget) {
              onTabHover(leaf.id, 'EMPTY', leaf.panels.length, 'right');
            }
          }}
          onPointerLeave={(e) => {
            if (state.draggedPanelId && e.target === e.currentTarget) {
              onTabHover(leaf.id, '', -1, null);
            }
          }}
        >
          {leaf.panels.map((id, idx) => {
            const panel = state.panels[id];
            if (!panel) return null;
            const isSelected = leaf.activePanelId === id;
            const isGloballyActive = state.activePanelId === id;

            const registryEntry = registry.get(panel.component);
            const options = registryEntry?.defaultOptions;

            const isHovered = hoveredTab && hoveredTab.leafId === leaf.id && hoveredTab.panelId === id;
            const isLast = idx === leaf.panels.length - 1;
            const isHoveredEmpty = hoveredTab && hoveredTab.leafId === leaf.id && hoveredTab.panelId === 'EMPTY' && isLast;
            const sideClass = isHovered
              ? (hoveredTab.side === 'left' ? 'rdd-drag-hover-left' : 'rdd-drag-hover-right')
              : (isHoveredEmpty ? 'rdd-drag-hover-right' : '');

            const tabFocusClass = isSelected
              ? (isGloballyActive ? 'rdd-active rdd-workspace-tab-active-focused' : 'rdd-active rdd-workspace-tab-active-unfocused')
              : 'rdd-workspace-tab-inactive';

            return (
              <div
                key={id}
                id={tabIdFor(id)}
                role="tab"
                aria-selected={isSelected}
                aria-controls={tabPanelId}
                aria-keyshortcuts={options?.canClose !== false ? 'Delete' : undefined}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, id, options?.canClose !== false)}
                data-tab-id={id}
                data-leaf-id={leaf.id}
                data-rdd-tab={id}
                data-tab-index={String(idx)}
                // State for app CSS (7.8.0): present when true, so `[data-rdd-dirty]` matches.
                data-rdd-selected={isSelected ? '' : undefined}
                data-rdd-focused={isGloballyActive ? '' : undefined}
                data-rdd-dirty={panel?.dirty ? '' : undefined}
                onClick={() => selectTab(id)}
                onPointerDown={(e) => {
                  if (options?.canDrag !== false) {
                    onTabDragStart(id, e);
                  }
                }}
                onContextMenu={(e) => onTabRightClick(id, e)}
                onPointerMove={(e) => {
                  if (state.draggedPanelId && e.pointerType !== 'touch') {
                    onTabHover(leaf.id, id, idx, tabDropSide(e.currentTarget, e.clientX));
                  }
                }}
                onPointerLeave={() => {
                  if (state.draggedPanelId) {
                    onTabHover(leaf.id, '', -1, null);
                  }
                }}
                className={`rdd-workspace-tab ${tabFocusClass} ${sideClass}${options?.tabClassName ? ` ${options.tabClassName}` : ''}`}
                style={{ cursor: options?.canDrag === false ? 'default' : 'pointer' }}
              >
                <span className="rdd-text-truncate rdd-workspace-tab-title">
                  {(() => {
                    const icon = panel.icon ?? (options?.icon || defaultPanelIcon || DefaultGridIcon);
                    const title = formatLabel(panel.title, formatMessage);
                    // The app's content replaces the icon, title and marker; the tab stays ours (7.10.0).
                    if (renderTabContent) {
                      return renderTabContent({ panelId: id, component: panel.component, title, icon, dirty: panel.dirty === true, selected: isSelected, focused: isGloballyActive });
                    }
                    return (
                      <>
                        <span className="rdd-workspace-tab-icon">{icon}</span>
                        <span>
                          {title}
                          {panel.dirty ? ' *' : ''}
                        </span>
                      </>
                    );
                  })()}
                </span>
                {options?.renderHeaderActions && (
                  <span
                    className="rdd-tab-header-actions"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {options.renderHeaderActions(id)}
                  </span>
                )}
                {options?.canClose !== false && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestClosePanel(id);
                    }}
                    title={formatLabel(messages.closeTab, formatMessage)}
                    // Not a separate control: interactive content inside role="tab" is not allowed.
                    // Keyboard users close the focused tab with Delete.
                    aria-hidden="true"
                    className={`rdd-close-tab-x${options?.renderHeaderActions ? '' : ' rdd-close-tab-x--end'}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {tabScroll.end && (
          <button
            className={`rdd-tab-scroll-btn rdd-tab-scroll-btn-${endSide}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => scrollTabs('end')}
            tabIndex={-1}
            aria-label={formatLabel(scrollLabel[endSide], formatMessage)}
          >{scrollGlyph[endSide]}</button>
        )}

        {/* Empty group close button — only visible when keepOnEmpty keeps the group alive */}
        {leaf.panels.length === 0 && leaf.keepOnEmpty && leaf.canClose !== false && (
          <button
            type="button"
            onClick={() => { void closeLeafGroup(leaf.id); }}
            className="rdd-close-tab-x rdd-header-close-empty-group"
            title={formatLabel(messages.closeEmptyGroup, formatMessage)}
            aria-label={formatLabel(messages.closeEmptyGroup, formatMessage)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Tab Content Display Area */}
      <div
        id={tabPanelId}
        role="tabpanel"
        aria-labelledby={leaf.activePanelId ? tabIdFor(leaf.activePanelId) : undefined}
        className={`rdd-panel-body ${windowBodyClass ?? ''}`}
              >
        {leaf.activePanelId && state.panels[leaf.activePanelId] ? (
          <PreservedDOMWrapper key={leaf.activePanelId} panelId={leaf.activePanelId} />
        ) : emptyWorkspace !== undefined && leaf.panels.length === 0 ? (
          <div className="rdd-empty-workspace">{emptyWorkspace}</div>
        ) : (
          <div className="rdd-empty-leaf-placeholder">
            <span>{formatLabel(messages.emptyGroup, formatMessage)}</span>
          </div>
        )}

        {/* Drag overlay targets cross */}
        {state.draggedPanelId !== null && (() => {
          // State-driven, not :hover-driven — :hover never fires reliably in Safari
          // during an active drag, and doesn't exist at all on touch. activeDropZone
          // already tracks this for mouse, pen, and touch alike (see updateHoverFromPoint).
          const isActive = (pos: DropPosition) => activeDropZone?.leafId === leaf.id && activeDropZone.position === pos;
          // A target the rules forbid isn't offered at all (7.9.0). Zones are drawn by screen side;
          // the move flips left and right under RTL, and canDrop sees the side the move applies.
          const dragged = state.draggedPanelId;
          const applied = (pos: DropPosition): DropPosition =>
            state.isRtl && (pos === 'left' || pos === 'right') ? (pos === 'left' ? 'right' : 'left') : pos;
          const offer = (pos: DropPosition) => isDropAllowed(dragged, { kind: 'group', leafId: leaf.id, position: applied(pos) });
          return (
          <div className="rdd-dock-drop-zone-overlay">
            <div className="rdd-dock-target-cross">
              {/* Top target */}
              {offer('top') && (
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="top"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'top')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className={`rdd-dock-target-box rdd-dock-target-top${isActive('top') ? ' rdd-dock-target-box--active' : ''}`}
              >
                ▲
              </div>
              )}
              {/* Bottom target */}
              {offer('bottom') && (
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="bottom"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'bottom')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className={`rdd-dock-target-box rdd-dock-target-bottom${isActive('bottom') ? ' rdd-dock-target-box--active' : ''}`}
              >
                ▼
              </div>
              )}
              {/* Left target */}
              {offer('left') && (
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="left"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'left')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className={`rdd-dock-target-box rdd-dock-target-left${isActive('left') ? ' rdd-dock-target-box--active' : ''}`}
              >
                ◀
              </div>
              )}
              {/* Right target */}
              {offer('right') && (
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="right"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'right')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className={`rdd-dock-target-box rdd-dock-target-right${isActive('right') ? ' rdd-dock-target-box--active' : ''}`}
              >
                ▶
              </div>
              )}
              {/* Center target */}
              {offer('center') && (
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="center"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'center')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className={`rdd-dock-target-box rdd-dock-target-center${isActive('center') ? ' rdd-dock-target-box--active' : ''}`}
              >
                ▣
              </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* Visual preview highlight overlay */}
        {state.draggedPanelId !== null && activeDropZone !== null && activeDropZone.leafId === leaf.id && (
          <div
            className="rdd-dock-preview-highlight"
            style={(() => {
              const pos = activeDropZone.position;
              const pct = `${state.splitRatio * 100}%`;
              const rem = `${(1 - state.splitRatio) * 100}%`;
              return {
                left:   pos === 'right'  ? rem   : '0',
                top:    pos === 'bottom' ? rem   : '0',
                width:  (pos === 'left' || pos === 'right')  ? pct : '100%',
                height: (pos === 'top'  || pos === 'bottom') ? pct : '100%',
              };
            })()}
          />
        )}
      </div>
    </div>
  );
};
