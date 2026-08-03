# Advanced Topics

## Pre-loading a layout with a specific initial tree

Use `WorkspaceClient.initialState` to define a precise default layout rather than relying on drag-and-drop configuration by the user. The value is the same JSON produced by `saveLayout()`.

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

const client = new WorkspaceClient({
  panels: {
    map:     { component: MapPanel },
    props:   { component: PropertiesPanel },
    console: { component: ConsolePanel },
  },
  initialState: localStorage.getItem('workspace-layout') ?? DEFAULT_LAYOUT,
});
```

The `initialState` is read **once at construction time** — it is not reactive.

## Zero-unmount DOM preservation

Heavy widgets (WebGL contexts, Leaflet maps, CodeMirror instances) keep their DOM nodes — and everything alive inside them — across all three ways a panel's visibility can change: **docking** it into a different tab group, **floating** it into a detached window, and **switching tabs** to cover it. The library moves the DOM subtree into a hidden container (`#preserved-dom-container`) rather than unmounting it, in every case.

This is automatic and unconditional — by default, across all three transitions simultaneously, with no configuration and no integration work. The implication is that your panel components should be written to tolerate visibility changes without relying on mount/unmount cycles.

If you need to react to visibility, use the lifecycle hooks:

```ts
import { useFormContainer } from 'react-dockable-desktop';

function MyPanel() {
  const { onRestore, onMinimize } = useFormContainer();

  useEffect(() => {
    const unsubRestore  = onRestore(() => { /* panel became visible */ });
    const unsubMinimize = onMinimize(() => { /* panel was hidden */ });
    return () => { unsubRestore(); unsubMinimize(); };
  }, []);
}
```

## Custom header actions

Inject React nodes into a panel's tab header:

```ts
const client = new WorkspaceClient({
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

In short: pass `dir="rtl"` to `DockableDesktopProvider` **and** set `document.documentElement.dir = 'rtl'` so portals (ContextMenu, toolbar flyout, Toast) that render into `document.body` also pick up the RTL direction via CSS inheritance.

## Multiple providers on one page

Each `WorkspaceClient` instance has its own scoped `PanelRegistryClass`. Multiple providers can coexist on the same page without panel key conflicts:

```tsx
const wsA = new WorkspaceClient({ panels: { map: { component: MapA } } });
const wsB = new WorkspaceClient({ panels: { map: { component: MapB } } });

<div>
  <WindowManagerProvider client={wsA}><WindowManager /></WindowManagerProvider>
  <WindowManagerProvider client={wsB}><WindowManager /></WindowManagerProvider>
</div>
```

## DockableDesktopProvider, state selectors, lifecycle callbacks, `usePanelId()`

These v3 features are documented in the dedicated guides:

- [Panel Lifecycle & Forms →](./forms-and-panels) — `usePanelId()`, `useFormContainer()`, lifecycle hooks
- [Event Bus & Communication →](./event-bus) — `onPanelOpen/Close/Minimize/Restore`, typed events, state subscriptions
- [WorkspaceClient →](./workspace-client) — `DockableDesktopProvider`, `useWindowManagerState` selectors, CSS class overrides

## i18n / custom messages

Pass a `formatMessage` function to translate all built-in strings:

```ts
import { useIntl } from 'react-intl';

function App() {
  const intl = useIntl();
  const client = useMemo(() => new WorkspaceClient({
    panels: { ... },
    formatMessage: (msg) => intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage }, msg.values),
  }), [intl]);

  return <WindowManagerProvider client={client}>...</WindowManagerProvider>;
}
```
