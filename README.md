    # React Dockable Desktop

[![npm version](https://img.shields.io/badge/npm-v5.1.3-blue.svg)](https://www.npmjs.com/package/react-dockable-desktop)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178c6.svg)](https://www.typescriptlang.org/)
[![Touch Ready](https://img.shields.io/badge/touch-iPad%20%7C%20Android-success.svg)](#touch--mobile)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)
[![Docs](https://img.shields.io/badge/docs-site-blue.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/)

A premium dockable layout engine for React. Build desktop-class applications with fluid split-docking grids, tabbed panels, resizable floating windows, and **zero-unmount DOM preservation** — by default, across docking, floating, *and* tab-switching alike, so WebGL contexts, live maps, and stateful editors never lose their state no matter how a panel is moved.

**[Live Demo](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)** &nbsp;|&nbsp;
**[Full Documentation](https://felipecarrillo100.github.io/react-dockable-desktop/)** &nbsp;|&nbsp;
**[API Reference](https://felipecarrillo100.github.io/react-dockable-desktop/api/)**

---

## Features

- **Split-Docking Grid** — drag panels to split any zone into rows/columns or group into tabbed containers
- **Workspace Edge Docking** — drag to the outer edges to dock a panel as a full-width or full-height strip
- **Floating Windows** — pop panels into freely resizable floating windows; 8-direction resize handles (N/NE/E/SE/S/SW/W/NW), maximize, minimize; drag to a workspace corner to anchor it there — anchored windows stack with 8 px gaps and reposition when the viewport resizes
- **Panel Overlay** — per-panel overlay layer with anchored toolbars (`PanelToolbar`, `ToolbarButton`, `ToolbarToggle`, async search) and corner-anchored floating windows that stack, drag, and dock; `usePanelFloatingWindowManager()` opens N named windows dynamically from data or event handlers
- **Touch & Mobile Ready** — full iPad and Android support: long-press to drag tabs, touch resize, 44px coarse-pointer targets throughout
- **Zero-Unmount DOM Persistence** — panel DOM nodes are moved, never destroyed, across docking, floating, and tab-switching alike, all by default; WebGL, maps, terminals, and forms retain full state with zero integration work
- **i18n & RTL** — full Right-to-Left layout support; `dir="rtl"` flips every control, tab order, and drop zone automatically
- **Inter-Panel Pub/Sub** — lightweight typed event bus for decoupled panel-to-panel communication
- **Imperative API** — `WorkspaceClient` opens, closes, focuses, and serializes panels from anywhere — inside or outside React
- **Layout Serialization** — save and restore the full workspace as a JSON string; survives page reloads
- **7 Built-in Skins** — VSCode, macOS, Chrome, Slate, Nord, Obsidian, Tokyo — all fully themeable via CSS variables
- **Toast Notifications** — imperative singleton `toast.info/success/warning/error/promise()` with queue, pause-on-hover, progress bar, and a `ToastAdapter` interface for delegating to a third-party notification library
- **Drag-Resize Primitives** — `startPointerDrag()` and `computeResizedRect()`, the same pointer-capture mechanics and 8-directional resize math the built-in resizers use, exported for building custom resizable UI inside your own panel content ([guide →](https://felipecarrillo100.github.io/react-dockable-desktop/guide/advanced#building-custom-drag-resize-interactions))
- **Zero extra dependencies** — no runtime dependencies beyond React itself; everything is bundled in
- **TypeScript-first** — complete type definitions included; no separate `@types/` package needed

---

## Installation

```bash
npm install react-dockable-desktop
```

Import styles in your app entry file:

```ts
import 'react-dockable-desktop/styles.css';
```

**Requirements:** React ≥ 16.8 · Node ≥ 18 · No other runtime dependencies

---

## Quick Start

### 1. Create a WorkspaceClient

Define your panel catalog and create a `WorkspaceClient` **outside React**, at module scope. It acts as the bridge between your imperative code and the React tree.

```ts
// workspace.ts
import { WorkspaceClient } from 'react-dockable-desktop';
import MapPanel    from './panels/MapPanel';
import EditorPanel from './panels/EditorPanel';

export const workspace = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map View' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor'   } },
  },
  initialState: localStorage.getItem('workspace-layout'),
});
```

### 2. Mount the Provider

`DockableDesktopProvider` is the single composite provider — it wraps everything the library needs:

```tsx
// App.tsx
import { DockableDesktopProvider, WindowManager, ModalStackRenderer } from 'react-dockable-desktop';
import { workspace } from './workspace';

export default function App() {
  return (
    <DockableDesktopProvider client={workspace}>
      <div style={{ width: '100vw', height: '100vh' }}>
        <WindowManager />
      </div>
      <ModalStackRenderer />
    </DockableDesktopProvider>
  );
}
```

> **Important:** the `WindowManager` container must have an explicit height. A `height: 100%` that resolves to zero will produce a development warning.

### 3. Open Panels

```ts
// From anywhere — inside or outside React:
workspace.openPanel('map-1', 'map');
workspace.openPanel('ed-1', 'editor', { title: 'config.json', initialTarget: 'floating' });
workspace.focusPanel('map-1');

// Layout persistence:
localStorage.setItem('workspace-layout', workspace.saveLayout());

// Query state without a hook:
workspace.isOpen('map-1');        // boolean
workspace.getOpenPanelIds();      // string[]
```

Panels can now be dragged, split, tabbed, floated, and minimized out of the box.

---

## Writing a Panel Component

A panel is any React component. Use built-in hooks to integrate with the layout:

```tsx
import { useFormContainer, usePanelId } from 'react-dockable-desktop';

export default function EditorPanel() {
  const panelId = usePanelId();               // this panel's instance ID — no prop needed
  const { setDirty, setTitle } = useFormContainer();

  const handleChange = (value: string) => {
    setDirty(true);                           // blocks close until user confirms discard
    setTitle('config.json *');                // updates the tab title live
  };

  return <textarea onChange={e => handleChange(e.target.value)} />;
}
```

### Lifecycle callbacks

`useFormContainer()` exposes a full push-based lifecycle API — no subscriptions to global state required:

```tsx
import { useFormContainer } from 'react-dockable-desktop';
import { useEffect } from 'react';

export default function MapPanel() {
  const {
    containerType,          // current container type at mount: 'dockable-panel' | 'floating-window'
    onActivate,             // fires when this panel becomes the globally active panel
    onDeactivate,           // fires when this panel loses active status (or is destroyed)
    onContainerTypeChange,  // fires when the panel moves between docked and floating
    onClose,                // fires just before the panel is destroyed
    requestMinimize,        // imperatively minimize this panel to the taskbar
    getDimensions,          // synchronously read current {width, height} — null until first layout
  } = useFormContainer();

  useEffect(() => {
    const unsub = [
      onActivate?.(() => {
        // e.g. resume animation, reload data
        const dims = getDimensions?.();
        console.log('active, size:', dims);
      }),
      onDeactivate?.(() => {
        // e.g. pause background work
      }),
      onContainerTypeChange?.((type) => {
        // type === 'floating-window' | 'dockable-panel'
        // e.g. trigger map.resize() after layout change
      }),
      onClose?.(() => {
        // final cleanup — unsubscribe from external stores
      }),
    ];
    return () => unsub.forEach(fn => fn?.());
  }, []);

  return <div>Map</div>;
}
```

---

## Hooks

Call these inside any component within the `DockableDesktopProvider` tree:

| Hook | Returns | Use For |
| :--- | :--- | :--- |
| `useWindowManagerActions()` | `WindowActions` | Open, close, float, dock, minimize, maximize, serialize panels |
| `useWindowManagerState(selector?)` | `WindowState` or selected slice | Read layout, floating windows, active panel ID |
| `usePanelActions()` | `PanelActions` | Open modal overlays and left/right side drawers |
| `usePanelContext()` | `{ publish, subscribe }` | Inter-panel typed event bus |
| `useFormContainer()` | `FormContainerContract` | Dirty state, close guards, dynamic title/icon, lifecycle callbacks (activate, deactivate, container-type change), imperative minimize, sync dimensions |
| `usePanelSize()` | `{ width, height } \| null` | Reactive alternative to `getDimensions()` — live panel dimensions across docking, floating, and tab changes, no manual subscription |
| `usePanelId()` | `string` | The panel's own instance ID — no prop drilling needed |
| `useToolbar()` | `ToolbarContextValue` | Read/write Toolbar state (active tool, modifiers) from any panel |
| `useSidebar()` | `SidebarContextValue` | Open/close Sidebar tabs from any component in the Sidebar tree |
| `useSidebarTab()` | `SidebarTabContext` | Self-control for content inside a Sidebar tab |
| `usePanelContextMenu(items)` | `void` | Inject dynamic context menu items into this panel's right-click menu |
| `usePanelFloatingWindowManager()` | `PanelFloatingWindowManagerHandle` | Open/close N named floating windows inside a panel overlay at runtime; each independently anchored, dockable, and resizable |
| `useRegistry()` | `PanelRegistryClass` | The scoped panel registry for the current provider |
| `useFormatMessage()` | `MessageFormatter` | i18n formatter matching the current provider's locale |
| `usePanelContribution(contribution)` | `void` | Publish toolbar items/sidebar sections shown only while this panel is active |
| `useActivePanelContribution()` | `PanelContribution \| null` | Read the active panel's published contribution, to merge manually |
| `useMergedToolbarItems(staticItems)` | `ToolbarItem[]` | `staticItems` + the active panel's contributed toolbar items, ready for `<Toolbar items={...}>` |
| `useMergedSidebarTabs(staticTabs)` | `SidebarTab[]` | `staticTabs` + the active panel's contributed sections as dynamic tabs, ready for `<Sidebar tabs={...}>` |
| `useColorScheme()` | `'dark' \| 'light'` | Reactively read the workspace's current color scheme from your own panel content |

**State selectors** prevent unnecessary re-renders:

```ts
// Only re-renders when activePanelId changes — not on every layout mutation:
const activeId = useWindowManagerState(s => s.activePanelId);
const panelCount = useWindowManagerState(s => Object.keys(s.panels).length);
```

---

## WorkspaceClient Reference

```ts
const workspace = new WorkspaceClient({ panels, initialState?, formatMessage?, dir? });

// Panel lifecycle
workspace.openPanel(id, component, options?)   // options: title, initialTarget, anchor
workspace.closePanel(id)
workspace.focusPanel(id)                       // raises floating / selects tab for docked
workspace.floatPanel(id, rect?, anchor?)       // detach to a floating window; optional corner anchor
workspace.dockPanel(id)                        // return floating to the grid
workspace.minimizePanel(id)
workspace.restorePanel(id)
workspace.maximizePanel(id)

// Synchronous state queries (no hook needed)
workspace.isOpen(id)                           // → boolean
workspace.getOpenPanelIds()                    // → string[]

// Layout persistence
workspace.saveLayout()                         // → JSON string
workspace.loadLayout(json)                     // → boolean (true = success)

// Event bus
workspace.publish(event, data)
workspace.subscribe(event, callback)           // → unsubscribe()
workspace.onPanelOpen(cb)
workspace.onPanelClose(cb)
workspace.onPanelMinimize(cb)
workspace.onPanelRestore(cb)

// Direction
workspace.setDirection('ltr' | 'rtl')
```

---

## FormContainerContract Reference

`useFormContainer()` returns a `FormContainerContract` with these members:

| Member | Type | Description |
| :--- | :--- | :--- |
| `requestClose(options?)` | `(options?: CloseOptions) => void` | Request the container to close; respects dirty state and close guards |
| `setDirty(dirty, options?)` | `(dirty: boolean) => void` | Mark unsaved changes; triggers confirmation dialog on close |
| `onCloseRequested(handler)` | `(handler) => unsubscribe` | Register a close guard; return `false` to block the close |
| `setTitle(title)` | `(title) => void` | Change the tab/window title dynamically |
| `setIcon?(icon)` | `(icon: ReactNode) => void` | Change the tab/window icon dynamically |
| `containerType?` | `ContainerType` | Container type **at mount time** — see `onContainerTypeChange` for live updates |
| `instanceId` | `string` | The panel's instance ID |
| `onClose?(handler)` | `(handler) => unsubscribe` | Subscribe to panel destruction |
| `onMinimize?(handler)` | `(handler) => unsubscribe` | Subscribe to minimize events |
| `onRestore?(handler)` | `(handler) => unsubscribe` | Subscribe to restore-from-taskbar events |
| `onResize?(handler)` | `(handler) => unsubscribe` | Subscribe to resize events; handler receives `(width, height)` |
| `requestMinimize?()` | `() => void` | Imperatively minimize this panel to the taskbar |
| `getDimensions?()` | `() => {width, height} \| null` | Synchronously read the current rendered size; `null` until first layout |
| `onActivate?(handler)` | `(handler) => unsubscribe` | Subscribe to this panel becoming the globally active panel |
| `onDeactivate?(handler)` | `(handler) => unsubscribe` | Subscribe to this panel losing active status; also fires on destruction |
| `onContainerTypeChange?(handler)` | `(handler) => unsubscribe` | Subscribe to dock↔float transitions; handler receives the new `ContainerType` |

### ContainerType

```ts
type ContainerType =
  | 'dockable-panel'   // panel is docked in the grid
  | 'floating-window'  // panel is in a detached floating window
  | 'left-panel'       // rendered inside the left side drawer
  | 'right-panel'      // rendered inside the right side drawer
  | 'modal'            // rendered inside a modal overlay
  | 'standalone';      // rendered outside the Window Manager (default / no context)
```

`containerType` on the contract reflects the state **at mount time**. Subscribe to `onContainerTypeChange` to get notified whenever the panel moves between `'dockable-panel'` and `'floating-window'`. Minimize/restore cycles do **not** fire `onContainerTypeChange`; use `onMinimize`/`onRestore` for those.

All `on*` subscribers return an unsubscribe function. Call it (or return it from `useEffect`) to avoid leaks.

---

## Layout Persistence

```ts
// Save on unload (or on any meaningful user action):
window.addEventListener('beforeunload', () => {
  localStorage.setItem('workspace-layout', workspace.saveLayout());
});

// Restore by passing the saved string to the constructor:
new WorkspaceClient({
  panels: { ... },
  initialState: localStorage.getItem('workspace-layout'),
});
```

---

## Side Panels & Modals

Add `SidePanelRenderer` and `ModalStackRenderer` to your app root. Placement matters — `SidePanelRenderer` must be **inside** the workspace container so drawers position correctly; `ModalStackRenderer` goes **outside** as a full-screen overlay:

```tsx
// App.tsx
import { SidePanelRenderer, ModalStackRenderer } from 'react-dockable-desktop';

function App() {
  return (
    <DockableDesktopProvider client={workspace}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <WindowManager />
        <SidePanelRenderer />  {/* inside — drawers position relative to this container */}
      </div>
      <ModalStackRenderer />   {/* outside — full-screen overlay */}
    </DockableDesktopProvider>
  );
}

// From any panel component:
const { openModal, openRightPanel } = usePanelActions();

openModal(MyForm, { itemId: 42 }, { title: 'Edit Item', size: 'medium' });
openRightPanel(PropertiesPanel, { nodeId }, { title: 'Properties', width: 320 });
```

---

## Touch & Mobile

Touch support is built in for v3.1.0+. No extra setup required:

- **Tab drag** — long-press (300ms) on any tab to start dragging; haptic feedback on supported devices
- **Floating window drag** — long-press the titlebar, then drag
- **Resize** — drag any of the 8 resize handles; minimum 44px touch targets throughout
- **Split resizer** — drag the 1px divider line; the hit area extends into the safe direction to avoid accidental tab activation
- **Tab bar scroll** — swipe horizontally in the tab strip to scroll when there are many tabs

---

## i18n & RTL

The library does **not** auto-detect direction — the consuming app owns it. Two things must be wired together:

```tsx
// 1. Keep html[dir] in sync for portals (ContextMenu, flyout, Toast)
//    that render into document.body and need CSS direction inheritance.
useEffect(() => {
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
}, [isRtl]);

// 2. Pass dir prop to the provider — controls workspace layout engine.
<DockableDesktopProvider
  dir={isRtl ? 'rtl' : 'ltr'}
  formatMessage={(msg) => intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage })}
  predefinedMessages={customMessages}
>
```

`dir` can be `'ltr'` (default) or `'rtl'`. All layout, split directions, tab ordering, floating window controls, drop zones, sidebars, and context menus flip automatically.

Direction is **independent of locale** — you can have Arabic translations with LTR layout, or RTL without locale changes.

See the [RTL Support guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/rtl) for the complete wiring pattern and macOS skin notes.

---

## Skins

```tsx
<WindowManager skin="vscode" />   // default
<WindowManager skin="macos" />
<WindowManager skin="nord" />
<WindowManager skin="tokyo" />
```

| Skin | Character | Active state (Sidebar & Toolbar) |
|------|-----------|----------------------------------|
| `vscode` | VS Code dark (default) | Transparent fill, 2 px accent bar |
| `macos` | Glass Chip — accent fill, rounded corners | 36 px floating chip, white inner ring |
| `chrome` | Google Chrome tab geometry | Sidebar: half-pill bridge. Toolbar: 2 px bar |
| `slate` | Fluent Slate — deep navy | Floating 36 px accent-tinted pill |
| `nord` | Arctic Frost — muted Nord palette | Short horizontal line below icon |
| `obsidian` | Vercel Midnight — pure black/white | Deep glow + icon drop-shadow |
| `tokyo` | Tokyo Night — purple accent | Neon glow + vivid icon drop-shadow |

All built-in skins include dark and light variants. Create your own skin by overriding CSS custom properties under a `[data-workspace-skin="myskin"]` selector. See the [Theming Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/theming) for the full variable reference and the [Per-skin active state guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/theming#per-skin-active-state-design-language) to customise the Sidebar/Toolbar active indicator in your own skin.

---

## What's New

### v4.1.0
- **`onActivate` / `onDeactivate` on `FormContainerContract`** — push-based callbacks fired when a panel gains or loses globally active status; no need to subscribe to `useWindowManagerState` and diff `activePanelId` inside each panel.
- **`onContainerTypeChange` on `FormContainerContract`** — fires with the new `ContainerType` (`'dockable-panel'` | `'floating-window'`) whenever the panel transitions between docked and floating; does not fire during minimize/restore cycles.
- **`getDimensions()` on `FormContainerContract`** — synchronous getter returning the current `{width, height}` of the panel (or `null` before first layout); reads from the same `ResizeObserver` that drives `onResize`.
- **`requestMinimize()` on `FormContainerContract`** — imperative counterpart to `requestClose()`; minimizes the panel without needing `useWindowManagerActions`.
- **`'floating-window'` ContainerType value** — `containerType` now correctly reports `'dockable-panel'` for docked panels and `'floating-window'` for panels in detached floating windows.

### v4.0.0
- **Built-in `<ContextMenu>`** — zero-dependency context menu, portal-rendered and styled with design tokens. No extra package or CSS import needed.
- **`ContextMenuAdapter` interface** — swap the default menu for your own design-system implementation via `<WindowManager contextMenuAdapter={...} />`.
- **New exports** — `ContextMenu`, `DefaultContextMenuAdapter`, `ContextMenuHandle`, `ContextMenuAdapter`, `ShowContextMenuOptions`.
- **Panel Overlay system** — `PanelOverlayRoot`, `PanelToolbar`, `PanelFloatingWindow`, and `usePanelFloatingWindowManager` bring per-panel toolbars and dynamically-spawned corner-anchored floating info windows to any panel.
- **`usePanelFloatingWindowManager()`** — imperative hook for opening N named floating windows from data or event handlers; all windows share z-ordering, drag, and corner-docking infrastructure.
- **Toolbar primitives** — `ToolbarButton`, `ToolbarToggle`, `PanelToolbarSeparator`, `ToolbarSpacer`, `ToolbarCenter`, `ToolbarSearchInput` compose panel toolbar content.
- **Toast Notifications** — zero-dependency `toast.info/success/warning/error/promise()` singleton. `<ToastContainer>` renders via `createPortal`; supports configurable position, width, max-visible queue, pause-on-hover, opt-in progress bar, and auto-dismiss. `ToastAdapter` lets you delegate to Ant Design, MUI, Sonner, or any other notification library without changing call sites.
- **Workspace corner anchor zones** — drag any panel (floating or docked tab) to a workspace corner to pin it there. Four 80×80 px snap zones appear during drag; anchored windows stack with 8 px gaps and reposition automatically on viewport resize.
- **`anchor` option on `openPanel` and `floatPanel`** — spawn a new floating window pre-anchored: `openPanel('id', 'comp', { initialTarget: 'floating', anchor: 'top-right' })` or `floatPanel('id', undefined, 'bottom-left')`.
- **`defaultAnchor` in panel registry** — set `defaultAnchor: 'top-left'` in `PanelRegistryEntry.defaultOptions` so every instance of that component opens anchored.
- **Full RTL support** — floating window drop zones, edge triggers, and corner snap zones all mirror correctly when `dir="rtl"`.
- **Removed:** `openPanel` options `stickyRight` / `stickyBottom` (replaced by `anchor`). Saved layouts are automatically migrated.

### v3.2.0
- **Per-skin active state design language** — Sidebar tabs and Toolbar buttons now use a per-skin visual pattern (transparent bar, floating chip, pill, line, neon glow), driven by new CSS design tokens — fully overridable in custom skins. CSS-only, no API changes.
- **Documentation overhaul** — All guides updated to cover the full v3.1.0 API surface.

### v3.1.0
- **`<Toolbar>` component** — Vertical/horizontal strip hosting `action`, `radio`, `toggle`, `group`, and `separator` items. `useToolbar()` reads/writes state from any panel. `ToolbarGroupItem` adds a collapsed tool-family flyout with controlled mode support.
- **`<WindowManager taskbarVisibility>`** — Three modes: `'always'` (permanent bar, new default), `'compact'` (shows only with minimized panels), `'autohide'` (overlay bar with 8 px peek strip).
- **Sidebar resizable drawer** — Drag the drawer edge to resize. Props: `defaultWidth` (px), `minWidth`, `maxWidth`, `onWidthChange`. `drawerWidth` (string) deprecated.
- **Sidebar `visible` / `stripVisible`** — `visible` collapses the entire sidebar; `stripVisible` collapses only the activity bar. New handle methods: `showStrip()`, `hideStrip()`, `setWidth(px)`, `getWidth()`.
- **`useSidebar()` / `useSidebarTab()` hooks** — Programmatic Sidebar control from any component in the tree.
- **`usePanelContextMenu()` hook** — Inject dynamic right-click context menu items from inside a panel component.
- **Touch & iPad/Android support** — Pointer Events migration; long-press (300 ms) activates tab drag; taskbar chips support hover preview and long-press context menu on touch.
- **8-direction resize handles** — Floating windows now have N, NE, E, SE, S, SW, W, NW resize handles.
- **Skin scope fix** — `data-workspace-skin` now applied to `document.documentElement` so Toolbar and Sidebar always inherit the correct skin.

### v3.0.0
- **`DockableDesktopProvider`** — single composite provider replaces the manual `WindowManagerProvider + PanelProvider` nesting
- **RTL support** — `dir` prop on provider; `setDirection()` on client; full mirroring of all controls
- **State selectors** — `useWindowManagerState(s => s.activePanelId)` for surgical re-renders
- **Dynamic ModalStack** — clean overlay system with dirty-state close guards
- **`usePanelId()` hook** — zero-prop-drilling panel identity
- **Typed event bus** — `WorkspaceClient<AppEvents>` for type-safe inter-panel messaging

### v2.0.0 — Breaking Changes

| Removed | Replacement |
| :--- | :--- |
| `bringToFront(id)` | `focusPanel(id)` — works for both floating and docked panels |
| `setActivePanel(id)` | `focusPanel(id)` |

Full details in the [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration) and the [Changelog](https://github.com/felipecarrillo100/react-dockable-desktop/releases).

---

## Documentation

Complete guides, API reference, and interactive demo at:

**[https://felipecarrillo100.github.io/react-dockable-desktop/](https://felipecarrillo100.github.io/react-dockable-desktop/)**

| Guide | Description |
| :--- | :--- |
| [Installation](https://felipecarrillo100.github.io/react-dockable-desktop/guide/installation) | Requirements, CSS import order, module formats |
| [Quick Start](https://felipecarrillo100.github.io/react-dockable-desktop/guide/quick-start) | Minimal working app with layout persistence |
| [WorkspaceClient](https://felipecarrillo100.github.io/react-dockable-desktop/guide/workspace-client) | Full imperative API, multiple providers, i18n config |
| [Panel Registry](https://felipecarrillo100.github.io/react-dockable-desktop/guide/panel-registry) | `defaultOptions`, scoped vs global registry |
| [Layout System](https://felipecarrillo100.github.io/react-dockable-desktop/guide/layout) | Opening, floating, minimizing, serializing layouts |
| [Panel Lifecycle & Forms](https://felipecarrillo100.github.io/react-dockable-desktop/guide/forms-and-panels) | Dirty state, close guards, `useFormContainer` |
| [Modals & Side Panels](https://felipecarrillo100.github.io/react-dockable-desktop/guide/modals-and-drawers) | Modal stack, drawers, `Sidebar` component |
| [Event Bus](https://felipecarrillo100.github.io/react-dockable-desktop/guide/event-bus) | Typed pub/sub, built-in lifecycle events |
| [Theming](https://felipecarrillo100.github.io/react-dockable-desktop/guide/theming) | CSS variables, custom skins, dark/light modes |
| [Advanced Topics](https://felipecarrillo100.github.io/react-dockable-desktop/guide/advanced) | RTL, multiple workspaces, custom header actions, custom drag-resize interactions |
| [Best Practices](https://felipecarrillo100.github.io/react-dockable-desktop/guide/best-practices) | Patterns for production-ready implementations |
| [Panel Overlay](https://felipecarrillo100.github.io/react-dockable-desktop/guide/panel-overlay) | `PanelOverlayRoot`, panel toolbars, `PanelFloatingWindow`, `usePanelFloatingWindowManager` |
| [Toast Notifications](https://felipecarrillo100.github.io/react-dockable-desktop/guide/toast) | `toast` singleton, `<ToastContainer>`, queue behaviour, theming, `ToastAdapter` |
| [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration) | Upgrade from v1 → v2 → v3 → v4 |
| [API Reference](https://felipecarrillo100.github.io/react-dockable-desktop/api/) | Full type-level reference for all exports |

---

## Development

```bash
git clone https://github.com/felipecarrillo100/react-dockable-desktop.git
cd react-dockable-desktop
npm install
npm run dev          # Leaflet + Monaco open-source demo
npm run dev:ria      # LuciadRIA 3D Earth demo (requires license)
npm test             # vitest unit suite
npm run build        # build dist/
```

---

## License

MIT — free to use, adapt, and build upon.
