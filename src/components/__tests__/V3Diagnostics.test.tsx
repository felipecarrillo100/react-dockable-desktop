/**
 * Tests for v3.0.0 diagnostic improvements:
 * - C5: styles.css sentinel — console.error when --rdd-styles-loaded is absent
 * - C6: ResizeObserver height warning — fires once with ancestor context; deduplicated
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';
import { PanelProvider } from '../PanelProviderContext';

const MockPanel: React.FC<{ panelId: string }> = ({ panelId }) => (
  <div data-panel-id={panelId} />
);

let lastActions: any = null;
const StateExtractor: React.FC = () => {
  useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ─── C5: styles.css sentinel check ───────────────────────────────────────────

describe('C5: styles.css sentinel (--rdd-styles-loaded)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;
  let originalGetComputedStyle: typeof window.getComputedStyle;
  let originalEnv: string | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastActions = null;
    client = new WorkspaceClient({ panels: { map: { component: MockPanel } } });
    originalGetComputedStyle = window.getComputedStyle;
    originalEnv = process.env.NODE_ENV;
    // @ts-ignore
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    document.body.removeChild(container);
    window.getComputedStyle = originalGetComputedStyle;
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  const mockSentinel = (value: string) => {
    window.getComputedStyle = (el: Element, pseudo?: string | null) => {
      const style = originalGetComputedStyle(el, pseudo ?? undefined);
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return (p: string) =>
              p === '--rdd-styles-loaded' ? value : target.getPropertyValue(p);
          }
          const v = (target as any)[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    };
  };

  it('emits console.error when styles.css sentinel variable is absent', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentinel(''); // styles.css not imported

    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("styles.css is not imported")
    );

    errorSpy.mockRestore();
  });

  it('does NOT emit console.error for styles.css when sentinel is present', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentinel('1'); // styles.css is imported

    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("styles.css is not imported")
    );

    errorSpy.mockRestore();
  });

  it('sentinel error message includes the exact import statement', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentinel('');

    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("react-dockable-desktop/styles.css")
    );

    errorSpy.mockRestore();
  });
});

// ─── C6: ResizeObserver height warning ───────────────────────────────────────

describe('C6: ResizeObserver zero-height warning', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let client: WorkspaceClient;
  let capturedCallback: ResizeObserverCallback | null;
  let OriginalResizeObserver: typeof ResizeObserver;
  let originalEnv: string | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastActions = null;
    client = new WorkspaceClient({ panels: { map: { component: MockPanel } } });
    capturedCallback = null;
    OriginalResizeObserver = globalThis.ResizeObserver;
    originalEnv = process.env.NODE_ENV;
    // @ts-ignore
    process.env.NODE_ENV = 'development';

    // Replace ResizeObserver with a mock that captures the callback
    // @ts-ignore
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) { capturedCallback = cb; }
      observe()     {}
      unobserve()   {}
      disconnect()  {}
    };
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    document.body.removeChild(container);
    globalThis.ResizeObserver = OriginalResizeObserver;
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  const fireResize = (height: number) => {
    if (!capturedCallback) return;
    capturedCallback(
      [{ contentRect: { height, width: 1024 } } as ResizeObserverEntry],
      {} as ResizeObserver
    );
  };

  const mount = () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <StateExtractor />
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
  };

  it('emits console.warn when ResizeObserver reports height of 0', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    act(() => { fireResize(0); });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Workspace height is 0px')
    );

    warnSpy.mockRestore();
  });

  it('warning fires only once even if ResizeObserver fires multiple times at height 0', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    act(() => { fireResize(0); });
    act(() => { fireResize(0); });
    act(() => { fireResize(0); });

    const heightWarnings = warnSpy.mock.calls.filter(
      args => typeof args[0] === 'string' && args[0].includes('Workspace height is 0px')
    );
    expect(heightWarnings).toHaveLength(1);

    warnSpy.mockRestore();
  });

  it('warning message explains the CSS height inheritance rule', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    act(() => { fireResize(0); });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('height: 100%')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fix options')
    );

    warnSpy.mockRestore();
  });

  it('does NOT emit the height warning when workspace has positive height', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();

    act(() => { fireResize(600); }); // normal height

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Workspace height is 0px')
    );

    warnSpy.mockRestore();
  });
});
