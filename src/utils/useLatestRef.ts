import { useInsertionEffect, useRef, type RefObject } from 'react';

/**
 * A ref that holds the latest `value`, for event handlers and effects to read without being
 * re-created. Never read it during render.
 *
 * It is updated in an insertion effect rather than during render (which the React Compiler rules
 * forbid, and which can publish a value from a render React then discards). Insertion effects run
 * before every layout effect of the commit, so even a child's effect, which runs before its
 * parent's, already sees this render's value.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useInsertionEffect(() => { ref.current = value; });
  return ref;
}
