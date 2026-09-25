# Migration Guide

## v6.x → v7.0.0

7.0.0 renames the public API to match the rest of the dockable-desktop family
(vue-dockable-desktop, angular-dockable-desktop), and finishes the CSS prefixing started in 5.0.0.
Nothing is deprecated first: every old name is gone in 7.0.0. The TypeScript compiler therefore
finds every call site you missed.

**Requirement:** React 18 or later (`react` and `react-dom` ≥ 18). The 6.x peer range said
16.8, but the library already relied on React 18 APIs.

**What does not change:**
- Every workspace action name and signature: `openPanel`, `closePanel`, `requestClosePanel`,
  `minimizePanel`, `restorePanel`, `floatPanel`, `dockPanel`, `dockPanelToGroup`,
  `dockPanelToWorkspaceEdge`, `maximizePanel`, `focusPanel`, `movePanelOrder`, `closeLeafGroup`,
  `updateSplitSizes`, `updateFloatingPosition`, `isOpen`, `getOpenPanelIds`, `findPanelId`,
  `saveLayout`, `loadLayout`, `publish`, `subscribe`, `setPanelDirty`, `updatePanelTitle`,
  `setDirection`, `showContextMenu`, `registerCloseGuard`, `registerStateProvider`,
  `onPanelOpen`, `onPanelClose`, `onPanelMinimize`, `onPanelRestore`, `onLayoutChanged` and
  `onPanelsExcluded`.
- **Saved layouts.** JSON written by `saveLayout()` in 6.x loads unchanged in 7.0.0, so no data
  migration is needed.
- Every CSS **class** name (`rdd-floating-window`, `rdd-workspace-tab`, …). Only custom
  properties, one data attribute and one global rule change (§5).

This guide is written so an automated agent can apply it in one pass. §1 gives the rules and §2
the order. §3–§5 are the changes: the rename tables in §3 are mechanical, and each rule in §4 and
§5 names what to look for and shows the result. §6 is how to verify.

---

### 1. Rules for applying this guide

1. **Only rename what comes from this library.** An identifier is in scope only if it was
   imported from `'react-dockable-desktop'`, or is a member of a namespace import of it
   (`import * as Rdd from 'react-dockable-desktop'`, then `Rdd.WindowManager`).
   - Never rename an identifier that has the same name but another source. For example, `Toolbar`
     from `@mui/material`, `Sidebar` from a shadcn/ui component or `ContextMenu` from Radix stay as
     they are.
2. **Aliased imports:** change only the imported name, not the alias or its uses.
   `import { Toolbar as DockToolbar } from 'react-dockable-desktop'` becomes
   `import { RddToolbar as DockToolbar } from 'react-dockable-desktop'`. Every `<DockToolbar>` stays.
3. **Unaliased imports:** change the import specifier and every reference to it in that file:
   - JSX opening and closing tags;
   - type positions, generics, `typeof X` and `keyof X`;
   - `React.ComponentProps<typeof X>`;
   - JSDoc `{@link X}`.
4. **Name collisions.** If the new name is already bound in the file (another import, or a local
   declaration such as the app's own `useWorkspace`), import it with an alias. Name the alias with
   an `Rdd` prefix (`useWorkspace as useRddWorkspace`) and rename this library's uses to the alias.
5. **Re-exports:** `export { WindowManager } from 'react-dockable-desktop'` and
   `export type { … } from 'react-dockable-desktop'` are renamed by the same tables. Keep an
   existing `as` alias.
6. **Mocks and tests:** `vi.mock('react-dockable-desktop', …)` and `jest.mock(…)` factories, and
   the `__mocks__/react-dockable-desktop.*` files, return objects keyed by export names. Rename
   those keys with the same tables.
7. **Strings are not identifiers.** Change a string literal only where §5 says so (CSS custom
   properties, the skin attribute). Don't rename words inside user-facing text, comments or
   unrelated strings (a comment that names the 6.x API may be updated). If a string *shows* this library's API to people (a code sample in a docs
   page, a help text), leave it and add a `// TODO(rdd-7): review` next to it for a person.
8. **CSS custom properties:** rename only the exact names listed in §5.1. Never use a pattern such
   as `--sidebar-*`. shadcn/ui defines its own `--sidebar-border`, `--sidebar-foreground` and
   others, and they must not be touched (see §5.1 for how to tell them apart).
9. **Don't edit** `node_modules/`, build output (`dist/`, `build/`, `.next/`), or lockfiles by hand.

### 2. Procedure

1. Check that the working tree is clean. Run `npx tsc --noEmit` and record the existing error
   count, so pre-existing errors can be told apart from migration errors.
2. `npm install react-dockable-desktop@7`
3. Apply the §3 tables to every `.ts`, `.tsx`, `.js`, `.jsx`, `.mts` and `.cts` file, following
   the §1 rules.
4. Apply every §4 rule whose pattern appears in the project.
5. Apply §5 to stylesheets (`.css`, `.scss`, `.sass`, `.less`), CSS-in-JS and TS/JS strings.
6. Verify (§6). Repeat steps 3–5 for anything §6 reports.

---

### 3. Rename tables (one-to-one)

These names change and nothing else about them does: same props, same behaviour, same call
signature. For each row, replace the left name with the right one.

#### 3.1 Components
| 6.x | 7.0.0 |
|---|---|
| `WindowManager` | `RddDesktop` |
| `Sidebar` | `RddSidebar` |
| `SecondarySidebar` | `RddSecondarySidebar` |
| `Toolbar` | `RddToolbar` |
| `ModalStackRenderer` | `RddModals` |
| `ToastContainer` | `RddToasts` |
| `ConfirmationForm` | `RddConfirm` |
| `PanelOverlayRoot` | `RddPanelOverlay` |
| `PanelToolbar` | `RddPanelToolbar` |
| `ToolbarButton` | `RddToolbarButton` |
| `ToolbarToggle` | `RddToolbarToggle` |
| `ToolbarSearchInput` | `RddToolbarSearch` |
| `PanelToolbarSeparator` | `RddToolbarSeparator` |
| `PanelToolbarItem` | `RddToolbarItem` |
| `ToolbarSpacer` | `RddToolbarSpacer` |
| `ToolbarCenter` | `RddToolbarCenter` |
| `PanelFloatingWindow` | `RddFloatingWidget` |

`RddDesktop` has no `contextMenuAdapter` prop: a `<WindowManager contextMenuAdapter={X}>` becomes
`<RddDesktop>`, and `contextMenuAdapter={X}` moves to `<DockableDesktopProvider>`. (In 6.x the
prop on `WindowManager` only took effect when nothing above it provided a context menu, which
`DockableDesktopProvider` always does.)

