/**
 * @file predefinedMessages.ts
 * @description Provides the default localizable message catalogs and translation keys
 * utilized by Dockable Desktop's context menus, headers, and tooltips.
 *
 * Each value's `id` is the react-intl message ID that the consumer should
 * define in their IntlProvider messages table. The `defaultMessage` is used
 * as a fallback when no external formatter is provided.
 *
 * Pass a partial or full override to `<WindowManagerProvider predefinedMessages={…} />`
 * to customise labels without replacing the whole table.
 */
export const defaultPredefinedMessages = {
  floatWindow:     { id: 'dockable-desktop-floatWindow',     defaultMessage: 'Float Window' },
  minimizePanel:   { id: 'dockable-desktop-minimizePanel',   defaultMessage: 'Minimize Panel' },
  closeTab:        { id: 'dockable-desktop-closeTab',        defaultMessage: 'Close Tab' },
  restorePanel:    { id: 'dockable-desktop-restorePanel',    defaultMessage: 'Restore Panel' },
  maximizePanel:   { id: 'dockable-desktop-maximizePanel',   defaultMessage: 'Maximize Panel' },
  closePanel:      { id: 'dockable-desktop-closePanel',      defaultMessage: 'Close Panel' },
  dockWindow:      { id: 'dockable-desktop-dockWindow',      defaultMessage: 'Dock Window' },
  minimize:        { id: 'dockable-desktop-minimize',        defaultMessage: 'Minimize' },
  maximize:        { id: 'dockable-desktop-maximize',        defaultMessage: 'Maximize' },
  restoreSize:     { id: 'dockable-desktop-restoreSize',     defaultMessage: 'Restore Size' },
  close:           { id: 'dockable-desktop-close',           defaultMessage: 'Close' },
  closeEmptyGroup: { id: 'dockable-desktop-closeEmptyGroup', defaultMessage: 'Close empty split group' },
  unsavedChangesTitle: { id: 'dockable-desktop-unsavedChangesTitle', defaultMessage: 'Unsaved Changes' },
  unsavedChangesMessage: { id: 'dockable-desktop-unsavedChangesMessage', defaultMessage: '"{title}" has unsaved changes. Do you want to discard your changes and close?' },
  discardChanges: { id: 'dockable-desktop-discardChanges', defaultMessage: 'Discard Changes' },
  cancel: { id: 'dockable-desktop-cancel', defaultMessage: 'Cancel' },
  yes: { id: 'dockable-desktop-yes', defaultMessage: 'Yes' },
  no: { id: 'dockable-desktop-no', defaultMessage: 'No' },
  ok: { id: 'dockable-desktop-ok', defaultMessage: 'OK' },
  closePanelTooltip: { id: 'dockable-desktop-closePanelTooltip', defaultMessage: 'Close panel' },
  closeTooltip: { id: 'dockable-desktop-closeTooltip', defaultMessage: 'Close' },
  // Accessible names and placeholders (6.4.0) — previously hard-coded in English.
  notifications: { id: 'dockable-desktop-notifications', defaultMessage: 'Notifications' },
  closeNotification: { id: 'dockable-desktop-closeNotification', defaultMessage: 'Close notification' },
  scrollTabsLeft: { id: 'dockable-desktop-scrollTabsLeft', defaultMessage: 'Scroll tabs left' },
  scrollTabsRight: { id: 'dockable-desktop-scrollTabsRight', defaultMessage: 'Scroll tabs right' },
  scrollTaskbarLeft: { id: 'dockable-desktop-scrollTaskbarLeft', defaultMessage: 'Scroll taskbar left' },
  scrollTaskbarRight: { id: 'dockable-desktop-scrollTaskbarRight', defaultMessage: 'Scroll taskbar right' },
  moreActions: { id: 'dockable-desktop-moreActions', defaultMessage: 'More actions' },
  search: { id: 'dockable-desktop-search', defaultMessage: 'Search' },
  closeSearch: { id: 'dockable-desktop-closeSearch', defaultMessage: 'Close search' },
  searchPlaceholder: { id: 'dockable-desktop-searchPlaceholder', defaultMessage: 'Search…' },
  modalTitle: { id: 'dockable-desktop-modalTitle', defaultMessage: 'Confirmation' },
  emptyGroup: { id: 'dockable-desktop-emptyGroup', defaultMessage: 'Empty Workspace Section' },
  emptyGrid: { id: 'dockable-desktop-emptyGrid', defaultMessage: 'Grid Empty' },
  componentUnregistered: { id: 'dockable-desktop-componentUnregistered', defaultMessage: 'Component Unregistered' },
  componentKey: { id: 'dockable-desktop-componentKey', defaultMessage: 'Key: {key}' },
  untitledPanel: { id: 'dockable-desktop-untitledPanel', defaultMessage: 'Panel' },
} as const;

/**
 * Union of every key in `defaultPredefinedMessages`.
 *
 * Import this type in your i18n message tables to get a compile-time
 * guarantee that all keys are present and no typos exist:
 *
 *   import type { PredefinedMessageKey } from 'react-dockable-desktop';
 *
 *   const myMessages: Record<PredefinedMessageKey, string> = { ... };
 */
export type PredefinedMessageKey = keyof typeof defaultPredefinedMessages;
