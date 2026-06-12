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
  usePanelId
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
export { Sidebar } from './components/Sidebar';
export type { SidebarTab, SidebarProps, SidebarHandle } from './components/Sidebar';

