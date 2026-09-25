// An app shell written against the react-dockable-desktop 6.x API.
import React, { useRef } from 'react';
import {
  RddDesktop, createWorkspace, DockableDesktopProvider, RddSidebar as DockSidebar, RddSecondarySidebar,
  RddModals, RddSidePanels, RddToasts, toast, RddConfirm,
  RddContextMenu, useContextMenu,
  useWorkspaceState, useWorkspace, useModals, useSidePanels,
  useActiveContribution, sectionToTab, useMessages, defaultMessages, useHostClasses,
  type Workspace, type WorkspaceState, type OverlayInstance, type MessageKey,
  type MessageDescriptor, type ContextMenuHandle, type RddSidebarProps,
} from 'react-dockable-desktop';
import { Toolbar } from './other-ui-kit';
import { NotesPanel, MapPanel } from './panels';
import './fixture.css';

export interface AppEvents {
  'notes:active': { id: string };
  'notes:inactive': { id: string };
  'notes:clear': Record<string, never>;
}

const messages: Partial<Record<MessageKey, MessageDescriptor>> = {
  closeTab: { id: 'app.closeTab', defaultMessage: 'Close this tab' },
};

// Panels are registered with the workspace (the 6.x global PanelRegistry singleton is gone).
export const workspace: Workspace<AppEvents> = createWorkspace<AppEvents>({
  panels: {
    notes: { component: NotesPanel, defaultOptions: { title: 'Notes' } },
    map: { component: MapPanel, defaultOptions: { title: 'Map' } },
  },
  messages: messages as Record<string, MessageDescriptor>,
});

export function StatusBar() {
  const openCount = useWorkspaceState((s: WorkspaceState) => Object.keys(s.panels).length);
  const ws = useWorkspace();
  const { registry } = ws;
  const { open: openModal, close, stack } = useModals();
  const { openLeft: openLeftPanel } = useSidePanels();
  const top: OverlayInstance | undefined = stack[stack.length - 1];
  const contribution = useActiveContribution();
  const labels = useMessages();
  const { modalClass } = useHostClasses();
  const showMenu = useContextMenu();
  return (
    <div data-testid="status" className={modalClass}>
      <span data-testid="count">{openCount}</span>
      <span>{labels.closeTab.defaultMessage ?? defaultMessages.closeTab.defaultMessage}</span>
      <span>{registry.get('notes') ? 'notes registered' : ''}</span>
      <span>{contribution?.toolbarItems?.length ?? 0}</span>
      <button data-testid="open-notes" onClick={() => ws.openPanel('notes-1', 'notes')}>Notes</button>
      <button onClick={() => openModal(RddConfirm, { message: 'Sure?', onConfirm: () => {}, onCancel: () => {} }, { title: 'Confirm' })}>Ask</button>
      <button onClick={() => { void openLeftPanel(MapPanel, {}, { title: 'Map drawer' }); }}>Drawer</button>
      <button onClick={() => top && close(top.id)}>Close top</button>
      <button onContextMenu={e => { e.preventDefault(); showMenu({ event: e, items: [{ label: 'Hello', action: () => toast('hi') }] }); }}>Menu</button>
    </div>
  );
}

const sidebarTabs: RddSidebarProps['tabs'] = [
  sectionToTab({ id: 'layers', label: 'Layers', icon: <span>L</span>, content: <div>layers</div> }),
];

export function App() {
  const menuRef = useRef<ContextMenuHandle>(null);
  return (
    <div className="app-root">
      <Toolbar>app toolbar from another kit</Toolbar>
      <DockableDesktopProvider workspace={workspace} messages={messages as Record<string, MessageDescriptor>}>
        <DockSidebar tabs={sidebarTabs}>
          <RddSecondarySidebar tabs={[]}>
            <RddDesktop />
          </RddSecondarySidebar>
        </DockSidebar>
        <StatusBar />
        <RddSidePanels />
        <RddSidePanels side="left" defaultWidth={320} />
        <RddModals />
      </DockableDesktopProvider>
      <RddToasts />
      <RddContextMenu ref={menuRef} />
    </div>
  );
}
