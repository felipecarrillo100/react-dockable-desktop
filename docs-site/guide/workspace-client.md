# WorkspaceClient

`WorkspaceClient` is the central object for `react-dockable-desktop`. It holds your panel catalog, the initial layout string, and the imperative API. You create one instance **outside React** and pass it to the provider via `client={workspace}`.

The pattern mirrors **TanStack QueryClient** and **Redux store**: all configuration and imperative access live on the client; the React provider is a thin rendering shell.

## Constructor

```ts
const client = new WorkspaceClient(config?: WorkspaceClientConfig)
```

### WorkspaceClientConfig

| Property | Type | Description |
|----------|------|-------------|
| `panels` | `Record<string, PanelDefinition>` | Declarative panel catalog. Keys are the component identifiers used in `openPanel()` and serialized layouts. |
| `initialState` | `string \| null` | JSON string from a previous `saveLayout()`. Pass `null` or omit for an empty canvas. |
| `formatMessage` | `MessageFormatter` | Custom i18n formatter for all built-in strings. |
| `predefinedMessages` | `Record<string, ...>` | Override any subset of the built-in context menu message catalog. |
| `dir` | `'ltr' \| 'rtl'` | Initial layout direction. Auto-detected if omitted. |

## Imperative API

Once the provider mounts and calls `_connect()`, all client methods forward directly to the React state.

### Panel lifecycle

```ts
client.openPanel(id, componentKey, options?)  // open / focus a panel
client.closePanel(id)                          // close immediately (no guard)
client.minimizePanel(id)                       // send to taskbar
client.restorePanel(id)                        // restore from taskbar
client.focusPanel(id)                          // bring to front / select tab
```

### Floating / docking

```ts
client.floatPanel(id, rect?)                   // detach to floating window
client.dockPanel(id, targetLeafId?)            // dock back to grid
client.maximizePanel(id)                       // maximize floating window
```

### Layout serialization

```ts
const json = client.saveLayout();              // → JSON string
client.loadLayout(json);                       // restore from JSON string
```

### Query methods

```ts
client.isOpen(id)          // → boolean — is this panel currently open?
client.getOpenPanelIds()   // → string[] — IDs of all open panels
```

### Event bus

```ts
client.publish('my-event', { value: 42 });
const unsubscribe = client.subscribe('my-event', (data) => console.log(data));
```

### Typed event bus (v3)

Pass a custom event map as the generic type parameter to get fully-typed `publish` and `subscribe` calls:

```ts
interface AppEvents {
  'layer:toggle':  { layerId: string; visible: boolean };
  'selection:set': { ids: string[] };
}

const workspace = new WorkspaceClient<AppEvents>({ panels: { ... } });

workspace.publish('layer:toggle', { layerId: 'markers', visible: true }); // typed ✓
workspace.publish('layer:toggle', { wrong: true });                        // TS error ✓

// Built-in lifecycle events are also available on typed clients:
workspace.subscribe('panel:opened', data => console.log(data.id, data.component));
```

The default (`WorkspaceClient` without a type parameter) accepts any string key with `unknown` data — fully backward-compatible.

### Lifecycle convenience methods (v3)

```ts
const unsub = workspace.onPanelOpen((id, component) => { /* ... */ });
const unsub = workspace.onPanelClose(id => { /* ... */ });
const unsub = workspace.onPanelMinimize(id => { /* ... */ });
const unsub = workspace.onPanelRestore(id => { /* ... */ });
```

