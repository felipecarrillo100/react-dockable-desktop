/**
 * useLatestRef: the ref holds this render's value by the time any effect of the commit runs —
 * including a child's layout effect, which runs before its parent's.
 */
import { it, expect, afterEach } from 'vitest';
import React, { useLayoutEffect, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useLatestRef } from '../useLatestRef';

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; });

it("a child's layout and passive effects read the parent's latest value", () => {
  const seen: string[] = [];
  const Child: React.FC<{ read: () => number }> = ({ read }) => {
    useLayoutEffect(() => { seen.push(`layout:${read()}`); });
    useEffect(() => { seen.push(`effect:${read()}`); });
    return null;
  };
  const Parent: React.FC<{ value: number }> = ({ value }) => {
    const ref = useLatestRef(value);
    // A stable reader, as a handler or an action would be.
    const read = React.useCallback(() => ref.current, [ref]);
    return <Child read={read} />;
  };

  const container = document.createElement('div');
  root = createRoot(container);
  act(() => root!.render(<Parent value={1} />));
  act(() => root!.render(<Parent value={2} />));
  expect(seen).toEqual(['layout:1', 'effect:1', 'layout:2', 'effect:2']);
});
