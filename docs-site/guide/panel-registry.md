# Panel Registry

The panel registry maps string component keys (used in `openPanel()` and serialized layouts) to React component constructors. There are two ways to populate it.

## Recommended: WorkspaceClient panels config

Pass a `panels` map to the `WorkspaceClient` constructor. This creates a **scoped registry** that lives on the client instance:

```ts
const client = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map', canClose: false } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
    logs:   { component: LogsPanel },
  },
});
```

Each key is the `componentKey` argument to `openPanel(id, componentKey)`. Keys must be stable — they are persisted inside `saveLayout()` JSON.

### PanelDefinition

```ts
interface PanelDefinition {
  component: ComponentType<{ panelId: string }>;
  defaultOptions?: PanelDefaultOptions;
}
```

### PanelDefaultOptions

All fields are optional. They set the per-panel defaults; most can be overridden per-instance in `openPanel`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string \| MessageDescriptor` | — | Tab and window title. |
| `icon` | `ReactNode` | — | Icon shown in the tab and taskbar. |
| `initialTarget` | `string` | — | ID of the leaf panel to dock into when first opened. |
| `favoritePosition` | `number \| string` | — | Preferred pixel size or CSS percentage used when the panel splits into a new leaf. |
| `canClose` | `boolean` | `true` | Show or hide the × close button. |
| `canMinimize` | `boolean` | `true` | Show or hide the minimize button. |
| `canFloat` | `boolean` | `true` | Allow the panel to be detached as a floating window. |
| `canDrag` | `boolean` | `true` | Allow the tab to be dragged to a different leaf or position. |
| `defaultStickyRight` | `boolean` | `false` | Snap to the right edge of the viewport when floating. |
| `defaultStickyBottom` | `boolean` | `false` | Snap to the bottom edge of the viewport when floating. |
| `disableLivePreview` | `boolean` | `false` | Do not render a thumbnail preview when the panel is not the active tab. |
| `renderHeaderActions` | `(panelId: string) => ReactNode` | — | Inject React nodes into the panel tab header (e.g. export buttons). |

#### Locked / pinned panel pattern

Set `canDrag`, `canClose`, and `canMinimize` all to `false` to create a panel the user cannot move, close, or hide — useful for a primary map or content area:

```ts
const client = new WorkspaceClient({
  panels: {
    mainMap: {
      component: MapPanel,
      defaultOptions: {
        title:       'Map',
        canDrag:     false,
        canClose:    false,
        canMinimize: false,
      },
    },
  },
});
```

## Imperative registration (advanced)

For dynamic panel types registered after construction, use `client.registry.register()`:

```ts
client.registry.register('live-chart', LiveChartComponent, {
  title: 'Live Chart',
  canClose: true,
});
```

## Global singleton (legacy)

`PanelRegistry` (the global singleton) is still available for backward compatibility:

```ts
import { PanelRegistry } from 'react-dockable-desktop';

PanelRegistry.register('map', MapPanel);
```

When no `client` prop is passed to the provider, the global singleton is used. For new projects, prefer the scoped `WorkspaceClient` approach.

## Unregistered key warning

If `openPanel('id', 'unknown-key')` is called and `'unknown-key'` is not in the registry, the panel renders a visual warning placeholder **and** emits `console.warn`:

```
[react-dockable-desktop] Panel "id" references component key "unknown-key"
which is not registered. Add it to the WorkspaceClient panels config:
  new WorkspaceClient({ panels: { "unknown-key": { component: YourComponent } } })
```