Each returns an unsubscribe function. See [Lifecycle callbacks](/guide/advanced#lifecycle-callbacks-v3) for patterns.

### Misc

```ts
client.setDirection('rtl');
client.isConnected;  // true while provider is mounted
```

## Pending-call queue

Calls made **before the provider mounts** are queued and replayed in order once `_connect()` fires. This solves the common React timing issue where a child component's `useEffect` fires before the parent provider's `useEffect`.

```tsx
// Safe — queued and replayed on mount:
client.openPanel('dashboard', 'map');

function App() {
  return (
    <WindowManagerProvider client={client}>
      <MyApp />
    </WindowManagerProvider>
  );
}
```

::: warning Forgotten `client` prop
If you queue calls but never pass the client to a provider, a `console.error` fires after 1 second in development (5 seconds in production):
```
[react-dockable-desktop] WorkspaceClient has N queued call(s) but was never
connected to a WindowManagerProvider. Did you forget client={workspace}?
```
:::

::: info Non-queueable methods
`saveLayout()`, `isOpen()`, `getOpenPanelIds()`, and `subscribe()` return values
immediately and cannot be queued. They return safe defaults (`''`, `false`, `[]`,
`() => {}`) when the client is not connected.
:::

## `useWindowManagerState` — state selectors

`useWindowManagerState` is a React hook that reads from the workspace state. Pass a selector to subscribe only to the slice you care about:

```ts
import { useWindowManagerState } from 'react-dockable-desktop';

// No selector — returns the full state. Re-renders on any change.
const state = useWindowManagerState();

// With selector — re-renders only when the selected value changes.
const panelCount  = useWindowManagerState(s => Object.keys(s.panels).length);
const isMapOpen   = useWindowManagerState(s => 'map-1' in s.panels);
const activePanel = useWindowManagerState(s => s.activePanelId);
```

The selector overload was added in v3. The no-argument overload works exactly as before.

## `WindowManager` props

`WindowManager` is the rendering component that draws the grid, tabs, and floating windows. It accepts two optional props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `skin` | `string` | `'vscode'` | Built-in visual theme or any custom skin name. Built-ins: `vscode`, `macos`, `chrome`, `slate`, `nord`, `obsidian`, `tokyo`. See [Custom Theming →](/guide/theming). |
| `defaultPanelIcon` | `ReactNode` | — | Fallback icon used when a panel definition has no `icon`. |
| `taskbarVisibility` | `'always' \| 'compact' \| 'autohide'` | `'always'` | Controls when the minimized-panels taskbar is shown. `'always'` keeps a permanent strip at the bottom. `'compact'` shows the bar only when at least one panel is minimized. `'autohide'` renders the bar as a full-screen overlay with an 8 px peek strip that expands on pointer-enter; briefly auto-expands for 2 s when a panel is minimized. |

```tsx
<WindowManager skin="nord" taskbarVisibility="autohide" defaultPanelIcon={<FolderIcon />} />
```

## CSS class overrides

`DockableDesktopProvider` (and `WindowManagerProvider`) accept six class props that let you apply custom CSS classes to the overlay containers. Pass them as regular string props:

```tsx
<DockableDesktopProvider
  client={workspace}
  modalClass="my-modal-wrapper"
  modalBodyClass="my-modal-body"
  sidePanelClass="my-drawer-wrapper"
  sidePanelBodyClass="my-drawer-body"
  windowClass="my-floating-window"
  windowBodyClass="my-floating-window-body"
>
  ...
</DockableDesktopProvider>
```

| Prop | Applied to |
|------|-----------|
| `modalClass` | The outer wrapper element of every modal. |
| `modalBodyClass` | The inner content area of every modal. |
| `sidePanelClass` | The outer wrapper of left/right drawers. |
| `sidePanelBodyClass` | The inner content area of drawers. |
| `windowClass` | The outer wrapper of floating windows. |
| `windowBodyClass` | The inner content area of floating windows. |

Use these when you need to override library default styles without touching the built-in CSS variables.

## Scoped registry

Each `WorkspaceClient` creates its own `PanelRegistryClass` instance, independent of the global singleton. This enables multiple independent workspace instances on the same page.

```ts
client.registry.register('custom-panel', CustomComponent);
```

## Multiple workspaces

You can mount several independent `<WindowManagerProvider>` trees on the same page, each with its own `WorkspaceClient`:

```tsx
const workspaceA = new WorkspaceClient({ panels: { ... } });
const workspaceB = new WorkspaceClient({ panels: { ... } });

<WorkspaceA client={workspaceA}>...</WorkspaceA>
<WorkspaceB client={workspaceB}>...</WorkspaceB>
```
