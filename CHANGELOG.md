# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.1.1] — 2026-08-07

### Fixed
- **Dragging a floating window — either by a resize handle or by its title bar — selected text in whatever docked panel sat behind it, Safari/WebKit only.** The shared `startPointerDrag()` mechanics (`src/components/dragResize.ts`) support an `activeClasses` option that toggles a `document.body` class — and matching `user-select: none` CSS — for the duration of a drag; the workspace grid splitter and the sidebar drawer resizer already passed it, which is why those two were never affected.
  - **Resize handles**: both floating-window resize-handle implementations (`WindowManager`'s `startResize` and `PanelOverlay`'s `handleResizePointerDown`) never passed `activeClasses` at all, so nothing suppressed selection while their handles were dragged. Both now pass it, toggling `rdd-resizing-active`, whose CSS rule also gained `-webkit-user-select: none` alongside the existing unprefixed property, for full Safari reliability.
  - **Header drag (moving an already-floating window)**: unlike resize, this was never built on `startPointerDrag()` at all — both `WindowManager`'s `startDrag` and `PanelOverlay`'s `handleHeaderPointerDown`/`handleWindowPointerMove` are independent, hand-rolled pointer-drag implementations with extra logic (drop-zone/tab-swap/corner-anchor hover detection, touch long-press-to-drag) that the shared utility doesn't model, so neither ever toggled a body-level selection-suppressing class. Both now toggle a new `rdd-dragging-active` class on `document.body` for the drag's duration (paired with `-webkit-user-select`/`user-select: none` in CSS), added at pointerdown rather than after any move threshold, since WebKit can start extending a selection from the very first pixel of movement. `WindowManager`'s `startDrag` also gained the `e.preventDefault()` it was missing entirely, and both implementations now clean up correctly on `pointercancel`, not just `pointerup`, so an interrupted drag can't leave selection disabled indefinitely.
  - **Dragging a docked panel's tab out** (the drag-preview "ghost" label shown before it becomes an actual floating window, or before it's dropped onto a new dock target): a third, independent hand-rolled implementation, `WindowManager`'s `handleTabDragStart`, had the identical gap — no `preventDefault()`, no selection-suppressing class. It now reuses the same `rdd-dragging-active` class (no CSS changes needed, since this is the same kind of "moving a panel around" interaction as the header-drag case above), added/removed at the same points, with the same `pointercancel` hardening.

  In all cases, Chromium/Firefox apparently tolerate the drag without this CSS-level suppression (via `preventDefault()` alone), but Safari doesn't once a native selection drag is already extending.

## [5.1.0] — 2026-08-04