The **type** `ToolbarItem` (the union of toolbar item configs) and the type `ToolbarSeparator`
keep their names. Only the components that were exported under the `PanelToolbar*` aliases are
renamed.

#### 3.2 Hooks
| 6.x | 7.0.0 |
|---|---|
| `useWindowManagerActions` | `useWorkspace` |
| `useWindowManagerState` | `useWorkspaceState` |
| `useShowContextMenu` | `useContextMenu` |
| `useActivePanelContribution` | `useActiveContribution` |
| `usePanelFloatingWindowManager` | `useFloatingWidgets` |
| `usePredefinedMessages` | `useMessages` |
| `useStyleClasses` | `useHostClasses` |

`useWorkspaceState(selector)` keeps the selector overload. `useWorkspaceState()` with no argument
still returns the whole state.

`useWorkspace()` returns the workspace object itself. Destructuring it is fine
(`const { openPanel } = useWorkspace()`): every method is bound to its workspace. It never
changes identity, so it is safe in dependency arrays.

**Unchanged:** `useSidebar`, `useSidebarTab`, `useToolbar`, `usePanelContribution`,
`usePanelContextMenu`, `useMergedToolbarItems`, `useMergedSidebarTabs`, `useColorScheme`,
`usePanelSize` and `useFormatMessage`.

#### 3.3 Functions and values
| 6.x | 7.0.0 |
|---|---|
| `sidebarSectionToTab` | `sectionToTab` |
| `defaultPredefinedMessages` | `defaultMessages` |

**Unchanged:** `toast`, `formatLabel`, `isSerializable`, `startPointerDrag` and
`computeResizedRect`.

#### 3.4 Types
| 6.x | 7.0.0 |
|---|---|
| `WorkspaceClient` (used as a type) | `Workspace` |
| `WorkspaceClientConfig` | `WorkspaceConfig` |
| `BuiltInPanelEvents` | `BuiltInEvents` |
| `WindowState` | `WorkspaceState` |
| `WindowActions` | `WorkspaceActions` |
| `WindowManagerProviderProps` | `DockableDesktopProviderProps` |
| `PanelRegistryClass` | `PanelRegistry` |
| `FormContainerContract` | `PanelHandle` |
| `PanelInstance` | `OverlayInstance` |
| `PanelState` | `OverlayState` |
| `PanelInstanceId` | `OverlayId` |
| `ManagedWindowConfig` | `ManagedWidget` |
| `PanelFloatingWindowManagerHandle` | `FloatingWidgetsApi` |
| `SidebarHeaderActionButton` | `SidebarActionButton` |
| `SidebarHeaderActionCustom` | `SidebarCustomEntry` |
| `SidebarContextValue` | `SidebarContext` |
| `SidebarTabContextValue` | `SidebarTabContext` |
| `StyleClasses` | `HostClasses` |
| `PredefinedMessageKey` | `MessageKey` |
| `ContextMenuPredefinedMessage` | `MessageDescriptor` |
| `WindowManagerProps` | `RddDesktopProps` |
| `SidebarProps` | `RddSidebarProps` |
| `SecondarySidebarProps` | `RddSecondarySidebarProps` |
| `ToolbarProps` | `RddToolbarProps` |
| `ToastContainerProps` | `RddToastsProps` |
| `ConfirmationFormProps` | `RddConfirmProps` |
| `PanelOverlayRootProps` | `RddPanelOverlayProps` |
| `PanelToolbarProps` | `RddPanelToolbarProps` |
| `ToolbarButtonProps` | `RddToolbarButtonProps` |
| `ToolbarToggleProps` | `RddToolbarToggleProps` |
| `ToolbarSearchInputProps` | `RddToolbarSearchProps` |
| `PanelFloatingWindowProps` | `RddFloatingWidgetProps` |
| `SidePanelRendererProps` | `RddSidePanelsProps` |
| `ContextMenuProps` | `RddContextMenuProps` |

`PanelState` means something different in 7.0.0: it is the panel's own state (`'docked'`,
`'floating'` or `'minimized'`), as in the other family libraries. Every 6.x use of `PanelState`
referred to the modal/drawer stack and must become `OverlayState`. Rename all of them.

**Unchanged:** `LayoutNode`, `LayoutGridNode`, `LayoutLeafNode`, `PanelInfo`, `FloatingWindow`,
`SerializedLayout`, `OpenPanelOptions`, `SplitOrientation`, `SplitDirection`, `DropPosition`,
`DropTarget`, `FloatAnchor`, `Stretch`, `PanelFloatPlacement`, `ToolbarItem` and all of its
members, `SidebarTab`, `SidebarHandle`, `ToolbarHandle`, `ContextMenuItem` and all of its members,
`ContextMenuHandle`, `ContextMenuAdapter`, `ShowContextMenuOptions`, `MenuItemAction`,
`ToastOptions`, `ToastType`, `ToastPosition`, `ToastFunction`, `ToastAdapter`,
`ResolvedToastOptions`, `ToastPromiseMessages`, `SidePanelOptions`, `ModalOptions`,
`CloseOptions`, `DirtyStateOptions`, `ContainerType`, `PanelTitle`, `PanelContribution`, `PanelSidebarSection`,
`PanelDefinition`, `PanelRegistryEntry`, `MessageFormatter`, `TaskbarVisibility`, `SearchResult`,
`ToolbarVariant`, `ButtonVariant`, `ToolbarPosition`, `ResizeDir`, `ResizeRect`,
`ResizeConstraints` and `PointerDragConfig`.

#### 3.5 Machine-readable map

The same renames as §3.1–§3.4 as JSON, for tooling:

