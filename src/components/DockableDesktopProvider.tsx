import React from 'react';
import { WindowManagerProvider } from './WindowManagerContext';
import type { WindowManagerProviderProps } from './WindowManagerContext';
import { PanelProvider } from './PanelProviderContext';
import { ToolbarProvider } from './ToolbarContext';

/**
 * Props for `<DockableDesktopProvider>`. Alias of `WindowManagerProviderProps`.
 * @see WindowManagerProviderProps
 */
export type DockableDesktopProviderProps = WindowManagerProviderProps;

/**
 * Composite provider that wraps both `WindowManagerProvider` and `PanelProvider`
 * in the correct order. Drop-in replacement for manually nesting both providers.
 *
 * `WindowManagerProvider` and `PanelProvider` remain independently exported
 * for cases that require custom nesting or separate configuration.
 *
 * @example
 * ```tsx
 * <DockableDesktopProvider client={workspace}>
 *   <WindowManager />
 *   <ModalStackRenderer />
 * </DockableDesktopProvider>
 * ```
 */
export const DockableDesktopProvider: React.FC<WindowManagerProviderProps> = (props): React.ReactElement => (
  <ToolbarProvider>
    <WindowManagerProvider {...props}>
      <PanelProvider>
        {props.children}
      </PanelProvider>
    </WindowManagerProvider>
  </ToolbarProvider>
);

export default DockableDesktopProvider;
