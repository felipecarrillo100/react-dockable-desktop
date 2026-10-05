/**
 * Two workspaces on one page, each with its own provider — the 7.7.1 fixes.
 *
 * Before 7.7.1 the panel DOM cache, the panel sizes and the lifecycle handlers were module-level maps
 * keyed by panel id, shared by every workspace: one workspace's cleanup deleted the other's cached
 * elements (its panels remounted blank on its next render), and two workspaces with the same panel id
 * rendered into one element and fired each other's handlers. The skin, the animations opt-out and the
 * stacking base on <html> were last-writer-wins, and unmounting either workspace removed them.
 *
 * Uses the public API only, as an app would.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, usePanel, usePanelEvents, usePanelSize,
  type Workspace,
} from '../../index';

interface Mounted { ws: Workspace; container: HTMLDivElement; root: Root }
let mounted: Mounted[] = [];

const html = document.documentElement;

beforeEach(() => {
  mounted = [];
  html.removeAttribute('data-rdd-skin');
  html.classList.remove('rdd-no-animations');
  html.style.removeProperty('--rdd-z-base');
});
afterEach(() => {
  for (const m of mounted) { act(() => m.root.unmount()); m.container.remove(); }
  mounted = [];
  document.getElementById('preserved-dom-container')?.remove();
});

const events: string[] = [];

/** A panel that names its workspace, keeps local state, logs its lifecycle and shows its size. */
const Probe: React.FC<{ tag: string }> = ({ tag }) => {
  const panel = usePanel();
  const [clicks, setClicks] = useState(0);
  const size = usePanelSize();
  usePanelEvents({
    onMinimize: () => events.push(`${tag}:${panel.id}:minimize`),
    onRestore: () => events.push(`${tag}:${panel.id}:restore`),
  });
  return (
    <div data-probe={`${tag}:${panel.id}`} data-size={size ? `${size.width}x${size.height}` : 'null'}>
      <button type="button" data-click={`${tag}:${panel.id}`} onClick={() => setClicks(c => c + 1)}>{tag}:{clicks}</button>
    </div>
  );
};

function mount(tag: string, desktop: React.ComponentProps<typeof RddDesktop> = {}, zIndexBase?: number): Mounted {
  const ws = createWorkspace({ panels: { probe: { component: Probe } } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <DockableDesktopProvider workspace={ws} zIndexBase={zIndexBase}>
        <RddDesktop {...desktop} />
      </DockableDesktopProvider>,
    );
  });
  const m = { ws, container, root };
  mounted.push(m);
  return m;
}

function unmount(m: Mounted): void {
  act(() => m.root.unmount());
  m.container.remove();
  mounted = mounted.filter(x => x !== m);
}

const probe = (m: Mounted, key: string) => m.container.querySelector(`[data-probe="${key}"]`) as HTMLElement | null;
const click = (m: Mounted, key: string) => act(() => {
  (m.container.querySelector(`[data-click="${key}"]`) as HTMLButtonElement).click();
});

beforeEach(() => { events.length = 0; });

describe('two workspaces, different panel ids', () => {
  it("one workspace's panel changes don't blank the other's panels or lose their state", () => {
    const a = mount('A');
    const b = mount('B');
    act(() => { a.ws.openPanel('a1', 'probe', { props: { tag: 'A' } }); });
    act(() => { b.ws.openPanel('b1', 'probe', { props: { tag: 'B' } }); });
    click(b, 'B:b1');
    click(b, 'B:b1');
    const before = probe(b, 'B:b1');
    expect(before?.textContent).toBe('B:2');

    // A opens and closes a panel: its cache cleanup runs.
    act(() => { a.ws.openPanel('a2', 'probe', { props: { tag: 'A' } }); });
    act(() => { a.ws.closePanel('a2'); });
    // …and B renders again, which is when a deleted cache entry used to give its panel a new, empty element.
    act(() => { b.ws.openPanel('b2', 'probe', { props: { tag: 'B' } }); });
    act(() => { b.ws.focusPanel('b1'); });

    const after = probe(b, 'B:b1');
    expect(after).toBe(before);
    expect(after?.textContent).toBe('B:2');
    expect(after?.isConnected).toBe(true);
  });
});