```json
{
  "WindowManager": "RddDesktop", "Sidebar": "RddSidebar", "SecondarySidebar": "RddSecondarySidebar",
  "Toolbar": "RddToolbar", "ModalStackRenderer": "RddModals", "ToastContainer": "RddToasts",
  "ConfirmationForm": "RddConfirm", "PanelOverlayRoot": "RddPanelOverlay", "PanelToolbar": "RddPanelToolbar",
  "ToolbarButton": "RddToolbarButton", "ToolbarToggle": "RddToolbarToggle", "ToolbarSearchInput": "RddToolbarSearch",
  "PanelToolbarSeparator": "RddToolbarSeparator", "PanelToolbarItem": "RddToolbarItem",
  "ToolbarSpacer": "RddToolbarSpacer", "ToolbarCenter": "RddToolbarCenter", "PanelFloatingWindow": "RddFloatingWidget",
  "useWindowManagerActions": "useWorkspace", "useWindowManagerState": "useWorkspaceState",
  "useShowContextMenu": "useContextMenu", "useActivePanelContribution": "useActiveContribution",
  "usePanelFloatingWindowManager": "useFloatingWidgets", "usePredefinedMessages": "useMessages",
  "useStyleClasses": "useHostClasses", "sidebarSectionToTab": "sectionToTab",
  "defaultPredefinedMessages": "defaultMessages",
  "WorkspaceClientConfig": "WorkspaceConfig", "BuiltInPanelEvents": "BuiltInEvents",
  "WindowState": "WorkspaceState", "WindowActions": "WorkspaceActions",
  "WindowManagerProviderProps": "DockableDesktopProviderProps", "PanelRegistryClass": "PanelRegistry",
  "FormContainerContract": "PanelHandle", "PanelInstance": "OverlayInstance", "PanelState": "OverlayState",
  "PanelInstanceId": "OverlayId", "ManagedWindowConfig": "ManagedWidget",
  "PanelFloatingWindowManagerHandle": "FloatingWidgetsApi",
  "SidebarHeaderActionButton": "SidebarActionButton", "SidebarHeaderActionCustom": "SidebarCustomEntry",
  "SidebarContextValue": "SidebarContext", "SidebarTabContextValue": "SidebarTabContext",
  "StyleClasses": "HostClasses", "PredefinedMessageKey": "MessageKey",
  "ContextMenuPredefinedMessage": "MessageDescriptor",
  "WindowManagerProps": "RddDesktopProps", "SidebarProps": "RddSidebarProps",
  "SecondarySidebarProps": "RddSecondarySidebarProps", "ToolbarProps": "RddToolbarProps",
  "ToastContainerProps": "RddToastsProps", "ConfirmationFormProps": "RddConfirmProps",
  "PanelOverlayRootProps": "RddPanelOverlayProps", "PanelToolbarProps": "RddPanelToolbarProps",
  "ToolbarButtonProps": "RddToolbarButtonProps", "ToolbarToggleProps": "RddToolbarToggleProps",
  "ToolbarSearchInputProps": "RddToolbarSearchProps", "PanelFloatingWindowProps": "RddFloatingWidgetProps",
  "SidePanelRendererProps": "RddSidePanelsProps", "ContextMenuProps": "RddContextMenuProps"
}
```

These names are **not** in the map, because their change depends on how they're used. Handle them
with the §4 rule shown:

| 6.x name | Rule |
|---|---|
| `WorkspaceClient` (as a value) | §4.1 |
| `WindowManagerProvider`, `PanelProvider`, `ToolbarProvider`, `PanelContributionProvider`, `ContextMenuProvider`, `DefaultContextMenuAdapter` | §4.2 |
| `ContextMenu` | §4.3 |
| `SidePanelRenderer`, `LeftPanelRenderer`, `RightPanelRenderer` | §4.4 |
| `usePanelActions`, `usePanelState`, `PanelActions` | §4.5 |
| `useFormContainer`, `usePanelId`, `FormContainerContext`, `FormContainerProvider` | §4.6 |
| `usePanelFloatingWindow`, `UsePanelFloatingWindowReturn` | §4.7 |
| `useRegistry`, `usePanelContext` | §4.8 |
| `PanelRegistry` (the global singleton) | §4.9 |

---

### 4. Structural changes

#### 4.1 `new WorkspaceClient(…)` → `createWorkspace(…)`

**Look for:** `new WorkspaceClient`.

```ts
// 6.x
import { WorkspaceClient } from 'react-dockable-desktop';
export const workspace = new WorkspaceClient<AppEvents>({ panels, predefinedMessages });

// 7.0.0
import { createWorkspace } from 'react-dockable-desktop';
export const workspace = createWorkspace<AppEvents>({ panels, messages });
```

- **Config:** the `predefinedMessages` key is renamed to `messages`. Every other config key is
  unchanged.
- **Type annotations:** a variable annotated `WorkspaceClient<AppEvents>` becomes
  `Workspace<AppEvents>` (§3.4).
- **Methods:** every method keeps its name and signature. The `registry` property is unchanged.
- **Before mount:** `createWorkspace()` returns a live store. Calls made before
  `<DockableDesktopProvider>` mounts now apply immediately instead of being queued. Code that
  worked in 6.x keeps working, so no edit is needed. Delete any comment that says calls are
  queued.
- **Internals:** `_connect` and `_disconnect` are gone. If the project calls them (usually only in
  tests), delete those calls; the provider no longer needs them.
- **Event maps:** an `interface AppEvents { … }` event map is accepted as-is. 6.3.2 had already
  fixed the TS2344 error, so there's no need to convert it to a `type`.

#### 4.2 Providers: `DockableDesktopProvider` is the only one

**Look for:** `client=`, `<WindowManagerProvider`, `<PanelProvider`, `<ToolbarProvider`,
`<PanelContributionProvider` and `<ContextMenuProvider`.

1. On `<DockableDesktopProvider>`, rename the prop `client=` to `workspace=`, and the prop
   `predefinedMessages=` to `messages=`. The other props are unchanged: `formatMessage`, `dir`,
   `modalClass`, `modalBodyClass`, `sidePanelClass`, `sidePanelBodyClass`, `windowClass`,
   `windowBodyClass`, `zIndexBase` and `contextMenuAdapter`.
2. Replace `<WindowManagerProvider …props>` with `<DockableDesktopProvider …props>`, applying the
   prop renames from step 1. It accepts every prop the old provider did.
3. If `<PanelProvider>`, `<ToolbarProvider>` or `<PanelContributionProvider>` wraps or sits inside
   the provider from step 2, delete the element and keep its children.
4. A `<ContextMenuProvider adapter={X} …>` wrapping a `<DockableDesktopProvider>`: delete the
   element, keep its children, and add `contextMenuAdapter={X}` to `DockableDesktopProvider`.
   Move its other props (`theme`, `onOpenChange`, `className`, `style`, …) to an
   `<RddContextMenu>` inside the provider only if the project sets them. Otherwise drop them.
5. Replace `DefaultContextMenuAdapter` with nothing: leave `contextMenuAdapter` out. It's still
   the default.
6. A `<ContextMenuProvider>` used **without** a workspace (a standalone menu) is covered by §4.3.

```tsx
// 6.x
<WindowManagerProvider client={ws} predefinedMessages={msgs}>
  <PanelProvider>
    <WindowManager />
  </PanelProvider>
</WindowManagerProvider>

// 7.0.0
<DockableDesktopProvider workspace={ws} messages={msgs}>
  <RddDesktop />
</DockableDesktopProvider>
```

For several workspaces on one page, use one `<DockableDesktopProvider workspace={…}>` per
workspace, as before.

#### 4.3 Standalone context menu → `<RddContextMenu>`

**Look for:** `<ContextMenuProvider` with no `DockableDesktopProvider` around it, or
`<ContextMenu ref=`.

