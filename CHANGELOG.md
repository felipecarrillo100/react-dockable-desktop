# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.2.2] — 2026-08-02

### Fixed
- **RTL corner-anchor positioning inconsistency** — the resize-triggered realignment effect in `WindowManager` recomputed anchored floating windows' position using the raw, un-flipped anchor string, disagreeing with the (already RTL-aware) render-time stacking logic. Anchored windows now derive their visual position entirely from `anchor` + the element's `dir` attribute via CSS logical properties (`insetInlineStart`/`insetInlineEnd`) — both code paths now agree by construction, and switching direction at runtime (e.g. via `setDirection()`) re-mirrors already-anchored windows with no other action needed.

### Changed
- Internal: de-duplicated `flipZoneHorizontal` (previously defined separately in `WindowManager.tsx` and `PanelOverlay.tsx`) into a single shared `src/components/anchorGeometry.ts` module.
- Internal: `PanelFloatingWindow` (Panel Overlay) now sets an explicit `dir` attribute and positions its corner anchor via CSS logical properties, replacing a manual `isRtl`-based left/right flip — consistent with how `PanelToolbar` already positions itself in the same file.

## [4.2.1] — 2026-06-29

### Fixed
- **`showContextMenu` missing from published bundle** — `showContextMenu` on `useWindowManagerActions()` was implemented in source but the 4.2.0 package was published without rebuilding `dist/`. Added `prepublishOnly` script to ensure the bundle is always rebuilt before publishing.

### Added
- **`onActivate` / `onDeactivate` on `FormContainerContract`** — push-based callbacks that fire when a panel becomes or stops being the globally active panel (`state.activePanelId`). Eliminates the need to subscribe to `useWindowManagerState` and compare `activePanelId` from inside each panel. `onDeactivate` also fires when the panel is destroyed while active (before `onClose`). Returns an unsubscribe function.
- **`onContainerTypeChange` on `FormContainerContract`** — fires with the new `ContainerType` whenever the panel transitions between `'dockable-panel'` (docked in the grid) and `'floating-window'` (detached floating window). Does not fire during minimize/restore cycles — use `onMinimize` / `onRestore` for those. Returns an unsubscribe function.
- **`getDimensions()` on `FormContainerContract`** — synchronous getter that returns the current `{ width: number; height: number }` of the panel, or `null` before the first layout. Reads from the same module-level map populated by the existing `ResizeObserver`-backed `onResize` callback.
- **`requestMinimize()` on `FormContainerContract`** — imperative method that minimizes the panel to the taskbar. No-op if the container type does not support minimize. Symmetric counterpart to the existing `requestClose()`.
- **`'floating-window'` value in `ContainerType`** — `containerType` on the contract now correctly reports `'dockable-panel'` for panels docked in the workspace grid and `'floating-window'` for panels in a detached `PanelFloatingWindow`. Previously the field was stuck at `'standalone'` for all dockable panels.

