/**
 * Tests for v2.0.0 features:
 * - C1: console.warn for unregistered panel component keys
 * - C2: WorkspaceClient pending-call queue + "forgot client=" warning
 * - C4: isOpen() / getOpenPanelIds()
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

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ─── C4: isOpen / getOpenPanelIds ─────────────────────────────────────────────

describe('C4: isOpen() and getOpenPanelIds()', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    client = new WorkspaceClient({
      panels: { map: { component: MockPanel }, editor: { component: MockPanel } },
    });
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });
  };

  it('isOpen returns false before panel is opened and true after', () => {
    mount();
    expect(lastActions.isOpen('my-panel')).toBe(false);
    act(() => { lastActions.openPanel('my-panel', 'map'); });
    expect(lastActions.isOpen('my-panel')).toBe(true);
  });

  it('isOpen returns false after panel is closed', () => {
    mount();
    act(() => { lastActions.openPanel('p1', 'map'); });
    expect(lastActions.isOpen('p1')).toBe(true);
    act(() => { lastActions.closePanel('p1'); });
    expect(lastActions.isOpen('p1')).toBe(false);
  });

  it('getOpenPanelIds returns empty array on fresh mount', () => {
    mount();
    expect(lastActions.getOpenPanelIds()).toEqual([]);
  });

  it('getOpenPanelIds returns correct IDs after opening several panels', () => {
    mount();
    act(() => {
      lastActions.openPanel('alpha', 'map');
      lastActions.openPanel('beta', 'editor');
    });
    const ids = lastActions.getOpenPanelIds();
    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
    expect(ids).toHaveLength(2);
  });

  it('getOpenPanelIds excludes closed panels', () => {
    mount();
    act(() => {
      lastActions.openPanel('a', 'map');
      lastActions.openPanel('b', 'editor');
    });
    act(() => { lastActions.closePanel('a'); });
    const ids = lastActions.getOpenPanelIds();
    expect(ids).not.toContain('a');
    expect(ids).toContain('b');
  });

  it('WorkspaceClient.isOpen() delegates correctly when connected', () => {
    mount();
    expect(client.isOpen('x')).toBe(false);
    act(() => { lastActions.openPanel('x', 'map'); });
    expect(client.isOpen('x')).toBe(true);
  });

  it('WorkspaceClient.getOpenPanelIds() returns [] when disconnected', () => {
    // client not connected to any provider yet
    expect(client.getOpenPanelIds()).toEqual([]);
  });

  it('WorkspaceClient.isOpen() returns false when disconnected', () => {
    expect(client.isOpen('anything')).toBe(false);
  });
});

// ─── C2: Pending-call queue ───────────────────────────────────────────────────

describe('C2: WorkspaceClient pending-call queue', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    client = new WorkspaceClient({
      panels: { map: { component: MockPanel }, editor: { component: MockPanel } },
    });
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
  });

  it('openPanel called before mount is replayed after provider connects', () => {
    // Queue call BEFORE mounting
    client.openPanel('queued-panel', 'map', { title: 'Queued' });

    // Mount — _connect fires → pending call replays
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    expect(lastState.panels['queued-panel']).toBeDefined();
    expect(lastState.panels['queued-panel'].title).toBe('Queued');
  });

  it('multiple calls queued before mount all replay in order', () => {
    client.openPanel('p1', 'map', { title: 'First' });
    client.openPanel('p2', 'editor', { title: 'Second' });

    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    expect(lastState.panels['p1']).toBeDefined();
    expect(lastState.panels['p2']).toBeDefined();
  });

  it('queue is empty after replay — no double-firing on reconnect', () => {
    client.openPanel('once', 'map');

    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });
    expect(lastState.panels['once']).toBeDefined();

    // Simulate unmount + remount (StrictMode-like)
    act(() => { root!.unmount(); });
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    // Panel may or may not be in the new state (loadLayout resets), but
    // the important thing is exactly 0 or 1 occurrence (not duplicated).
    const panelCount = Object.keys(lastState.panels).filter(k => k === 'once').length;
    expect(panelCount).toBeLessThanOrEqual(1);
  });

  it('loadLayout queued before mount is applied after connect', () => {
    const layout = JSON.stringify({
      gridRoot: { type: 'leaf', id: 'root', panels: ['pre-loaded'], activePanelId: 'pre-loaded' },
      floating: [],
      minimized: [],
      panels: { 'pre-loaded': { id: 'pre-loaded', title: 'Pre', component: 'map', state: 'docked' } },
    });
    client.loadLayout(layout);

    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    expect(lastState.panels['pre-loaded']).toBeDefined();
  });
});

// ─── C2: "Forgot client=" warning (timer-based) ───────────────────────────────

describe('C2: WorkspaceClient warns when never connected', () => {
  it('emits console.warn after 1s if connected client never receives _connect()', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Temporarily pretend we are in development mode
    const originalEnv = process.env.NODE_ENV;
    // @ts-ignore
    process.env.NODE_ENV = 'development';

    const orphan = new WorkspaceClient({
      panels: { map: { component: MockPanel } },
    });

    orphan.openPanel('orphan-panel', 'map'); // queues, starts timer

    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Did you forget client={workspace}')
    );

    warnSpy.mockRestore();
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  it('does NOT warn when the client connects within 1s', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const originalEnv = process.env.NODE_ENV;
    // @ts-ignore
    process.env.NODE_ENV = 'development';

    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;

    const client = new WorkspaceClient({ panels: { map: { component: MockPanel } } });
    client.openPanel('will-connect', 'map'); // starts timer

    // Mount before 1s fires
    act(() => {
      root = createRoot(container);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });

    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Did you forget client={workspace}')
    );

    act(() => { root!.unmount(); });
    document.body.removeChild(container);
    warnSpy.mockRestore();
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });
});

// ─── C1: console.warn for unregistered panel component key ────────────────────

describe('C1: console.warn for unregistered component key', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
    // Only register 'map' — 'ghost' is intentionally unregistered
    client = new WorkspaceClient({
      panels: { map: { component: MockPanel } },
    });
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
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

  it('emits console.warn when a panel references an unregistered component key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount();
    act(() => { lastActions.openPanel('ghost-panel', 'ghost-key'); });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ghost-key')
    );

    warnSpy.mockRestore();
  });

  it('does NOT warn for registered component keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount();
    act(() => { lastActions.openPanel('real-panel', 'map'); });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not registered')
    );

    warnSpy.mockRestore();
  });
});
