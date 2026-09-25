/**
 * @file index.ts
 * @description Public entry point for react-dockable-desktop 7.
 *
 * Components carry an `Rdd` prefix, so they never collide with a UI kit's own `Toolbar`,
 * `Sidebar` or `ContextMenu`. The full 6.x → 7.0 map is in the migration guide.
 *
 * The library's modules still use their internal names; this file is the only place the 7.0 names
 * are defined, and `api-surface.json` pins exactly what it exports.
 */

// ─── Workspace ──────────────────────────────────────────────────────────────────
export { createWorkspace, useWorkspace } from './api';
export type { Workspace, WorkspaceConfig } from './api';
export type { PanelDefinition, BuiltInEvents } from './WorkspaceClient';
export { DockableDesktopProvider } from './components/DockableDesktopProvider';
export type { DockableDesktopProviderProps } from './components/DockableDesktopProvider';
export { PanelRegistry } from './components/PanelRegistry';
export type { PanelRegistryEntry } from './components/PanelRegistry';
export {
  useWindowManagerState as useWorkspaceState,
  useFormatMessage,
  formatLabel,
  usePredefinedMessages as useMessages,
  defaultPredefinedMessages as defaultMessages,
  useStyleClasses as useHostClasses,
  usePanelContextMenu,
} from './components/WindowManagerContext';
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
  OpenPanelOptions,
  WorkspaceState,
  WorkspaceActions,
  SerializedLayout,
  MessageDescriptor,
  MessageFormatter,
  MessageKey,
  HostClasses,
} from './components/WindowManagerContext';

// Runtime serializability check — the same one saveLayout() uses to decide what it can persist
export { isSerializable } from './components/serializable';

// ─── The desktop ────────────────────────────────────────────────────────────────
export { default as RddDesktop } from './components/WindowManager';
export type { RddDesktopProps, TaskbarVisibility } from './components/WindowManager';

// ─── Panel side: what a panel component uses ───────────────────────────────────
export { usePanel, usePanelEvents, useBeforeClose, useSaveState } from './api';
export type { PanelHandle, PanelEvents, PanelState } from './api';
export { usePanelSize } from './components/FormContainerContext';
export type { CloseOptions, ContainerType } from './components/FormContainerContext';
export type { DirtyStateOptions } from './components/dirtyOptions';

// ─── Context menu ───────────────────────────────────────────────────────────────
export { RddContextMenu } from './api';
export type { RddContextMenuProps } from './api';
export { useShowContextMenu as useContextMenu } from './components/ContextMenu';
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
} from './components/ContextMenu';

// ─── Modals and side drawers ────────────────────────────────────────────────────
export { useModals, useSidePanels, RddSidePanels } from './api';
export type { ModalsApi, SidePanelsApi, OverlayInstance, OverlayId, RddSidePanelsProps } from './api';
export { default as RddModals } from './components/ModalStackRenderer';
export type {
  PanelTitle,
  PanelTitleDescriptor,
  SidePanelOptions,
  ModalOptions,
  OverlayState,
} from './components/PanelProviderContext';
export { default as RddConfirm } from './forms/ConfirmationForm';
export type { RddConfirmProps } from './forms/ConfirmationForm';

// ─── Sidebar ────────────────────────────────────────────────────────────────────
export { Sidebar as RddSidebar, SecondarySidebar as RddSecondarySidebar, useSidebar, useSidebarTab } from './components/Sidebar';
export type {
  SidebarTab,
  RddSidebarProps,
  RddSecondarySidebarProps,
  SidebarHandle,
  SidebarContextValue as SidebarContext,
  SidebarTabContextValue as SidebarTabContext,
  SidebarHeaderAction,
  SidebarRailEntry,
  SidebarActionButton,
  SidebarCustomEntry,
} from './components/Sidebar';

// ─── Toolbar ────────────────────────────────────────────────────────────────────
export { Toolbar as RddToolbar, useToolbar } from './components/Toolbar';
export type {
  ToolbarItem,
  ToolbarActionItem,
  ToolbarRadioItem,
  ToolbarToggleItem,
  ToolbarGroupItem,
  ToolbarGroupSubItem,
  ToolbarGroupEntry,
  ToolbarSeparator,
  RddToolbarProps,
  ToolbarHandle,
  ToolbarContextValue,
} from './components/Toolbar';

// ─── Toasts ─────────────────────────────────────────────────────────────────────
export { toast, ToastContainer as RddToasts } from './components/Toast';
export type {
  ToastFunction,
  ToastOptions,
  ToastType,
  ToastPosition,
  RddToastsProps,
  ToastAdapter,
  ResolvedToastOptions,
  ToastPromiseMessages,
} from './components/Toast';

// ─── Panel overlay: toolbars and floating widgets inside a panel ───────────────
export {
  PanelOverlayRoot as RddPanelOverlay,
  PanelToolbar as RddPanelToolbar,
  ToolbarButton as RddToolbarButton,
  ToolbarToggle as RddToolbarToggle,
  ToolbarSearchInput as RddToolbarSearch,
  ToolbarSeparator as RddToolbarSeparator,
  ToolbarSpacer as RddToolbarSpacer,
  ToolbarCenter as RddToolbarCenter,
  ToolbarItem as RddToolbarItem,
  PanelFloatingWindow as RddFloatingWidget,
  usePanelFloatingWindowManager as useFloatingWidgets,
} from './components/PanelOverlay';
export type {
  RddPanelOverlayProps,
  RddPanelToolbarProps,
  RddToolbarButtonProps,
  RddToolbarToggleProps,
  RddToolbarSearchProps,
  SearchResult,
  RddFloatingWidgetProps,
  ToolbarVariant,
  ButtonVariant,
  ToolbarPosition,
  FloatAnchor,
  ManagedWidget,
  FloatingWidgetsApi,
  Stretch,
  PanelFloatPlacement,
} from './components/PanelOverlay';

// ─── Panel contributions: active-panel-driven toolbar and sidebar content ──────
export {
  usePanelContribution,
  useActivePanelContribution as useActiveContribution,
  sidebarSectionToTab as sectionToTab,
  useMergedToolbarItems,
  useMergedSidebarTabs,
} from './components/PanelContributionContext';
export type { PanelContribution, PanelSidebarSection } from './components/PanelContributionContext';

// ─── Drag-resize primitives for custom resizable UI inside panel content ───────
export { startPointerDrag, computeResizedRect } from './components/dragResize';
export type { PointerDragConfig, ResizeDir, ResizeRect, ResizeConstraints } from './components/dragResize';

// ─── Colour scheme and direction ────────────────────────────────────────────────
export { useColorScheme } from './hooks/useColorScheme';
export { isComputedRtl, isElementRtl } from './utils/rtl';
