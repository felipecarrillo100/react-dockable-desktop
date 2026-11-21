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
 *   pt=VARIANT      …and a top panel toolbar of that variant (frosted | solid | transparent)
 *   wo=1            panel p3 (needs ov=1) also opens a managed widget `wo` (useFloatingWidgets):
 *                   a counter, a text field, a WebGL canvas and a box with height: 100% (#wo-fill);
 *                   canDock and canFloat, and a titleMenu ("Dock below" / "Back into the panel");
 *                   its manager is exposed as `window.__wo`
 *   cs=dark|light|none   colour scheme the app sets on <html> (none = app sets nothing)
 *   zb=N            zIndexBase passed to the provider
 *   grow=1          no rdd-fill-viewport on the wrapper (the workspace grows with its content)
 *   canvas=1        also opens `cv`, a panel whose canvas sits in a [data-rdd-preview-unscale] box
 *   anim=0          animations={false} on RddDesktop
 *   skin=NAME       skin passed to RddDesktop (switchable at run time with `window.__setSkin(name)`)
 *   ba=HEX, bon=HEX --rdd-brand-accent / --rdd-brand-on-accent set on :root (hex without the #)
 *   tbx=1           toolbar also has a radio pair (group "rg": r1, r2) and a toggle that starts active
 *   emb=1           also opens `fk` (an iframe panel with preserveEmbeds) and `fb` (the same without),
 *                   and the `wo` widget (needs ov=1&wo=1) gets preserveEmbeds and an iframe;
 *                   each iframe counts its loads in `window.__loads[name]`
 *   two=1           a second, independent workspace below the first (panels b1, b2), exposed as `window.__wm2`
 *   po=1            the workspace has popOut, and opens `pp` (type `popper`, canPopOut) as a tab in p1's
 *                   group: a counter (#po-inc, #po-count), a scroller (#po-sc) and a WebGL canvas (`window.__poGl`, lost
 *                   contexts counted in `__poLost`); the header's #po-btn calls popOutPanel('pp') and
 *                   keeps the result in `window.__poResult`
 *   pourl=1         (with po=1) popoutUrl is the harness's own popout.html
 *   emo=1           (with po=1) the documented Emotion recipe: a popoutWrapper with a CacheProvider whose
 *                   cache follows the panel's document (speedy: rules inserted with insertRule, as in
 *                   production); `pp` shows an Emotion-styled #po-emo; `window.__poMounts` counts its mounts;
 *                   `popper`'s icon, #po-menu's item icon, #po-toast's toast icon and the `wo` widget's icon and
 *                   titleMenu item icons are Emotion-styled boxes ([data-emo-icon], 16 x 16, rgb(200, 30, 40))
 *   (po=1: #po-menu in `pp` opens a context menu from there; #po-toast raises a toast "from pp")
 *   (po=1 with ov=1&wo=1: the `wo` widget has canPopOut, and the header's #wo-po-btn pops it out)
 *   po2=1           (with po=1) a second `popper` panel `pq`, a tab in p1's group; #po-btn-q pops it out;
 *                   inside `pp`, #po-pop-q pops `pq` out (a click in pp's window, once pp is out: 7.12.1),
 *                   the result in `window.__poqResult`
 *   opo=1           (with po=1&ov=1) the `overlay` type (p3) has canPopOut, and the header's #ov-po-btn pops p3
 *                   out; with wo=1, #wo-po-in inside p3 pops the `wo` widget out (a click in p3's window, once
 *                   p3 is out: 7.12.1), the result in `window.__woPopResult`
 *
 * Exposes `window.__wm = { state, actions }` and sets `window.__ready = true` once the
 * initial layout (p1, p2 in one group; p3 docked to the right edge; p4 floating) is in place.
 *
 * Also registers `nopreview` (defaultOptions.disableLivePreview, so its taskbar preview is the
 * placeholder thumbnail), and `titled`, a panel whose effect lists the usePanel() handle and writes its own
 * title and dirty flag (the naive port of a 6.x `[container]` effect, which looped in 7.0.0).
 *
 * Uses only the public 7.0 API, as an app would.
 */
/* eslint-disable react-refresh/only-export-components -- a test harness entry point; never hot-reloaded */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider, ClassNames } from '@emotion/react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, RddSidebar, RddToolbar,
  useWorkspaceState, useWorkspace, usePanel, useContextMenu,
  RddPanelOverlay, RddFloatingWidget, RddSidePanels, RddModals, RddToasts, useModals, useSidePanels, RddConfirm, toast,
  type ToolbarItem, type SidebarTab, type FloatAnchor,
  RddPanelToolbar, RddToolbarItem, useFloatingWidgets, useWidget, type WidgetMenuContext, type WidgetPlacement,
  type PopoutWrapperProps,
} from '../../../src/index';