### Added
- **`openPanel(id, component, options)` now accepts `props`** — custom per-instance data spread onto the panel component alongside `panelId` (`<Component {...props} panelId={id} />`), matching `openModal`/`openLeftPanel`/`openRightPanel`'s already-unconstrained `props` argument. Previously a docked/floating panel received exactly one prop — `panelId` — with no way to pass anything else, forcing every app with per-instance data (a document's filename+content, a record id, a filter) into hand-rolling an external store keyed by `panelId`. There is **no type restriction** on `props` — see the next entry for why.
- **`PanelInfo.serializable: boolean`, computed automatically** — whether a panel's current `props` can round-trip through `saveLayout()`/`loadLayout()`, checked recursively for functions, symbols, React elements, class instances, `Map`/`Set`, or `undefined` anywhere in the tree (`Date` is treated as serializable-enough, matching `JSON.stringify`'s own behavior). A panel opened with non-serializable `props` isn't rejected or blocked — it keeps rendering and working normally on screen, it's simply **excluded from the next `saveLayout()` call**, pruned from `gridRoot`/`floating`/`minimized` in that saved snapshot (non-mutating — the live workspace is never touched by computing a save) so a later `loadLayout()` never references a panel it has no data to recreate. The new `isSerializable()` utility backing this is exported for apps that want to apply the same check themselves.
- **`'layout:panels-excluded'` event**, published from inside `saveLayout()` itself whenever that specific call excluded at least one panel — payload `{ panels: { id, component }[] }`. A passive flag alone isn't enough for the case that actually matters (e.g. a floating window rendering data from a live class instance: fine on screen right now, but nobody may be polling `serializable` at the exact moment a save happens and it silently drops out) — this is deliberately just a signal, not a UI opinion; decide for yourself whether it becomes a toast, a console warning, or nothing. New `WorkspaceClient.onPanelsExcluded()` convenience method, matching the existing `onPanelOpen`/`onPanelClose`/etc. pattern.
- **`FormContainerContract.registerStateProvider(getState)`** (docked/floating panels only) — registers a callback reporting a panel's *current* restorable state, pulled fresh by `saveLayout()` every time it's called, for state a panel accumulates after opening that static `props` alone can't capture (scroll position, an in-progress edit, a view-mode toggle). Return `undefined` to fall back to the panel's static `props` for that save. The returned value goes through the same serializability check as static props, re-evaluated on **every** save — a provider-backed panel's exclusion status can flip from one save to the next, unlike a static-props-only panel, which is classified once at open time. New `WorkspaceClient.registerStateProvider()`/`unregisterStateProvider()` mirror the existing `registerCloseGuard()`/`unregisterCloseGuard()` pattern exactly. Not added to left/right side panels or modals — they already have a complete, different answer to this via their own `props` argument plus `updateInstance`.
- **`openPanel`'s `dedupeKey` option, and `findPanelId(component, dedupeKey)`** — if another open panel of the same `component` already has the given `dedupeKey`, `openPanel` focuses that existing panel instead of creating a new one (the new call's `id`/`props` are ignored), the same way re-opening an already-open exact `id` already focuses it instead of duplicating it. For callers who can't guarantee they'll reuse the same literal `id` for the same logical entity across call sites — `isOpen(id)`/`focusPanel(id)` already solve this when the id *is* known and consistent; `dedupeKey` covers the case where it isn't.
- **`'layout:changed'` event** — coalesces open/close/minimize/restore/dedupe-redirect into one signal for autosave-style consumers, instead of subscribing to four (now potentially more) separate lifecycle events plus a fallback interval. Deliberately scoped, not oversold: it cannot observe a `registerStateProvider` callback's return value changing on its own (that's a pull, unobservable without the panel notifying separately), nor resize/split-ratio-drag/dock-rearrange, which have no hooks yet. New `WorkspaceClient.onLayoutChanged()` convenience method.
- **`SerializedLayout.version` is now written as `2`** (previously `1`, and never actually read/branched on since the field's introduction) — panels may now carry `props`/`dedupeKey`, and a saved payload may omit panels the live workspace still has open (see `serializable` above). Old saved layouts (version `1` or absent) still load correctly, unchanged — this is a forward-looking marker for the *next* migration to branch on, not a breaking change itself.

All of the above is additive and backward-compatible: every new field is optional and a panel that doesn't use `props` behaves identically to before; old saved layouts load unchanged since `props`/`dedupeKey`/`serializable` are never validated per-panel on load; new layouts saved by this version degrade gracefully when loaded by an older library version, which simply never reads the new fields.

## [5.0.0] — 2026-08-03

### Changed
- **BREAKING: `useSidebar()`, `useSidebarTab()`, `useToolbar()`, `usePanelContribution()`, and `useActivePanelContribution()` now throw when used outside their required provider**, instead of silently returning a no-op object (and logging a `console.warn`). This aligns them with `useWindowManagerActions()`, `useWindowManagerState()`, `usePanelState()`, `usePanelActions()`, and `useShowContextMenu()`, which already threw — previously, "does this hook throw or degrade gracefully?" had no learnable rule and depended on which hook you were looking at. `DockableDesktopProvider` already wraps every provider these hooks need, so apps using it are unaffected; only code calling one of the five listed hooks with **no** ancestor provider at all needs to add one (or catch the resulting error, if graceful degradation outside a provider is genuinely required).
- **BREAKING: every CSS class and custom property the library renders is now prefixed with `rdd-`** (e.g. `floating-window` → `rdd-floating-window`, `--accent-color` → `--rdd-accent-color`). An audit of framework-agnosticism (the library's primary users build with Material-UI, React-Bootstrap, Tailwind, and shadcn/ui) found the previous naming was an inconsistent mix of five prefixes (`dw-`, `v2-`, `sb-`, `fw-`, `wm-`) plus ~100 unprefixed classes, including a bare `.active` that collides with Bootstrap's own global `.active`, and `:root`-scoped design tokens using the same short-generic-name convention shadcn/ui uses for its own theme tokens. One consolidated, low-collision-risk prefix means anything you see in devtools is instantly recognizable as belonging to this library. Only the library's own rendered output was renamed — the demo apps' own classes (e.g. `sb-*`) are unaffected, as they're sample-app code, not library API. See the [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration) for the full old-name → new-name tables if you have custom CSS overriding the library's internal classes or default variable values.
- **BREAKING: the library no longer sets cosmetic global CSS.** Previously, importing `styles.css` set `font-family`/background/text-color on `html, body, #root` and restyled scrollbars on the bare `*` selector — affecting the consumer's entire page, not just the workspace. These are now scoped to `.rdd-workspace` (the root element `<WindowManager />` renders) and its descendants only. The `margin`/`padding`/`width`/`height`/`overflow` reset on `html, body, #root` is unchanged — it's structural, not cosmetic: `.full-viewport-layout` and every percentage-height element the workspace nests inside (including `WindowManager`'s own root) can only resolve `height: 100%` if this chain has a real height all the way to `<html>`.
- **BREAKING: animations are now enabled by default.** Previously, every transition/animation on the *entire page* — not just the library's own — was force-disabled (`!important`) unless `<html>` had an undocumented `enable-animations` class that nothing in the library itself ever added; only the demo apps' own UI toggle knew about it. `<WindowManager animations={false} />` now opts out, scoped to only the library's own elements via the new `rdd-` prefix — it never touches a consumer's own transitions/animations elsewhere on the page, in either state.
- **BREAKING: `<Sidebar>`'s deprecated `drawerWidth` (string) prop is removed.** It was deprecated in v3.1.0 in favor of `defaultWidth` (number, pixels); replace `drawerWidth="280px"` with `defaultWidth={280}`. `defaultWidth`'s own default (when omitted) also changed from `220` to `280` — a more comfortable fit for typical drawer content (forms, labeled toggles, card metadata).

### Added
- **`WorkspaceClient` now mirrors the full `WindowActions` interface** — added `updateSplitSizes`, `updateFloatingPosition`, `setDraggedPanelId`, `dockPanelToGroup`, `movePanelOrder`, `closeLeafGroup`, `registerCloseGuard`, `unregisterCloseGuard`, `setPanelDirty`, `updatePanelTitle`, `requestClosePanel`, `dockPanelToWorkspaceEdge`, and `showContextMenu`. Previously 13 of the ~28 actions available via `useWindowManagerActions()` had no equivalent on `WorkspaceClient`, so code built entirely against the imperative client (rather than hooks) could hit an unexpected capability gap.
- **Serialized layouts now carry a `version` field** (`SerializedLayout` type, currently `1`) — purely additive; layouts saved before this change (with no `version` field) still load correctly. This gives the *next* breaking change to the layout JSON shape a clean version to branch on, instead of another ad hoc field-presence sniff like the existing `stickyRight`/`stickyBottom` → `anchor` migration.
- **`startPointerDrag()` and `computeResizedRect()` are now public** (`src/components/dragResize.ts`) — the same pointer-capture mechanics and 8-directional resize math the built-in grid/sidebar/floating-window resizers already share internally, exported so panel content can build custom resizable dividers or handles without reimplementing pointer capture and cleanup. The demo's Markdown Editor preview divider, previously hand-rolled for exactly this reason, now uses it.
- **`useColorScheme()` hook** — reactively reads the workspace's `data-color-scheme` attribute (`'dark' | 'light'`), for panel content that needs to react in JS, not just CSS, to the same scheme the workspace is using (e.g. swapping a map's tile layer or an embedded editor's theme). This logic previously existed independently in `WindowManager` itself and in 4 separate demo call sites — all 5 now share one implementation.
- **`usePanelSize()` hook** — reactive alternative to calling `getDimensions()` yourself: returns the panel's current `{ width, height }` (or `null` before layout) and re-renders on change. It wraps the existing `onResize`/`getDimensions()` mechanism on `FormContainerContract`, which already correctly tracks a panel's box across docking, floating, and tab changes — several demo map panels had independently built a second, redundant `ResizeObserver` on their own container to get the same signal; they now use this instead.
- **`zIndexBase` config on `WorkspaceClientConfig`/`WindowManagerProviderProps`** (default `1000`, matching today's behavior exactly) — floating windows and the library's own chrome overlays (context menu, toolbar flyout, modal stack, toast, workspace edge zones) previously used three independent, un-synced z-index systems with hardcoded values (8000–10100+) that always sat above a host app's own Material-UI (1300–1500) or Bootstrap (1055–1080) overlays, while the floating-window base (1000) sat *inside* MUI's modal range — a real collision risk if a consumer's own modal is triggered from inside a panel. All of these now derive from one `--rdd-z-base` CSS variable via fixed offsets that preserve today's exact relative order; `zIndexBase` shifts everything together, letting you place the library's entire stacking context above or below a host app's own overlays.
- **`data-color-scheme` is now mirrored onto `document.documentElement`**, matching the existing `data-workspace-skin` mirroring. `<Sidebar>`/`<Toolbar>` are DOM siblings (or, for `<Sidebar>`, an ancestor) of `<WindowManager>`, not descendants — previously, `[data-color-scheme="light"]`-scoped tokens (including all `--sidebar-*` variables) only reached them if the consumer independently set the attribute themselves, despite a code comment claiming this already worked "same as skin."

### Fixed
- **`WorkspaceClient.initialState` silently skipped the `stickyRight`/`stickyBottom` → `anchor` migration that `loadLayout()` already applied** — the two entry points independently duplicated their shape-checking logic, and only one of the two copies had the migration. Both now share a single `parseLayoutPayload()` function, so a legacy-format layout behaves identically regardless of which entry point loads it.
- **Four independent implementations of "pointer-capture drag, resize on move" had quietly drifted apart** — the workspace grid split resizer, the sidebar drawer resizer, and two separate floating-window 8-direction resize-handle implementations (one in `WindowManager`, one in `PanelOverlay`) each hand-rolled the same mechanics. This is the same class of drift that caused the docked-panel resize bug fixed in 4.3.0 (a property present in one implementation's inline styles but missing in the other). All four now share `startPointerDrag()` and `computeResizedRect()` (`src/components/dragResize.ts`) for the pointer-capture/delta/cleanup mechanics and the 8-directional resize math respectively — behavior is unchanged for every existing call site (verified: unbounded floating-window growth stays unbounded, container-clamped `PanelOverlay` resizing stays clamped, grid/drawer resize math is bit-for-bit the same).

## [4.3.0] — 2026-08-02

### Added
- **`usePanelContribution(contribution)`** — lets any panel publish `toolbarItems` and/or `sidebarSections` that are only surfaced while that panel is `state.activePanelId`. Call on every render; republishes automatically when the contribution changes, and is cleared on unmount. Independent panel instances (e.g. two maps) keep fully independent contributed state — nothing is shared or keyed globally. No-op with a `console.warn` outside a `PanelContributionProvider`.
- **`useActivePanelContribution()`** — returns whatever the currently active panel has published, or `null` if none. Same no-op-with-warning behavior outside a `PanelContributionProvider`, matching the existing `useToolbar()`/`useSidebar()` convention.
- **`useMergedToolbarItems(staticItems)`** / **`useMergedSidebarTabs(staticTabs, fallbackIcon?)`** — convenience wrappers around `useActivePanelContribution()` for the common case: append the active panel's contributed toolbar items (behind a separator) / sidebar sections (as dynamic tabs, via `sidebarSectionToTab`) to a static list, unchanged when there's nothing to add. `useActivePanelContribution()` stays exported for manual control.
- **`sidebarSectionToTab(section, fallbackIcon?)`** — converts a `PanelSidebarSection` into a `SidebarTab` for `<Sidebar tabs={...}>` (`renderContent: () => section.content`, with a fallback for `SidebarTab`'s required `icon`).
- **`PanelContributionProvider`** — the context provider backing the hooks above. Mounted automatically by `DockableDesktopProvider`; only needed manually when composing `WindowManagerProvider` directly.
- **`PanelContribution` / `PanelSidebarSection` types** — `PanelContribution` is `{ toolbarItems?: ToolbarItem[]; sidebarSections?: PanelSidebarSection[] }`; `PanelSidebarSection` is `{ id, label, icon?, content }`.
- **`active?: boolean` on `ToolbarToggleItem`** — controlled-mode escape hatch mirroring `ToolbarGroupItem`'s existing `activeItemId`/`onActiveItemChange` pattern. When provided, the toggle reads `active` instead of `ToolbarContext`'s shared modifier state, and skips writing to it on click — this is what lets contributed toggle buttons (e.g. a per-map controller selector: Pan/Draw/Measure) report independent active state per panel instance instead of colliding on a shared id. Omitting `active` preserves prior uncontrolled behavior exactly.
- **`options.focus?: boolean` on `openPanel()`** — escape hatch to open a panel without changing `activePanelId` (`default: true`). Lets an app open several panels and choose exactly which one ends up focused (e.g. "focus the first one opened") without fighting the default.
- **Panel Contributions guide** (`docs-site/guide/panel-contributions.md`) and README hooks-table rows.

### Fixed
- **`openPanel()` didn't consistently focus the panel it opened** — despite its own doc comment claiming otherwise, `state.activePanelId` was only set when re-opening an already-*floating* panel; brand-new panels, restored-from-minimized panels, and re-opened *docked* panels never set it. `openPanel()` now sets `activePanelId` in every branch by default, matching its documented behavior — confirmed safe: no call site in this repo relied on the previous gap, and two already worked around it manually.
- **Docked panels could resize based on unrelated internal content** — switching an unrelated panel's internal tab (e.g. Control Center, Markdown Editor) could shift the width of neighboring panels or the `Sidebar` drawer by a few pixels. The actual source: `Sidebar`'s wrapper around `{children}` used `flex: '1 1 auto'`, whose `auto` basis is computed from its content's max-content size — `minWidth: 0` alone only bounds how far something can *shrink*, not that content-driven starting size. Changed to `flex: '1 1 0%'`, so the wrapper's size comes purely from `flex-grow`'s share of space regardless of content. Also hardened `WorkspaceGrid`'s recursive per-child wrapper (`WindowManager.tsx`) with `minWidth`/`minHeight: 0`, closing the equivalent gap between sibling leaves within the same grid.

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

[Unreleased]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v5.1.1...HEAD
[5.1.1]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v5.1.0...v5.1.1
[5.1.0]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.3.0...v5.0.0
[4.3.0]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.2.2...v4.3.0
[4.2.2]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.2.1...v4.2.2
[4.2.0]: https://github.com/felipecarrillo100/react-dockable-desktop/compare/v4.0.0...v4.2.0
[4.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v4.0.0
[3.2.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v3.2.0
[3.1.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v3.1.0
[3.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v3.0.0
[2.0.0]: https://github.com/felipecarrillo100/react-dockable-desktop/releases/tag/v2.0.0
