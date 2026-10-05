/**
 * Panels re-render only when something about them changes — the 7.7.2 fixes.
 *
 * Before 7.7.2 the desktop rebuilt every panel's element on each render, so focusing one panel or
 * moving a window by one pixel re-rendered all of them. `useWorkspaceState(selector)` re-rendered on
 * every change whatever the selector returned, and each tab-drag move re-rendered the whole desktop.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createWorkspace, DockableDesktopProvider, RddDesktop, RddModals, useModals, usePanel, useWorkspaceState, type Workspace } from '../../index';
import * as workspaceMenus from '../workspace/workspaceMenus';
import type { WorkspaceClient } from '../../WorkspaceClient';

// The desktop builds its menu handlers once per render: counting the calls counts its renders.
vi.mock('../workspace/workspaceMenus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace/workspaceMenus')>();
  return { ...actual, createWorkspaceMenus: vi.fn(actual.createWorkspaceMenus) };
});
const desktopRenders = () => vi.mocked(workspaceMenus.createWorkspaceMenus).mock.calls.length;

const renders = new Map<string, number>();
const count = (id: string) => renders.set(id, (renders.get(id) ?? 0) + 1);
const total = () => [...renders.values()].reduce((a, b) => a + b, 0);

/** A panel that reads nothing from the workspace. */
const Plain: React.FC<{ panelId: string }> = ({ panelId }) => { count(panelId); return <div>{panelId}</div>; };
/** A panel that reads its own state through `usePanel`. */
const Aware: React.FC = () => { const p = usePanel(); count(p.id); return <div data-active={p.isActive} />; };

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });

let ws: Workspace;
let container: HTMLDivElement;
let root: Root;

function mount(extra?: React.ReactNode): void {
  ws = createWorkspace({ panels: { plain: { component: Plain }, aware: { component: Aware } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<DockableDesktopProvider workspace={ws}><RddDesktop />{extra}</DockableDesktopProvider>);
  });
}

function open(n: number, component: 'plain' | 'aware'): void {
  act(() => { for (let i = 0; i < n; i++) ws.openPanel(`p${i}`, component); });
  act(() => { ws.floatPanel('p0', { x: 10, y: 10, width: 300, height: 200 }); });
  renders.clear();
}

beforeEach(() => { renders.clear(); });
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.getElementById('preserved-dom-container')?.remove();
  document.body.classList.remove('rdd-dragging-active');
});

describe('panel bodies', () => {
  it.each([10, 100])('focusing a panel re-renders none of %i panels that read nothing', (n) => {
    mount();
    open(n, 'plain');
    act(() => { ws.focusPanel('p5'); });
    act(() => { ws.focusPanel('p0'); });
    expect(total()).toBe(0);
  });

  it.each([10, 100])('moving a floating window re-renders none of %i panels', (n) => {
    mount();
    open(n, 'plain');
    for (let i = 0; i < 20; i++) act(() => { ws.updateFloatingPosition('p0', { x: 20 + i, y: 20, anchor: null }); });
    expect(total()).toBe(0);
  });

  it('dragging a floating window by its title bar re-renders no panel', () => {
    mount();
    open(10, 'plain');
    const bar = container.querySelector('[data-rdd-titlebar="p0"]')!;
    act(() => { bar.dispatchEvent(pointer('pointerdown', 50, 15)); });
    for (let i = 0; i < 20; i++) act(() => { window.dispatchEvent(pointer('pointermove', 100 + i * 5, 100)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 200, 100)); });
    expect((ws as unknown as WorkspaceClient)._core.getSnapshot().floating.find(w => w.id === 'p0')!.x).not.toBe(10);
    expect(total()).toBe(0);
  });

  it('a focus change re-renders only the two panels whose usePanel().isActive flips', () => {
    mount();
    open(10, 'aware');
    act(() => { ws.focusPanel('p5'); });
    expect([...renders.keys()].sort()).toEqual(['p0', 'p5']);
  });

  it("a panel's own change re-renders that panel and no other", () => {
    mount();
    open(10, 'plain');
    act(() => { ws.updatePanelTitle('p3', 'Renamed'); });
    expect([...renders.keys()]).toEqual(['p3']);
  });
});

describe('useWorkspaceState(selector)', () => {
  it('re-renders only when the selected value changes', () => {
    let selectorRenders = 0;
    const Count: React.FC = () => { selectorRenders++; return <span>{useWorkspaceState(s => Object.keys(s.panels).length)}</span>; };
    mount(<Count />);
    open(10, 'plain');
    selectorRenders = 0;
    act(() => { ws.focusPanel('p5'); });
    for (let i = 0; i < 5; i++) act(() => { ws.updateFloatingPosition('p0', { x: 20 + i, y: 20, anchor: null }); });
    expect(selectorRenders).toBe(0);
    act(() => { ws.openPanel('extra', 'plain'); });
    expect(selectorRenders).toBe(1);
  });
});

describe('modals', () => {
  it("moving a window re-renders no open modal's content", () => {
    let modals: ReturnType<typeof useModals> | null = null;
    const Grab: React.FC = () => { modals = useModals(); return null; };
    const Dialog: React.FC = () => { count('modal'); return <div />; };
    mount(<><RddModals /><Grab /></>);
    open(3, 'plain');
    act(() => { modals!.open(Dialog, {}); });
    renders.clear();
    for (let i = 0; i < 5; i++) act(() => { ws.updateFloatingPosition('p0', { x: 20 + i, y: 20, anchor: null }); });
    expect(total()).toBe(0);
  });
});

describe('tab drag', () => {
  it('moving the pointer moves the ghost without re-rendering the desktop', () => {
    mount();
    open(10, 'plain');
    const tab = container.querySelector('[data-rdd-tab="p3"]')!;
    act(() => { tab.dispatchEvent(pointer('pointerdown', 100, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
    const ghost = () => container.querySelector('.rdd-drag-ghost-tab') as HTMLElement | null;
    expect(ghost()).not.toBeNull();

    const before = desktopRenders();
    for (let i = 1; i <= 20; i++) act(() => { window.dispatchEvent(pointer('pointermove', 200 + i, 200)); });
    expect(ghost()!.style.left).toBe(`${220 + 12}px`);
    expect(desktopRenders() - before).toBe(0);
    expect(total()).toBe(0);

    act(() => { window.dispatchEvent(pointer('pointerup', 220, 200)); });
  });
});