const q = new URLSearchParams(location.search);
const DIR = q.get('dir') || '';
const CARD = q.get('card') === '1';
const TBHIDDEN = q.get('tb') === 'hidden';
const SBPOS = (q.get('sb') || 'left') as 'left' | 'right';
const TBPOS = (q.get('tbpos') || 'left') as 'left' | 'right';
const NTABS = parseInt(q.get('ntabs') || '0', 10);
const SCHEME = q.get('cs') || 'dark';
// `plain=1`: probe panels without their scroll-test gradient, so the panel's own surface shows (the 7.3.0 contact sheet).
const PLAIN = q.get('plain') === '1';

if (DIR === 'html') document.documentElement.dir = 'rtl';
if (DIR === 'body') document.body.dir = 'rtl';
if (q.get('font') === '1') document.body.style.fontFamily = "'Courier New'";
if (q.get('ba')) document.documentElement.style.setProperty('--rdd-brand-accent', '#' + q.get('ba'));
if (q.get('bon')) document.documentElement.style.setProperty('--rdd-brand-on-accent', '#' + q.get('bon'));
if (q.get('bs')) document.documentElement.style.setProperty('--rdd-brand-surface', '#' + q.get('bs'));
if (q.get('bt')) document.documentElement.style.setProperty('--rdd-brand-text', '#' + q.get('bt'));
if (q.get('rs')) document.documentElement.style.setProperty('--rdd-radius-scale', q.get('rs'));
const applyScheme = () => { if (SCHEME !== 'none') document.documentElement.setAttribute('data-color-scheme', SCHEME); };
applyScheme();

function ProbePanel() {
  const { id } = usePanel();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <input id={`in-${id}`} defaultValue="hello world text" style={{ margin: 4 }} />
      <div id={`sc-${id}`} className="probe-scroller" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div id={`content-${id}`} style={{ height: 3000, background: PLAIN ? undefined : 'linear-gradient(#333,#777)' }}>content {id}</div>
      </div>
    </div>
  );
}

/** A managed widget's content: state to keep (a counter, a text field) and a box that fills it. */
function ManagedContent() {
  const [count, setCount] = useState(0);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const widget = useWidget();
  const fillRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    // What a map would do: read its size before a move and after it (window.__woMoves).
    if (!widget) return;
    const w = window as unknown as { __woMoves: string[] };
    w.__woMoves ??= [];   // once: the effect re-subscribes whenever the handle changes
    const size = () => `${fillRef.current?.offsetWidth}x${fillRef.current?.offsetHeight}`;
    const off1 = widget.onWillMove(() => w.__woMoves.push(`will ${size()}`));
    const off2 = widget.onMoved(() => w.__woMoves.push(`moved ${size()}`));
    return () => { off1(); off2(); };
  }, [widget?.onWillMove, widget?.onMoved]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A WebGL context, as a map would hold: a move must not lose it.
    const canvas = canvasRef.current!;
    const w = window as unknown as { __woLost: number; __woGl: WebGLRenderingContext | null };
    w.__woLost = 0;
    canvas.addEventListener('webglcontextlost', () => { w.__woLost += 1; });
    w.__woGl = canvas.getContext('webgl');
  }, []);
  return (
    <div id="wo-fill" ref={fillRef} data-location={widget?.location} style={{ height: '100%', boxSizing: 'border-box', border: '1px solid #888' }}>
      <button id="wo-inc" onClick={() => setCount(c => c + 1)}>+</button>
      <span id="wo-count">{count}</span>
      <input id="wo-input" defaultValue="" />
      <canvas id="wo-canvas" ref={canvasRef} width={40} height={20} />
      {q.get('emb') === '1' && <CountingFrame name="wo" />}
    </div>
  );
}

