# Advanced Topics

## Pre-loading a layout with a specific initial tree

Use the `initialState` option of `createWorkspace()` to define a precise default layout rather than relying on drag-and-drop configuration by the user. The value is the same JSON produced by `saveLayout()`.

```ts
const DEFAULT_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'horizontal',
    sizes: [0.7, 0.3],
    children: [
      {
        type: 'leaf',
        id: 'main-area',
        panels: ['map-1'],
        activePanelId: 'map-1',
      },
      {
        type: 'branch',
        orientation: 'vertical',
        sizes: [0.5, 0.5],
        children: [
          { type: 'leaf', id: 'top-right',    panels: ['props-1'],   activePanelId: 'props-1' },
          { type: 'leaf', id: 'bottom-right', panels: ['console-1'], activePanelId: 'console-1' },
        ],
      },
    ],
  },
  floating: [],
  minimized: [],
  panels: {
    'map-1':     { id: 'map-1',     title: 'Map',        component: 'map',     state: 'docked' },
    'props-1':   { id: 'props-1',   title: 'Properties', component: 'props',   state: 'docked' },
    'console-1': { id: 'console-1', title: 'Console',    component: 'console', state: 'docked' },
  },
});

const workspace = createWorkspace({
  panels: {
    map:     { component: MapPanel },
    props:   { component: PropertiesPanel },
    console: { component: ConsolePanel },
  },
  initialState: localStorage.getItem('workspace-layout') ?? DEFAULT_LAYOUT,
});
```

The `initialState` is read **once, when the workspace is created** — it is not reactive.

## Zero-unmount DOM preservation

Heavy widgets (WebGL contexts, Leaflet maps, CodeMirror instances) keep their DOM nodes — and everything alive inside them — across all three ways a panel's visibility can change: **docking** it into a different tab group, **floating** it into a detached window, and **switching tabs** to cover it. The library moves the DOM subtree into a hidden container (`#preserved-dom-container`) rather than unmounting it, in every case.

This is automatic and unconditional — by default, across all three transitions simultaneously, with no configuration and no integration work. The implication is that your panel components should be written to tolerate visibility changes without relying on mount/unmount cycles.

Browser state moves with the DOM too (since 6.4.0). A hidden subtree normally loses its scroll offsets and its focus; the library records both while the panel is on screen and puts them back when it reappears. So a list scrolled halfway down is still there after a tab switch, a float, a dock or a minimize/restore, and the field you were typing in gets focus back — only when its panel is the active one and focus hasn't gone somewhere else meanwhile, so a panel restored in the background never takes focus.

If you need to react to visibility, use the lifecycle hooks:

```ts
import { usePanelEvents } from 'react-dockable-desktop';

function MyPanel() {
  usePanelEvents({
    onRestore:  () => { /* panel became visible */ },
    onMinimize: () => { /* panel was hidden */ },
  });
}
```

## Custom header actions

Inject React nodes into a panel's tab header:

```ts
const workspace = createWorkspace({
  panels: {
    chart: {
      component: ChartPanel,
      defaultOptions: {
        renderHeaderActions: (panelId) => (
          <button onClick={() => exportChart(panelId)}>Export</button>
        ),
      },
    },
  },
});
```

## Building custom drag-resize interactions

`startPointerDrag()` is the same pointer-capture primitive the library's own grid resizer, sidebar drawer resizer, and floating-window resize handles are built on — exported so you can build a resizable divider or handle inside your own panel content without reimplementing pointer capture, delta tracking, and cleanup.

```tsx
import { startPointerDrag } from 'react-dockable-desktop';

function ResizableSplit() {
  const [ratio, setRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const startClientX = e.clientX;

    startPointerDrag({
      element: bar,
      pointerId: e.pointerId,
      startClientX,
      startClientY: e.clientY,
      captureStart: () => {},
      activeClasses: [{ el: bar, classes: ['active'] }],
      onMove: (dx) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setRatio(Math.min(0.85, Math.max(0.15, (startClientX + dx - rect.left) / rect.width)));
      },
    });
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ flexBasis: `${ratio * 100}%` }}>{/* left pane */}</div>
      <div onPointerDown={handlePointerDown} className="rdd-resizer-bar" />
      <div style={{ flexBasis: `${(1 - ratio) * 100}%` }}>{/* right pane */}</div>
    </div>
  );
}
```

