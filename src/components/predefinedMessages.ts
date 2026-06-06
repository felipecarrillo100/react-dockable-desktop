/**
 * Default English messages for every action exposed by Dockable Desktop.
 *
 * Each value's `id` is the react-intl message ID that the consumer should
 * define in their IntlProvider messages table. The `defaultMessage` is used
 * as a fallback when no external formatter is provided.
 *
 * Pass a partial or full override to <WindowManagerProvider predefinedMessages={…} />
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
  anchorToRightEdge: { id: 'dockable-desktop-anchorToRightEdge', defaultMessage: 'Anchor to Right Edge' },
  anchorToBottomEdge: { id: 'dockable-desktop-anchorToBottomEdge', defaultMessage: 'Anchor to Bottom Edge' },
  windowAnchoringOptions: { id: 'dockable-desktop-windowAnchoringOptions', defaultMessage: 'Window Anchoring Options' },
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
