export interface MessageDescriptor {
  id: string;
  defaultMessage?: string;
  values?: Record<string, string | number>;
}

export type MessageFormatter = (msg: MessageDescriptor) => string;
export type ContextMenuLabel = string | MessageDescriptor;
export type MenuItemAction = () => void;