`onMove` receives the delta from the drag's start position, not the live pointer coordinate — recover an absolute position with `startClientX + dx` as shown above. `activeClasses` toggles CSS classes for the duration of the drag; for anything beyond classes (e.g. `document.body.style.cursor`), set it before calling `startPointerDrag` and reset it in `onEnd`.

For a resize handle that grows/shrinks a box in up to 8 directions instead of a single-axis divider, pair it with `computeResizedRect(dir, dx, dy, start, constraints)` — the same pure function the floating-window resize handles use — which supports independent `minW`/`minH`/`maxW`/`maxH`/`minX`/`minY` constraints per call site.

## RTL support

See the dedicated [RTL Support →](./rtl) guide for the full wiring pattern, what flips automatically, macOS skin behaviour, and the `isElementRtl` utility.

In short: pass `dir="rtl"` to `DockableDesktopProvider` **and** set `document.documentElement.dir = 'rtl'` so portals (context menu, toolbar flyout, toasts) that render into `document.body` also pick up the RTL direction via CSS inheritance.

## Multiple providers on one page

Each workspace has its own `PanelRegistry`. Multiple providers can coexist on the same page without panel key conflicts:

```tsx
const wsA = createWorkspace({ panels: { map: { component: MapA } } });
const wsB = createWorkspace({ panels: { map: { component: MapB } } });

<div>
  <DockableDesktopProvider workspace={wsA}><RddDesktop /></DockableDesktopProvider>
  <DockableDesktopProvider workspace={wsB}><RddDesktop /></DockableDesktopProvider>
</div>
```

## Provider, state selectors, panel hooks

These are documented in the dedicated guides:

- [Panel Lifecycle & Forms →](./forms-and-panels) — `usePanel()`, `useBeforeClose()`, `useSaveState()`, `usePanelEvents()`
- [Event Bus & Communication →](./event-bus) — `onPanelOpen/Close/Minimize/Restore`, typed events, state subscriptions
- [Workspace →](./workspace-client) — `createWorkspace()`, `useWorkspace()`, `DockableDesktopProvider`, `useWorkspaceState` selectors, CSS class overrides

## Keyboard and screen readers

The chrome follows the WAI-ARIA Authoring Practices patterns (since 6.4.0):

| Where | Keys |
|---|---|
| Tab strip (`role="tablist"`) | Tab reaches the selected tab. ←/→ select and focus the neighbouring tab (by screen position, so mirrored under RTL); Home/End jump to the ends; Delete closes the focused tab; ContextMenu or Shift+F10 opens its menu. |
| Context menus | Focus moves to the first item on open. ↑/↓ move (skipping disabled items, wrapping); Home/End; → (← under RTL), Enter or Space opens a sub-menu; ← goes back; Tab or Esc closes and returns focus to where it was. |
| Taskbar | Minimized panels are buttons: Tab reaches them, Enter restores, ContextMenu / Shift+F10 opens their menu. |
| Toolbar, sidebar, taskbar | Buttons show a focus ring when reached from the keyboard (`:focus-visible`); restyle it with `--rdd-focus-ring`. |

## Server rendering (Next.js, Remix)

The chrome renders on the server: `renderToString` of `<DockableDesktopProvider>`, `<RddDesktop>`, `<RddSidebar>`, `<RddToolbar>` and the overlay hosts works without a DOM, and hydrates without a mismatch. `<RddToasts>` renders nothing until it is mounted on the client, and `useColorScheme()` reports `'dark'` on the server, switching to the page's real scheme once hydrated.

Panel content is a different matter: it is your code, and anything that touches `window` or `document` while rendering (a map engine, an editor) must only render on the client. In Next.js, mark the file that renders the workspace `'use client'`, and load DOM-bound panels with `dynamic(() => import('./MapPanel'), { ssr: false })`.

## i18n / custom messages

Pass a `formatMessage` function to translate all built-in strings. On `DockableDesktopProvider` it can change from render to render, so it follows the current locale; create the workspace once, outside the component:

```tsx
import { useIntl } from 'react-intl';

const workspace = createWorkspace({ panels: { ... } });

function App() {
  const intl = useIntl();

  return (
    <DockableDesktopProvider
      workspace={workspace}
      formatMessage={(msg) => intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage }, msg.values)}
    >
      ...
    </DockableDesktopProvider>
  );
}
```

A `formatMessage` passed to `createWorkspace()` instead takes precedence over the provider's. To change the built-in texts themselves, pass `messages` — a partial override of `defaultMessages` — to either one. Inside React, `useMessages()` returns the effective table and `useFormatMessage()` the formatter.
