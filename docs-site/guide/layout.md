# Layout System

## Opening panels

```ts
// Docked (default) — goes into the first available leaf group
client.openPanel('my-map', 'map', { title: 'Satellite View' });

// Forced docked — explicit
client.openPanel('my-map', 'map', { initialTarget: 'docked' });

// Floating — opens as a resizable window
client.openPanel('settings', 'settings', { initialTarget: 'floating' });

// Tabbed alongside an existing panel
client.openPanel('log-2', 'logs', { initialTarget: 'tabbed' });
```

If the panel ID is already open, `openPanel` focuses it instead of creating a duplicate.

## Activating / focusing panels

```ts
client.focusPanel('my-map');
// For floating: raises z-index so the window appears on top.
// For docked: selects the tab within its leaf group.
```

## Querying open panels

```ts
if (!client.isOpen('my-map')) {
  client.openPanel('my-map', 'map');
}

const openIds = client.getOpenPanelIds();
// → ['my-map', 'settings', 'log-2']
```

## Floating window operations

```ts
client.floatPanel('my-map');                  // detach from grid
client.floatPanel('my-map', { x: 100, y: 60, width: 800, height: 600 });

client.maximizePanel('my-map');               // fill the workspace
client.dockPanel('my-map');                   // return to grid
client.dockPanel('my-map', 'left-leaf');      // dock to specific group
```

## Minimizing

```ts
client.minimizePanel('my-map');   // sends to taskbar
client.restorePanel('my-map');    // restores from taskbar
```

## Layout serialization

```ts
// Save the entire workspace to JSON
const snapshot = client.saveLayout();
localStorage.setItem('layout', snapshot);

// Restore — replaces everything currently open
client.loadLayout(localStorage.getItem('layout') ?? '');
```

The snapshot JSON contains:
- `version` — schema version, for migrating older saved layouts as the format evolves
- `gridRoot` — the full tree of branches and leaf groups
- `floating` — positions and sizes of floating windows
- `minimized` — panels in the taskbar
- `panels` — metadata (title, component key, state) for every open panel

### Pre-loading a layout on startup

Pass the JSON string directly to `WorkspaceClient.initialState`:

```ts
const client = new WorkspaceClient({
  panels: { ... },
  initialState: localStorage.getItem('layout'),
});
```

The layout is parsed synchronously before the first render — no flicker, no `useEffect` needed.

### Loading asynchronously

For layouts fetched from a server, use the imperative API:

```ts
// Outside React (after provider mounts):
fetchLayoutFromServer().then(json => client.loadLayout(json));

// Or inside a component:
useEffect(() => {
  fetch('/api/layout').then(r => r.text()).then(json => {
    actions.loadLayout(json);
  });
}, []);
```

## Dirty-state close guards

Prevent accidental data loss with close guards:

```ts
// In your panel component:
const actions = useWindowManagerActions();

useEffect(() => {
  actions.registerCloseGuard('editor-1', () => {
    return !hasUnsavedChanges || confirm('Discard unsaved changes?');
  });
  return () => actions.unregisterCloseGuard('editor-1');
}, [hasUnsavedChanges]);

// Or use the built-in dirty flag + modal:
actions.setPanelDirty('editor-1', true, {
  title: 'Unsaved Changes',
  body: 'Your changes will be lost. Continue?',
});
```

## Event bus

```ts
// Publish from any panel or outside React:
client.publish('map:zoom', { level: 12 });
actions.publish('selection:changed', { ids: ['feature-1'] });

// Subscribe in a panel:
const actions = useWindowManagerActions();
useEffect(() => {
  return actions.subscribe('map:zoom', ({ level }) => {
    setZoom(level);
  });
}, []);
```