/** Opens the `wo` managed widget once; needs to sit inside the overlay to reach its manager. */
function ManagedOpener() {
  const widgets = useFloatingWidgets();
  const config = {
    title: 'Managed', content: <ManagedContent />, anchor: 'bottom-right' as const, width: 200, height: 180,
    canDock: true, canFloat: true, preserveEmbeds: q.get('emb') === '1',
    // po=1: it can open in its own window too (7.12.0); #wo-po-btn pops it out.
    canPopOut: q.get('po') === '1',
    ...(EMO ? { icon: <EmoIcon name="wo" /> } : {}),
    titleMenu: (w: WidgetMenuContext) => w.location === 'panel'
      ? [{ label: 'Dock below', icon: EMO ? <EmoIcon name="wo-menu" /> : undefined, action: () => w.move({ to: 'docked', position: 'bottom' }) }]
      : [{ label: 'Back into the panel', icon: EMO ? <EmoIcon name="wo-menu" /> : undefined, action: () => w.move({ to: 'panel' }) }],
  };
  // eslint-disable-next-line react-hooks/immutability
  (window as unknown as { __wo: unknown }).__wo = widgets;
  // Re-opens `wo` with the same config at a saved placement, as an app would after a reload.
  // eslint-disable-next-line react-hooks/immutability
  (window as unknown as { __woOpen: unknown }).__woOpen = (placement?: WidgetPlacement) => widgets.open('wo', { ...config, placement });
  useEffect(() => {
    widgets.open('wo', config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
/** opo=1&wo=1: a button inside the widget's own panel that pops the widget out (7.12.1). */
function WidgetPopButton() {
  const widgets = useFloatingWidgets();
  return (
    <button id="wo-po-in" style={{ position: 'absolute', top: 40, right: 4, zIndex: 5 }} onClick={() => {
      (window as unknown as { __woPopResult: unknown }).__woPopResult = widgets.popOut('wo');
    }}>pop widget</button>
  );
}
function OverlayPanel() {
  const [open, setOpen] = useState(true);
  return (
    <RddPanelOverlay>
      {q.get('wo') === '1' && <ManagedOpener />}
      {q.get('wo') === '1' && q.get('opo') === '1' && <WidgetPopButton />}
      <div style={{ width: '100%', height: '100%', background: '#224' }} id="ovbg" />
      {q.get('pt') && (
        <RddPanelToolbar position="top" variant={q.get('pt') as 'frosted'}>
          <RddToolbarItem><span id="ptitem">tool</span></RddToolbarItem>
        </RddPanelToolbar>
      )}
      <RddFloatingWidget id="w1" title="Widget" open={open} onClose={() => setOpen(false)}
        defaultAnchor={(q.get('anchor') || 'top-left') as FloatAnchor} defaultWidth={220} defaultHeight={160}>
        <div id="widgetbody" style={{ padding: 6 }}>widget body</div>
      </RddFloatingWidget>
    </RddPanelOverlay>
  );
}

function TitledPanel() {
  const panel = usePanel();
  const [doc, setDoc] = useState({ title: 'Untitled', dirty: false });
  useEffect(() => {
    panel.setTitle(doc.title);
    panel.setDirty(doc.dirty);
  }, [panel, doc.title, doc.dirty]);
  return <button id={`rename-${panel.id}`} onClick={() => setDoc({ title: 'Renamed doc', dirty: true })}>Rename</button>;
}

/** An iframe that counts its loads (a reload is a new load) in the host page's `__loads`. */
function CountingFrame({ name }: { name: string }) {
  const doc = `<script>const w = parent; w.__loads = w.__loads || {}; w.__loads['${name}'] = (w.__loads['${name}'] || 0) + 1;</script>${name}`;
  return <iframe title={name} srcDoc={doc} style={{ width: '100%', height: 60, border: 0 }} />;
}
const KeepFrame = () => <CountingFrame name="fk" />;
const BareFrame = () => <CountingFrame name="fb" />;

/** po=1: a panel that can pop out, with state, a scroll offset and a WebGL context to keep. */
/** emo=1: one Emotion cache per document, inserting into that document's <head>, with insertRule. */
const emotionCaches = new WeakMap<Document, EmotionCache>();
const cacheFor = (doc: Document): EmotionCache => {
  let cache = emotionCaches.get(doc);
  if (!cache) {
    cache = createCache({ key: 'hx', container: doc.head, speedy: true });
    emotionCaches.set(doc, cache);
  }
  return cache;
};
const EmotionWrapper = ({ document: doc, children }: PopoutWrapperProps) => (
  <CacheProvider value={cacheFor(doc)}>{children}</CacheProvider>
);
const EMO = q.get('emo') === '1';
/** emo=1: an icon whose size and colour come only from Emotion (as an MUI SvgIcon's do). */
const EmoIcon = ({ name }: { name: string }) => (
  <ClassNames>{({ css }) => (
    // A rule of its own per name (the custom property), so one icon's rule can't style another's.
    <span data-emo-icon={name} className={css({ display: 'inline-block', width: 16, height: 16, backgroundColor: 'rgb(200, 30, 40)', '--emo-icon': name })} />
  )}</ClassNames>
);

function PopPanel() {
  const { id } = usePanel();
  const actions = useWorkspace();
  const [count, setCount] = useState(0);
  const showMenu = useContextMenu();
  useEffect(() => {
    const w = window as unknown as { __poMounts?: number };
    w.__poMounts = (w.__poMounts ?? 0) + 1;
  }, []);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const w = window as unknown as { __poLost: number; __poGl: WebGLRenderingContext | null };
    w.__poLost = 0;
    canvas.addEventListener('webglcontextlost', () => { w.__poLost += 1; });
    w.__poGl = canvas.getContext('webgl');
  }, []);
  return (
    // Fills its slot (height: 100%), with a scroller taking the rest, as a map or a table would.
    <div id="po-fill" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div>
        <button id="po-inc" onClick={() => setCount(c => c + 1)}>+</button>
        <span id="po-count">{count}</span>
        <canvas id="po-canvas" ref={canvasRef} width={40} height={20} />
        {/* The menu closes on its window's click: without stopPropagation, the click that opens it closes it. */}
        <button id="po-menu" onClick={(e) => { e.stopPropagation(); showMenu({ event: e, items: [
          { label: 'Emo item', icon: EMO ? <EmoIcon name="menu" /> : undefined, action: () => {} },
        ] }); }}>menu</button>
        {id === 'pp' && q.get('po2') === '1' && <button id="po-pop-q" onClick={() => {
          (window as unknown as { __poqResult: unknown }).__poqResult = actions.popOutPanel('pq');
        }}>pop q</button>}
        <button id="po-toast" onClick={() => { toast('from pp', { icon: EMO ? <EmoIcon name="toast" /> : undefined }); }}>toast</button>
        {q.get('emo') === '1' && (
          <ClassNames>{({ css }) => (
            <span id="po-emo" className={css({ color: 'rgb(10, 20, 30)', letterSpacing: '3px', borderBottom: '2px solid rgb(40, 50, 60)' })}>emotion</span>
          )}</ClassNames>
        )}
      </div>
      <div id="po-sc" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}><div style={{ height: 3000 }}>scroll</div></div>
    </div>
  );
}

function CanvasPanel() {
  return (
    <div data-rdd-preview-unscale="" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas id="cv-canvas" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

const POPOUT = q.get('po') === '1';
const workspace = createWorkspace({
  popOut: POPOUT,
  panels: {
    // Only with po=1: a canPopOut type on a workspace without popOut warns in development.
    ...(POPOUT ? { popper: { component: PopPanel, defaultOptions: { canPopOut: true, ...(EMO ? { icon: <EmoIcon name="frame" /> } : {}) } } } : {}),
    probe: { component: ProbePanel },
    overlay: { component: OverlayPanel, ...(POPOUT && q.get('opo') === '1' ? { defaultOptions: { canPopOut: true } } : {}) },
    canvas: { component: CanvasPanel },
    titled: { component: TitledPanel },
    nopreview: { component: ProbePanel, defaultOptions: { disableLivePreview: true } },
    keepFrame: { component: KeepFrame, defaultOptions: { preserveEmbeds: true } },
    bareFrame: { component: BareFrame },
  },
});

const Icon = ({ t }: { t: string }) => <span style={{ fontSize: 12 }}>{t}</span>;
const Plain = () => <div style={{ padding: 8 }}>overlay content</div>;

function Inner() {
  // The skin, switchable from a spec (`window.__setSkin`), as an app's theme picker would.
  const [skin, setSkin] = useState<string | undefined>(q.get('skin') ?? undefined);
  // eslint-disable-next-line react-hooks/immutability
  (window as unknown as { __setSkin: unknown }).__setSkin = setSkin;
  const state = useWorkspaceState();
  const actions = useWorkspace();
  const { open: openModal } = useModals();
  const { openLeft: openLeftPanel } = useSidePanels();
  const overlays = { openModal, openLeftPanel };
  const showCtx = useContextMenu();
  // Exposed to the specs, which drive the workspace from outside the page.
  // eslint-disable-next-line react-hooks/immutability
  (window as unknown as { __wm: unknown }).__wm = { state, actions, overlays, Plain, RddConfirm, toast };
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
        if (POPOUT) actions.openPanel('pp', 'popper', { title: 'Pop', dockTo: { panel: 'p1', position: 'center' } });
        if (POPOUT && q.get('po2') === '1') actions.openPanel('pq', 'popper', { title: 'Pop Q', dockTo: { panel: 'p1', position: 'center' } });
        if (q.get('emb') === '1') {
          actions.openPanel('fk', 'keepFrame', { title: 'Keep', dockTo: { panel: 'p1', position: 'bottom' } });
          actions.openPanel('fb', 'bareFrame', { title: 'Bare', dockTo: { panel: 'fk', position: 'right' } });
        }
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
    ...(q.get('tbx') === '1' ? [
      { type: 'separator' },
      { type: 'radio', id: 'r1', group: 'rg', label: 'Radio 1', icon: <Icon t="r" /> },
      { type: 'radio', id: 'r2', group: 'rg', label: 'Radio 2', icon: <Icon t="s" /> },
      { type: 'toggle', id: 'tg', label: 'Toggle', icon: <Icon t="t" />, active: true, onToggle: () => {} },
    ] as ToolbarItem[] : []),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div id="hdr" style={{ height: 30, flex: '0 0 30px', display: 'flex', gap: 8 }}>
        <button id="before">before</button>
        {POPOUT && <button id="po-btn" onClick={() => {
          (window as unknown as { __poResult: unknown }).__poResult = actions.popOutPanel('pp');
        }}>pop out</button>}
        {POPOUT && q.get('opo') === '1' && <button id="ov-po-btn" onClick={() => { actions.popOutPanel('p3'); }}>pop out p3</button>}
        {POPOUT && <button id="po-btn-q" onClick={() => { actions.popOutPanel('pq'); }}>pop out q</button>}
        {POPOUT && <button id="wo-po-btn" onClick={() => {
          const w = window as unknown as { __wo?: { popOut(id: string): unknown }; __woPopResult: unknown };
          w.__woPopResult = w.__wo?.popOut('wo');
        }}>pop out widget</button>}
        <span id="ctx" style={{ padding: '0 8px', background: '#ccc' }}
          onContextMenu={(e) => { e.preventDefault(); showCtx({ event: e, items: [
            { label: 'Item one', action: () => {} },
            { label: 'Sub menu', items: [{ label: 'Child 1', action: () => {} }, { label: 'Child 2', action: () => {} }] },
          ] }); }}>ctx-target</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        {TBPOS === 'left' && <RddToolbar position="left" items={items} visible={!TBHIDDEN} />}
        <RddSidebar position={SBPOS} tabs={tabs} defaultWidth={250}>
          <RddDesktop animations={q.get('anim') !== '0'} skin={skin} />
        </RddSidebar>
        {TBPOS === 'right' && <RddToolbar position="right" items={items} visible={!TBHIDDEN} />}
      </div>
      <RddSidePanels />
      <RddModals />
      <RddToasts />
      <button id="after">after</button>
    </div>
  );
}

// two=1: a second workspace on the same page, with its own provider — the 7.7.1 isolation spec.
const workspace2 = createWorkspace({ panels: { probe: { component: ProbePanel } } });

function SecondDesktop() {
  const actions = useWorkspace();
  useEffect(() => {
    (window as unknown as { __wm2: unknown }).__wm2 = { actions };
    actions.openPanel('b1', 'probe', { title: 'Bee One' });
    actions.openPanel('b2', 'probe', { title: 'Bee Two' });
    actions.focusPanel('b1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <RddDesktop />;
}

function App() {
  const app = (
    <DockableDesktopProvider workspace={workspace} dir={DIR === 'prov' ? 'rtl' : undefined} zIndexBase={q.get('zb') ? Number(q.get('zb')) : undefined}
      popoutUrl={q.get('pourl') === '1' ? '/popout.html' : undefined}
      popoutWrapper={q.get('emo') === '1' ? EmotionWrapper : undefined}>
      <Inner />
    </DockableDesktopProvider>
  );
  // emo=1: the page's own cache is speedy as well, as Emotion's default one is in production; so
  // what isn't inside the popoutWrapper in a pop-out gets no rules there.
  const styled = EMO ? <CacheProvider value={cacheFor(document)}>{app}</CacheProvider> : app;
  const wrapped = DIR === 'wrap' ? <div dir="rtl" style={{ height: '100%' }}>{styled}</div> : styled;
  if (CARD) {
    return (
      <div id="longpage" style={{ height: 3000, padding: 20, boxSizing: 'border-box' }}>
        <h1>Long host page</h1>
        <div id="card" style={{ height: 400, border: '2px solid red' }}>{wrapped}</div>
      </div>
    );
  }
  // grow=1: a full-window app that forgot rdd-fill-viewport (a wrapper with no height of its own).
  if (q.get('grow') === '1') return <div style={{ height: '100%' }}>{wrapped}</div>;
  if (q.get('two') === '1') {
    return (
      <div className="rdd-fill-viewport" style={{ display: 'flex', flexDirection: 'column' }}>
        <div id="first" style={{ flex: '1 1 50%', minHeight: 0 }}>{wrapped}</div>
        <div id="second" style={{ flex: '1 1 50%', minHeight: 0 }}>
          <DockableDesktopProvider workspace={workspace2}><SecondDesktop /></DockableDesktopProvider>
        </div>
      </div>
    );
  }
  return <div className="rdd-fill-viewport">{wrapped}</div>;
}
createRoot(document.getElementById('root')!).render(<App />);
