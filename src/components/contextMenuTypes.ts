export interface ContextMenuPredefinedMessage {
  id: string;
  defaultMessage?: string;
  values?: Record<string, string | number>;
}

export type MessageFormatter = (msg: ContextMenuPredefinedMessage) => string;
export type ContextMenuLabel = string | ContextMenuPredefinedMessage;
export type MenuItemAction = () => void;