```tsx
// 6.x: provider form
<ContextMenuProvider adapter={myAdapter} theme="light">
  <MyCanvas />            {/* calls useShowContextMenu() */}
</ContextMenuProvider>

// 7.0.0
<RddContextMenu adapter={myAdapter} theme="light">
  <MyCanvas />            {/* calls useContextMenu() */}
</RddContextMenu>
```

```tsx
// 6.x: imperative form
const ref = useRef<ContextMenuHandle>(null);
<ContextMenu ref={ref} />

// 7.0.0: same handle type and methods
const ref = useRef<ContextMenuHandle>(null);
<RddContextMenu ref={ref} />
```

#### 4.4 Side-panel renderers → `<RddSidePanels>`

**Look for:** `SidePanelRenderer`, `LeftPanelRenderer` and `RightPanelRenderer`.

| 6.x | 7.0.0 |
|---|---|
| `<SidePanelRenderer defaultWidth={w} />` | `<RddSidePanels defaultWidth={w} />` (both sides) |
| `<LeftPanelRenderer defaultWidth={w} />` | `<RddSidePanels side="left" defaultWidth={w} />` |
| `<RightPanelRenderer defaultWidth={w} />` | `<RddSidePanels side="right" defaultWidth={w} />` |

A tree that renders `SidePanelRenderer` *and* a `Left…`/`RightPanelRenderer` renders that side's
drawer twice (it did in 6.x as well). Replace the pair with one `<RddSidePanels />` per side, each
keeping the props that applied to it:

```tsx
// 6.x
<SidePanelRenderer />
<LeftPanelRenderer defaultWidth={320} />

// 7.0.0
<RddSidePanels side="right" />
<RddSidePanels side="left" defaultWidth={320} />
```

#### 4.5 `usePanelActions()` / `usePanelState()` → `useModals()` + `useSidePanels()`

**Look for:** `usePanelActions` and `usePanelState`.

Map each member used on the old object to the new hook. If a component uses both kinds, call both
hooks.

| 6.x member | 7.0.0 |
|---|---|
| `openModal(C, props, opts)` | `useModals().open(C, props, opts)` |
| `closeAllModals()` | `useModals().closeAll()` |
| `openLeftPanel(C, props, opts)` | `useSidePanels().openLeft(C, props, opts)` |
| `openRightPanel(C, props, opts)` | `useSidePanels().openRight(C, props, opts)` |
| `close(id)` | `close(id)` on the hook for that overlay's kind. If the id can be either kind, call both; closing an unknown id does nothing |
| `closeAll()` | `useModals().closeAll()` **and** `useSidePanels().closeAll()` |
| `getInstance(id)` | `get(id)` on the hook for that kind |
| `updateInstance(id, u)` | `update(id, u)` on the hook for that kind |
| `setDirty(id, d, o)` | `setDirty(id, d, o)` on the hook for that kind |
| `registerCloseHandler(id, h)` / `unregisterCloseHandler(id)` | Removed. Inside the overlay's content component, call `useBeforeClose(h)` (§4.6) |
| `usePanelState().modals` | `useModals().stack` |
| `usePanelState().leftPanel` / `.rightPanel` | `useSidePanels().left` / `.right` |

Each hook's return value is typed `ModalsApi` or `SidePanelsApi`. Replace a `PanelActions` type
annotation with whichever one the value comes from. A `PanelState` annotation on the value
`usePanelState()` returned has no single replacement — drop it, and type what you read from it:
`OverlayInstance[]` for `useModals().stack`, `OverlayInstance | null` for `useSidePanels().left` /
`.right`. (`OverlayState` still names the whole `{ leftPanel, rightPanel, modals }` shape.)

```tsx
// 6.x
const { openModal, openLeftPanel } = usePanelActions();

// 7.0.0
const { open: openModal } = useModals();
const { openLeft: openLeftPanel } = useSidePanels();
```

Destructuring with the old names as aliases, as above, keeps the rest of the component unchanged.
Prefer it for a one-shot migration.

#### 4.6 Panel contract: `useFormContainer()` → `usePanel()` and lifecycle hooks

**Look for:** `useFormContainer`, `usePanelId`, `FormContainerContext` and
`FormContainerProvider`.

`usePanel()` works everywhere `useFormContainer()` did: panels, floating windows, modals and
drawers. It returns a `PanelHandle`.

| 6.x (`useFormContainer()` member) | 7.0.0 |
|---|---|
| `instanceId` | `usePanel().id` |
| `usePanelId()` | `usePanel().id` |
| `containerType` | `usePanel().containerType` (now updates live) |
| `requestClose(opts)` | `usePanel().close(opts)` |
| `requestMinimize()` | `usePanel().minimize()` |
| `setDirty`, `setTitle`, `setIcon` | unchanged, on `usePanel()` |
| `getDimensions()` | `usePanelSize()` (same `{ width, height } \| null` value) |
| `onCloseRequested(guard)` | `useBeforeClose(guard)` |
| `registerStateProvider(fn)` | `useSaveState(fn)` |
| `onActivate`, `onDeactivate`, `onMinimize`, `onRestore`, `onClose`, `onResize`, `onContainerTypeChange` | `usePanelEvents({ onActivate, onDeactivate, onMinimize, onRestore, onClose, onResize, onContainerTypeChange })` |

The three hooks `useBeforeClose`, `useSaveState` and `usePanelEvents`:
- are called at the top level of the component, like any hook, and clean up automatically;
- always call the **latest** function passed in, so there's no dependency array and no stale
  closure;
- each callback runs at exactly the moment the old subscription fired;
- `usePanelEvents` takes only the callbacks you pass.

To register conditionally, pass `null`: `useBeforeClose(isDirty ? guard : null)`.

**Rewrite pattern:** a `useEffect` whose body only returns a subscription becomes the hook call.
Delete the effect.

```tsx
// 6.x
const fc = useFormContainer();
useEffect(() => fc.onCloseRequested(async () => confirmDiscard()), [fc]);
useEffect(() => fc.registerStateProvider?.(() => ({ query })), [fc, query]);
useEffect(() => {
  const offA = fc.onActivate?.(() => resume());
  const offD = fc.onDeactivate?.(() => pause());
  return () => { offA?.(); offD?.(); };
}, [fc]);
const close = () => fc.requestClose({ force: true });

// 7.0.0
const panel = usePanel();
useBeforeClose(async () => confirmDiscard());
useSaveState(() => ({ query }));
usePanelEvents({ onActivate: () => resume(), onDeactivate: () => pause() });
const close = () => panel.close({ force: true });
```

**Conditional registration.** Code like
`useEffect(() => { if (!dirty) return; return fc.onCloseRequested(g); }, [dirty])` becomes
`useBeforeClose(dirty ? g : null)`.

