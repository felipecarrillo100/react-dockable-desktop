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
  defaultOptions?: {
    title?: string | ContextMenuPredefinedMessage;
    canClose?: boolean;
    canMinimize?: boolean;
    canFloat?: boolean;
    canDrag?: boolean;
    renderHeaderActions?: (panelId: string) => React.ReactNode;
  };
}
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
