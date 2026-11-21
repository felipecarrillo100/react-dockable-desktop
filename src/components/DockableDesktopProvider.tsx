import React, { useContext, useEffect, useState } from 'react';
import { WindowManagerProvider } from './WindowManagerContext';
import type { MessageFormatter, MessageDescriptor } from './WindowManagerContext';
import { PanelProvider } from './PanelProviderContext';
import { ToolbarProvider } from './ToolbarContext';
import { PanelContributionProvider } from './PanelContributionContext';
import { ContextMenuContext, ContextMenuProvider, DefaultContextMenuAdapter } from './ContextMenu';
import type { ContextMenuAdapter } from './ContextMenu';
import { WorkspaceClient } from '../WorkspaceClient';
import { WorkspaceInstanceContext } from './WorkspaceInstanceContext';
import type { Workspace } from '../api';
import { PopoutWrapperContext, type PopoutWrapperProps } from './workspace/panelWindow';

/** Props for `<DockableDesktopProvider>`. */
export interface DockableDesktopProviderProps {
  children: React.ReactNode;
  /**
   * The workspace to render, from `createWorkspace()`. Omit it and the provider creates an empty
   * one of its own (register panels through `useWorkspace().registry`).
   */
  workspace?: Workspace<object>;
  /** Translates every built-in label. Overridden by the workspace's own `formatMessage`. */
  formatMessage?: MessageFormatter;
  /** Overrides any subset of the built-in message table. Overridden by the workspace's own `messages`. */
  messages?: Record<string, MessageDescriptor>;
  /** Initial layout direction, when the workspace doesn't set one. */
  dir?: 'ltr' | 'rtl';
  /** CSS class for the outer wrapper of every modal. */
  modalClass?: string;
  /** CSS class for the content area of every modal. */
  modalBodyClass?: string;
  /** CSS class for the outer wrapper of the side drawers. */
  sidePanelClass?: string;
  /** CSS class for the content area of the side drawers. */
  sidePanelBodyClass?: string;
  /** CSS class for the outer wrapper of floating windows. */
  windowClass?: string;
  /** CSS class for the content area of floating windows. */
  windowBodyClass?: string;
  /**
   * Starting z-index for floating windows and all of the library's chrome overlays, which shift
   * together via `--rdd-z-base`. @default 1000
   */
  zIndexBase?: number;
  /** Context menu implementation. Defaults to the built-in menu. */
  contextMenuAdapter?: ContextMenuAdapter;
  /**
   * The page a pop-out window opens (7.12.0): a same-origin page of the app, such as
   * `/popout.html`, with an empty `<body>`. The library waits for it to load, then moves the panel
   * in. Without it, the window opens blank. A page that can't be read (another origin, or a redirect
   * off this one) or doesn't load within 10 s sends the panel back. Only used with
   * `createWorkspace({ popOut: true })`. Set it when a third-party embed refuses a blank window: a
   * YouTube player, for one, shows error 153 there.
   */
  popoutUrl?: string;
  /**
   * A component around every panel's content, given the window and document the panel is in (7.12.0):
   * the main ones, then the pop-out's while it is in its own window. For CSS-in-JS: a cache per
   * document, so the panel's styles are inserted where it is shown (a pop-out doesn't get rules
   * inserted with `insertRule` from the page). Rendered for every panel, for its whole life, while
   * the workspace has `popOut: true` (none otherwise), so nothing remounts when a panel moves. Pass
   * a stable component (defined outside a render), not an inline function. In a pop-out it is also
   * rendered around the window's frame (the icon and title you give the panel), a context menu and
   * the toasts shown there, with that window: keep one cache per document, not per wrapper.
   *
   * @example
   * ```tsx
   * import createCache from '@emotion/cache';
   * import { CacheProvider } from '@emotion/react';
   *
   * const caches = new WeakMap<Document, ReturnType<typeof createCache>>();
   * const cacheFor = (doc: Document) => {
   *   let c = caches.get(doc);
   *   if (!c) { c = createCache({ key: 'app', container: doc.head }); caches.set(doc, c); }
   *   return c;
   * };
   * const PopoutWrapper = ({ document, children }: PopoutWrapperProps) =>
   *   <CacheProvider value={cacheFor(document)}>{children}</CacheProvider>;
   *
   * <DockableDesktopProvider workspace={workspace} popoutWrapper={PopoutWrapper}>…</DockableDesktopProvider>
   * ```
   */
  popoutWrapper?: React.ComponentType<PopoutWrapperProps>;
}

/**
 * The one provider. Place it above everything from this library: `<RddDesktop>`, `<RddSidebar>`,
 * `<RddToolbar>`, `<RddSidePanels>`, `<RddModals>`.
 *
 * @example
 * ```tsx
 * const workspace = createWorkspace({ panels: { map: { component: MapPanel } } });
 *
 * <DockableDesktopProvider workspace={workspace}>
 *   <RddSidebar tabs={tabs}>
 *     <RddDesktop />
 *   </RddSidebar>
 *   <RddSidePanels />
 *   <RddModals />
 * </DockableDesktopProvider>
 * ```
 */
export const DockableDesktopProvider: React.FC<DockableDesktopProviderProps> = (
  { contextMenuAdapter = DefaultContextMenuAdapter, workspace, messages, popoutUrl, popoutWrapper, children, ...props }
): React.ReactElement => {
  const existingCtxMenu = useContext(ContextMenuContext);
  const [ws] = useState(() => workspace ?? new WorkspaceClient<object>());
  // Read when a window opens, inside the user's click, so it is handed over ahead of time.
  useEffect(() => { ws._popOut.setUrl(popoutUrl); }, [ws, popoutUrl]);

  const inner = (
    <WorkspaceInstanceContext.Provider value={ws}>
      <ToolbarProvider>
        <WindowManagerProvider client={ws} predefinedMessages={messages} {...props}>
          <PanelContributionProvider>
            <PanelProvider>
              {children}
            </PanelProvider>
          </PanelContributionProvider>
        </WindowManagerProvider>
      </ToolbarProvider>
    </WorkspaceInstanceContext.Provider>
  );

  // The app's popoutWrapper is outside the menu's provider too (7.12.0): a menu shown in a pop-out
  // is wrapped there (an app's own <RddContextMenu> above this provider is outside it).
  return (
    <PopoutWrapperContext.Provider value={popoutWrapper ?? null}>
      {existingCtxMenu !== null ? inner : (
        <ContextMenuProvider
          adapter={contextMenuAdapter}
          formatMessageProvider={props.formatMessage}
        >
          {inner}
        </ContextMenuProvider>
      )}
    </PopoutWrapperContext.Provider>
  );
};

