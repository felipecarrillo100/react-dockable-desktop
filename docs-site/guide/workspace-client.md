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
| `defaultSplitRatio` | `number` | Fraction (0.1–0.9) the new panel takes when dropped on a panel's top/bottom/left/right cross target. Default: `0.5`. |
| `defaultEdgeSplitRatio` | `number` | Fraction (0.1–0.9) the new panel takes when dropped on the workspace's outer edge. Default: `0.2`. |
| `zIndexBase` | `number` | Starting z-index for floating windows and the library's own chrome overlays (context menu, toolbar flyout, modal stack, toast, workspace edge zones) — all shift together via `--rdd-z-base`. Set this above/below a host app's own modal z-index range to control stacking against it. Default: `1000`. |

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

### `openPanel` options

| Option | Type | Description |
|---|---|---|
| `title` | `string \| ContextMenuPredefinedMessage` | Overrides the panel tab/window title. |
| `initialTarget` | `'floating' \| 'docked' \| 'tabbed'` | Initial placement. Defaults to `'docked'` when a grid exists. |
| `anchor` | `FloatAnchor \| null` | Pin a new floating window to a workspace corner. No effect when docked/tabbed. |
| `focus` | `boolean` | Set `activePanelId` to this panel. Default `true`. |
| `props` | `object` | Custom per-instance data spread onto the panel component alongside `panelId` — see **Per-panel props** below. Unconstrained, matching `openModal`/`openLeftPanel`/`openRightPanel`'s own `props` argument. |
| `dedupeKey` | `string` | If another open panel of the same `componentKey` already has this exact key, that panel is focused instead of opening a new one — see **Instance dedup** below. |

## Per-panel props

```ts
client.openPanel('doc-1', 'markdownDocument', { props: { filename: 'notes.md', content: '# Hi' } });
```

`props` is spread onto the component the same way `openModal`/`openLeftPanel`/`openRightPanel` already spread theirs — `<Component {...props} panelId={id} />` (props first, so a prop literally named `panelId` can never shadow the injected one). There's **no type restriction** on `props` — a function, a `ReactNode`, a class instance, anything is accepted.

Whether a specific `props` value survives a `saveLayout()` call is a **runtime fact**, not a compile-time guarantee:

- Every panel has a `serializable: boolean` field (readable via `useWindowManagerState().panels[id].serializable`), computed by recursively checking `props` for anything that can't round-trip through `JSON.stringify`/`JSON.parse` — functions, symbols, React elements, class instances, `Map`/`Set`, or `undefined` anywhere in the tree. (`Date` is treated as serializable-enough, matching `JSON.stringify`'s own behavior, even though it doesn't round-trip back to a `Date` instance.)
- A panel with `serializable: false` **keeps working normally on screen** — it's simply excluded from the *next* `saveLayout()` call, pruned from the grid/floating/minimized structures in that saved snapshot so a later `loadLayout()` never references a panel it has no data to recreate.
- `saveLayout()` publishes `'layout:panels-excluded'` (see **Event bus** below) whenever a specific call excludes at least one panel — subscribe to it if you want to tell the user ("2 panels couldn't be saved") rather than relying on them noticing something's missing after a reload.

```ts
import { isSerializable } from 'react-dockable-desktop';

// Check before opening, if you want to warn early instead of discovering it at save time:
if (!isSerializable(myProps)) { /* ... */ }
```

### Reporting state pulled fresh at save time

Static `props` are frozen at open time — fine for identity/config, but they can't capture state a panel accumulates *after* opening (scroll position, an in-progress edit, a view-mode toggle). A panel can instead register a callback reporting its *current* state, called by `saveLayout()` every time:

```tsx
import { useFormContainer } from 'react-dockable-desktop';

function MyPanel() {
  const container = useFormContainer();
  const scrollLineRef = useRef(0);

  useEffect(() => {
    return container.registerStateProvider?.(() => ({ scrollLine: scrollLineRef.current }));
  }, [container]);

  // ...
}
```

Return `undefined` to fall back to the panel's static `props` for that save. The returned value is re-checked against the same serializability rule on **every** save — a provider-backed panel's exclusion status can flip from one save to the next. Only meaningful for docked/floating panels; left/right side panels and modals already have a complete, different answer to this (their own `props` argument plus `updateInstance`).