**An effect that does other setup as well** (creates a map, opens a socket) and subscribes along
the way: take only the subscriptions out, into a top-level `usePanelEvents` / `useBeforeClose` /
`useSaveState` call, and keep the rest of the effect. The hook is registered for the component's
whole life, not only once the setup has run, so a callback that relies on that setup must check
for it (`if (!mapRef.current) return;`). Leave a `// TODO(rdd-7): review` there.

**A callback with its own state** — a `throttle(…)` or `debounce(…)` created inline — must not be
re-created on every render, or it stops throttling: the hooks always call the *latest* function.
Create it once (`useMemo(() => throttle(fn, 100), [])` or a `useRef`) and pass that.

**Not mechanical, so flag it for a person.** If a subscription is created inside an event
handler, a promise or a loop (not directly in an effect), move it to a top-level hook call guarded
by state. Leave a `// TODO(rdd-7): review` comment at the site.

**Tests that provided a fake container:** code that rendered
`<FormContainerProvider value={fake}>` or `<FormContainerContext.Provider value={fake}>` should
render the component inside `<DockableDesktopProvider workspace={createWorkspace()}>` and open it
as a panel instead. Don't replace the fake with a hand-built `PanelHandle` object: the 7.0.0
context isn't exported.

#### 4.7 `usePanelFloatingWindow()` → `useState`

**Look for:** `usePanelFloatingWindow(` (this is not `usePanelFloatingWindowManager`, which is in
§3.2).

```tsx
// 6.x
const win = usePanelFloatingWindow();
<button onClick={win.open}>Show</button>
<PanelFloatingWindow open={win.isOpen} onClose={win.close} … />

// 7.0.0
const [isOpen, setIsOpen] = useState(false);
<button onClick={() => setIsOpen(true)}>Show</button>
<RddFloatingWidget open={isOpen} onClose={() => setIsOpen(false)} … />
```

Add `useState` to the file's React import if it isn't already there.

#### 4.8 `useRegistry()` and `usePanelContext()` → `useWorkspace()`

| 6.x | 7.0.0 |
|---|---|
| `const registry = useRegistry()` | `const { registry } = useWorkspace()` |
| `const { publish, subscribe } = usePanelContext()` | `const { publish, subscribe } = useWorkspace()` |

With an app event map, pass it as the type argument so payloads stay typed:
`useWorkspace<AppEvents>()` (the same map `createWorkspace<AppEvents>()` was given). Import the map
with `import type { AppEvents } from …` — it is often declared next to the workspace, which in
turn imports the panels, and a type-only import can't create a runtime import cycle. Without one,
`subscribe` callbacks receive `unknown` — where a 6.x callback annotated its payload
(`(data: { layerId: string }) => …`), add the type argument rather than casting.

#### 4.9 Global `PanelRegistry` singleton → the workspace's registry

**Look for:** `PanelRegistry.register(`, `PanelRegistry.get(` and other calls on the imported
`PanelRegistry` value.

In 7.0.0, `PanelRegistry` is the class, and the global instance is gone. Move each registration
into the workspace:

```ts
// 6.x
PanelRegistry.register('map', MapPanel, { title: 'Map' });

// 7.0.0: preferred, declared with the workspace
createWorkspace({ panels: { map: { component: MapPanel, defaultOptions: { title: 'Map' } } } });
// or, where the workspace is in scope
workspace.registry.register('map', MapPanel, { title: 'Map' });
```

If the file that calls `PanelRegistry.register` can't reach the workspace, export the workspace
from where it's created (the usual pattern) and import it.

**An app that never created a workspace** — a bare `<DockableDesktopProvider>` (or
`WindowManagerProvider`) with no `client`, and panels registered on the global `PanelRegistry` at
start-up — needs one now: add a module that exports it, pass it to the provider, and move the
registrations into it.

```ts
// workspace.ts (new)
import { createWorkspace } from 'react-dockable-desktop';
export const workspace = createWorkspace({ panels: { map: { component: MapPanel } } });

// App.tsx
<DockableDesktopProvider workspace={workspace}> … </DockableDesktopProvider>
```

Reads of the registry inside components — `PanelRegistry.get(id)`, `PanelRegistry.getRegisteredIds()`
— become `useWorkspace().registry.get(id)` and so on.

---

### 5. CSS changes

#### 5.1 Custom properties get the `--rdd-` prefix

Rename exactly these 36 names, and no others:

| 6.x | 7.0.0 |
|---|---|
| `--bg-drop-hover` | `--rdd-bg-drop-hover` |
| `--sidebar-badge-bg`, `--sidebar-badge-text`, `--sidebar-bg`, `--sidebar-border`, `--sidebar-btn-front-bg`, `--sidebar-btn-front-border`, `--sidebar-btn-front-hover-bg`, `--sidebar-btn-front-text`, `--sidebar-btn-hover-bg`, `--sidebar-card-active-bg`, `--sidebar-card-active-border`, `--sidebar-card-active-shadow`, `--sidebar-card-bg`, `--sidebar-card-border`, `--sidebar-card-hover-bg`, `--sidebar-card-hover-border`, `--sidebar-drawer-header-bg`, `--sidebar-tabs-bg`, `--sidebar-text-muted`, `--sidebar-text-title` | the same name with `--rdd-` in front of `sidebar`: `--rdd-sidebar-badge-bg`, … |
| `--tab-accent-bar-width`, `--tab-btn-active-bg`, `--tab-btn-active-glow`, `--tab-btn-active-radius`, `--tab-btn-active-shadow`, `--tab-btn-active-width`, `--tab-icon-active`, `--tab-icon-inactive` | `--rdd-tab-accent-bar-width`, … |
| `--toolbar-accent-bar-width`, `--toolbar-btn-active-glow`, `--toolbar-btn-active-shadow`, `--toolbar-btn-hover-bg`, `--toolbar-btn-radio-active-bg`, `--toolbar-btn-toggle-active-bg`, `--toolbar-separator-color` | `--rdd-toolbar-accent-bar-width`, … |

**Where to rename:**
- in stylesheets, both declarations (`--sidebar-bg: …`) and uses (`var(--sidebar-bg)`);
- in CSS-in-JS;
- in TS/JS strings passed to `style.setProperty` / `getPropertyValue`;
- as keys of an inline `style` object (`'--sidebar-bg': …`).

**Which occurrences belong to this library.** shadcn/ui and other kits define variables with the
same spelling, notably `--sidebar-border`. An occurrence belongs to this library only if one of
these is true:
- it's declared inside a rule whose selector contains `[data-workspace-skin`,
  `[data-color-scheme`, or a class starting with `rdd-`;
- it's used inside such a rule;
- it's set on an element that this library renders.

Leave every other occurrence alone. If a single declaration serves both (rare), duplicate it:
keep the original and add the `--rdd-` copy next to it.

