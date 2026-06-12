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
If you queue calls but never pass the client to a provider, a `console.warn` fires after 1 second in development mode:
```
[react-dockable-desktop] WorkspaceClient has queued calls but was never connected
to a provider. Did you forget client={workspace} on <WindowManagerProvider>?
```
:::

::: info Non-queueable methods
`saveLayout()`, `isOpen()`, `getOpenPanelIds()`, and `subscribe()` return values
immediately and cannot be queued. They return safe defaults (`''`, `false`, `[]`,
`() => {}`) when the client is not connected.
:::

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
