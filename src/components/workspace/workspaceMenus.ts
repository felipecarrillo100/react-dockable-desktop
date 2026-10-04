/**
 * @file workspaceMenus.ts
 * @description The workspace's own context menus: a tab's, and a minimized panel's on the taskbar.
 */
import React from 'react';
import { formatLabel } from '../WindowManagerContext';
import type { MessageDescriptor, MessageFormatter, WorkspaceState, InternalWindowActions } from '../../types';
import type { MessageKey } from '../predefinedMessages';
import type { PanelRegistry } from '../PanelRegistry';
import { initialFocusFor } from './helpers';
import { ContextMenuIcons } from './icons';
import type { HoveredMinimized } from './Taskbar';

export interface WorkspaceMenusDeps {
  state: WorkspaceState;
  registry: PanelRegistry;
  messages: Record<MessageKey, MessageDescriptor>;
  formatMessage: MessageFormatter;
  handleRequestClose: (id: string) => unknown;
  setHoveredMinimized: (v: HoveredMinimized | null) => void;
  actions: Pick<InternalWindowActions, 'floatPanel' | 'minimizePanel' | 'restorePanel' | 'maximizePanel' | 'getPanelContextMenuItems' | 'showContextMenu'>;
}

export function createWorkspaceMenus(deps: WorkspaceMenusDeps): { handleTabRightClick: (id: string, e: React.MouseEvent) => void; handleMinimizedRightClick: (id: string, e: React.MouseEvent) => void } {
  const { state, registry, messages, formatMessage, handleRequestClose, setHoveredMinimized } = deps;
  const { floatPanel, minimizePanel, restorePanel, maximizePanel, getPanelContextMenuItems, showContextMenu } = deps.actions;

  const handleTabRightClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const panel = state.panels[id];
    if (!panel) return;
    const registryEntry = registry.get(panel.component);
    const options = registryEntry?.defaultOptions;

    const items = [];
    if (options?.canDrag !== false) {
      items.push({
        label: formatLabel(messages.floatWindow, formatMessage),
        icon: ContextMenuIcons.float,
        action: () => floatPanel(id)
      });
    }
    if (options?.canMinimize !== false) {
      items.push({
        label: formatLabel(messages.minimizePanel, formatMessage),
        icon: ContextMenuIcons.minimize,
        action: () => minimizePanel(id)
      });
    }
    if (items.length > 0 && options?.canClose !== false) {
      items.push({ separator: true as const });
    }
    if (options?.canClose !== false) {
      items.push({
        label: formatLabel(messages.closeTab, formatMessage),
        icon: ContextMenuIcons.close,
        action: () => handleRequestClose(id)
      });
    }

    if (items.length === 0) return;

    const custom = getPanelContextMenuItems(id);
    const finalItems = custom.length > 0 ? [...items, { separator: true as const }, ...custom] : items;

    showContextMenu({
      event: e,
      items: finalItems,
      initialFocus: initialFocusFor(e),
    });
  };

  const handleMinimizedRightClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setHoveredMinimized(null);
    // Maximizing needs a floating window. A panel minimized from a group is floated on the way
    // back, which a `canDrag: false` panel refuses — so for it the item would do nothing.
    const panel = state.panels[id];
    const canMaximize = panel?.previousState === 'floating'
      || registry.get(panel?.component ?? '')?.defaultOptions?.canDrag !== false;
    showContextMenu({
      event: e,
      initialFocus: initialFocusFor(e),
      items: [
        {
          label: formatLabel(messages.restorePanel, formatMessage),
          icon: ContextMenuIcons.restore,
          action: () => restorePanel(id)
        },
        ...(canMaximize ? [{
          label: formatLabel(messages.maximizePanel, formatMessage),
          icon: ContextMenuIcons.maximize,
          action: () => maximizePanel(id)
        }] : []),
        { separator: true },
        {
          label: formatLabel(messages.closePanel, formatMessage),
          icon: ContextMenuIcons.close,
          action: () => handleRequestClose(id)
        }
      ]
    });
  };

  return { handleTabRightClick, handleMinimizedRightClick };
}
