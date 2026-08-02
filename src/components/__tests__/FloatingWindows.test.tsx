import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import { PanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;
PanelRegistry.register('map', MockPanel);
PanelRegistry.register('editor', MockPanel);

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

describe('Floating Windows', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
    const preserved = document.getElementById('preserved-dom-container');
    if (preserved?.parentNode) preserved.parentNode.removeChild(preserved);
  });

  const mount = (withRenderer = false, dir?: 'ltr' | 'rtl') => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider dir={dir}>
          <PanelProvider>
            <StateExtractor />
            {withRenderer && <WindowManager />}
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
  };

  it('should open a panel directly as a floating window', () => {
    mount();
    act(() => {
      lastActions.openPanel('float-1', 'map', { initialTarget: 'floating' });
    });

    expect(lastState.panels['float-1'].state).toBe('floating');
    expect(lastState.floating.some((w: any) => w.id === 'float-1')).toBe(true);
  });

  it('should float a previously docked panel', () => {
    mount();
    act(() => { lastActions.openPanel('dock-then-float', 'map', { initialTarget: 'docked' }); });
    expect(lastState.panels['dock-then-float'].state).toBe('docked');

    act(() => { lastActions.floatPanel('dock-then-float'); });
    expect(lastState.panels['dock-then-float'].state).toBe('floating');
    expect(lastState.floating.some((w: any) => w.id === 'dock-then-float')).toBe(true);
  });

  it('should float a panel at a specified position and size', () => {
    mount();
    act(() => {
      lastActions.openPanel('pos-float', 'map', { initialTarget: 'docked' });
    });
    act(() => {
      lastActions.floatPanel('pos-float', { x: 100, y: 200, width: 500, height: 350 });
    });

    const win = lastState.floating.find((w: any) => w.id === 'pos-float');
    expect(win.x).toBe(100);
    expect(win.y).toBe(200);
    expect(win.width).toBe(500);
    expect(win.height).toBe(350);
  });

  it('should update floating window position via updateFloatingPosition', () => {
    mount();
    act(() => {
      lastActions.openPanel('upd-float', 'map', { initialTarget: 'floating' });
    });
    act(() => {
      lastActions.updateFloatingPosition('upd-float', { x: 300, y: 400 });
    });

    const win = lastState.floating.find((w: any) => w.id === 'upd-float');
    expect(win.x).toBe(300);
    expect(win.y).toBe(400);
  });

  it('should set anchor on a floating window', () => {
    mount();
    act(() => { lastActions.openPanel('anchor-win', 'map', { initialTarget: 'floating' }); });
    act(() => { lastActions.updateFloatingPosition('anchor-win', { anchor: 'top-right' }); });

    const win = lastState.floating.find((w: any) => w.id === 'anchor-win');
    expect(win.anchor).toBe('top-right');
  });

  it('should open a floating window pre-anchored to a corner', () => {
    mount();
    act(() => { lastActions.openPanel('pre-anchored', 'map', { initialTarget: 'floating', anchor: 'bottom-right' }); });

    const win = lastState.floating.find((w: any) => w.id === 'pre-anchored');
    expect(win.anchor).toBe('bottom-right');
  });

  it('should maximize a floating window', () => {
    mount();
    act(() => { lastActions.openPanel('max-win', 'map', { initialTarget: 'floating' }); });
    act(() => { lastActions.maximizePanel('max-win'); });

    const win = lastState.floating.find((w: any) => w.id === 'max-win');
    expect(win.maximized).toBe(true);
  });

  it('should restore (toggle off maximize) a maximized floating window', () => {
    mount();
    act(() => { lastActions.openPanel('toggle-max', 'map', { initialTarget: 'floating' }); });
    act(() => { lastActions.maximizePanel('toggle-max'); });
    expect(lastState.floating.find((w: any) => w.id === 'toggle-max').maximized).toBe(true);

    act(() => { lastActions.maximizePanel('toggle-max'); });
    expect(lastState.floating.find((w: any) => w.id === 'toggle-max').maximized).toBe(false);
  });

  it('should focus a floating window (highest z-index)', () => {
    mount();
    act(() => {
      lastActions.openPanel('win-a', 'map', { initialTarget: 'floating' });
      lastActions.openPanel('win-b', 'editor', { initialTarget: 'floating' });
    });

    const zBefore = lastState.floating.find((w: any) => w.id === 'win-a').z;
    act(() => { lastActions.focusPanel('win-a'); });
    const zAfter = lastState.floating.find((w: any) => w.id === 'win-a').z;

    expect(zAfter).toBeGreaterThan(zBefore);
    expect(zAfter).toBeGreaterThan(
      lastState.floating.find((w: any) => w.id === 'win-b').z
    );
  });

  it('should dock a floating window back to the grid', () => {
    mount();
    act(() => { lastActions.openPanel('dock-back', 'map', { initialTarget: 'floating' }); });
    expect(lastState.panels['dock-back'].state).toBe('floating');

    act(() => { lastActions.dockPanel('dock-back'); });
    expect(lastState.panels['dock-back'].state).toBe('docked');
    expect(lastState.floating.some((w: any) => w.id === 'dock-back')).toBe(false);
  });

  it('should remove floating window record when panel is closed', () => {
    mount();
    act(() => { lastActions.openPanel('close-float', 'map', { initialTarget: 'floating' }); });
    expect(lastState.floating.some((w: any) => w.id === 'close-float')).toBe(true);

    act(() => { lastActions.closePanel('close-float'); });
    expect(lastState.floating.some((w: any) => w.id === 'close-float')).toBe(false);
    expect(lastState.panels['close-float']).toBeUndefined();
  });

  it('should cascade multiple floating windows so they do not overlap exactly', () => {
    mount();
    act(() => {
      lastActions.openPanel('cascade-1', 'map', { initialTarget: 'floating' });
      lastActions.openPanel('cascade-2', 'map', { initialTarget: 'floating' });
    });

    const w1 = lastState.floating.find((w: any) => w.id === 'cascade-1');
    const w2 = lastState.floating.find((w: any) => w.id === 'cascade-2');
    // They should not have identical x,y (cascade offset applied)
    const samePosition = w1.x === w2.x && w1.y === w2.y;
    expect(samePosition).toBe(false);
  });

  it('should render floating window in DOM when WindowManager is mounted', () => {
    mount(true); // with WindowManager renderer
    act(() => {
      lastActions.openPanel('render-float', 'map', { initialTarget: 'floating', title: 'Render Float' });
    });

    const floatingEl = container!.querySelector('.floating-window');
    expect(floatingEl).not.toBeNull();
  });

  it('positions a top-right anchored window with insetInlineEnd under LTR (no manual physical flip)', () => {
    mount(true, 'ltr');
    act(() => { lastActions.openPanel('anchor-ltr', 'map', { initialTarget: 'floating', anchor: 'top-right' }); });

    const el = container!.querySelector('[data-window-id="anchor-ltr"]') as HTMLElement;
    expect(el.style.insetInlineEnd).not.toBe('');
    expect(el.style.insetInlineStart).toBe('');
  });

  it('positions a top-right anchored window with insetInlineEnd under RTL too (dir handles the mirroring, not JS)', () => {
    mount(true, 'rtl');
    act(() => { lastActions.openPanel('anchor-rtl', 'map', { initialTarget: 'floating', anchor: 'top-right' }); });

    const el = container!.querySelector('[data-window-id="anchor-rtl"]') as HTMLElement;
    expect(el.style.insetInlineEnd).not.toBe('');
    expect(el.style.insetInlineStart).toBe('');
    expect(el.getAttribute('dir')).toBe('rtl');
  });

  it('re-mirrors an already-anchored window when direction is switched live, with no other action taken', () => {
    mount(true, 'ltr');
    act(() => { lastActions.openPanel('anchor-live', 'map', { initialTarget: 'floating', anchor: 'top-right' }); });

    let el = container!.querySelector('[data-window-id="anchor-live"]') as HTMLElement;
    expect(el.style.insetInlineEnd).not.toBe('');
    expect(el.getAttribute('dir')).toBe('ltr');

    act(() => { lastActions.setDirection('rtl'); });

    el = container!.querySelector('[data-window-id="anchor-live"]') as HTMLElement;
    // Same logical property — the anchor itself was never touched. Only `dir` changed.
    expect(el.style.insetInlineEnd).not.toBe('');
    expect(el.style.insetInlineStart).toBe('');
    expect(el.getAttribute('dir')).toBe('rtl');
    expect(lastState.floating.find((w: any) => w.id === 'anchor-live').anchor).toBe('top-right');
  });

  it('stacks two windows anchored to the same corner with an offset, in both LTR and RTL', () => {
    for (const dir of ['ltr', 'rtl'] as const) {
      if (root) { act(() => { root!.unmount(); }); root = null; }
      lastState = null;
      lastActions = null;

      mount(true, dir);
      act(() => { lastActions.openPanel('stack-1', 'map', { initialTarget: 'floating', anchor: 'top-right' }); });
      act(() => { lastActions.updateFloatingPosition('stack-1', { height: 200 }); });
      act(() => { lastActions.openPanel('stack-2', 'editor', { initialTarget: 'floating', anchor: 'top-right' }); });

      const el1 = container!.querySelector('[data-window-id="stack-1"]') as HTMLElement;
      const el2 = container!.querySelector('[data-window-id="stack-2"]') as HTMLElement;
      const top1 = parseFloat(el1.style.top);
      const top2 = parseFloat(el2.style.top);

      // Second window stacks below the first: its height (200) + the fixed 8px gap.
      expect(top2 - top1).toBe(200 + 8);
    }
  });

  it('clamps width/height (but not position) of an anchored window when the workspace shrinks', () => {
    let roCallbacks: ResizeObserverCallback[] = [];
    const OriginalRO = globalThis.ResizeObserver;
    // @ts-ignore
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) { roCallbacks.push(cb); }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    try {
      mount(true, 'ltr');
      act(() => { lastActions.openPanel('anchor-clamp', 'map', { initialTarget: 'floating', anchor: 'top-right' }); });
      act(() => { lastActions.updateFloatingPosition('anchor-clamp', { width: 800, height: 600 }); });

      act(() => {
        roCallbacks.forEach(cb => cb(
          [{ contentRect: { width: 500, height: 400 } } as ResizeObserverEntry],
          {} as ResizeObserver
        ));
      });

      const win = lastState.floating.find((w: any) => w.id === 'anchor-clamp');
      expect(win.width).toBeLessThanOrEqual(500 - 20);
      expect(win.height).toBeLessThanOrEqual(400 - 40);
      expect(win.anchor).toBe('top-right');
    } finally {
      globalThis.ResizeObserver = OriginalRO;
    }
  });
});
