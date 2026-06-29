import React, { useContext } from 'react';
import { WindowManagerProvider } from './WindowManagerContext';
import type { WindowManagerProviderProps } from './WindowManagerContext';
import { PanelProvider } from './PanelProviderContext';
import { ToolbarProvider } from './ToolbarContext';
import { ContextMenuContext, ContextMenuProvider, DefaultContextMenuAdapter } from './ContextMenu';
import type { ContextMenuAdapter } from './ContextMenu';

/**
 * Props for `<DockableDesktopProvider>`.
 * Extends `WindowManagerProviderProps` with workspace-level context menu configuration.
 */
export interface DockableDesktopProviderProps extends WindowManagerProviderProps {
  /**
   * Context menu adapter for the workspace-level `ContextMenuProvider`.
   * Defaults to `DefaultContextMenuAdapter`. Ignored if a `<ContextMenuProvider>`
   * already exists above `<DockableDesktopProvider>` in the tree.
   */
  contextMenuAdapter?: ContextMenuAdapter;
}

/**
 * Composite provider that wraps `WindowManagerProvider`, `PanelProvider`, and `ToolbarProvider`
 * in the correct order, and mounts the workspace-level `ContextMenuProvider` so that
 * `showContextMenu()` and `useShowContextMenu()` work from any component in the tree —
 * including siblings of `<WindowManager>` such as `<Sidebar>`, `<SidePanelRenderer>`,
 * and `<ModalStackRenderer>`.
 *
 * Drop-in replacement for manually nesting both providers.
 *
 * `WindowManagerProvider` and `PanelProvider` remain independently exported
 * for cases that require custom nesting or separate configuration.
 *
 * @example
 * ```tsx
 * <DockableDesktopProvider client={workspace}>
 *   <Sidebar>
 *     <WindowManager />
 *   </Sidebar>
 *   <SidePanelRenderer />
 *   <ModalStackRenderer />
 * </DockableDesktopProvider>
 * ```
 */
export const DockableDesktopProvider: React.FC<DockableDesktopProviderProps> = (
  { contextMenuAdapter = DefaultContextMenuAdapter, ...props }
): React.ReactElement => {
  const existingCtxMenu = useContext(ContextMenuContext);

  const inner = (
    <ToolbarProvider>
      <WindowManagerProvider {...props}>
        <PanelProvider>
          {props.children}
        </PanelProvider>
      </WindowManagerProvider>
    </ToolbarProvider>
  );

  if (existingCtxMenu !== null) return inner;

  return (
    <ContextMenuProvider
      adapter={contextMenuAdapter}
      formatMessageProvider={props.formatMessage}
    >
      {inner}
    </ContextMenuProvider>
  );
};

export default DockableDesktopProvider;
