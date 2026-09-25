// Panel components written against the react-dockable-desktop 6.x API.
import React, { useEffect, useState } from 'react';
import {
  usePanel, useBeforeClose, useSaveState, usePanelEvents,
  usePanelSize, useWorkspace as useRddWorkspace, usePanelContribution,
  RddPanelOverlay, RddPanelToolbar, RddToolbarButton, RddToolbarToggle, RddToolbarSearch,
  RddToolbarSeparator, RddToolbarItem, RddToolbarSpacer, RddToolbarCenter,
  RddFloatingWidget, useFloatingWidgets,
  type PanelHandle, type ManagedWidget,
} from 'react-dockable-desktop';

/** A local hook whose name collides with the 7.0 `useWorkspace`. */
export function useWorkspace(): string {
  return 'app-level workspace name';
}

export function NotesPanel() {
  const panel: PanelHandle = usePanel();
  const panelId = panel.id;
  const size = usePanelSize();
  const ws = useRddWorkspace();
  const [text, setText] = React.useState('');

  useBeforeClose(async () => text.length === 0);
  useSaveState(() => ({ text }));
  usePanelEvents({
    onActivate: () => ws.publish('notes:active', { id: panelId }),
    onDeactivate: () => ws.publish('notes:inactive', { id: panelId }),
  });
  useEffect(() => ws.subscribe('notes:clear', () => setText('')), [ws]);

  usePanelContribution({ toolbarItems: [{ type: 'action', id: 'save', label: 'Save', icon: <span>S</span>, onClick: () => panel.close({ force: true }) }] });

  return (
    <div data-testid="notes" data-panel={panelId} data-width={size?.width ?? 0}>
      <textarea value={text} onChange={e => { setText(e.target.value); panel.setDirty(e.target.value.length > 0); }} />
      <span>{useWorkspace()}</span>
    </div>
  );
}

/**
 * Keeps its tab title and dirty flag in step with a document. The 6.x original listed the
 * container, which was stable, in the effect's dependencies:
 *   const container = useFormContainer();
 *   useEffect(() => { container.setTitle(doc.title); container.setDirty(doc.dirty); },
 *     [container, doc.title, doc.dirty]);
 * This is the naive, mechanical port of it. 7.0.0 looped on it (a consumer report); from 7.0.1 it
 * settles, and App.test.tsx keeps it that way.
 */
export function DocumentPanel() {
  const panel = usePanel();
  const [doc, setDoc] = useState({ title: 'Untitled', dirty: false });
  useEffect(() => {
    panel.setTitle(doc.title);
    panel.setDirty(doc.dirty);
  }, [panel, doc.title, doc.dirty]);
  return (
    <div data-testid="document">
      <button data-testid="rename" onClick={() => setDoc({ title: 'Report.docx', dirty: true })}>Rename</button>
    </div>
  );
}

export function MapPanel() {
  const [legendOpen, setLegendOpen] = useState(false);
  const widgets = useFloatingWidgets();
  const layers: ManagedWidget = { title: 'Layers', content: <div>layers</div> };
  return (
    <RddPanelOverlay>
      <RddPanelToolbar position="top">
        <RddToolbarButton icon={<span>+</span>} title="Zoom in" onClick={() => {}} />
        <RddToolbarToggle icon={<span>G</span>} title="Grid" active={false} onToggle={() => {}} />
        <RddToolbarSeparator />
        <RddToolbarSearch onSearch={async () => []} onSelect={() => {}} />
        <RddToolbarSpacer />
        <RddToolbarCenter><span>Map</span></RddToolbarCenter>
        <RddToolbarItem><button onClick={() => setLegendOpen(true)}>Legend</button></RddToolbarItem>
        <RddToolbarItem><button onClick={() => widgets.open('layers', layers)}>Layers</button></RddToolbarItem>
      </RddPanelToolbar>
      <RddFloatingWidget id="legend" title="Legend" open={legendOpen} onClose={() => setLegendOpen(false)}
        defaultAnchor="top-right" defaultWidth={200} defaultHeight={120}>
        <div>legend</div>
      </RddFloatingWidget>
    </RddPanelOverlay>
  );
}
