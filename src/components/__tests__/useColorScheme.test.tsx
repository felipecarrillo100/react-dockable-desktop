/**
 * Tests for useColorScheme():
 * - CS1: returns 'dark' by default when no data-color-scheme attribute is set
 * - CS2: reads an existing data-color-scheme="light" attribute on first render
 * - CS3: re-renders with the new value when the attribute changes
 * - CS4: falls back to 'dark' for any value other than 'light'
 * - CS5: disconnects its observer on unmount (no update after unmount)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useColorScheme } from '../../hooks/useColorScheme';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); root = null; });
  document.body.removeChild(container);
  document.documentElement.removeAttribute('data-color-scheme');
});

let observed: string | null = null;
const Probe: React.FC = () => {
  observed = useColorScheme();
  return null;
};

describe('CS1: default with no attribute', () => {
  it('returns "dark"', () => {
    act(() => {
      root = createRoot(container);
      root!.render(<Probe />);
    });
    expect(observed).toBe('dark');
  });
});

describe('CS2: reads an existing attribute on first render', () => {
  it('returns "light" when data-color-scheme is already "light"', () => {
    document.documentElement.setAttribute('data-color-scheme', 'light');
    act(() => {
      root = createRoot(container);
      root!.render(<Probe />);
    });
    expect(observed).toBe('light');
  });
});

describe('CS3: reacts to attribute changes', () => {
  it('updates from "dark" to "light" and back', async () => {
    act(() => {
      root = createRoot(container);
      root!.render(<Probe />);
    });
    expect(observed).toBe('dark');

    await act(async () => {
      document.documentElement.setAttribute('data-color-scheme', 'light');
    });
    expect(observed).toBe('light');

    await act(async () => {
      document.documentElement.setAttribute('data-color-scheme', 'dark');
    });
    expect(observed).toBe('dark');
  });
});

describe('CS4: unrecognized values fall back to dark', () => {
  it('treats any non-"light" value as dark', async () => {
    act(() => {
      root = createRoot(container);
      root!.render(<Probe />);
    });

    await act(async () => {
      document.documentElement.setAttribute('data-color-scheme', 'sepia');
    });
    expect(observed).toBe('dark');
  });
});

describe('CS5: cleanup on unmount', () => {
  it('stops updating after the component unmounts', async () => {
    act(() => {
      root = createRoot(container);
      root!.render(<Probe />);
    });

    act(() => { root!.unmount(); root = null; });
    observed = null;

    await act(async () => {
      document.documentElement.setAttribute('data-color-scheme', 'light');
    });
    // Nothing to re-render — the probe is unmounted, so `observed` stays untouched.
    expect(observed).toBeNull();
  });
});
