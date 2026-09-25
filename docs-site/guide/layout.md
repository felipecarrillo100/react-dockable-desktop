# Layout System

## Opening panels

```ts
// Docked (default) — goes into the first available leaf group
workspace.openPanel('my-map', 'map', { title: 'Satellite View' });

// Forced docked — explicit
workspace.openPanel('my-map', 'map', { initialTarget: 'docked' });

// Floating — opens as a resizable window
workspace.openPanel('settings', 'settings', { initialTarget: 'floating' });

// 'tabbed' is the same as 'docked': both add a tab to the first group
workspace.openPanel('log-2', 'logs', { initialTarget: 'tabbed' });
```

To put a panel into a particular group, or split one, open it and then use `dockPanelToGroup(id, leafId, position)` or `dockPanelToWorkspaceEdge(id, side)`.

If the panel ID is already open, `openPanel` focuses it instead of creating a duplicate.

## Activating / focusing panels

```ts
workspace.focusPanel('my-map');
// For floating: raises z-index so the window appears on top.
// For docked: selects the tab within its leaf group.
```

## Querying open panels

```ts
if (!workspace.isOpen('my-map')) {
  workspace.openPanel('my-map', 'map');
}

const openIds = workspace.getOpenPanelIds();
// → ['my-map', 'settings', 'log-2']
```

## Floating window operations

```ts
workspace.floatPanel('my-map');                  // detach from grid
workspace.floatPanel('my-map', { x: 100, y: 60, width: 800, height: 600 });

workspace.maximizePanel('my-map');               // toggle: fill the workspace, or restore its size
workspace.dockPanel('my-map');                   // return to grid
workspace.dockPanel('my-map', 'left-leaf');      // dock to specific group
```

## Minimizing

```ts
workspace.minimizePanel('my-map');   // sends to taskbar
workspace.restorePanel('my-map');    // restores from taskbar
```

## Layout serialization

```ts
// Save the entire workspace to JSON
const snapshot = workspace.saveLayout();
localStorage.setItem('layout', snapshot);

// Restore — replaces everything currently open
workspace.loadLayout(localStorage.getItem('layout') ?? '');
```

The snapshot JSON contains:
- `version` — schema version, for migrating older saved layouts as the format evolves
- `activePanelId` — the panel that was active at save time; omitted when none was, or when that
  panel was excluded from the snapshot as non-serializable
- `gridRoot` — the full tree of branches and leaf groups
- `floating` — positions and sizes of floating windows
- `minimized` — panels in the taskbar
- `panels` — metadata (title, component key, state) for every open panel

### Which panel is active after a restore

A restored workspace comes back with `state.activePanelId` set to the panel the user was actually
looking at — which matters because that is the panel `useActiveContribution()` reads from, so
every contributed sidebar tab and toolbar item is wired to it.

It resolves in this order:

1. The snapshot's own `activePanelId`, if that panel is still visible in the restored layout.
2. Otherwise the selected tab of the first leaf in the grid, depth-first. This is the path taken by
   layouts saved before `activePanelId` was persisted, and by any snapshot whose recorded value is
   no longer valid.
3. Otherwise the frontmost (highest z-index) floating window, so a layout of only floating windows
   still restores with something active.
4. Otherwise `null`.

A minimized panel is never chosen — it isn't on screen, even though it stays mounted. The same rule
holds during normal use: closing or minimizing the active panel moves `activePanelId` to whatever
becomes visible in its place, rather than leaving it on a panel that is gone or hidden.

### Pre-loading a layout on startup

Pass the JSON string directly as the `initialState` of `createWorkspace()`:

```ts
const workspace = createWorkspace({
  panels: { ... },
  initialState: localStorage.getItem('layout'),
});
```

The layout is parsed synchronously before the first render — no flicker, no `useEffect` needed.

### Loading asynchronously

For layouts fetched from a server, use the imperative API:

```ts
// Outside React:
fetchLayoutFromServer().then(json => workspace.loadLayout(json));

// Or inside a component:
const workspace = useWorkspace();
useEffect(() => {
  fetch('/api/layout').then(r => r.text()).then(json => {
    workspace.loadLayout(json);
  });
}, [workspace]);
```

## Dirty-state close guards

Prevent accidental data loss with close guards:

```ts
// In your panel component:
useBeforeClose(hasUnsavedChanges ? () => confirm('Discard unsaved changes?') : null);

// Or use the built-in dirty flag + modal:
const panel = usePanel();
panel.setDirty(true, {
  title: 'Unsaved Changes',
  message: 'Your changes will be lost. Continue?',
});
```

## Event bus

```ts
// Publish from any panel or outside React:
workspace.publish('map:zoom', { level: 12 });

// Subscribe in a panel:
const workspace = useWorkspace();
useEffect(() => {
  return workspace.subscribe('map:zoom', ({ level }) => {
    setZoom(level);
  });
}, [workspace]);
```
