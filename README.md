    # React Dockable Desktop

[![npm version](https://img.shields.io/badge/npm-v7.0.1-blue.svg)](https://www.npmjs.com/package/react-dockable-desktop)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178c6.svg)](https://www.typescriptlang.org/)
[![Touch Ready](https://img.shields.io/badge/touch-iPad%20%7C%20Android-success.svg)](#touch--mobile)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)
[![Docs](https://img.shields.io/badge/docs-site-blue.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/)

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)

A premium dockable layout engine for React. Build desktop-class applications with fluid split-docking grids, tabbed panels, resizable floating windows, and **zero-unmount DOM preservation** — by default, across docking, floating, *and* tab-switching alike, so WebGL contexts, live maps, and stateful editors never lose their state no matter how a panel is moved.

**[Live Demo](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)** &nbsp;|&nbsp;
**[Full Documentation](https://felipecarrillo100.github.io/react-dockable-desktop/)** &nbsp;|&nbsp;
**[API Reference](https://felipecarrillo100.github.io/react-dockable-desktop/api/)**

**Using Vue?** [`vue-dockable-desktop`](https://github.com/felipecarrillo100/vue-dockable-desktop)
is the Vue 3 port — a native Vue library, not a wrapper, and it reads and writes the **same
serialised layout format**, so a layout saved by either library loads in the other.

---

## Features

- **Split-Docking Grid** — drag panels to split any zone into rows/columns or group into tabbed containers
- **Workspace Edge Docking** — drag to the outer edges to dock a panel as a full-width or full-height strip
- **Floating Windows** — pop panels into freely resizable floating windows; 8-direction resize handles (N/NE/E/SE/S/SW/W/NW), maximize, minimize; drag to a workspace corner to anchor it there — anchored windows stack with 8 px gaps and reposition when the viewport resizes
- **Panel Overlay** — per-panel overlay layer with anchored toolbars (`RddPanelToolbar`, `RddToolbarButton`, `RddToolbarToggle`, async search) and corner-anchored floating windows that stack, drag, and dock; an axis can span the panel instead of carrying a fixed size, so a strip or column tracks the panel as it resizes — set declaratively or by dragging an edge out until it snaps; `useFloatingWidgets()` opens N named windows dynamically from data or event handlers
- **Touch & Mobile Ready** — full iPad and Android support: long-press to drag tabs, touch resize, 44px coarse-pointer targets throughout
- **Zero-Unmount DOM Persistence** — panel DOM nodes are moved, never destroyed, across docking, floating, and tab-switching alike, all by default; WebGL, maps, terminals, and forms retain full state with zero integration work
- **i18n & RTL** — full Right-to-Left layout support; `dir="rtl"` flips every control, tab order, and drop zone automatically
- **Inter-Panel Pub/Sub** — lightweight typed event bus for decoupled panel-to-panel communication
- **Imperative API** — the workspace from `createWorkspace()` opens, closes, focuses, and serializes panels from anywhere — inside or outside React
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

**Requirements:** React ≥ 18. No other runtime dependencies.

---

## Quick Start

### 1. Create a workspace

Define your panel catalog and create the workspace with `createWorkspace()` **outside React**, at module scope. It acts as the bridge between your imperative code and the React tree, and it is live immediately — calls made before the provider mounts apply straight away.

```ts
// workspace.ts
import { createWorkspace } from 'react-dockable-desktop';
import MapPanel    from './panels/MapPanel';
import EditorPanel from './panels/EditorPanel';

export const workspace = createWorkspace({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map View' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor'   } },
  },
  initialState: localStorage.getItem('workspace-layout'),
});
```

### 2. Mount the Provider

`DockableDesktopProvider` is the only provider — it wraps everything the library needs:

```tsx
// App.tsx
import { DockableDesktopProvider, RddDesktop, RddModals } from 'react-dockable-desktop';
import { workspace } from './workspace';

export default function App() {
  return (
    <DockableDesktopProvider workspace={workspace}>
      <div className="rdd-fill-viewport">
        <RddDesktop />
      </div>
      <RddModals />
    </DockableDesktopProvider>
  );
}
```

> **Important:** the `RddDesktop` container must have an explicit height. A `height: 100%` that resolves to zero will produce a development warning. The stylesheet styles nothing outside the library's own elements, so `rdd-fill-viewport` (full-window height, no overflow) is opt-in — and remove the browser's default body margin in your own CSS (`body { margin: 0 }`).

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
import { usePanel } from 'react-dockable-desktop';

export default function EditorPanel() {
  const { id, setDirty, setTitle } = usePanel();   // id: this panel's instance ID — no prop needed

  const handleChange = (value: string) => {
    setDirty(true);                           // blocks close until user confirms discard
    setTitle('config.json *');                // updates the tab title live
  };

  return <textarea onChange={e => handleChange(e.target.value)} />;
}
```

### Lifecycle callbacks

Lifecycle hooks are called at the top level of the panel component. They always call the latest function you pass (no dependency array) and clean up on unmount:

```tsx
import { usePanel, usePanelEvents, usePanelSize, useBeforeClose, useSaveState } from 'react-dockable-desktop';

export default function MapPanel() {
  const { containerType, minimize } = usePanel();  // containerType: 'dockable-panel' | 'floating-window' | …, updates live
  const size = usePanelSize();                     // { width, height } | null — re-renders on resize

  usePanelEvents({
    onActivate:   () => { /* e.g. resume animation, reload data */ },
    onDeactivate: () => { /* e.g. pause background work */ },
    onContainerTypeChange: (type) => { /* e.g. trigger map.resize() after layout change */ },
    onClose:      () => { /* final cleanup — unsubscribe from external stores */ },
  });

  useBeforeClose(async () => confirm('Close the map?'));   // resolve false to keep it open
  useSaveState(() => ({ zoom: currentZoom() }));           // saved with the layout by saveLayout()

  return <div>Map</div>;
}
```

---

## Hooks

Call these inside any component within the `DockableDesktopProvider` tree:

| Hook | Returns | Use For |
| :--- | :--- | :--- |
| `useWorkspace()` | `Workspace` | The workspace: open, close, float, dock, minimize, maximize, serialize panels; `publish`/`subscribe`; `registry` |
| `useWorkspaceState(selector?)` | `WorkspaceState` or selected slice | Read layout, floating windows, active panel ID |
| `useModals()` | `ModalsApi` | Open, close and track modal overlays |
| `useSidePanels()` | `SidePanelsApi` | Open, close and track the left/right side drawers |
| `usePanel()` | `PanelHandle` | Inside a panel: its `id`, live `containerType`, `isActive`, dirty state, dynamic title/icon, `close()`, `minimize()` |
| `usePanelEvents(events)` | `void` | Inside a panel: activate, deactivate, minimize, restore, close, resize, container-type change |
| `useBeforeClose(guard)` | `void` | Inside a panel: a close guard; resolve `false` to keep it open |
| `useSaveState(getState)` | `void` | Inside a panel: state pulled fresh by every `saveLayout()` |
| `usePanelSize()` | `{ width, height } \| null` | Live panel dimensions across docking, floating, and tab changes, no manual subscription |
| `useToolbar()` | `ToolbarContextValue` | Read/write toolbar state (active tool, modifiers) from any panel |
| `useSidebar()` | `SidebarContext` | Open/close sidebar tabs from any component in the `RddSidebar` tree |
| `useSidebarTab()` | `SidebarTabContext` | Self-control for content inside a sidebar tab |
| `useContextMenu()` | `(options) => void` | Show the shared context menu at a pointer event or position |
| `usePanelContextMenu(items)` | `void` | Inject dynamic context menu items into this panel's right-click menu |
| `useFloatingWidgets()` | `FloatingWidgetsApi` | Open/close N named floating widgets inside a panel overlay at runtime; each independently anchored, dockable, and resizable |
| `useFormatMessage()` | `MessageFormatter` | i18n formatter matching the current provider's locale |
| `useMessages()` | `Record<MessageKey, MessageDescriptor>` | The effective built-in message table |
| `useHostClasses()` | `HostClasses` | The class props set on the provider (`modalClass`, `windowClass`, …) |
| `usePanelContribution(contribution)` | `void` | Publish toolbar items/sidebar sections shown only while this panel is active |
| `useActiveContribution()` | `PanelContribution \| null` | Read the active panel's published contribution, to merge manually |
| `useMergedToolbarItems(staticItems)` | `ToolbarItem[]` | `staticItems` + the active panel's contributed toolbar items, ready for `<RddToolbar items={...}>` |
| `useMergedSidebarTabs(staticTabs)` | `SidebarTab[]` | `staticTabs` + the active panel's contributed sections as dynamic tabs, ready for `<RddSidebar tabs={...}>` |
| `useColorScheme()` | `'dark' \| 'light'` | Reactively read the workspace's current color scheme from your own panel content |

**State selectors** prevent unnecessary re-renders:

```ts
// Only re-renders when activePanelId changes — not on every layout mutation:
const activeId = useWorkspaceState(s => s.activePanelId);
const panelCount = useWorkspaceState(s => Object.keys(s.panels).length);
```

---

## Workspace Reference

```ts
const workspace = createWorkspace({ panels, initialState?, formatMessage?, messages?, dir? });

// Panel lifecycle
workspace.openPanel(id, component, options?)   // options: title, initialTarget, anchor
workspace.closePanel(id)
workspace.focusPanel(id)                       // raises floating / selects tab for docked
workspace.floatPanel(id, rect?, anchor?)       // detach to a floating window; optional corner anchor
workspace.dockPanel(id)                        // return floating to the grid
workspace.minimizePanel(id)
workspace.restorePanel(id)
workspace.maximizePanel(id)                    // a minimized panel is restored and maximized
workspace.closeLeafGroup(leafId, opts?)        // closes each tab (guards apply), then the group; returns a Promise

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

## PanelHandle Reference

`usePanel()` returns a `PanelHandle` — in docked panels, floating windows, modals and side drawers alike. Its actions never change identity; the handle object does (it carries live state), so depend on the actions, never on the handle, in dependency arrays:

| Member | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | The panel's instance ID |
| `containerType` | `ContainerType` | Where it is rendered; updates live (a docked panel that is floated re-renders as `'floating-window'`) |
| `isActive` | `boolean` | The globally active panel. Always `false` in a modal or drawer |
| `isMinimized` / `isFloating` | `boolean` | Current state of a workspace panel |
| `close(options?)` | `(options?: CloseOptions) => void` | Request the container to close; respects dirty state and close guards (`{ force: true }` skips them) |
| `minimize()` | `() => void` | Minimize this panel to the taskbar; no effect in a modal or drawer |
| `setDirty(dirty, options?)` | `(dirty: boolean, options?: DirtyStateOptions) => void` | Mark unsaved changes; triggers confirmation dialog on close |
| `setTitle(title)` | `(title: string \| MessageDescriptor) => void` | Change the tab/window title dynamically |
| `setIcon(icon)` | `(icon: ReactNode) => void` | Change a modal's or drawer's header icon. A docked or floating panel shows its registration's `defaultOptions.icon` |

### ContainerType

```ts
type ContainerType =
  | 'dockable-panel'   // panel is docked in the grid
  | 'floating-window'  // panel is in a detached floating window
  | 'left-panel'       // rendered inside the left side drawer
  | 'right-panel'      // rendered inside the right side drawer
  | 'modal'            // rendered inside a modal overlay
  | 'standalone';      // rendered outside the desktop (default / no context)
```

Minimize/restore cycles do **not** change `containerType` or fire `onContainerTypeChange`; use `usePanelEvents({ onMinimize, onRestore })` for those.

---

## Layout Persistence

```ts
// Save on unload (or on any meaningful user action):
window.addEventListener('beforeunload', () => {
  localStorage.setItem('workspace-layout', workspace.saveLayout());
});

// Restore by passing the saved string to createWorkspace():
createWorkspace({
  panels: { ... },
  initialState: localStorage.getItem('workspace-layout'),
});
```

---

## Side Panels & Modals

Add `RddSidePanels` and `RddModals` to your app root. Placement matters — `RddSidePanels` must be **inside** the workspace container so drawers position correctly; `RddModals` goes **outside** as a full-screen overlay:

```tsx
// App.tsx
import { DockableDesktopProvider, RddDesktop, RddSidePanels, RddModals } from 'react-dockable-desktop';

function App() {
  return (
    <DockableDesktopProvider workspace={workspace}>
      <div className="rdd-fill-viewport" style={{ position: 'relative' }}>
        <RddDesktop />
        <RddSidePanels />  {/* inside — drawers position relative to this container */}
      </div>
      <RddModals />        {/* outside — full-screen overlay */}
    </DockableDesktopProvider>
  );
}

// From any component inside the provider:
const modals = useModals();
const sidePanels = useSidePanels();

modals.open(MyForm, { itemId: 42 }, { title: 'Edit Item', size: 'medium' });
sidePanels.openRight(PropertiesPanel, { nodeId }, { title: 'Properties', width: 320 });
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
// 1. Keep html[dir] in sync for portals (context menu, flyout, toasts)
//    that render into document.body and need CSS direction inheritance.
useEffect(() => {
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
}, [isRtl]);

// 2. Pass dir prop to the provider — controls workspace layout engine.
<DockableDesktopProvider
  dir={isRtl ? 'rtl' : 'ltr'}
  workspace={workspace}
  formatMessage={(msg) => intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage })}
  messages={customMessages}
>
```

`dir` can be `'ltr'` (default) or `'rtl'`. All layout, split directions, tab ordering, floating window controls, drop zones, sidebars, and context menus flip automatically.

Direction is **independent of locale** — you can have Arabic translations with LTR layout, or RTL without locale changes.

See the [RTL Support guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/rtl) for the complete wiring pattern and macOS skin notes.

---

## Skins

```tsx
<RddDesktop skin="vscode" />   // default
<RddDesktop skin="macos" />
<RddDesktop skin="nord" />
<RddDesktop skin="tokyo" />
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

All built-in skins include dark and light variants. Create your own skin by overriding CSS custom properties under a `[data-rdd-skin="myskin"]` selector. See the [Theming Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/theming) for the full variable reference and the [Per-skin active state guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/theming#per-skin-active-state-design-language) to customise the sidebar/toolbar active indicator in your own skin.

---

## What's New

Every release is documented in one place — see the
**[CHANGELOG](https://github.com/felipecarrillo100/react-dockable-desktop/blob/main/CHANGELOG.md)**
for the full, up-to-date history of additions, fixes, and breaking changes.

Upgrading across a major version? See the [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration).

---

## Documentation

Complete guides, API reference, and interactive demo at:

**[https://felipecarrillo100.github.io/react-dockable-desktop/](https://felipecarrillo100.github.io/react-dockable-desktop/)**

| Guide | Description |
| :--- | :--- |
| [Installation](https://felipecarrillo100.github.io/react-dockable-desktop/guide/installation) | Requirements, CSS import order, module formats |
| [Quick Start](https://felipecarrillo100.github.io/react-dockable-desktop/guide/quick-start) | Minimal working app with layout persistence |
| [Workspace](https://felipecarrillo100.github.io/react-dockable-desktop/guide/workspace-client) | `createWorkspace`, full imperative API, multiple providers, i18n config |
| [Panel Registry](https://felipecarrillo100.github.io/react-dockable-desktop/guide/panel-registry) | `defaultOptions`, per-workspace registry |
| [Layout System](https://felipecarrillo100.github.io/react-dockable-desktop/guide/layout) | Opening, floating, minimizing, serializing layouts |
| [Panel Lifecycle & Forms](https://felipecarrillo100.github.io/react-dockable-desktop/guide/forms-and-panels) | Dirty state, close guards, `usePanel` and lifecycle hooks |
| [Modals & Side Panels](https://felipecarrillo100.github.io/react-dockable-desktop/guide/modals-and-drawers) | Modal stack, drawers, `RddSidebar` component |
| [Event Bus](https://felipecarrillo100.github.io/react-dockable-desktop/guide/event-bus) | Typed pub/sub, built-in lifecycle events |
| [Theming](https://felipecarrillo100.github.io/react-dockable-desktop/guide/theming) | CSS variables, custom skins, dark/light modes |
| [Advanced Topics](https://felipecarrillo100.github.io/react-dockable-desktop/guide/advanced) | RTL, multiple workspaces, custom header actions, custom drag-resize interactions |
| [Best Practices](https://felipecarrillo100.github.io/react-dockable-desktop/guide/best-practices) | Patterns for production-ready implementations |
| [Panel Overlay](https://felipecarrillo100.github.io/react-dockable-desktop/guide/panel-overlay) | `RddPanelOverlay`, panel toolbars, `RddFloatingWidget`, `useFloatingWidgets` |
| [Toast Notifications](https://felipecarrillo100.github.io/react-dockable-desktop/guide/toast) | `toast` singleton, `<RddToasts>`, queue behaviour, theming, `ToastAdapter` |
| [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration) | Upgrading across major versions |
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

MIT — free to use, adapt, and build upon. See [LICENSE](./LICENSE).

---

## Donations & Sponsoring

Creating and maintaining open-source libraries is a passion of mine. If you find this library useful and it saves you time, please consider supporting its development. Your contributions help keep the project active and motivated!

Every bit of support—whether it's sponsoring on GitHub, a coffee, a star, or a shout-out, is deeply appreciated. Thank you for being part of the community!

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" name="buy-me-a-coffee" alt="Buy Me A Coffee" width="180">](https://buymeacoffee.com/felipecarrillo100)

[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)
