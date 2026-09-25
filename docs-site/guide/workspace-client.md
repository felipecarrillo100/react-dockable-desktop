# Workspace

The workspace is the central object for `react-dockable-desktop`. It holds your panel catalog, the initial layout string, and the imperative API. You create one with `createWorkspace()` **outside React** and pass it to the provider via `workspace={workspace}`.

The pattern mirrors **TanStack QueryClient** and **Redux store**: all configuration and imperative access live on the workspace; the React provider is a thin rendering shell.

## `createWorkspace()`

```ts
const workspace = createWorkspace(config?: WorkspaceConfig)  // → Workspace
```

### WorkspaceConfig

| Property | Type | Description |
|----------|------|-------------|
| `panels` | `Record<string, PanelDefinition>` | Declarative panel catalog. Keys are the component identifiers used in `openPanel()` and serialized layouts. |
| `initialState` | `string \| null` | JSON string from a previous `saveLayout()`. Pass `null` or omit for an empty canvas. |
| `formatMessage` | `MessageFormatter` | Custom i18n formatter for all built-in strings. |
| `messages` | `Record<string, MessageDescriptor>` | Override any subset of the built-in message table (see `defaultMessages`). |
| `dir` | `'ltr' \| 'rtl'` | Initial layout direction. If omitted, the provider's `dir` prop is used, else `'ltr'`. |
| `defaultSplitRatio` | `number` | Fraction (0.1–0.9) the new panel takes when dropped on a panel's top/bottom/left/right cross target. Default: `0.5`. |
| `defaultEdgeSplitRatio` | `number` | Fraction (0.1–0.9) the new panel takes when dropped on the workspace's outer edge. Default: `0.2`. |
| `zIndexBase` | `number` | Starting z-index for floating windows and the library's own chrome overlays (context menu, toolbar flyout, modal stack, toast, workspace edge zones) — all shift together via `--rdd-z-base`. Set this above/below a host app's own modal z-index range to control stacking against it. Default: `1000`. |

## Imperative API

The workspace is live from the moment `createWorkspace()` returns: every method applies immediately, whether or not a `<DockableDesktopProvider>` has mounted yet. Inside React, `useWorkspace()` returns the workspace of the nearest provider — a stable object, so a component that only calls actions never re-renders because of it:

```tsx
import { useWorkspace } from 'react-dockable-desktop';

function OpenMapButton() {
  const workspace = useWorkspace();
  return <button onClick={() => workspace.openPanel('map-1', 'map')}>Map</button>;
}
```

### Panel lifecycle

```ts
workspace.openPanel(id, componentKey, options?)  // open / focus a panel; a minimized one is restored where it was
workspace.closePanel(id)                          // close immediately (no guard)
workspace.minimizePanel(id)                       // send to taskbar
workspace.restorePanel(id)                        // restore from taskbar
workspace.focusPanel(id)                          // bring to front / select tab
```

### `openPanel` options

| Option | Type | Description |
|---|---|---|
| `title` | `string \| MessageDescriptor` | Overrides the panel tab/window title. |
| `initialTarget` | `'floating' \| 'docked' \| 'tabbed'` | Initial placement. Defaults to `'docked'` when a grid exists. |
| `anchor` | `FloatAnchor \| null` | Pin a new floating window to a workspace corner. No effect when docked/tabbed. |
| `focus` | `boolean` | Set `activePanelId` to this panel. Default `true`. |
| `props` | `object` | Custom per-instance data spread onto the panel component alongside `panelId` — see **Per-panel props** below. Unconstrained, matching the `props` argument of `useModals().open` and `useSidePanels().openLeft`/`openRight`. |
| `dedupeKey` | `string` | If another open panel of the same `componentKey` already has this exact key, that panel is focused instead of opening a new one — see **Instance dedup** below. |

## Per-panel props

```ts
workspace.openPanel('doc-1', 'markdownDocument', { props: { filename: 'notes.md', content: '# Hi' } });
```

`props` is spread onto the component the same way modals and side drawers spread theirs — `<Component {...props} panelId={id} />` (props first, so a prop literally named `panelId` can never shadow the injected one). There's **no type restriction** on `props` — a function, a `ReactNode`, a class instance, anything is accepted.

Whether a specific `props` value survives a `saveLayout()` call is a **runtime fact**, not a compile-time guarantee:

