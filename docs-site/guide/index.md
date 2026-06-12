# Introduction

`react-dockable-desktop` is a premium, state-of-the-art window manager and dockable layout engine for React. It lets you build VS Code–style, JetBrains–style, or any kind of multi-panel desktop application in the browser.

## What it does

- **Dockable splits and tabs** — drag panels to any edge of a group to split the view, or to the center to tab them together.
- **Floating windows** — pop any panel out as a resizable, draggable window. Supports maximize, sticky right/bottom, and z-index stacking.
- **Zero-unmount DOM preservation** — the layout engine moves DOM nodes (WebGL contexts, Leaflet maps, CodeMirror editors) without destroying them.
- **Layout serialization** — `saveLayout()` / `loadLayout()` round-trip your entire workspace to/from JSON. Persist to `localStorage`, IndexedDB, or a server.
- **i18n and RTL** — all built-in strings are translatable. RTL layout (Arabic, Hebrew, Persian) is auto-detected and fully supported.
- **Pub/sub event bus** — panels publish and subscribe to events without prop drilling.
- **Dirty-state close guards** — panels can intercept close requests and show a confirmation dialog when unsaved changes are present.

## Design philosophy

The library follows the **WorkspaceClient pattern**, inspired by TanStack QueryClient and Redux store. Configuration and imperative API live on a single client object that you create **outside the React tree**. The React provider is a thin rendering layer that binds to the client.

This means you can call `client.openPanel()`, `client.saveLayout()`, `client.focusPanel()` from **anywhere** — button handlers, keyboard shortcuts, server-sent events — without needing `useRef` hacks or context access.

## Peer dependencies

```bash
npm install react-dockable-desktop replace-react-contexify
```

Import the CSS in your entry file:

```ts
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

> **C5 warning:** In development mode, the provider will print a `console.warn` if the `replace-react-contexify` stylesheet is not detected. Context menus will not render correctly without it.

## Next steps

- [Installation →](./installation)
- [Quick Start →](./quick-start)
- [WorkspaceClient →](./workspace-client)
