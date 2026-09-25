/**
 * Harness page for the real-browser suite (tests/browser/*.browser.ts).
 *
 * One workspace, configured from the URL so each spec can ask for the layout it needs:
 *   dir=html|body|wrap|ws|prov   where RTL is set (none = LTR)
 *   card=1          workspace inside a 400px card on a long scrolling page
 *   font=1          host page body font set to Courier New
 *   tb=hidden       toolbar starts hidden
 *   tbpos=left|right, sb=left|right   toolbar / sidebar position
 *   ntabs=N         N extra tabs in the first group
 *   ov=1            panel p3 hosts a PanelOverlayRoot with an inner floating widget
 *   cs=dark|light|none   colour scheme the app sets on <html> (none = app sets nothing)
 *   zb=N            zIndexBase passed to the provider
 *   canvas=1        also opens `cv`, a panel whose canvas sits in a [data-rdd-preview-unscale] box
 *
 * Exposes `window.__wm = { state, actions }` and sets `window.__ready = true` once the
 * initial layout (p1, p2 in one group; p3 docked to the right edge; p4 floating) is in place.
 */
/* eslint-disable react-refresh/only-export-components -- a test harness entry point; never hot-reloaded */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import {
  DockableDesktopProvider, WindowManager, Sidebar, Toolbar, PanelRegistry,
  useWindowManagerState, useWindowManagerActions, usePanelId, useShowContextMenu,
  PanelOverlayRoot, PanelFloatingWindow, SidePanelRenderer, ModalStackRenderer, usePanelActions,
  type ToolbarItem, type SidebarTab, type FloatAnchor,
} from '../../../src/index';

const q = new URLSearchParams(location.search);
const DIR = q.get('dir') || '';
const CARD = q.get('card') === '1';
const TBHIDDEN = q.get('tb') === 'hidden';
const SBPOS = (q.get('sb') || 'left') as 'left' | 'right';
const TBPOS = (q.get('tbpos') || 'left') as 'left' | 'right';
const NTABS = parseInt(q.get('ntabs') || '0', 10);
const SCHEME = q.get('cs') || 'dark';

if (DIR === 'html') document.documentElement.dir = 'rtl';
if (DIR === 'body') document.body.dir = 'rtl';
if (q.get('font') === '1') document.body.style.fontFamily = "'Courier New'";
const applyScheme = () => { if (SCHEME !== 'none') document.documentElement.setAttribute('data-color-scheme', SCHEME); };
applyScheme();

function ProbePanel() {
  const id = usePanelId();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <input id={`in-${id}`} defaultValue="hello world text" style={{ margin: 4 }} />
      <div id={`sc-${id}`} className="probe-scroller" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div id={`content-${id}`} style={{ height: 3000, background: 'linear-gradient(#333,#777)' }}>content {id}</div>
      </div>
    </div>
  );
}
PanelRegistry.register('probe', ProbePanel, {});

function OverlayPanel() {
  const [open, setOpen] = useState(true);
  return (
    <PanelOverlayRoot>
      <div style={{ width: '100%', height: '100%', background: '#224' }} id="ovbg" />
      <PanelFloatingWindow id="w1" title="Widget" open={open} onClose={() => setOpen(false)}
        defaultAnchor={(q.get('anchor') || 'top-left') as FloatAnchor} defaultWidth={220} defaultHeight={160}>
        <div id="widgetbody" style={{ padding: 6 }}>widget body</div>
      </PanelFloatingWindow>
    </PanelOverlayRoot>
  );
}
PanelRegistry.register('overlay', OverlayPanel, {});

