# Migration Guide

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