#### 5.2 `data-workspace-skin` → `data-rdd-skin`

The `skin` prop is unchanged. The attribute it writes is renamed. Update:
- CSS attribute selectors: `[data-workspace-skin="x"]` → `[data-rdd-skin="x"]`;
- `querySelector`/`closest` strings;
- `getAttribute`/`setAttribute('data-workspace-skin'…)`;
- `dataset.workspaceSkin` → `dataset.rddSkin`.

`data-color-scheme` is **not** renamed.

#### 5.3 The stylesheet no longer styles `html`, `body` and `#root`

6.x shipped `html, body, #root { margin:0; padding:0; width:100%; height:100%; overflow:hidden }`.
7.0.0 doesn't. Apply exactly one of the following:

- **(a) The workspace fills the browser window.** Most apps: the provider or `RddDesktop` is
  rendered at the top of the app, and nothing else on the page is meant to scroll. Add this rule,
  unchanged, to the app's global stylesheet (the one imported first, e.g. `index.css` or
  `globals.css`):

  ```css
  html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  ```

  If the app's root element isn't `#root` (for example `#app` or `#__next`), use that id; if you
  can't tell, use `#root`. An app
  with no stylesheet of its own gets one (imported from its entry file), or a `<style>` element in
  its `index.html`; several apps sharing one stylesheet need the rule only once.
- **(b) The workspace is embedded in part of a scrolling page.** Add nothing. If the project had
  CSS fighting the old rule (for example `html, body { overflow: auto !important }` or
  `height: auto`), delete it: it's no longer needed.

Instead of (a), a new project can put the class `rdd-fill-viewport` on the element that wraps the
desktop (it sets the height and `overflow`; the page still needs `body { margin: 0 }`).

Variables this library dropped in 5.0 (`--bg-primary`, `--bg-workspace`, `--text-primary`, … —
unprefixed names not in §5.1) have had no effect since then; they are outside this migration.

#### 5.4 Classes

No class is renamed. Don't change any `rdd-*` class in stylesheets or code.

---

### 6. Verification

Run every check. The migration is done when all pass.

1. **Compiler:** `npx tsc --noEmit` shows no new errors compared with the count recorded in §2.
   Every removed 6.x export is a compile error, so this check finds anything §3/§4 missed. For a
   plain JavaScript project, run the bundler build instead and check for missing-export errors.
2. **Imports:** every import from `'react-dockable-desktop'` uses only 7.0.0 names. Search for any
   old name from §3 or §4 inside an import from this package:

   ```sh
   rg -n -U --pcre2 "import\s+(type\s+)?(\w+\s*,\s*)?\{[^}]*\b(WindowManager|WindowManagerProvider|WorkspaceClient|Sidebar|SecondarySidebar|Toolbar|ToolbarButton|ToolbarToggle|ToolbarSearchInput|PanelToolbarSeparator|PanelToolbarItem|ToolbarSpacer|ToolbarCenter|PanelToolbar|PanelOverlayRoot|PanelFloatingWindow|SidePanelRenderer|LeftPanelRenderer|RightPanelRenderer|ModalStackRenderer|ToastContainer|ConfirmationForm|ContextMenuProvider|ContextMenu|DefaultContextMenuAdapter|PanelProvider|ToolbarProvider|PanelContributionProvider|FormContainerContext|FormContainerProvider|useFormContainer|usePanelId|usePanelActions|usePanelState|usePanelFloatingWindow|usePanelFloatingWindowManager|useRegistry|usePanelContext|useWindowManagerState|useWindowManagerActions|useShowContextMenu|useActivePanelContribution|usePredefinedMessages|useStyleClasses|sidebarSectionToTab|defaultPredefinedMessages)\b[^}]*\}\s*from\s*['\"]react-dockable-desktop['\"]|import\s+\w+\s*(,\s*\{[^}]*\}\s*)?from\s*['\"]react-dockable-desktop['\"]" . --glob '!node_modules' --glob '*.{ts,tsx,js,jsx,mts,cts}'
   ```

   It must print nothing. The first alternative finds an old name inside the braces of an import
   from this package, including imports that span several lines (`-U`). The second finds a
   default import from this package, which it has never had.

   Types appear in this search only if they're listed here. `tsc` (check 1) catches the type
   renames from §3.4.
3. **CSS:** these searches must print nothing that belongs to this library (§5.1 says how to tell).
   A hit that belongs to another kit (such as shadcn/ui) is fine.

   ```sh
   rg -n "data-workspace-skin|workspaceSkin" . --glob '!node_modules'
   rg -n --glob '!node_modules' -e "--(bg-drop-hover|sidebar-(badge|bg|border|btn|card|drawer|tabs|text)|tab-(accent|btn|icon)|toolbar-(accent|btn|separator))" .
   ```
4. **Removed rule:** exactly one §5.3 option was applied, and the project's global stylesheet shows
   it.
5. **Tests:** the project's test suite passes.
6. **Run the app and check that:**
   - the desktop fills its area and a saved layout from 6.x loads;
   - you can open, float, dock, minimize and restore a panel;
   - a modal and a drawer open and close with × and with Escape;
   - a right-click menu opens;
   - a toast shows;
   - a skin passed through `skin=` is applied;
   - in the sidebar and toolbar, colours come from the `--rdd-*` variables.
7. **Review markers:** list every `// TODO(rdd-7): review` left by §4.6, and report them to a
   person.

---

## v5.x → v6.0.0

v6.0.0 removes the library's two remaining content-styling opinions: the fixed body padding on both side panels and modals. A docking library's job is layout mechanics, not content styling — padding is a decision that belongs entirely to whoever fills the panel or modal, and the old fixed `10px` sat at the wrong layer once content needed its own internal scroll+footer layout.

### Breaking changes

1. **`.rdd-side-panel-body`'s default padding changed from `10px` to `0`.** Any `openLeftPanel`/`openRightPanel` content that relied on that outer spacing (rather than supplying its own) now renders edge-to-edge. Restore the old look by passing the new `bodyPadding` option: `openLeftPanel(Component, props, { bodyPadding: 10 })`.
2. **`.rdd-modal-body`'s default padding changed from `10px` to `0`, the same way.** Restore the old look with `openModal(Component, props, { bodyPadding: 10 })`.

### Not breaking

- **`SidePanelOptions.bodyPadding`** and **`ModalOptions.bodyPadding`** (both `number | string`, e.g. `12` or `'10px 16px'`) are the only new fields — purely additive, and every other option (`title`, `icon`, `width`, `size`, `closable`) is unchanged.

### Upgrade steps

1. `npm install react-dockable-desktop@6`
2. For any `openLeftPanel`/`openRightPanel`/`openModal` call whose content assumed the old `10px` outer spacing, add `bodyPadding: 10` to its options (or any other value that fits — this is now yours to decide).

