/**
 * @file sameUpdate.ts
 * @description Equality checks that let the title and dirty setters skip a write that changes
 * nothing, so a panel that writes the same value on every render doesn't re-render forever.
 */
import type { DirtyStateOptions } from './dirtyOptions';

type Title = string | { id: string; defaultMessage?: string; values?: Record<string, unknown> };

function shallowEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(k => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/** A string title, or a message descriptor with the same id, default text and values. */
export function sameTitle(a: Title | undefined, b: Title | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  return a.id === b.id && a.defaultMessage === b.defaultMessage && shallowEqual(a.values, b.values);
}

/** Dirty options with the same title, message and alert. */
export function sameDirtyOptions(a: DirtyStateOptions | undefined, b: DirtyStateOptions | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof DirtyStateOptions>;
  for (const k of keys) {
    const x = a[k], y = b[k];
    if (k === 'title' || k === 'message' ? !sameTitle(x as Title | undefined, y as Title | undefined) : x !== y) return false;
  }
  return true;
}
