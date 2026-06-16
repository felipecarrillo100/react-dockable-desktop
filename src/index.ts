/**
 * @file index.ts
 * @description Core entry point for react-dockable-desktop.
 * Exports public window manager components, contexts, hooks, type definitions, sidebar layouts, and overlay renderers.
 */

// Core Components and Layouts
export { default as WindowManager } from './components/WindowManager';
export { PanelRegistry, PanelRegistryClass } from './components/PanelRegistry';
export type { PanelRegistryEntry } from './components/PanelRegistry';

// WorkspaceClient — primary configuration and imperative API object
export { WorkspaceClient } from './WorkspaceClient';
export type { WorkspaceClientConfig, PanelDefinition, BuiltInPanelEvents } from './WorkspaceClient';

// Composite provider — wraps WindowManagerProvider + PanelProvider in correct order
export { DockableDesktopProvider } from './components/DockableDesktopProvider';

// State Actions and Context Providers
export {
  WindowManagerProvider,
  useWindowManagerState,
  useWindowManagerActions,
  useRegistry,
  useFormatMessage,
  formatLabel,
  usePanelContext,
  usePredefinedMessages,
  defaultPredefinedMessages,
  useStyleClasses,
  usePanelId,
  usePanelContextMenu
} from './components/WindowManagerContext';

// TypeScript Types and Interfaces
export type {
  SplitOrientation,
  SplitDirection,
  DropPosition,
  DropTarget,
  LayoutGridNode,
  LayoutLeafNode,
  LayoutNode,
  FloatingWindow,
  PanelInfo,
  WindowState,
  WindowActions,
  ContextMenuPredefinedMessage,
  MessageFormatter,
  PredefinedMessageKey,
  StyleClasses
} from './components/WindowManagerContext';

// Context menu — built-in component, types, and adapter interface
export { ContextMenu, DefaultContextMenuAdapter } from './components/ContextMenu';
export type {
  ContextMenuItem,
  ContextMenuSimpleItem,
  ContextMenuSeparator,
  ContextMenuSubMenu,
  ContextMenuCheckbox,
  ContextMenuLabel,
  MenuItemAction,
  ContextMenuHandle,
  ShowContextMenuOptions,
  ContextMenuAdapter,
  ContextMenuProps,
} from './components/ContextMenu';

// Form Container Context Contract
export {
  FormContainerContext,
  FormContainerProvider,
  useFormContainer
} from './components/FormContainerContext';

export type {
  CloseOptions,
  FormContainerContract
} from './components/FormContainerContext';

// Side Panels and Modal Stack Context
export {
  PanelProvider,
  usePanelState,
  usePanelActions
} from './components/PanelProviderContext';

export type {
  PanelInstanceId,
  PanelTitle,
  SidePanelOptions,
  ModalOptions,
  PanelInstance,
  PanelState,
  PanelActions
} from './components/PanelProviderContext';

// Overlay Renderers
export { default as ModalStackRenderer } from './components/ModalStackRenderer';
export {
  default as SidePanelRenderer,
  LeftPanelRenderer,
  RightPanelRenderer
} from './components/SidePanelRenderer';
export type { SidePanelRendererProps } from './components/SidePanelRenderer';

// Reusable Forms
export { default as ConfirmationForm } from './forms/ConfirmationForm';
export type { ConfirmationFormProps } from './forms/ConfirmationForm';

// Sidebar
export { Sidebar, useSidebar, useSidebarTab } from './components/Sidebar';
export type { SidebarTab, SidebarProps, SidebarHandle, SidebarContextValue, SidebarTabContextValue } from './components/Sidebar';

// Toolbar
export { Toolbar, useToolbar, ToolbarProvider } from './components/Toolbar';
export type {
  ToolbarItem,
  ToolbarActionItem,
  ToolbarRadioItem,
  ToolbarToggleItem,
  ToolbarGroupItem,
  ToolbarGroupSubItem,
  ToolbarGroupEntry,
  ToolbarSeparator,
  ToolbarProps,
  ToolbarHandle,
  ToolbarContextValue,
} from './components/Toolbar';

// ─── Toast — imperative notification API, zero dependencies ──────────────────
export { toast, ToastContainer } from './components/Toast';
export type {
  ToastFunction,
  ToastOptions,
  ToastType,
  ToastPosition,
  ToastContainerProps,
  ToastAdapter,
  ResolvedToastOptions,
  ToastPromiseMessages,
} from './components/Toast';

// ─── Panel Overlay — optional; tree-shaken when unused ───────────────────────
export {
  PanelOverlayRoot,
  PanelToolbar,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSearchInput,
  ToolbarSeparator as PanelToolbarSeparator,
  ToolbarSpacer,
  ToolbarCenter,
  ToolbarItem as PanelToolbarItem,
  PanelFloatingWindow,
  usePanelFloatingWindow,
  usePanelFloatingWindowManager,
} from './components/PanelOverlay';
export type {
  PanelOverlayRootProps,
  PanelToolbarProps,
  ToolbarButtonProps,
  ToolbarToggleProps,
  ToolbarSearchInputProps,
  SearchResult,
  PanelFloatingWindowProps,
  ToolbarVariant,
  ButtonVariant,
  ManagedWindowConfig,
  PanelFloatingWindowManagerHandle,
} from './components/PanelOverlay';