function CanvasPanel() {
  return (
    <div data-rdd-preview-unscale="" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas id="cv-canvas" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
PanelRegistry.register('canvas', CanvasPanel, {});

const Icon = ({ t }: { t: string }) => <span style={{ fontSize: 12 }}>{t}</span>;
const Plain = () => <div style={{ padding: 8 }}>overlay content</div>;

function Inner() {
  const state = useWindowManagerState();
  const actions = useWindowManagerActions();
  const overlays = usePanelActions();
  const showCtx = useShowContextMenu();
  // Exposed to the specs, which drive the workspace from outside the page.
  // eslint-disable-next-line react-hooks/immutability
  (window as unknown as { __wm: unknown }).__wm = { state, actions, overlays, Plain };
  useEffect(() => {
    applyScheme(); // after WindowManager's own mirroring effect, as demo/App.tsx does
    if (DIR === 'ws') actions.setDirection('rtl');
    actions.openPanel('p1', 'probe', { title: 'Panel One' });
    actions.openPanel('p2', 'probe', { title: 'Panel Two' });
    for (let i = 0; i < NTABS; i++) actions.openPanel('t' + i, 'probe', { title: 'Extra tab number ' + i });
    setTimeout(() => {
      actions.openPanel('p3', q.get('ov') ? 'overlay' : 'probe', { title: 'Panel Three' });
      setTimeout(() => {
        actions.dockPanelToWorkspaceEdge('p3', 'right');
        actions.openPanel('p4', 'probe', { title: 'Float Four', initialTarget: 'floating' });
        if (q.get('canvas')) actions.openPanel('cv', 'canvas', { title: 'Canvas' });
        (window as unknown as { __ready: boolean }).__ready = true;
      }, 50);
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tabs: SidebarTab[] = [
    { id: 'st1', label: 'Tab A', icon: <Icon t="A" />, renderContent: () => <div id="sbcontent" style={{ padding: 8 }}>Sidebar content A</div> },
    { id: 'st2', label: 'Tab B', icon: <Icon t="B" />, renderContent: () => <div style={{ padding: 8 }}>Sidebar content B</div> },
  ];
  const items: ToolbarItem[] = [
    { type: 'action', id: 'a1', label: 'Action 1', icon: <Icon t="1" />, onClick: () => {} },
    { type: 'group', id: 'g1', label: 'Group', defaultIcon: <Icon t="G" />, items: [
      { id: 'g1a', label: 'Sub A', icon: <Icon t="a" /> }, { id: 'g1b', label: 'Sub B', icon: <Icon t="b" /> },
    ] },
    { type: 'action', id: 'a2', label: 'Action 2', icon: <Icon t="2" />, onClick: () => {} },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div id="hdr" style={{ height: 30, flex: '0 0 30px', display: 'flex', gap: 8 }}>
        <button id="before">before</button>
        <span id="ctx" style={{ padding: '0 8px', background: '#ccc' }}
          onContextMenu={(e) => { e.preventDefault(); showCtx({ event: e, items: [
            { label: 'Item one', action: () => {} },
            { label: 'Sub menu', items: [{ label: 'Child 1', action: () => {} }, { label: 'Child 2', action: () => {} }] },
          ] }); }}>ctx-target</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        {TBPOS === 'left' && <Toolbar position="left" items={items} visible={!TBHIDDEN} />}
        <Sidebar position={SBPOS} tabs={tabs} defaultWidth={250}>
          <WindowManager />
        </Sidebar>
        {TBPOS === 'right' && <Toolbar position="right" items={items} visible={!TBHIDDEN} />}
      </div>
      <SidePanelRenderer />
      <ModalStackRenderer />
      <button id="after">after</button>
    </div>
  );
}

function App() {
  const app = (
    <DockableDesktopProvider dir={DIR === 'prov' ? 'rtl' : undefined} zIndexBase={q.get('zb') ? Number(q.get('zb')) : undefined}>
      <Inner />
    </DockableDesktopProvider>
  );
  const wrapped = DIR === 'wrap' ? <div dir="rtl" style={{ height: '100%' }}>{app}</div> : app;
  if (CARD) {
    return (
      <div id="longpage" style={{ height: 3000, padding: 20, boxSizing: 'border-box' }}>
        <h1>Long host page</h1>
        <div id="card" style={{ height: 400, border: '2px solid red' }}>{wrapped}</div>
      </div>
    );
  }
  return <div style={{ height: '100vh' }}>{wrapped}</div>;
}
createRoot(document.getElementById('root')!).render(<App />);
