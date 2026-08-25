/**
 * Tests for useAnimationScrollGuard(durationMs):
 * - AG1: attaches a scroll listener on mount that snaps back to the captured position
 * - AG2: no longer reacts to scroll once durationMs has elapsed
 * - AG3: unmounting before durationMs elapses removes the listener
 * - AG4: two concurrent instances don't interfere with each other
 * - AG5: snaps back to the exact position captured at mount, not a later value
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useAnimationScrollGuard } from '../../hooks/useAnimationScrollGuard';

let container: HTMLDivElement;
let root: Root | null = null;
let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.useFakeTimers();
  scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); root = null; });
  document.body.removeChild(container);
  scrollToSpy.mockRestore();
  vi.useRealTimers();
});

const Probe: React.FC<{ duration: number }> = ({ duration }) => {
  useAnimationScrollGuard(duration);
  return null;
};

const setScrollPosition = (x: number, y: number) => {
  Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
};

describe('AG1: attaches a scroll listener on mount', () => {
  it('snaps back to the position captured at mount when a scroll fires', () => {
    setScrollPosition(0, 0);
    act(() => {
      root = createRoot(container);
      root!.render(<Probe duration={250} />);
    });

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('AG2: guard expires after durationMs', () => {
  it('no longer calls scrollTo once the duration has elapsed', () => {
    setScrollPosition(0, 0);
    act(() => {
      root = createRoot(container);
      root!.render(<Probe duration={250} />);
    });

    act(() => { vi.advanceTimersByTime(250); });
    scrollToSpy.mockClear();

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('AG3: cleans up on unmount', () => {
  it('removes the listener when unmounted before durationMs elapses', () => {
    setScrollPosition(0, 0);
    act(() => {
      root = createRoot(container);
      root!.render(<Probe duration={250} />);
    });

    act(() => { root!.unmount(); root = null; });
    scrollToSpy.mockClear();

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('AG4: independent concurrent instances', () => {
  it('unmounting one guard leaves the other active', () => {
    setScrollPosition(0, 0);

    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);
    let rootA: Root | null = null;
    let rootB: Root | null = null;

    act(() => {
      rootA = createRoot(containerA);
      rootA.render(<Probe duration={250} />);
      rootB = createRoot(containerB);
      rootB.render(<Probe duration={250} />);
    });

    act(() => { rootA!.unmount(); });
    scrollToSpy.mockClear();

    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    act(() => { rootB!.unmount(); });
    document.body.removeChild(containerA);
    document.body.removeChild(containerB);
  });
});

describe('AG5: captures position at mount time, not at scroll time', () => {
  it('snaps back to the mount-time position even if scrollX/scrollY read differently later', () => {
    setScrollPosition(120, 340);
    act(() => {
      root = createRoot(container);
      root!.render(<Probe duration={250} />);
    });

    setScrollPosition(999, 999);
    act(() => { window.dispatchEvent(new Event('scroll')); });

    expect(scrollToSpy).toHaveBeenCalledWith(120, 340);
  });
});