## Instance dedup

```ts
client.openPanel('doc-1', 'markdownDocument', { props: { path: '/notes.md' }, dedupeKey: '/notes.md' });
client.openPanel('doc-2', 'markdownDocument', { dedupeKey: '/notes.md' }); // focuses doc-1 instead — doc-2 never exists
```

Re-opening the exact same `id` already focuses the existing panel rather than duplicating it — `dedupeKey` covers the case where multiple call sites might not agree on the same literal `id` for what is semantically the same entity. When a match is found, the redirect entirely ignores the new call's `id`/`props`.

```ts
client.findPanelId('markdownDocument', '/notes.md')  // → the matching panel's id, or null
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
client.isOpen(id)                        // → boolean — is this panel currently open?
client.getOpenPanelIds()                 // → string[] — IDs of all open panels
client.findPanelId(componentKey, dedupeKey) // → string | null — see Instance dedup above
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

Two more built-in events, added alongside per-panel props:

```ts
// Fires whenever something saveLayout() would capture changes — coalesces open/close/minimize/
// restore/dedupe-redirect into one signal for autosave-style consumers. Does NOT cover a
// registerStateProvider callback's value changing on its own (that's a pull, unobservable without
// the panel notifying separately), nor resize/split-drag/dock-rearrange (no hooks yet).
workspace.subscribe('layout:changed', () => { /* ... */ });

// Fires from inside saveLayout() itself, only when that call excluded at least one panel.
workspace.subscribe('layout:panels-excluded', data => console.log(data.panels)); // { id, component }[]
```

### Lifecycle convenience methods (v3)

```ts
const unsub = workspace.onPanelOpen((id, component) => { /* ... */ });
const unsub = workspace.onPanelClose(id => { /* ... */ });
const unsub = workspace.onPanelMinimize(id => { /* ... */ });
const unsub = workspace.onPanelRestore(id => { /* ... */ });
const unsub = workspace.onLayoutChanged(() => { /* ... */ });
const unsub = workspace.onPanelsExcluded(panels => { /* ... */ });
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

`WindowManager` is the rendering component that draws the grid, tabs, and floating windows. Its full TypeScript type is `WindowManagerProps` — import it when building a wrapper component:

```ts
import type { WindowManagerProps, TaskbarVisibility } from 'react-dockable-desktop';
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `skin` | `string` | `'vscode'` | Built-in visual theme or any custom skin name. Built-ins: `vscode`, `macos`, `chrome`, `slate`, `nord`, `obsidian`, `tokyo`. See [Custom Theming →](/guide/theming). |
| `defaultPanelIcon` | `ReactNode` | — | Fallback icon used when a panel definition has no `icon`. |
| `taskbarVisibility` | `TaskbarVisibility` | `'always'` | Controls when the minimized-panels taskbar is shown. `'always'` keeps a permanent strip at the bottom. `'compact'` shows the bar only when at least one panel is minimized. `'autohide'` renders the bar as a full-screen overlay with an 8 px peek strip that expands on pointer-enter; briefly auto-expands for 2 s when a panel is minimized. |
| `contextMenuAdapter` | `ContextMenuAdapter` | `DefaultContextMenuAdapter` | Custom context menu renderer. Pass your own adapter to replace the built-in menu with a design-system component. See [Context Menus →](/guide/context-menus). |
| `animations` | `boolean` | `true` | Enables the library's own transitions/animations (tab hover, dock preview, etc.). Set to `false` to disable them — scoped to only the library's own elements, never the host page's. |

```tsx
<WindowManager skin="nord" taskbarVisibility="autohide" defaultPanelIcon={<FolderIcon />} />
```

## CSS class overrides

`DockableDesktopProvider` (and `WindowManagerProvider`) accept six class props that let you apply custom CSS classes to the overlay containers. The full TypeScript type is `DockableDesktopProviderProps` (alias of `WindowManagerProviderProps`):

```ts
import type { DockableDesktopProviderProps, WindowManagerProviderProps } from 'react-dockable-desktop';
```

Pass the class names as regular string props:

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