- **Workspace corner anchor zones** — four 80×80 px proximity snap zones appear at each workspace corner during any panel drag (docked tab or floating window). Dropping into a zone anchors the window to that corner; uses the same visual style (dashed accent-color border, `var(--accent-color)`) as the inner panel drop zones.
- **Anchor stacking** — multiple windows anchored to the same corner stack with 8 px gaps, uncapped. Dragging a window away from its corner returns it to free-float.
- **`anchor` option on `openPanel`** — new floating windows can be spawned pre-anchored: `openPanel('id', 'comp', { initialTarget: 'floating', anchor: 'top-right' })`.
- **`anchor` param on `floatPanel`** — `floatPanel(id, rect?, anchor?)` floats and anchors in one atomic call.
- **`defaultAnchor` on `PanelRegistryEntry.defaultOptions`** — sets the default corner for all instances of a registered component; replaces `defaultStickyRight`/`defaultStickyBottom`.
- **RTL corner anchoring** — all corner snap zones and anchor render positions mirror correctly when `dir="rtl"`.
- **RTL inner floating-window drop detection** — `PanelOverlay` inner floating window drop zones now correctly detect the logical corner in RTL mode; dragging no longer drops on the opposite corner.
- **`FloatAnchor` type** — exported from the package root: `import type { FloatAnchor } from 'react-dockable-desktop'`.
- **`toast` singleton** — imperative notification API with `toast()`, `toast.info()`, `toast.success()`, `toast.warning()`, `toast.error()`, `toast.dismiss()`, and `toast.promise()`. Works from anywhere — inside or outside React.
- **`<ToastContainer>`** — portal-rendered notification host. Props: `position` (`top-right` default), `width` (320px default), `maxVisible` (3), `defaultDuration` (5000ms), `defaultClosable`, `pauseOnHover`, `animation` (`slide`/`fade`/`none`), `newestOnTop`, `progressBar`, `adapter`.
- **`ToastAdapter` interface** — delegate all `toast.*` calls to an external notification library (Ant Design, MUI Snackbar, Sonner, etc.) without changing call sites.
- **Toast theming tokens** — `--toast-bg`, `--toast-border`, `--toast-info-color`, `--toast-success-color`, `--toast-warning-color`, `--toast-error-color`, `--dw-toast-offset-top`, `--dw-toast-offset-bottom`. All switch automatically with `[data-color-scheme="light"]`.
- **Toast Notifications guide** — new documentation page covering the full Toast API, positioning, theming, queue behaviour, `toast.promise()`, dedup by id, and the custom adapter pattern.
- **`PanelOverlayRoot`** — context provider and container div for the Panel Overlay system. Coordinates toolbar insets, z-ordering, drag state, drop-zone detection, and managed-window registry for all descendant overlay components.
- **`PanelToolbar`** — panel-scoped toolbar that attaches to any edge of a `PanelOverlayRoot`. Props: `position` (top/bottom/left/right), `variant` (transparent/frosted/solid), `buttonVariant` (ghost/soft/outlined/filled), `buttonSize`. Left/right toolbars auto-inset by the heights of any registered top/bottom toolbars.
- **Toolbar primitives** — `ToolbarButton`, `ToolbarToggle`, `ToolbarSeparator` (exported as `PanelToolbarSeparator`), `ToolbarSpacer`, `ToolbarCenter`, `ToolbarItem` (exported as `PanelToolbarItem`), `ToolbarSearchInput` for composing panel toolbar contents.
- **`PanelFloatingWindow`** — declarative single floating window inside a panel overlay. Props: `id`, `title`, `open`, `onClose`, `defaultAnchor`, `defaultWidth`, `defaultHeight`. Supports 8-direction resize, drag-to-free, drag-to-dock at four corners with smooth stacking transitions.
- **`usePanelFloatingWindow()`** — convenience hook returning `{ isOpen, open, close }` for a single boolean-toggled `PanelFloatingWindow`.
- **`usePanelFloatingWindowManager()`** — imperative hook returning `{ open(id, config), close(id), closeAll(), isOpen(id), openIds }`. Enables dynamically spawning N named floating windows from data or event handlers at runtime.
- **`ManagedWindowConfig`** interface — `{ title: string, content: ReactNode, anchor?: FloatAnchor, width?: number, height?: number }`.
- **`PanelFloatingWindowManagerHandle`** interface — TypeScript type for `usePanelFloatingWindowManager()` return value.
- **Panel Overlay guide** — new documentation page covering the full Panel Overlay system.

### Changed
- Internal: split the monolithic `PanelOverlayCtx` into three focused contexts (`PanelToolbarContext`, `PanelManagerContext`, `PanelOverlayContext`) — each consumer only re-renders on changes to its own slice. `PanelToolbar` no longer re-renders during window drag events; `usePanelFloatingWindowManager` consumers no longer re-render on z-order or drag-state changes.
- Internal: replaced O(n) `isActive` calculation in `FloatingWindowBody` with an O(1) `topId` field set by `focusWindow`.

### Removed
- **`openPanel` options `stickyRight` / `stickyBottom`** — replaced by `anchor?: FloatAnchor | null`. Saved layouts containing the old JSON fields are automatically migrated by `loadLayout`.
- **`PanelRegistryEntry.defaultOptions.defaultStickyRight` / `defaultStickyBottom`** — replaced by `defaultAnchor?: FloatAnchor`.

## [4.2.0] — 2026-06-29

### Added
- **`showContextMenu(options)` on `useWindowManagerActions`** — imperative method to trigger the shared workspace context menu from any panel, including panels in WebGL canvases, side drawers, and modals. Routes through the active `ContextMenuProvider` (managed automatically by `DockableDesktopProvider`). > **Note:** this was inadvertently missing from the 4.2.0 published bundle — use `4.2.1` or later.
- **`contextMenuAdapter` prop on `<DockableDesktopProvider>`** — sets the context menu adapter for the workspace-level `ContextMenuProvider`. Defaults to `DefaultContextMenuAdapter`. All siblings of `<WindowManager>` in the provider tree — `<Sidebar>`, `<SidePanelRenderer>`, `<ModalStackRenderer>` — share the same context menu instance and have access to `ContextMenuContext`.
- **`<ContextMenuProvider adapter? ...>`** — standalone provider that mounts the context menu and exposes it to all descendants via `ContextMenuContext`. Managed automatically by `DockableDesktopProvider` in typical usage; can also be placed manually above `DockableDesktopProvider` for full control. Accepts all `ContextMenuProps` (`formatMessageProvider`, `onShow`, `onHide`, etc.) to configure the mounted adapter.
- **`useShowContextMenu()`** — hook returning the `show` function from the nearest `<ContextMenuProvider>`. Works from any component inside `DockableDesktopProvider` or a standalone `<ContextMenuProvider>`.

