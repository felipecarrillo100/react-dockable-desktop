/**
 * @file messages.ts
 * @description Resolving a label — a string, a message descriptor or a thunk — to text.
 */
import type { MessageDescriptor, MessageFormatter } from '../types';

/**
 * @internal The formatter used when the app passes none: the descriptor's `defaultMessage` (or its
 * id) with each `{key}` replaced by its value — every occurrence (7.4.1; it replaced only the first).
 */
export const defaultFormatMessage: MessageFormatter = (msg) => {
  let text = msg.defaultMessage || msg.id;
  if (msg.values) {
    for (const [key, value] of Object.entries(msg.values)) text = text.split(`{${key}}`).join(String(value));
  }
  return text;
};

/**
 * Helper to resolve dynamic label strings or localizable descriptor objects into text.
 */
export const formatLabel = (
  label: string | MessageDescriptor | (() => string) | undefined,
  formatter: MessageFormatter
): string => {
  if (!label) return '';
  if (typeof label === 'string') return label;
  // A thunk (7.4.0) is called each time the label is rendered, so it follows the app's own locale.
  if (typeof label === 'function') return label();
  return formatter(label);
};
