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

Heavy widgets (WebGL contexts, Leaflet maps, CodeMirror instances) maintain their DOM nodes when a panel is hidden, minimized, or covered by another tab. The library moves the DOM subtree into a hidden container (`#preserved-dom-container`) rather than unmounting it.

This is automatic — you do not need to configure anything. The implication is that your panel components should be written to tolerate visibility changes without relying on mount/unmount cycles.

If you need to react to visibility, use the lifecycle hooks:

```ts
import { usePanelContext } from 'react-dockable-desktop';

function MyPanel({ panelId }: { panelId: string }) {
  const { onRestore, onMinimize } = usePanelContext(panelId);

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

## RTL support

RTL layout is auto-detected from the nearest ancestor element with `dir="rtl"`. You can also set it explicitly:

```ts
const client = new WorkspaceClient({ dir: 'rtl' });

// Or dynamically:
client.setDirection('rtl');
```

Both `data-color-scheme` and `data-bs-theme` attributes are updated automatically for theme compatibility.

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
