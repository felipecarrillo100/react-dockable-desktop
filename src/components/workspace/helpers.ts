/**
 * @file helpers.ts
 * @description Small helpers of the workspace view: tree lookup, tab drop side, the keyboard's right-click, focus after a tab closes, DOM-safe ids.
 */
import React from 'react';
import { isComputedRtl } from '../../utils/rtl';
import type { LayoutNode, LayoutLeafNode } from '../../types';

export const findLeaf = (node: LayoutNode | null, leafId: string): LayoutLeafNode | null => {
  if (!node) return null;
  if (node.type === 'leaf') return node.id === leafId ? node : null;
  for (const child of node.children) {
    const found = findLeaf(child, leafId);
    if (found) return found;
  }
  return null;
};

// DOM Element Cache for preserving contexts (WebGL map, text area etc.)
/**
 * Which side of a tab a dragged tab would drop on, in tab order: 'left' = before it, 'right' =
 * after it. The pointer's half is physical, but insertion (and the RTL-mirrored indicator CSS)
 * is logical — under RTL the physical left half means *after*.
 */
export const tabDropSide = (tabEl: Element, clientX: number): 'left' | 'right' => {
  const rect = tabEl.getBoundingClientRect();
  const onPhysicalLeft = clientX - rect.left < rect.width / 2;
  return onPhysicalLeft !== isComputedRtl(tabEl) ? 'left' : 'right';
};

/**
 * The keyboard's right-click: the ContextMenu key, or Shift+F10. Chrome on macOS sends no
 * `contextmenu` event for either, so the focused control handles them itself (preventing the
 * default, so a platform that does send one doesn't open the menu twice).
 */
export const isMenuKey = (e: React.KeyboardEvent): boolean => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');

/** Events made by `menuEventAt`: their menu was opened from the keyboard, so it opens on its first item. */
export const keyboardMenuEvents: WeakSet<object> = new WeakSet<object>();

/** A `contextmenu` event placed at an element, for opening that element's menu from the keyboard. */
export const menuEventAt = (el: Element): React.MouseEvent => {
  const r = el.getBoundingClientRect();
  const event = new MouseEvent('contextmenu', { clientX: r.left, clientY: r.bottom, cancelable: true });
  keyboardMenuEvents.add(event);
  return event as unknown as React.MouseEvent;
};

/**
 * The menu's initial focus for one of the library's own menus: the first item when it was opened
 * from the keyboard (the Menu key or Shift+F10 via `menuEventAt`, or Enter/Space on a button,
 * whose click has `detail` 0), else the default — the menu itself, nothing highlighted.
 */
export const initialFocusFor = (e: React.MouseEvent): 'first-item' | undefined =>
  keyboardMenuEvents.has(e) || (e.type === 'click' && e.detail === 0) ? 'first-item' : undefined;

/**
 * After a tab closed from the keyboard, keep focus in the workspace instead of letting it drop to
 * <body>: the tab selected in its place, else the workspace's active tab, else the workspace.
 * Leaves focus alone if the close was refused, or if something else (a dialog) already moved it.
 */
export const refocusAfterTabClose = (id: string, strip: HTMLElement | null, workspaceEl: HTMLElement | null): void => {
  if (!workspaceEl?.isConnected) return;
  const esc = id.replace(/["\\]/g, '\\$&');
  if (workspaceEl.querySelector(`[data-tab-id="${esc}"]`)) return;
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const target = (strip?.isConnected ? strip.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') : null)
    ?? workspaceEl.querySelector<HTMLElement>('.rdd-workspace-tab-active-focused')
    ?? workspaceEl.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    ?? workspaceEl;
  target.focus();
};

/** A panel or group id made safe for an HTML `id` (used to link tabs to their tab panel). */
export const domIdPart = (raw: string): string => raw.replace(/[^A-Za-z0-9_-]/g, '_');

/** A touch press held this long starts a drag (or opens a menu) instead of a tap. */
export const LONG_PRESS_MS = 300;
/** Moving this far before then cancels the long press: the finger is scrolling, not pressing. */
export const CANCEL_MOVE_PX = 8;
