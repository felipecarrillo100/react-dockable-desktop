/**
 * @file PanelOverlay.tsx
 * @description The Panel Overlay system: toolbars on a panel's edges and floating widgets over
 * its content. Since 7.6.1 the code lives in `./panelOverlay/` and `../core/`; this module
 * re-exports it, so every existing import keeps working.
 */
export type { FloatAnchor } from './WindowManagerContext';
export type { ToolbarPosition, Stretch, PanelFloatPlacement, ManagedWidget } from './panelOverlay/types';
export { PanelOverlayRoot } from './panelOverlay/PanelOverlayRoot';
export type { RddPanelOverlayProps } from './panelOverlay/PanelOverlayRoot';
export { PanelToolbar, ToolbarButton, ToolbarToggle, ToolbarSeparator, ToolbarSpacer, ToolbarItem, ToolbarCenter } from './panelOverlay/PanelToolbar';
export type { ToolbarVariant, ButtonVariant, RddPanelToolbarProps, RddToolbarButtonProps, RddToolbarToggleProps } from './panelOverlay/PanelToolbar';
export { ToolbarSearchInput } from './panelOverlay/ToolbarSearch';
export type { SearchResult, RddToolbarSearchProps } from './panelOverlay/ToolbarSearch';
export { PanelFloatingWindow } from './panelOverlay/FloatingWidget';
export type { RddFloatingWidgetProps } from './panelOverlay/FloatingWidget';
export { usePanelFloatingWindow, usePanelFloatingWindowManager } from './panelOverlay/useFloatingWidgets';
export type { UsePanelFloatingWindowReturn, FloatingWidgetsApi } from './panelOverlay/useFloatingWidgets';
