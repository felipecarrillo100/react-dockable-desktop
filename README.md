# React Dockable Desktop

[![npm version](https://img.shields.io/badge/npm-v2.0.0-blue.svg)](https://www.npmjs.com/package/react-dockable-desktop)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)
[![Docs](https://img.shields.io/badge/docs-site-blue.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/)

A premium React window manager and dockable layout engine. Fluid split-docking grids, resizable floating windows, dynamic taskbars, and tabbed panels with **zero-unmount DOM persistence** and **built-in i18n/RTL support**.

**[Full Documentation](https://felipecarrillo100.github.io/react-dockable-desktop/)** &nbsp;|&nbsp;
**[Live Demo](https://felipecarrillo100.github.io/react-dockable-desktop/demo/)** &nbsp;|&nbsp;
**[API Reference](https://felipecarrillo100.github.io/react-dockable-desktop/api/)**

---

## Key Features

- **Dockable Splits & Tab Grid** — drag panels to split screens or group them into tabbed containers
- **Workspace Edge Docking** — drag to outer edges to dock as full-width/height columns or rows
- **Floating Windows** — pop panels into resizable floating windows with maximize and minimize
- **Zero-Unmount DOM Persistence** — WebGL, maps, terminals, and stateful forms keep their DOM node and state when moved
- **i18n & RTL** — full Right-to-Left layout support with automatic `dir="rtl"` detection
- **Inter-Panel Pub/Sub** — decoupled lightweight messaging between active panels
- **Imperative API** — `WorkspaceClient` lets you open, close, focus, and serialize panels from anywhere outside React
- **Layout Serialization** — save/restore the full workspace layout as a JSON string

---

## Installation

```bash
npm install react-dockable-desktop replace-react-contexify
```

Import styles in your entry file:

```ts
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

---

## Quick Start

### 1. Create a WorkspaceClient

```ts
import { WorkspaceClient } from 'react-dockable-desktop';
import MapPanel from './panels/MapPanel';
import EditorPanel from './panels/EditorPanel';

export const client = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map View' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
  initialState: localStorage.getItem('workspace-layout'),
});
```

### 2. Mount the Provider

```tsx
import { WindowManagerProvider, WindowManager, PanelProvider, ModalStackRenderer, SidePanelRenderer } from 'react-dockable-desktop';
import { client } from './workspaceClient';

function App() {
  return (
    <WindowManagerProvider client={client}>
      <PanelProvider>
        <div style={{ width: '100vw', height: '100vh' }}>
          <WindowManager />
        </div>
        <ModalStackRenderer />
        <SidePanelRenderer />
      </PanelProvider>
    </WindowManagerProvider>
  );
}
```

### 3. Open Panels Imperatively

```ts
// From anywhere outside React:
client.openPanel('map-1', 'map', { title: 'Satellite View' });
client.focusPanel('map-1');
client.saveLayout();

// Query state:
client.isOpen('map-1');          // boolean
client.getOpenPanelIds();        // string[]
```

---

## Hooks

Use these inside any component within the provider tree:

| Hook | Returns | Description |
| :--- | :--- | :--- |
| `useWindowManagerActions()` | `WindowActions` | Open, close, focus, dock, float, minimize, maximize, serialize panels |
| `useWindowManagerState()` | `WindowState` | Reactive access to grid layout, floating windows, minimized panels |
| `useRegistry()` | `PanelRegistryClass` | The scoped panel registry for the current provider |
| `usePanelContext()` | `{ publish, subscribe }` | Inter-panel pub/sub event bus |
| `useFormContainer()` | `FormContainerContract` | Dirty-state tracking, dynamic title overrides, close guards |
| `useFormatMessage()` | `(msg) => string` | Translation formatter matching the provider's i18n config |

---

## v2.0.0 — Breaking Changes

| Removed | Replacement |
| :--- | :--- |
| `bringToFront(id)` | `focusPanel(id)` — works for both floating and docked panels |
| `setActivePanel(id)` on `WindowActions` | `focusPanel(id)` |

**New in v2.0.0:**
- `focusPanel(id)` — unified "show this panel" method
- `isOpen(id): boolean` — synchronous panel state query
- `getOpenPanelIds(): string[]` — list all open panel IDs
- Pending-call queue: imperative calls before the provider mounts are automatically buffered and replayed
- DEV-mode warning if `client=` prop is missing on the provider
- DEV-mode warning if `replace-react-contexify` CSS is not detected

See the [Migration Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration) for the full list of changes.

---

## Demo Environments

```bash
npm run dev          # Leaflet + Monaco open-source demo
npm run dev:ria      # LuciadRIA 3D Earth demo (requires license)
```

---

## Documentation

Full narrative guides, API reference, and the interactive demo are published at:

**https://felipecarrillo100.github.io/react-dockable-desktop/**

- [Getting Started](https://felipecarrillo100.github.io/react-dockable-desktop/guide/)
- [WorkspaceClient Guide](https://felipecarrillo100.github.io/react-dockable-desktop/guide/workspace-client)
- [Layout System](https://felipecarrillo100.github.io/react-dockable-desktop/guide/layout)
- [API Reference](https://felipecarrillo100.github.io/react-dockable-desktop/api/)
- [Migration v1 → v2](https://felipecarrillo100.github.io/react-dockable-desktop/guide/migration)

---

## License

MIT. Free to use, adapt, and build upon.