---

## v4.x → v5.0.0

v5.0.0 closes gaps found in two audits: a core-API review, and a framework-agnosticism review (the library's primary users build with Material-UI, React-Bootstrap, Tailwind, and shadcn/ui). Most apps are unaffected by the two hook-related breaking changes below (see why under each), but every app importing `styles.css` is affected by the CSS renames.

### Breaking changes

1. **Five hooks now throw instead of silently degrading.** `useSidebar()`, `useSidebarTab()`, `useToolbar()`, `usePanelContribution()`, `useActivePanelContribution()` used to log a `console.warn` and return a no-op object when called outside their required provider; they now throw, matching every other hook in the library. `DockableDesktopProvider` already wraps every provider these need, so apps using it are unaffected. Only code calling one of these five hooks with **no** ancestor provider at all needs to add one.

2. **Every CSS class and custom property is now prefixed with `rdd-`.** The previous naming was an inconsistent mix of five prefixes (`dw-`, `v2-`, `sb-`, `fw-`, `wm-`) plus many unprefixed classes — including a bare `.active` that collides with Bootstrap's own global `.active` class, and `:root`-scoped design tokens (`--accent-color`, `--bg-primary`, etc.) using the same short-generic-name convention shadcn/ui uses for its own theme tokens. This only affects you if you have custom CSS **overriding the library's internal classes or default variable values** (not if you only use documented props/skins). The demo apps' own classes (`sb-*` and similar) are unaffected — they're sample-app code, not library API.

   The rename follows one mechanical pattern:
   - Classes that had one of the five old prefixes: **the old prefix is replaced** by `rdd-` — e.g. `dw-context-menu` → `rdd-context-menu`, `v2-modal-overlay` → `rdd-modal-overlay`, `fw-corner-zone` → `rdd-corner-zone`, `wm-menu-icon` → `rdd-menu-icon`.
   - Classes that had no prefix: **`rdd-` is prepended** — e.g. `floating-window` → `rdd-floating-window`, `workspace-tab` → `rdd-workspace-tab`, `active` → `rdd-active`, `resizer-bar` → `rdd-resizer-bar`.
   - Every `--custom-property` at `:root` gets `--rdd-` prepended — e.g. `--accent-color` → `--rdd-accent-color`, `--bg-workspace` → `--rdd-bg-workspace`, `--window-opacity` → `--rdd-window-opacity`.

   If you have custom CSS targeting any of the library's classes or variables (skin overrides, `[data-workspace-skin="my-skin"] .some-class { ... }`, or reading/setting one of the default variables), find-and-replace the old name with its `rdd-`-prefixed form. Cross-check against the [Theming guide](./theming) for the current variable reference and [Advanced Topics](./advanced) for the current class names used in the drag-resize example.

3. **The library no longer sets cosmetic page-wide CSS.** Previously, importing `styles.css` set `font-family`/background/text-color on `html, body, #root` and restyled scrollbars on the bare `*` selector — affecting your entire page, not just the workspace. These are now scoped to the workspace's own root element and its descendants only. The `margin`/`padding`/`width`/`height`/`overflow` reset on `html, body, #root` is unchanged, since it's structurally required for `height: 100%` to resolve anywhere in the page — no action needed here.

4. **Animations are now enabled by default.** Previously, every transition/animation on your *entire page* was force-disabled unless `<html>` had an undocumented `enable-animations` class — something only the demo apps' own UI ever set. If you were relying on animations being off by default, pass `<WindowManager animations={false} />`.

5. **`<Sidebar>`'s deprecated `drawerWidth` (string) prop has been removed.** It was deprecated in v3.1.0 in favor of `defaultWidth` (number, pixels) and has been unused internally since. Replace `drawerWidth="280px"` with `defaultWidth={280}`. Separately, `defaultWidth`'s own default (when omitted entirely) changed from `220` to `280` — a better fit for typical drawer content (forms, labeled toggles, card metadata) without feeling cramped.

### Not breaking

- `WorkspaceClient`'s new methods, `SerializedLayout.version`, `startPointerDrag()`/`computeResizedRect()`, `useColorScheme()`, `usePanelSize()`, and `zIndexBase` are all purely additive.
- Layouts saved before this change still load correctly.

### Upgrade steps

1. `npm install react-dockable-desktop@5`
2. If you call any of the five hooks in #1 above outside `DockableDesktopProvider`, wrap them in it (or the specific provider they need).
3. If you have custom CSS targeting the library's classes/variables, apply the rename pattern in #2.
4. If you were relying on animations being off by default with no `enable-animations` class anywhere, pass `<WindowManager animations={false} />`.
5. Replace any `<Sidebar drawerWidth="Npx">` with `<Sidebar defaultWidth={N}>`.

---

## v3.x → v4.0.0

v4.0.0 removes the `replace-react-contexify` peer dependency. The library now ships a built-in `<ContextMenu>` component. All user-facing API is unchanged.

### Breaking changes

1. **`replace-react-contexify` is no longer a peer dependency.** Remove it from your project.
2. **Remove the `replace-react-contexify` CSS import** from your entry file.

### Not breaking

- `ContextMenuItem`, `ContextMenuSimpleItem`, `ContextMenuSeparator`, `ContextMenuSubMenu` are still exported from `react-dockable-desktop` at the same paths. No type changes required.
- `usePanelContextMenu` hook: same signature, same behaviour.
- All `WindowManager` props are unchanged. The new optional `contextMenuAdapter` prop defaults to the built-in implementation.

### Upgrade steps

1. `npm uninstall replace-react-contexify`
2. `npm install react-dockable-desktop@4`
3. In your entry file, delete `import 'replace-react-contexify/styles.css'`
4. Done — no other code changes required.

### New in v4.0.0

- **`<ContextMenu>` component** — exported for use on custom right-click surfaces.
- **`ContextMenuAdapter` interface** — swap in your own context menu implementation via `<WindowManager contextMenuAdapter={...} />`.
- **Skin-aware hover colour** — menu item hover now follows `--toolbar-btn-hover-bg` (the same hover token used by toolbar flyout items) instead of hardcoded VS Code blue.
- See the [Context Menus guide](./context-menus) for full details.

---

## v3.1.x → v3.2.0

v3.2.0 is a **documentation and CSS-only** release. No API was added, removed, or changed. Upgrading requires no code changes.

### What's new

- **Per-skin active state design language** — Sidebar tabs and Toolbar buttons now use a distinct per-skin visual pattern (transparent bar, floating chip, pill, line, neon glow), driven entirely by new CSS design tokens. Fully overridable in custom skins. See [Theming →](./theming#per-skin-active-state-design-language).
- **Documentation overhaul** — All guides updated to reflect the full v3.1.0 API: Toolbar, Sidebar props, resizable drawer, new hooks, `taskbarVisibility`, and more.

### Upgrade steps

1. `npm install react-dockable-desktop@3.2`
2. No code changes required.

### Breaking changes

None.

---

## v3.0.x → v3.1.0

v3.1.0 is **fully backward-compatible** with one small exception: `drawerWidth` (string) on `<Sidebar>` is deprecated in favour of `defaultWidth` (number, pixels).

### What's new

| Feature | What changed |
|---------|-------------|
| **Touch & iPad/Android support** | All drag and resize surfaces use the Pointer Events API. Long-press (300 ms) initiates tab drag on touch; instant capture on mouse/pen as before. Taskbar chips also support hover preview and long-press context menu on touch. |
| **8-direction resize handles** | Floating windows now render N, NE, E, SE, S, SW, W, NW resize handles. |
| **Smart resizer hit areas** | The horizontal split resizer's grab zone extends only upward, eliminating accidental activation when clicking tabs below. |
| **`taskbarVisibility` prop** | `<WindowManager taskbarVisibility="always" />` — three modes: `'always'` (permanent bar, new default), `'compact'` (show only with minimized panels), `'autohide'` (overlay with 8 px peek strip). |
| **`<Toolbar>` component** | New vertical/horizontal strip hosting `action`, `radio`, `toggle`, `group`, and `separator` items. State lives in `DockableDesktopProvider`; `useToolbar()` reads/writes from any panel. See [Toolbar →](./toolbar). |
| **`ToolbarGroupItem` (`type: 'group'`)** | Collapsed tool-family button with a sub-tool flyout. Supports uncontrolled and controlled (`activeItemId` / `onActiveItemChange`) modes. |
| **Sidebar `visible` / `stripVisible`** | `visible` collapses the entire sidebar; `stripVisible` collapses only the activity bar strip. Both accept paired callbacks. |
| **Resizable Sidebar drawer** | Users can drag the drawer edge to resize it. Props: `defaultWidth` (px), `minWidth`, `maxWidth`, `onWidthChange`. `drawerWidth` (string) is deprecated. |
| **`SidebarHandle` additions** | `showStrip()`, `hideStrip()`, `setWidth(px)`, `getWidth()` added to the imperative ref. |
| **`useSidebar()` hook** | Programmatic Sidebar control from any component in the tree — no ref or prop drilling. |
| **`useSidebarTab()` hook** | Self-control for content inside a Sidebar tab: `tabId`, `onOpen`, `onClose`, `openTab`. |
| **`usePanelContextMenu()` hook** | Inject dynamic right-click context menu items into a panel from inside the panel component. |
| **Skin scope fix** | `data-workspace-skin` is now applied to `document.documentElement` so Toolbar and Sidebar always inherit the correct skin. |

### Deprecated

| Deprecated | Replacement |
|---|---|
| `<Sidebar drawerWidth="280px">` | `<Sidebar defaultWidth={280}>` — number (pixels). The old string prop still works but will be removed in a future major. |

### Upgrade steps

1. `npm install react-dockable-desktop@3.1`
2. Optionally replace `drawerWidth="280px"` → `defaultWidth={280}`.
3. No other changes required.

### Breaking changes

None.

---

## v2.x → v3.0.0

v3.0.0 is **fully backward-compatible** — no existing API was removed or changed. All additions are opt-in.

### What's new

| Feature | What changed |
|---------|-------------|
| **StrictMode compatibility** | `focusPanel` is now idempotent; calling it twice no longer double-increments z-index. `WorkspaceClient` guards against StrictMode's double `_connect` cycle. |
| **CSS height warning** | `console.warn` fires in development when the workspace container height is near zero (missing `height: 100%` CSS). |
| **Missing-client error** | Upgraded from `console.warn` (dev-only) to `console.error` (always). Fires after 5 s in production, 1 s in development. |
| **State selectors** | `useWindowManagerState()` now accepts an optional selector. Components only re-render when the selected slice changes. |
| **Lifecycle callbacks** | `WorkspaceClient` exposes `onPanelOpen`, `onPanelClose`, `onPanelMinimize`, `onPanelRestore` convenience methods. |
| **`DockableDesktopProvider`** | New composite provider that wraps `WindowManagerProvider` + `PanelProvider` in the correct order. |
| **`usePanelId()` hook** | Any component rendered inside a panel can call `usePanelId()` to discover its own panel instance ID — no prop needed. |
| **Typed event bus** | `WorkspaceClient<TUserEvents>` is now generic. `publish` and `subscribe` are fully typed when you supply an event map. |

### Upgrade steps

1. Bump the package: `npm install react-dockable-desktop@3`
2. Optionally replace `<WindowManagerProvider> + <PanelProvider>` nesting with `<DockableDesktopProvider>`.
3. No further changes required.

### Breaking changes

None.

---

## v1.x → v2.0.0

## Overview

v2.0.0 introduces breaking API changes to clean up the public surface of `WindowActions` and `WorkspaceClient`. The changes are mechanical — find-and-replace in most cases.

## Breaking changes

### 1. `bringToFront` renamed to `focusPanel`

`bringToFront` was misleading for docked panels (it selects a tab, not a window z-index). The new unified method is `focusPanel`, which works correctly for both floating and docked panels.

```ts
// v1.x
actions.bringToFront('my-panel');
client.bringToFront('my-panel');

// v2.0.0
actions.focusPanel('my-panel');
client.focusPanel('my-panel');
```

### 2. `setActivePanel` removed from public API

`setActivePanel` was an internal tab-focus primitive that leaked into the public interface. It has been removed from `WindowActions`.

If you were using it to select a tab, use `focusPanel` instead:

```ts
// v1.x
actions.setActivePanel('my-panel');

// v2.0.0 — focusPanel covers this use case
actions.focusPanel('my-panel');
```

## New features in v2.0.0

- **`focusPanel(id)`** — unified activate method for floating and docked panels
- **`isOpen(id): boolean`** — query whether a panel is currently open
- **`getOpenPanelIds(): string[]`** — list all open panel IDs
- **Pending-call queue** — calls to `client.openPanel()` etc. before provider mounts are now queued and replayed automatically
- **"Forgot `client` prop" warning** — development warning when a `WorkspaceClient` has queued calls but no provider connects within 1 second
- **Unregistered panel warning** — `console.warn` when `openPanel` references an unregistered component key
- **CSS peer-dep detection** — development warning when `replace-react-contexify` stylesheet is not detected

## Not breaking

- All other `WindowActions` methods are unchanged
- Layout serialization format is unchanged — saved layouts from v1.x load correctly
- `PanelRegistry` global singleton still works for backward compatibility
- All other exports are unchanged