- Every panel has a `serializable: boolean` field (readable via `useWorkspaceState(s => s.panels[id].serializable)`), computed by recursively checking `props` for anything that can't round-trip through `JSON.stringify`/`JSON.parse` — functions, symbols, React elements, class instances, `Map`/`Set`, or `undefined` anywhere in the tree. (`Date` is treated as serializable-enough, matching `JSON.stringify`'s own behavior, even though it doesn't round-trip back to a `Date` instance.)
- A panel with `serializable: false` **keeps working normally on screen** — it's simply excluded from the *next* `saveLayout()` call, pruned from the grid/floating/minimized structures in that saved snapshot so a later `loadLayout()` never references a panel it has no data to recreate.
- `saveLayout()` publishes `'layout:panels-excluded'` (see **Event bus** below) whenever a specific call excludes at least one panel — subscribe to it if you want to tell the user ("2 panels couldn't be saved") rather than relying on them noticing something's missing after a reload.

```ts
import { isSerializable } from 'react-dockable-desktop';

// Check before opening, if you want to warn early instead of discovering it at save time:
if (!isSerializable(myProps)) { /* ... */ }
```

### Reporting state pulled fresh at save time

Static `props` are frozen at open time — fine for identity/config, but they can't capture state a panel accumulates *after* opening (scroll position, an in-progress edit, a view-mode toggle). A panel can instead report its *current* state with `useSaveState()`, which `saveLayout()` calls every time:

```tsx
import { useRef } from 'react';
import { useSaveState } from 'react-dockable-desktop';

function MyPanel() {
  const scrollLineRef = useRef(0);

  useSaveState(() => ({ scrollLine: scrollLineRef.current }));

  // ...
}
```

Return `undefined` (or pass `null` instead of a function) to fall back to the panel's static `props` for that save. The returned value is re-checked against the same serializability rule on **every** save — a provider-backed panel's exclusion status can flip from one save to the next. Only meaningful for docked/floating panels; left/right side panels and modals already have a complete, different answer to this (their own `props` argument plus `update(id, …)` on `useModals()` / `useSidePanels()`).

## Instance dedup

```ts
workspace.openPanel('doc-1', 'markdownDocument', { props: { path: '/notes.md' }, dedupeKey: '/notes.md' });
workspace.openPanel('doc-2', 'markdownDocument', { dedupeKey: '/notes.md' }); // focuses doc-1 instead — doc-2 never exists
```

Re-opening the exact same `id` already focuses the existing panel rather than duplicating it — `dedupeKey` covers the case where multiple call sites might not agree on the same literal `id` for what is semantically the same entity. When a match is found, the redirect entirely ignores the new call's `id`/`props`.

```ts
workspace.findPanelId('markdownDocument', '/notes.md')  // → the matching panel's id, or null
```

### Floating / docking

```ts
workspace.floatPanel(id, rect?)                   // detach to floating window
workspace.dockPanel(id, targetLeafId?)            // dock back to grid
workspace.maximizePanel(id)                       // maximize floating window (restores + floats a minimized one)
workspace.dockPanelToGroup(id, leafId, position)  // dock into a group, or split it ('center' | 'left' | 'right' | 'top' | 'bottom')
workspace.dockPanelToWorkspaceEdge(id, side)      // dock along an outer edge of the workspace
workspace.movePanelOrder(id, leafId, index)       // re-order a tab (or move it into another group)
await workspace.closeLeafGroup(leafId, { onConfirm? }) // close every tab in a group, then the group
```

The panel that was moved becomes the active one, and each of these publishes `layout:changed`.

`closeLeafGroup` closes each tab the way its own × does: a close guard can refuse, and a dirty tab stays open unless `onConfirm` resolves `true`. A tab that stays open keeps its group. The returned promise settles once every tab has been dealt with.

### Layout serialization

```ts
const json = workspace.saveLayout();              // → JSON string
workspace.loadLayout(json);                       // restore from JSON string
```

### Query methods

```ts
workspace.isOpen(id)                        // → boolean — is this panel currently open?
workspace.getOpenPanelIds()                 // → string[] — IDs of all open panels
workspace.findPanelId(componentKey, dedupeKey) // → string | null — see Instance dedup above
```

### Event bus

```ts
workspace.publish('my-event', { value: 42 });
const unsubscribe = workspace.subscribe('my-event', (data) => console.log(data));
```

### Typed event bus

Pass a custom event map as the generic type parameter to get fully-typed `publish` and `subscribe` calls:

```ts
interface AppEvents {
  'layer:toggle':  { layerId: string; visible: boolean };
  'selection:set': { ids: string[] };
}

const workspace = createWorkspace<AppEvents>({ panels: { ... } });

workspace.publish('layer:toggle', { layerId: 'markers', visible: true }); // typed ✓
workspace.publish('layer:toggle', { wrong: true });                        // TS error ✓

// Built-in lifecycle events are also available on typed workspaces:
workspace.subscribe('panel:opened', data => console.log(data.id, data.component));
```

The default (`createWorkspace()` without a type parameter) accepts any string key with `unknown` data. The matching type annotation is `Workspace<AppEvents>`, and `useWorkspace<AppEvents>()` returns the same typed API inside React.

