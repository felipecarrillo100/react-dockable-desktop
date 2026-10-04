/**
 * @file useWorkspaceSize.ts
 * @description The workspace's measured size, kept current by a ResizeObserver, with development warnings when the workspace has no height or is taller than the window.
 */
import React, { useState, useEffect } from 'react';

export function useWorkspaceSize(workspaceRef: React.RefObject<HTMLDivElement | null>): { width: number; height: number } {
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1024, height: 768 });

  // Dynamically observe the workspace container bounds (accounts for sidebar expanding/collapsing and taskbar showing/hiding)
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    let heightWarnShown = false;
    let tallWarnShown = false;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const rect = entries[0].contentRect;

      if (process.env.NODE_ENV === 'development' && rect.height < 10 && !heightWarnShown) {
        heightWarnShown = true;

        // Walk up the ancestor chain to find the highest zero-height element
        let culprit: Element = el;
        let cursor = el.parentElement;
        while (cursor && cursor !== document.documentElement) {
          if (cursor.getBoundingClientRect().height < 10) {
            culprit = cursor;
          } else {
            break;
          }
          cursor = cursor.parentElement;
        }

        const tag = culprit.tagName.toLowerCase();
        const id  = culprit.id ? ` id="${culprit.id}"` : '';
        const cls = culprit.className ? ` class="${culprit.className}"` : '';
        const who = culprit === el
          ? 'the RddDesktop container itself'
          : `a wrapper element: <${tag}${id}${cls}>`;

        console.warn(
          `[react-dockable-desktop] Workspace height is 0px — the workspace will be invisible.\n\n` +
          `Zero height found at: ${who}\n\n` +
          `Root cause: in CSS, "height: 100%" only works when the parent has an explicit height.\n` +
          `If any ancestor has height: auto (the default for <div>), the chain breaks and\n` +
          `everything inside collapses to 0px.\n\n` +
          `Fix options:\n` +
          `  1. Use height: 100vh directly on the workspace wrapper:\n` +
          `       <div style={{ height: '100vh', overflow: 'hidden' }}>\n` +
          `         <RddDesktop />\n` +
          `       </div>\n\n` +
          `  2. Use CSS Grid/Flex and let the workspace fill remaining space:\n` +
          `       .layout { display: flex; flex-direction: column; height: 100vh; }\n` +
          `       .workspace { flex: 1; min-height: 0; }\n\n` +
          `  3. For a workspace that fills the window, put className="rdd-fill-viewport" on its wrapper.`
        );
      }

      // Without a height of its own, a workspace in a full-window app grows with its content and the
      // *page* scrolls instead of the panels. Until 7.0 the stylesheet hid that by fixing
      // html, body and #root to the viewport; it no longer styles the host page.
      if (process.env.NODE_ENV === 'development' && !tallWarnShown
        && rect.height > window.innerHeight + 1
        && document.documentElement.scrollHeight > window.innerHeight + 1) {
        tallWarnShown = true;
        console.warn(
          `[react-dockable-desktop] The workspace is taller than the window (${Math.round(rect.height)}px > ` +
          `${window.innerHeight}px), so the page scrolls instead of the panels.\n\n` +
          `For a workspace that fills the window, give its wrapper the rdd-fill-viewport class:\n` +
          `  <div className="rdd-fill-viewport"> … <RddDesktop /> … </div>\n\n` +
          `(Before 7.0 the stylesheet fixed html, body and #root to 100% height; it no longer styles the host page.)`
        );
      }

      setWorkspaceSize({
        width: Math.max(100, rect.width),
        height: Math.max(100, rect.height)
      });
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return workspaceSize;
}