### Fixed
- **`ContextMenu` stays open on WebGL canvas click/tap** — The click-outside dismiss listener was registered on `mousedown` in the bubble phase. WebGL gesture controllers (LuciadRIA, MapLibre, Three.js, etc.) call `stopPropagation()` on pointer events to claim the interaction, preventing the bubble-phase handler from ever reaching `document`. Fixed with two complementary listeners: `pointerdown` in capture phase (fires before any canvas handler; covers touch and stylus) and `click` on `window` (synthetic click fires after the full press cycle and survives `stopPropagation` on `mousedown`/`pointerdown`, making it the reliable fallback for WebGL canvases).
- **`ContextMenuProvider` and `useShowContextMenu` exported as type-only** — corrected to value exports so they can be rendered and called at runtime. They were accidentally placed in an `export type {}` block which erases them at build time.

## [4.0.0] — 2026-06-16

### Breaking Changes
- **`replace-react-contexify` peer dependency removed.** The library no longer requires or uses it. Remove the package and delete its CSS import from your entry file. All existing user code continues to work unchanged. See the [v3→v4 migration guide](docs-site/guide/migration.md).

### Added
- **Built-in `<ContextMenu>` component** — zero-dependency, portal-rendered context menu styled with design tokens. Supports simple items, separators, sub-menus (one level), checkbox items, icons, and i18n labels. Viewport-clamped, RTL-aware, Esc-to-close.
- **`ContextMenuAdapter` interface** — strategy pattern for swapping the context menu implementation. Pass `contextMenuAdapter` to `<WindowManager>` to use a custom or design-system menu.
- **`DefaultContextMenuAdapter`** — default adapter wrapping the built-in `<ContextMenu>`.
- **New exports:** `ContextMenu`, `DefaultContextMenuAdapter`, `ContextMenuHandle`, `ShowContextMenuOptions`, `ContextMenuAdapter`, `ContextMenuProps`, `ContextMenuCheckbox`, `ContextMenuLabel`, `MenuItemAction`.
- **Context Menus guide page** — dedicated documentation covering `usePanelContextMenu`, all item shapes, standalone `<ContextMenu>` usage, and the adapter pattern.

### Changed
- Context menu item hover colour now follows `--toolbar-btn-hover-bg` (skin-aware) instead of hardcoded `#094771`, matching the toolbar flyout hover pattern.
- `<WindowManager>` gains optional `contextMenuAdapter` prop (fully backward-compatible; defaults to `DefaultContextMenuAdapter`).

### Removed
- `replace-react-contexify` peer dependency.
- `import 'replace-react-contexify/styles.css'` no longer needed.
- `.react-contexify` CSS override block from `src/index.css`.
- Development warning about missing `replace-react-contexify` stylesheet.

## [3.2.0] — 2026-06-15

### Added
- **Per-skin active state design language** — Sidebar tabs and Toolbar buttons now render a distinct per-skin visual pattern driven entirely by CSS custom properties (`--tab-btn-active-width`, `--tab-btn-active-radius`, `--tab-btn-active-shadow`, `--tab-btn-active-glow`, `--tab-accent-bar-width`, `--toolbar-btn-active-shadow`, `--toolbar-btn-active-glow`, `--toolbar-accent-bar-width`). Seven skins, seven patterns: transparent bar (`vscode`), floating glass chip (`macos`), fluent pill (`slate`), bridge pill (`chrome`), horizontal line indicator (`nord`), inset glow (`obsidian`), neon pulse (`tokyo`). Fully overridable in custom skins. CSS-only, no API changes.

### Changed
- **Documentation overhaul** — All guides updated to reflect the full v3.1.0 API surface: Toolbar group items, Sidebar resize props, new hooks, `taskbarVisibility`, and complete skin token reference.

## [3.1.0] — 2026-06-13

