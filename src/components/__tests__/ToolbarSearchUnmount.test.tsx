/**
 * The toolbar search stops when it unmounts (7.4.1): a pending debounce no longer calls
 * `onSearch` for a toolbar that has gone, and a search in flight has its signal aborted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToolbarSearchInput } from '../PanelOverlay';

// @ts-expect-error React's act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const mountAndType = (onSearch: (q: string, signal: AbortSignal) => Promise<never[]>) => {
  act(() => {
    root = createRoot(container);
    root.render(<ToolbarSearchInput onSearch={onSearch} onSelect={() => {}} />);
  });
  act(() => { container.querySelector('button')!.click(); });
  const input = container.querySelector('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'map');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  vi.useRealTimers();
  container.remove();
});

describe('toolbar search after unmount', () => {
  it('a pending debounce does not search', () => {
    const onSearch = vi.fn(async () => []);
    mountAndType(onSearch);
    act(() => root.unmount());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('a search in flight is aborted', () => {
    let signal: AbortSignal | undefined;
    mountAndType((_q, s) => { signal = s; return new Promise<never[]>(() => {}); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(signal?.aborted).toBe(false);
    act(() => root.unmount());
    expect(signal?.aborted).toBe(true);
  });
});
