# React Dockable Desktop

[![npm version](https://img.shields.io/badge/npm-v3.2.0-blue.svg)](https://www.npmjs.com/package/react-dockable-desktop)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178c6.svg)](https://www.typescriptlang.org/)
[![Touch Ready](https://img.shields.io/badge/touch-iPad%20%7C%20Android-success.svg)](#touch--mobile)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)
[![Docs](https://img.shields.io/badge/docs-site-blue.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/)

A premium dockable layout engine for React. Build desktop-class applications with fluid split-docking grids, tabbed panels, resizable floating windows, and **zero-unmount DOM preservation** — so WebGL contexts, live maps, and stateful editors never lose their state when moved or re-tabbed.

**[Live Demo](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)** &nbsp;|&nbsp;
**[Full Documentation](https://felipecarrillo100.github.io/react-dockable-desktop/)** &nbsp;|&nbsp;
**[API Reference](https://felipecarrillo100.github.io/react-dockable-desktop/api/)**

---

## Features

- **Split-Docking Grid** — drag panels to split any zone into rows/columns or group into tabbed containers
- **Workspace Edge Docking** — drag to the outer edges to dock a panel as a full-width or full-height strip
- **Floating Windows** — pop panels into freely resizable floating windows; 8-direction resize handles (N/NE/E/SE/S/SW/W/NW), maximize, minimize
- **Touch & Mobile Ready** — full iPad and Android support: long-press to drag tabs, touch resize, 44px coarse-pointer targets throughout
- **Zero-Unmount DOM Persistence** — panel DOM nodes are moved, never destroyed; WebGL, maps, terminals, and forms retain full state
- **i18n & RTL** — full Right-to-Left layout support; `dir="rtl"` flips every control, tab order, and drop zone automatically
- **Inter-Panel Pub/Sub** — lightweight typed event bus for decoupled panel-to-panel communication
- **Imperative API** — `WorkspaceClient` opens, closes, focuses, and serializes panels from anywhere — inside or outside React
- **Layout Serialization** — save and restore the full workspace as a JSON string; survives page reloads
- **7 Built-in Skins** — VSCode, macOS, Chrome, Slate, Nord, Obsidian, Tokyo — all fully themeable via CSS variables
- **TypeScript-first** — complete type definitions included; no separate `@types/` package needed

---

## Installation

```bash
npm install react-dockable-desktop replace-react-contexify
```

Import styles in your app entry file. **Order matters** — the contexify sheet must come first:

```ts
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

**Requirements:** React ≥ 16.8 · Node ≥ 18

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

---

## Hooks

Call these inside any component within the `DockableDesktopProvider` tree:

| Hook | Returns | Use For |
| :--- | :--- | :--- |
| `useWindowManagerActions()` | `WindowActions` | Open, close, float, dock, minimize, maximize, serialize panels |
| `useWindowManagerState(selector?)` | `WindowState` or selected slice | Read layout, floating windows, active panel ID |
| `usePanelActions()` | `PanelActions` | Open modal overlays and left/right side drawers |
| `usePanelContext()` | `{ publish, subscribe }` | Inter-panel typed event bus |
| `useFormContainer()` | `FormContainerContract` | Dirty state, close guards, dynamic panel title/icon |
| `usePanelId()` | `string` | The panel's own instance ID — no prop drilling needed |
| `useToolbar()` | `ToolbarContextValue` | Read/write Toolbar state (active tool, modifiers) from any panel |
| `useSidebar()` | `SidebarContextValue` | Open/close Sidebar tabs from any component in the Sidebar tree |
| `useSidebarTab()` | `SidebarTabContext` | Self-control for content inside a Sidebar tab |
| `usePanelContextMenu(items)` | `void` | Inject dynamic context menu items into this panel's right-click menu |
| `useRegistry()` | `PanelRegistryClass` | The scoped panel registry for the current provider |
| `useFormatMessage()` | `MessageFormatter` | i18n formatter matching the current provider's locale |

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
workspace.openPanel(id, component, options?)   // options: title, initialTarget, stickyRight, stickyBottom
workspace.closePanel(id)
workspace.focusPanel(id)                       // raises floating / selects tab for docked
workspace.floatPanel(id, rect?)                // detach to a floating window
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

```tsx
<DockableDesktopProvider
  dir="rtl"
  formatMessage={(msg) => intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage })}
  predefinedMessages={customMessages}
>
```

`dir` can be `'ltr'` (default) or `'rtl'`. All layout, split directions, tab ordering, drop zones, and context menus flip automatically. You can also switch at runtime:

```ts
workspace.setDirection('rtl');
```

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
| [Advanced Topics](https://felipecarrillo100.github.io/react-dockable-desktop/guide/advanced) | RTL, multiple workspaces, custom header actions |
| [Best Practices](https://felipecarrillo100.github.io/react-dockable-desktop/guide/best-practices) | Patterns for production-ready implementations |
| [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration) | Upgrade from v1 → v2 → v3 |
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