### Added
- **`<Toolbar>` component** — Vertical/horizontal strip hosting `action`, `radio`, `toggle`, `group`, and `separator` items. State lives in `DockableDesktopProvider`; `useToolbar()` reads/writes from any panel.
- **`ToolbarGroupItem` (`type: 'group'`)** — Collapsed tool-family button with a sub-tool flyout. Supports uncontrolled (state in ToolbarContext) and controlled (`activeItemId` / `onActiveItemChange`) modes.
- **Touch & tablet support** — All drag and resize surfaces migrated to the Pointer Events API. Long-press (300 ms) initiates tab drag on touch; instant capture on mouse/pen as before. Taskbar chips support hover preview and long-press context menu on touch devices.
- **8-direction resize handles** — Floating windows now render N, NE, E, SE, S, SW, W, NW resize handles.
- **`taskbarVisibility` prop** — `<WindowManager taskbarVisibility="always" />` with three modes: `'always'` (permanent bar, new default), `'compact'` (show only with minimised panels), `'autohide'` (overlay with 8 px peek strip).
- **Resizable Sidebar drawer** — Users can drag the drawer edge to resize. New props: `defaultWidth` (px), `minWidth`, `maxWidth`, `onWidthChange`.
- **Sidebar `visible` / `stripVisible` props** — `visible` collapses the entire sidebar; `stripVisible` collapses only the activity bar strip. Both accept paired `onVisibilityChange` / `onStripVisibilityChange` callbacks.
- **`SidebarHandle` additions** — `showStrip()`, `hideStrip()`, `setWidth(px)`, `getWidth()` added to the imperative ref.
- **`useSidebar()` hook** — Programmatic Sidebar control (openTab, closeDrawer, getActiveTab) from any component in the tree — no ref or prop drilling required.
- **`useSidebarTab()` hook** — Self-control for content inside a Sidebar tab: `tabId`, `onOpen`, `onClose`, `openTab`.
- **`usePanelContextMenu()` hook** — Inject dynamic right-click context menu items into a panel from inside the panel component. Items are re-read on every menu open; state-driven enable/disable updates automatically.
- **Smart resizer hit areas** — The horizontal split resizer's grab zone now extends only upward, eliminating accidental activation when clicking tabs below.

### Changed
- **Skin scope** — `data-workspace-skin` is now applied to `document.documentElement` so Toolbar and Sidebar always inherit the correct per-skin CSS variables regardless of their DOM position.

### Deprecated
- `<Sidebar drawerWidth="280px">` — use `<Sidebar defaultWidth={280}>` (number, pixels). The old string prop still works but will be removed in a future major release.

## [3.0.0] — 2026-06-12

### Added
- **`DockableDesktopProvider`** — Composite provider that wraps `WindowManagerProvider` + `PanelProvider` in the correct order. Drop-in replacement for manually nesting both providers.
- **`usePanelId()` hook** — Any component rendered inside a panel can call `usePanelId()` to discover its own panel instance ID — no prop needed.
- **State selectors** — `useWindowManagerState()` now accepts an optional selector function. Components only re-render when the selected slice changes.
- **Lifecycle callbacks** — `WorkspaceClient` exposes `onPanelOpen`, `onPanelClose`, `onPanelMinimize`, `onPanelRestore` convenience methods.
- **Typed event bus** — `WorkspaceClient<TUserEvents>` is now generic; `publish` and `subscribe` are fully typed when a user-supplied event map is provided.
- **Pending-call queue** — Calls to `client.openPanel()` etc. before provider mounts are queued and replayed automatically.
- **"Forgot `client` prop" warning** — Development warning when a `WorkspaceClient` has queued calls but no provider connects within 1 second.

### Fixed
- **StrictMode compatibility** — `focusPanel` is now idempotent; calling it twice no longer double-increments z-index. `WorkspaceClient` guards against StrictMode's double `_connect` cycle.
- **CSS height warning** — `console.warn` fires in development when the workspace container height is near zero (missing `height: 100%` CSS).
- **Missing-client error** — Upgraded from `console.warn` (dev-only) to `console.error` (always). Fires after 5 s in production, 1 s in development.

## [2.0.0] — 2026-06-12

### Added
- **`focusPanel(id)`** — Unified activate method for floating and docked panels. Works correctly for both floating windows (z-index focus) and docked panels (tab selection).
- **`isOpen(id): boolean`** — Query whether a panel is currently open.
- **`getOpenPanelIds(): string[]`** — List all open panel IDs.
- **Unregistered panel warning** — `console.warn` when `openPanel` references an unregistered component key.
- **CSS peer-dep detection** — Development warning when the `replace-react-contexify` stylesheet is not detected.

### Changed
- **`bringToFront` renamed to `focusPanel`** — `bringToFront` was misleading for docked panels (it selects a tab, not a z-index). The new unified method is `focusPanel`.

### Removed
- **`setActivePanel`** — Removed from public `WindowActions`. Was an internal tab-focus primitive that leaked into the public interface. Use `focusPanel` instead.

---

[Unreleased]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.2.2...HEAD
[4.2.2]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.2.1...v4.2.2
[4.2.0]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.0.0...v4.2.0
[4.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v4.0.0
[3.2.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v3.2.0
[3.1.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v3.1.0
[3.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v3.0.0
[2.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v2.0.0
