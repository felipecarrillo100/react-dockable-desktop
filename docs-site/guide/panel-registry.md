# Panel Registry

The panel registry maps string component keys (used in `openPanel()` and serialized layouts) to React component constructors. There are two ways to populate it.

## Recommended: the `panels` config

Pass a `panels` map to `createWorkspace()`. It fills the workspace's own registry, `workspace.registry`:

```ts
const workspace = createWorkspace({
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
  // The library injects `panelId` as a prop automatically.
  // Components that don't declare it in their props can read `usePanel().id` instead.
  component: ComponentType<any>;
  defaultOptions?: PanelDefaultOptions;
}
```

### PanelDefaultOptions

All fields are optional. They set the per-panel defaults; most can be overridden per-instance in `openPanel`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string \| MessageDescriptor` | — | Tab and window title. |
| `icon` | `ReactNode` | — | Icon shown in the tab and taskbar. |
| `initialTarget` | `'floating' \| 'docked' \| 'tabbed'` | `'docked'` | Initial placement when the panel is first opened. |
| `favoritePosition` | `{ x, y, width, height }` | — | Default floating bounds (position + size) when the panel is first floated. All four values accept numbers (px) or CSS strings (`'50%'`). |
| `canClose` | `boolean` | `true` | Show or hide the × close button. |
| `canMinimize` | `boolean` | `true` | Show or hide the minimize button. |
| `canDrag` | `boolean` | `true` | Allow the tab to be dragged to a different leaf or position. When `false`, the panel cannot be floated via drag. |
| `defaultAnchor` | `FloatAnchor` (`'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'`) | — (unanchored) | Every instance of this component opens pre-anchored to the given workspace corner when floated — see the `anchor` option in [Workspace](./workspace-client#openpanel-options), which this is the per-component default for. |
| `disableLivePreview` | `boolean` | `false` | Do not render a thumbnail preview when the panel is not the active tab. A canvas-rendered view (a WebGL map) that blurs in the scaled-down preview can instead be marked with `data-rdd-preview-unscale` on its container, which renders it at full resolution there. |
| `renderHeaderActions` | `(panelId: string) => ReactNode` | — | Inject React nodes into the panel tab header (e.g. export buttons). |

#### Locked / pinned panel pattern

Set `canDrag`, `canClose`, and `canMinimize` all to `false` to create a panel the user cannot move, close, or hide — useful for a primary map or content area:

```ts
const workspace = createWorkspace({
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

For dynamic panel types registered after the workspace is created, use `workspace.registry.register()` — or, inside React, `useWorkspace().registry.register()`:

```ts
workspace.registry.register('live-chart', LiveChartComponent, {
  title: 'Live Chart',
  canClose: true,
});
```

There is no global registry: each workspace has its own, so several workspaces on one page never share panel keys.

## Unregistered key warning

If `openPanel('id', 'unknown-key')` is called and `'unknown-key'` is not in the registry, the panel renders a visual warning placeholder **and** emits a `console.warn` naming the panel and the missing key. Add the key to the `panels` config of `createWorkspace()`, or register it with `workspace.registry.register()`.