Two more built-in events, added alongside per-panel props:

```ts
// Fires whenever something saveLayout() would capture changes — coalesces open/close/minimize/
// restore/dedupe-redirect into one signal for autosave-style consumers. Does NOT cover a
// useSaveState callback's value changing on its own (that's a pull, unobservable without
// the panel notifying separately), nor resize/split-drag/dock-rearrange (no hooks yet).
workspace.subscribe('layout:changed', () => { /* ... */ });

// Fires from inside saveLayout() itself, only when that call excluded at least one panel.
workspace.subscribe('layout:panels-excluded', data => console.log(data.panels)); // { id, component }[]
```

### Lifecycle convenience methods

```ts
const unsub = workspace.onPanelOpen((id, component) => { /* ... */ });
const unsub = workspace.onPanelClose(id => { /* ... */ });
const unsub = workspace.onPanelMinimize(id => { /* ... */ });
const unsub = workspace.onPanelRestore(id => { /* ... */ });
const unsub = workspace.onLayoutChanged(() => { /* ... */ });
const unsub = workspace.onPanelsExcluded(panels => { /* ... */ });
```

Each returns an unsubscribe function. See [Lifecycle convenience methods](/guide/event-bus#lifecycle-convenience-methods) for patterns.

### Misc

```ts
workspace.setDirection('rtl');
```

## `useWorkspaceState` — state selectors

`useWorkspaceState` is a React hook that reads from the workspace state. Pass a selector to subscribe only to the slice you care about:

```ts
import { useWorkspaceState } from 'react-dockable-desktop';

// No selector — returns the full state. Re-renders on any change.
const state = useWorkspaceState();

// With selector — re-renders only when the selected value changes.
const panelCount  = useWorkspaceState(s => Object.keys(s.panels).length);
const isMapOpen   = useWorkspaceState(s => 'map-1' in s.panels);
const activePanel = useWorkspaceState(s => s.activePanelId);
```

## `RddDesktop` props

`RddDesktop` is the rendering component that draws the grid, tabs, and floating windows. Its full TypeScript type is `RddDesktopProps` — import it when building a wrapper component:

```ts
import type { RddDesktopProps, TaskbarVisibility } from 'react-dockable-desktop';
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `skin` | `string` | `'vscode'` | Built-in visual theme or any custom skin name. Built-ins: `vscode`, `macos`, `chrome`, `slate`, `nord`, `obsidian`, `tokyo`. See [Custom Theming →](/guide/theming). |
| `defaultPanelIcon` | `ReactNode` | — | Fallback icon used when a panel definition has no `icon`. |
| `taskbarVisibility` | `TaskbarVisibility` | `'autohide'` | Controls when the minimized-panels taskbar is shown. `'always'` keeps a permanent strip at the bottom. `'compact'` shows the bar only when at least one panel is minimized. `'autohide'` renders the bar as a full-screen overlay with an 8 px peek strip that expands on pointer-enter; briefly auto-expands for 2 s when a panel is minimized. |
| `contextMenuAdapter` | `ContextMenuAdapter` | the built-in menu | Used only when no context menu is provided above `RddDesktop`. `DockableDesktopProvider` always provides one, so set `contextMenuAdapter` on the provider instead. See [Context Menus →](/guide/context-menus). |
| `animations` | `boolean` | `true` | Enables the library's own transitions/animations (tab hover, dock preview, etc.). Set to `false` to disable them — scoped to only the library's own elements, never the host page's. |

```tsx
<RddDesktop skin="nord" taskbarVisibility="autohide" defaultPanelIcon={<FolderIcon />} />
```

## CSS class overrides

`DockableDesktopProvider` accepts six class props that let you apply custom CSS classes to the overlay containers. The full TypeScript type is `DockableDesktopProviderProps`:

```ts
import type { DockableDesktopProviderProps } from 'react-dockable-desktop';
```

Pass the class names as regular string props:

```tsx
<DockableDesktopProvider
  workspace={workspace}
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

Each workspace has its own `PanelRegistry` instance, `workspace.registry`. There is no global registry, so several independent workspaces can share a page.

```ts
workspace.registry.register('custom-panel', CustomComponent);
```

## Multiple workspaces

You can mount several independent `<DockableDesktopProvider>` trees on the same page, each with its own workspace:

```tsx
const workspaceA = createWorkspace({ panels: { ... } });
const workspaceB = createWorkspace({ panels: { ... } });

<DockableDesktopProvider workspace={workspaceA}>...</DockableDesktopProvider>
<DockableDesktopProvider workspace={workspaceB}>...</DockableDesktopProvider>
```

Inside each tree, `useWorkspace()` returns that tree's workspace. A provider rendered without `workspace` creates an empty one of its own.