describe('two workspaces, the same panel id', () => {
  it('each renders into its own element', () => {
    const a = mount('A');
    const b = mount('B');
    act(() => { a.ws.openPanel('p', 'probe', { props: { tag: 'A' } }); });
    act(() => { b.ws.openPanel('p', 'probe', { props: { tag: 'B' } }); });
    expect(probe(a, 'A:p')).not.toBeNull();
    expect(probe(b, 'B:p')).not.toBeNull();
    expect(probe(a, 'B:p')).toBeNull();
    expect(probe(b, 'A:p')).toBeNull();
  });

  it("lifecycle events reach only their own workspace's panel, and survive the other closing it", () => {
    const a = mount('A');
    const b = mount('B');
    act(() => { a.ws.openPanel('p', 'probe', { props: { tag: 'A' } }); });
    act(() => { b.ws.openPanel('p', 'probe', { props: { tag: 'B' } }); });

    act(() => { a.ws.minimizePanel('p'); });
    expect(events).toEqual(['A:p:minimize']);

    act(() => { a.ws.closePanel('p'); });
    events.length = 0;
    act(() => { b.ws.minimizePanel('p'); });
    expect(events).toEqual(['B:p:minimize']);
  });

  it('usePanelSize reports its own panel only', () => {
    // A ResizeObserver that reports a size only for the elements it was asked to observe.
    const observers: { cb: ResizeObserverCallback; targets: Element[] }[] = [];
    const Original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private readonly entry: { cb: ResizeObserverCallback; targets: Element[] };
      constructor(cb: ResizeObserverCallback) { this.entry = { cb, targets: [] }; observers.push(this.entry); }
      observe(target: Element) { this.entry.targets.push(target); }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const a = mount('A');
      const b = mount('B');
      act(() => { a.ws.openPanel('p', 'probe', { props: { tag: 'A' } }); });
      act(() => { b.ws.openPanel('p', 'probe', { props: { tag: 'B' } }); });

      act(() => {
        for (const o of observers) {
          if (o.targets.some(t => a.container.contains(t))) {
            o.cb([{ contentRect: { width: 320, height: 240 } } as ResizeObserverEntry], {} as ResizeObserver);
          }
        }
      });
      expect(probe(a, 'A:p')?.getAttribute('data-size')).toBe('320x240');
      expect(probe(b, 'B:p')?.getAttribute('data-size')).toBe('null');
    } finally {
      globalThis.ResizeObserver = Original;
    }
  });
});

describe('the taskbar preview', () => {
  const pointer = (type: string, target: Element, pointerType: string) => act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, clientX: 0, clientY: 0 }));
  });
  const tooltip = (title: string) =>
    [...document.querySelectorAll('.rdd-taskbar-item-tooltip')].find(t => t.textContent?.includes(title)) ?? null;

  it("a touch inside one workspace's preview never reads as a touch outside it because of the other's", () => {
    const a = mount('A', { taskbarVisibility: 'always' });
    const b = mount('B', { taskbarVisibility: 'always' });
    act(() => { a.ws.openPanel('p', 'probe', { title: 'Alpha', props: { tag: 'A' } }); });
    act(() => { b.ws.openPanel('p', 'probe', { title: 'Beta', props: { tag: 'B' } }); });
    act(() => { a.ws.minimizePanel('p'); });
    act(() => { b.ws.minimizePanel('p'); });

    // B's preview first (by mouse, so it adds no touch handler), then A's by a touch tap: B's is now
    // the first preview in the document.
    pointer('pointerover', b.container.querySelector('button[aria-label="Beta"]')!, 'mouse');
    const alpha = a.container.querySelector('button[aria-label="Alpha"]')!;
    pointer('pointerdown', alpha, 'touch');
    pointer('pointerup', alpha, 'touch');
    expect(tooltip('Beta')).not.toBeNull();
    expect(tooltip('Alpha')).not.toBeNull();

    // A touch inside A's own preview keeps it open.
    pointer('pointerdown', tooltip('Alpha')!, 'touch');
    expect(tooltip('Alpha')).not.toBeNull();
  });
});

describe('what the workspaces mirror onto <html>', () => {
  it('the newest workspace wins, and unmounting it hands <html> back instead of clearing it', () => {
    const a = mount('A', { skin: 'nord', animations: false }, 2000);
    expect(html.getAttribute('data-rdd-skin')).toBe('nord');
    expect(html.classList.contains('rdd-no-animations')).toBe(true);
    expect(html.style.getPropertyValue('--rdd-z-base')).toBe('2000');

    const b = mount('B', { skin: 'tokyo' }, 3000);
    expect(html.getAttribute('data-rdd-skin')).toBe('tokyo');
    expect(html.classList.contains('rdd-no-animations')).toBe(false);
    expect(html.style.getPropertyValue('--rdd-z-base')).toBe('3000');

    unmount(b);
    expect(html.getAttribute('data-rdd-skin')).toBe('nord');
    expect(html.classList.contains('rdd-no-animations')).toBe(true);
    expect(html.style.getPropertyValue('--rdd-z-base')).toBe('2000');

    unmount(a);
    expect(html.hasAttribute('data-rdd-skin')).toBe(false);
    expect(html.classList.contains('rdd-no-animations')).toBe(false);
    expect(html.style.getPropertyValue('--rdd-z-base')).toBe('');
  });

  it("changing an older workspace's skin doesn't put it over a newer one", () => {
    const ws = createWorkspace();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderA = (skin: string) => act(() => {
      root.render(<DockableDesktopProvider workspace={ws}><RddDesktop skin={skin} /></DockableDesktopProvider>);
    });
    renderA('nord');
    mounted.push({ ws, container, root });
    mount('B', { skin: 'tokyo' });
    renderA('slate');
    expect(html.getAttribute('data-rdd-skin')).toBe('tokyo');
  });

  it("a provider without a desktop never touches the page's own skin attribute", () => {
    html.setAttribute('data-rdd-skin', 'page-set');
    const ws = createWorkspace();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<DockableDesktopProvider workspace={ws}><div /></DockableDesktopProvider>); });
    act(() => root.unmount());
    container.remove();
    expect(html.getAttribute('data-rdd-skin')).toBe('page-set');
  });
});
