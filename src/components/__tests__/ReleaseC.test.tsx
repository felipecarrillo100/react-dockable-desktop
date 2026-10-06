/**
 * The 7.10.0 tab content and typed registry, through the public API. `renderTabContent` replaces
 * what's inside each grid tab; the tab itself stays the library's. `definePanels` is a type-level
 * marker: at runtime it returns its argument. Without either, nothing changes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ts from 'typescript';
import { join } from 'node:path';
import { createWorkspace, definePanels, DockableDesktopProvider, RddDesktop, type Workspace, type TabContentProps } from '../../index';

const Plain: React.FC = () => <div />;
const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(desktop: React.ComponentProps<typeof RddDesktop> = {}): Workspace {
  const ws = createWorkspace({ panels: { plain: { component: Plain }, other: { component: Plain, defaultOptions: { icon: <i className="other-icon" /> } } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop {...desktop} /></DockableDesktopProvider>); });
  return ws;
}
const $ = (sel: string) => container!.querySelector(sel);
const $$ = (sel: string) => [...container!.querySelectorAll(sel)];

/** Records the latest props each tab was rendered with, and renders them as text. */
function recorder() {
  const last: Record<string, TabContentProps> = {};
  const render = (tab: TabContentProps) => {
    last[tab.panelId] = tab;
    return <b className="mine" data-id={tab.panelId}>{tab.component}:{tab.title}{tab.dirty ? '!' : ''}</b>;
  };
  return { last, render };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
  document.getElementById('preserved-dom-container')?.remove();
  document.body.classList.remove('rdd-dragging-active');
});

describe('renderTabContent', () => {
  it('without it, the built-in icon, title and dirty marker are shown', () => {
    const ws = mount();
    act(() => { ws.openPanel('a', 'plain', { title: 'Alpha' }); ws.setPanelDirty('a', true); });
    const tab = $('[data-rdd-tab="a"]')!;
    expect(tab.querySelector('.rdd-workspace-tab-icon')).not.toBeNull();
    expect(tab.querySelector('.rdd-workspace-tab-title')!.textContent).toContain('Alpha *');
  });

  it("replaces the tab's content, and the tab keeps its role, attributes and close button", () => {
    const { render } = recorder();
    const ws = mount({ renderTabContent: render });
    act(() => { ws.openPanel('a', 'plain', { title: 'Alpha' }); });
    const tab = $('[data-rdd-tab="a"]')!;
    expect(tab.querySelector('.rdd-workspace-tab-icon')).toBeNull();
    expect(tab.querySelector('.rdd-workspace-tab-title > .mine')!.textContent).toBe('plain:Alpha');
    expect(tab.getAttribute('role')).toBe('tab');
    expect(tab.getAttribute('aria-selected')).toBe('true');
    act(() => { (tab.querySelector('.rdd-close-tab-x') as HTMLElement).click(); });
    expect(ws.isOpen('a')).toBe(false);
  });

  it('receives the formatted title, the resolved icon, and the dirty, selected and focused state', () => {
    const { last, render } = recorder();
    const ws = mount({ renderTabContent: render });
    act(() => { ws.openPanel('a', 'plain', { title: 'Alpha' }); ws.openPanel('b', 'other', { title: () => 'Beta', initialTarget: 'tabbed' }); });
    expect(last.b).toMatchObject({ panelId: 'b', component: 'other', title: 'Beta', dirty: false, selected: true, focused: true });
    expect(last.a).toMatchObject({ selected: false, focused: false });
    act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop renderTabContent={(t) => <span className="icon-probe">{t.icon}</span>} /></DockableDesktopProvider>); });
    expect($('[data-rdd-tab="b"] .icon-probe .other-icon')).not.toBeNull();   // the registration's icon
    expect($('[data-rdd-tab="a"] .icon-probe svg')).not.toBeNull();            // the built-in default icon
  });

  it('re-renders as the state changes', () => {
    const { last, render } = recorder();
    const ws = mount({ renderTabContent: render });
    act(() => { ws.openPanel('a', 'plain', { title: 'Alpha' }); ws.openPanel('b', 'plain', { title: 'Beta', initialTarget: 'tabbed' }); });
    act(() => { ws.setPanelDirty('a', true); ws.updatePanelTitle('a', 'Alpha 2'); ws.focusPanel('a'); });
    expect(last.a).toMatchObject({ title: 'Alpha 2', dirty: true, selected: true, focused: true });
    expect(last.b).toMatchObject({ selected: false, focused: false });
    expect($('[data-rdd-tab="a"] .mine')!.textContent).toBe('plain:Alpha 2!');
  });

  it('applies to every group of a split, and focused tells the groups apart', () => {
    const { last, render } = recorder();
    const ws = mount({ renderTabContent: render });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { dockTo: { panel: 'a', position: 'right' } }); });
    expect($$('[data-rdd-leaf]').length).toBe(2);
    expect($$('.mine').map(e => e.getAttribute('data-id')).sort()).toEqual(['a', 'b']);
    expect(last.a.selected && last.b.selected).toBe(true);
    expect([last.a.focused, last.b.focused].filter(Boolean)).toHaveLength(1);
  });

  it('a tab is still dragged by its content', () => {
    const ws = mount({ renderTabContent: (t) => <b className="mine">{t.title}</b> });
    act(() => { ws.openPanel('a', 'plain'); ws.openPanel('b', 'plain', { initialTarget: 'tabbed' }); });
    act(() => { $('[data-rdd-tab="a"] .mine')!.dispatchEvent(pointer('pointerdown', 100, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 200, 200)); });
    expect($$('[data-drop-zone]').length).toBeGreaterThan(0);
    act(() => { window.dispatchEvent(pointer('pointerup', 200, 200)); });
  });

  it('floating windows keep their built-in title bar', () => {
    const ws = mount({ renderTabContent: (t) => <b className="mine">{t.title}</b> });
    act(() => { ws.openPanel('f', 'plain', { title: 'Floaty', initialTarget: 'floating' }); });
    expect($('[data-rdd-titlebar="f"]')!.textContent).toContain('Floaty');
    expect($$('.mine')).toHaveLength(0);
  });
});

describe('definePanels', () => {
  it('returns its argument, and a workspace created from it works as usual', () => {
    const map = { plain: { component: Plain } };
    const panels = definePanels(map);
    expect(panels).toBe(map);
    const ws = createWorkspace({ panels });
    ws.openPanel('a', 'plain');
    expect(ws.isOpen('a')).toBe(true);
  });

  it('types openPanel from the registry, and leaves plain maps untyped', () => {
    const fixture = join(__dirname, 'fixtures', 'typedPanels.fixture.tsx');
    const program = ts.createProgram([fixture], {
      strict: true, noEmit: true, skipLibCheck: true,
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program)
      .filter(d => d.file?.fileName === fixture)
      .map(d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    expect(diagnostics).toEqual([]);
  }, 60_000);
});
