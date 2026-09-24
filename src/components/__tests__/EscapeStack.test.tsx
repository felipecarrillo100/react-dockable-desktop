import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DockableDesktopProvider } from '../DockableDesktopProvider';
import SidePanelRenderer from '../SidePanelRenderer';
import ModalStackRenderer from '../ModalStackRenderer';
import { Toolbar } from '../Toolbar';
import { usePanelActions } from '../PanelProviderContext';
import { useShowContextMenu } from '../ContextMenu';
import { ToolbarSearchInput } from '../PanelOverlay';

// One Escape closes exactly one overlay: the one on top. Every overlay used to listen on
// `document` on its own, and `stopPropagation()` does not stop other listeners on the same
// node — so one key press could close a menu *and* the modal under it, or both drawers.
//
// "On top": popups (context menu, toolbar flyout) above modals, modals above drawers, and
// within one of those layers the most recently opened.

let P: any;
let showMenu: any;
const Probe: React.FC = () => { P = usePanelActions(); showMenu = useShowContextMenu(); return null; };
const Plain: React.FC = () => <div className="plain-content">content</div>;
const WithSearch: React.FC = () => <div><ToolbarSearchInput onSearch={async () => []} onSelect={() => {}} /></div>;
const WithToolbar: React.FC = () => (
  <Toolbar items={[{ type: 'group', id: 'g', label: 'G', defaultIcon: <svg />, items: [{ id: 's1', label: 'S1', icon: <svg /> }] }]} />
);
const ClaimsEscape: React.FC = () => (
  <input className="claims-escape" onKeyDown={e => { if (e.key === 'Escape') e.preventDefault(); }} />
);

let container: HTMLDivElement;
let root: Root | null = null;
const mount = (extra?: React.ReactNode) => act(() => {
  root = createRoot(container);
  root.render(
    <DockableDesktopProvider>
      <Probe />
      {extra}
      <SidePanelRenderer />
      <ModalStackRenderer />
    </DockableDesktopProvider>,
  );
});
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { if (root) act(() => root!.unmount()); root = null; container.remove(); });

const q = (sel: string) => !!document.body.querySelector(sel);
const open = () => ({
  left: q('.rdd-side-panel-left'),
  right: q('.rdd-side-panel-right'),
  modals: document.body.querySelectorAll('.rdd-modal-overlay').length,
  menu: q('.rdd-context-menu'),
  flyout: q('.rdd-toolbar-group-flyout'),
  search: q('.rdd-panel-toolbar-search--open'),
});
const escape = async (target: EventTarget = document.body) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
};
const openLeft = async (C: React.FC = Plain) => { await act(async () => { await P.openLeftPanel(C, {}, { title: 'L' }); }); };
const openRight = async () => { await act(async () => { await P.openRightPanel(Plain, {}, { title: 'R' }); }); };
const openModal = (C: React.FC = Plain, options: object = {}) => act(() => { P.openModal(C, {}, { title: 'M', ...options }); });
const openMenu = () => act(() => { showMenu({ x: 10, y: 10, items: [{ label: 'x', action: () => {} }] }); });
const openFlyout = () => {
  const btn = document.body.querySelector('button.rdd-toolbar-btn-group') as HTMLButtonElement;
  act(() => btn.click());
};

describe('Escape closes only the overlay on top', () => {
  it('two drawers: the one opened last, then the other', async () => {
    mount();
    await openLeft();
    await openRight();
    await escape();
    expect(open()).toMatchObject({ left: true, right: false });
    await escape();
    expect(open()).toMatchObject({ left: false, right: false });
  });

  it('a context menu over a modal closes before the modal', async () => {
    mount();
    openModal();
    openMenu();
    await escape();
    expect(open()).toMatchObject({ menu: false, modals: 1 });
    await escape();
    expect(open().modals).toBe(0);
  });

  it('two stacked modals: the top one only', async () => {
    mount();
    openModal();
    openModal();
    await escape();
    expect(open().modals).toBe(1);
  });

  it('a toolbar flyout inside a modal closes before the modal', async () => {
    mount();
    openModal(WithToolbar);
    openFlyout();
    await escape();
    expect(open()).toMatchObject({ flyout: false, modals: 1 });
  });

  it('a flyout left open when a modal opens closes first', async () => {
    mount(<WithToolbar />);
    openFlyout();
    openModal();
    await escape();
    expect(open()).toMatchObject({ flyout: false, modals: 1 });
  });

  for (const where of ['drawer', 'modal'] as const) {
    it(`the panel search inside a ${where} closes before the ${where}`, async () => {
      mount();
      if (where === 'drawer') await openLeft(WithSearch); else openModal(WithSearch);
      act(() => (document.body.querySelector('.rdd-panel-toolbar-search button') as HTMLButtonElement).click());
      const input = document.body.querySelector('.rdd-panel-toolbar-search--open input') as HTMLInputElement;
      expect(input).not.toBeNull();
      await escape(input);
      const after = open();
      expect(after.search).toBe(false);
      if (where === 'drawer') expect(after.left).toBe(true); else expect(after.modals).toBe(1);
    });
  }

  it('a modal closes before a drawer opened after it (the modal is drawn on top)', async () => {
    mount();
    openModal();
    await openLeft();
    await escape();
    expect(open()).toMatchObject({ modals: 0, left: true });
    await escape();
    expect(open().left).toBe(false);
  });

  it('a modal closes before a drawer opened before it', async () => {
    mount();
    await openLeft();
    openModal();
    await escape();
    expect(open()).toMatchObject({ modals: 0, left: true });
  });

  it('a context menu over a drawer closes before the drawer', async () => {
    mount();
    await openLeft();
    openMenu();
    await escape();
    expect(open()).toMatchObject({ menu: false, left: true });
  });

  it('a modal that cannot be closed swallows Escape instead of passing it to the drawer below', async () => {
    mount();
    await openLeft();
    openModal(Plain, { closable: false });
    await escape();
    expect(open()).toMatchObject({ modals: 1, left: true });
  });

  it('an app control that handles Escape itself keeps its modal open', async () => {
    mount();
    openModal(ClaimsEscape);
    const input = document.body.querySelector('input.claims-escape') as HTMLInputElement;
    await escape(input);
    expect(open().modals).toBe(1);
  });

  it('control: a single drawer closes', async () => {
    mount();
    await openLeft();
    await escape();
    expect(open().left).toBe(false);
  });
});

describe('Context menu outside-click check', () => {
  it('a click whose target is not a DOM node closes the menu instead of throwing', () => {
    mount();
    openMenu();
    const errors: string[] = [];
    const onError = (e: ErrorEvent) => { errors.push(e.message); e.preventDefault(); };
    window.addEventListener('error', onError);
    act(() => { window.dispatchEvent(new MouseEvent('click')); });
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(open().menu).toBe(false);
  });
});
