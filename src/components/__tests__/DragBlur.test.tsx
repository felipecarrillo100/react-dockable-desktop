/**
 * The window losing focus mid-drag ends the drag (7.4.1). The blur handler cleared the drag's
 * React state only: the window pointermove/pointerup listeners, the hovered drop zone and the
 * body's `rdd-dragging-active` stayed, so after an alt-tab the next click anywhere ran the drop —
 * docking the panel into the zone it had been over before the window lost focus.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WindowManagerProvider } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import WindowManager from '../WindowManager';
import { WorkspaceClient } from '../../WorkspaceClient';

// @ts-expect-error React's act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Panel: React.FC = () => <div />;
const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });

describe('window blur during a tab drag', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: WorkspaceClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    client = new WorkspaceClient({ panels: { p: { component: Panel } } });
    act(() => { client.openPanel('a', 'p'); client.openPanel('b', 'p'); });
    act(() => {
      root = createRoot(container);
      root.render(<WindowManagerProvider client={client}><PanelProvider><WindowManager /></PanelProvider></WindowManagerProvider>);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.classList.remove('rdd-dragging-active');
  });

  it('cancels the drag: no stale drop on the next click', () => {
    const before = JSON.stringify(client._core.getSnapshot().gridRoot);
    expect(client._core.getSnapshot().gridRoot.type).toBe('leaf');

    const tab = container.querySelector('[data-rdd-tab="b"]')!;
    act(() => { tab.dispatchEvent(pointer('pointerdown', 100, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
    expect(client._core.getSnapshot().draggedPanelId).toBe('b');
    const zone = container.querySelector('[data-drop-zone="right"]')!;
    expect(zone).toBeTruthy();
    act(() => { zone.dispatchEvent(pointer('pointerover', 200, 200)); });

    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(client._core.getSnapshot().draggedPanelId).toBeNull();
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);

    act(() => { window.dispatchEvent(pointer('pointerup', 200, 200)); });
    expect(JSON.stringify(client._core.getSnapshot().gridRoot)).toBe(before);
  });

  it('cancels a floating window drag too: the next click does not dock it', () => {
    act(() => { client.floatPanel('b', { x: 300, y: 300, width: 200, height: 150 }); });
    const before = JSON.stringify(client._core.getSnapshot().gridRoot);
    const bar = container.querySelector('[data-rdd-titlebar="b"]')!;
    act(() => { bar.dispatchEvent(pointer('pointerdown', 350, 310)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
    expect(client._core.getSnapshot().draggedPanelId).toBe('b');
    act(() => { container.querySelector('[data-drop-zone="right"]')!.dispatchEvent(pointer('pointerover', 200, 200)); });

    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
    act(() => { window.dispatchEvent(pointer('pointerup', 200, 200)); });
    expect(client._core.getSnapshot().panels.b.state).toBe('floating');
    expect(JSON.stringify(client._core.getSnapshot().gridRoot)).toBe(before);
  });

  it('a drag that is not interrupted still drops (the control)', () => {
    const tab = container.querySelector('[data-rdd-tab="b"]')!;
    act(() => { tab.dispatchEvent(pointer('pointerdown', 100, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
    act(() => { container.querySelector('[data-drop-zone="right"]')!.dispatchEvent(pointer('pointerover', 200, 200)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 200, 200)); });
    expect(client._core.getSnapshot().gridRoot.type).toBe('branch');
  });
});
