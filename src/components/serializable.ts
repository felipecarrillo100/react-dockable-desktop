import { isValidElement } from 'react';

/**
 * Recursively checks whether a value can round-trip through `JSON.stringify`/`JSON.parse`
 * without silently losing information.
 *
 * Deliberately **not** a `JSON.stringify` try/catch — that call doesn't throw for the actual
 * failure case this guards against: a function-valued property is simply dropped by
 * `JSON.stringify`, not rejected. This walks the value tree instead, returning `false` as soon as
 * it finds a function, symbol, `undefined`, React element, or any non-plain object (a class
 * instance, `Map`, `Set`, `RegExp`, etc.).
 *
 * `Date` is treated as an explicit exception — serializable-enough, matching `JSON.stringify`'s
 * own behavior — even though it doesn't round-trip back to a `Date` instance on parse. That's a
 * smaller, more tolerable gotcha than a silently-vanishing function, so it's documented rather
 * than treated as a disqualifying case.
 *
 * Used to decide whether a docked/floating panel's `props` can be included in
 * `WorkspaceClient.saveLayout()`'s output — see {@link PanelInfo.serializable}.
 */
export function isSerializable(value: unknown): boolean {
  if (value === null) return true;
  if (value === undefined) return false;

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'function' || type === 'symbol' || type === 'bigint') return false;

  // type === 'object' from here on.
  if (value instanceof Date) return true;
  if (isValidElement(value)) return false;
  if (Array.isArray(value)) return value.every(isSerializable);

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false; // class instance, Map, Set, RegExp, Error, etc.

  return Object.values(value as Record<string, unknown>).every(isSerializable);
}
