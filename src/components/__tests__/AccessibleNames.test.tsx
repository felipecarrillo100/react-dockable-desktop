import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DockableDesktopProvider } from '../DockableDesktopProvider';
import { useWindowManagerActions, usePanelContextMenu, type MessageFormatter } from '../WindowManagerContext';
import { usePanelActions } from '../PanelProviderContext';
import ModalStackRenderer from '../ModalStackRenderer';
import { Sidebar } from '../Sidebar';
import { ToastContainer, toast } from '../Toast';
import { ToolbarSearchInput } from '../PanelOverlay';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';

// Every user-facing string and accessible name the library renders goes through the message
// table, so a localised app never shows (or announces) English. The formatter below prefixes
// everything it translates with "ES:"; any English default that reaches the DOM is a string that
// bypassed the table.

const ES: MessageFormatter = (m) => {
  let text = m.defaultMessage ?? m.id;
  for (const [k, v] of Object.entries(m.values ?? {})) text = text.replace(`{${k}}`, String(v));
  return `ES:${text}`;
};

let A: any;
let P: any;
const Probe: React.FC = () => { A = useWindowManagerActions(); P = usePanelActions(); return null; };
const Plain: React.FC = () => <div />;
const WithMenu: React.FC = () => {
  usePanelContextMenu([{ label: 'custom', action: () => {} }]);
  return <div />;
};

let container: HTMLDivElement;
let root: Root | null = null;
const mount = (children: React.ReactNode, initialState: string | null = null) => {
  const client = new WorkspaceClient({
    panels: { plain: { component: Plain }, withMenu: { component: WithMenu } },
    initialState,
    formatMessage: ES,
  });
  act(() => {
    root = createRoot(container);
    root.render(<DockableDesktopProvider workspace={client} formatMessage={ES}><Probe />{children}</DockableDesktopProvider>);
  });
};
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.getElementById('preserved-dom-container')?.remove();
});

const attr = (sel: string, name: string) => document.body.querySelector(sel)?.getAttribute(name) ?? null;
const text = (sel: string) => document.body.querySelector(sel)?.textContent?.trim() ?? null;

describe('accessible names and messages are localised', () => {
  it('toast region and close button', async () => {
    mount(<ToastContainer />);
    await act(async () => { toast('saved'); });
    expect(attr('.rdd-toast-container', 'aria-label')).toBe('ES:Notifications');
    expect(attr('.rdd-toast [aria-label]', 'aria-label')).toBe('ES:Close notification');
  });

  it('sidebar drawer close button', () => {
    mount(
      <Sidebar tabs={[{ id: 's1', label: 'S', icon: <span />, renderContent: () => <div /> }]} activeTabId="s1" showCloseButton>
        <div />
      </Sidebar>,
    );
    expect(attr('.rdd-sidebar-drawer-close-button', 'aria-label')).toBe('ES:Close');
    expect(attr('.rdd-sidebar-drawer-close-button', 'title')).toBe('ES:Close');
  });

  it('panel search box: button, input and close', () => {
    mount(<ToolbarSearchInput onSearch={async () => []} onSelect={() => {}} />);
    const open = document.body.querySelector('.rdd-panel-toolbar-search button')!;
    expect(open.getAttribute('aria-label')).toBe('ES:Search');
    expect(open.getAttribute('title')).toBe('ES:Search');
    act(() => (open as HTMLButtonElement).click());
    const input = document.body.querySelector('.rdd-panel-toolbar-search--open input')!;
    expect(input.getAttribute('placeholder')).toBe('ES:Search…');
    expect(input.getAttribute('aria-label')).toBe('ES:Search');
    expect(attr('.rdd-panel-toolbar-search--open button[aria-label]', 'aria-label')).toBe('ES:Close search');
  });

  it('an explicit search placeholder still wins', () => {
    mount(<ToolbarSearchInput placeholder="Find a layer" onSearch={async () => []} onSelect={() => {}} />);
    act(() => (document.body.querySelector('.rdd-panel-toolbar-search button') as HTMLButtonElement).click());
    expect(attr('.rdd-panel-toolbar-search--open input', 'placeholder')).toBe('Find a layer');
  });

  it('default modal title', () => {
    mount(<ModalStackRenderer />);
    act(() => { P.openModal(Plain, {}); });
    expect(text('.rdd-modal-title')).toBe('ES:Confirmation');
  });

  it('unregistered component placeholder', () => {
    mount(<WindowManager />);
    act(() => { A.openPanel('x', 'no-such-component'); });
    const box = text('.rdd-unregistered-panel');
    expect(box).toContain('ES:Component Unregistered');
    expect(box).toContain('ES:Key: no-such-component');
    expect(box).not.toMatch(/(^|[^:])Component Unregistered/);
  });

  it('empty group placeholder', () => {
    mount(<WindowManager />);
    expect(text('.rdd-empty-leaf-placeholder')).toBe('ES:Empty Workspace Section');
  });

  it('taskbar scroll buttons', () => {
    mount(<WindowManager taskbarVisibility="always" />);
    act(() => { A.openPanel('a', 'plain'); });
    act(() => { A.minimizePanel('a'); });
    const labels = Array.from(document.body.querySelectorAll('.rdd-taskbar-nav-btn')).map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual(['ES:Scroll taskbar left', 'ES:Scroll taskbar right']);
  });

  it('floating window "more actions" button', () => {
    mount(<WindowManager />);
    act(() => { A.openPanel('m', 'withMenu', { initialTarget: 'floating' }); });
    // The panel registers its menu items in an effect; the header shows the button on its next render.
    act(() => { A.openPanel('other', 'plain'); });
    expect(attr('.rdd-btn-more-actions', 'title')).toBe('ES:More actions');
    expect(attr('.rdd-btn-more-actions', 'aria-label')).toBe('ES:More actions');
  });
});
