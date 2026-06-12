# Quick Start

A complete, runnable minimal application. Every file shown is copy-paste ready — no guesswork.

## Step 0 — Import the CSS

The library stylesheet **must be imported in your entry point**. It provides the critical layout rules (`height: 100%`, `overflow: hidden`, CSS custom properties for all skins). Without it the workspace renders as a **black screen with no errors**.

```ts
// main.tsx  (or index.tsx — wherever you call createRoot)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'react-dockable-desktop/styles.css';  // ← required — add this first
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

> **Order matters.** Import `react-dockable-desktop/styles.css` before any stylesheet that overrides CSS custom properties.

## Step 1 — Register panels

Create a `WorkspaceClient` **outside the React tree**. It holds your panel catalog and the imperative API. Think of it like a TanStack `QueryClient` — one instance, referenced from anywhere.

```ts
// workspace.ts
import { WorkspaceClient } from 'react-dockable-desktop';
import { MapPanel }    from './panels/MapPanel';
import { EditorPanel } from './panels/EditorPanel';

export const workspace = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
  // Pass a saved layout string to restore a previous session.
  // null is fine on first load — it starts with an empty canvas.
  initialState: localStorage.getItem('workspace-layout'),
});
```

## Step 2 — Mount the provider

`DockableDesktopProvider` wraps `WindowManagerProvider` and `PanelProvider` in the correct order. Open your initial panels in a `useEffect` — calls made before the provider mounts are queued and replayed automatically.

```tsx
// App.tsx
import { useEffect } from 'react';
import {
  DockableDesktopProvider,
  WindowManager,
  ModalStackRenderer,
  SidePanelRenderer,
} from 'react-dockable-desktop';
import { workspace } from './workspace';

export default function App() {
  useEffect(() => {
    // Open panels on first load.
    // These calls are safe even if they run before the provider mounts —
    // they are queued and replayed once the workspace is ready.
    workspace.openPanel('main-map',    'map');
    workspace.openPanel('main-editor', 'editor');
  }, []);

  return (
    <DockableDesktopProvider client={workspace}>
      {/* The workspace must have an explicit height — 100vh is the simplest choice. */}
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <WindowManager />
        <SidePanelRenderer />   {/* must be a sibling of WindowManager, inside the sized container */}
      </div>
      <ModalStackRenderer />    {/* full-screen overlay — lives outside the workspace div */}
    </DockableDesktopProvider>
  );
}
```

::: tip Why `useEffect` and not a top-level call?
Both work. A top-level `workspace.openPanel(...)` before the component tree mounts is queued and replayed; a `useEffect` is queued and replayed too. The `useEffect` form makes React StrictMode behaviour explicit (the effect runs once in production). If you have a saved layout in `initialState`, you can skip `openPanel` entirely — the layout is restored automatically.
:::

**What you'll see:** A dark VS Code–style workspace with two side-by-side tabs labelled "Map" and "Editor". Each shows its panel ID. You can drag tabs to create splits, pop them out as floating windows, and minimize them to the taskbar at the bottom.

## Step 3 — Write panel components

Each panel component receives a `panelId` prop automatically. It should fill its container:

```tsx
// panels/MapPanel.tsx
export function MapPanel({ panelId }: { panelId: string }) {
  return (
    <div style={{ width: '100%', height: '100%', padding: '1rem' }}>
      Panel ID: {panelId}
    </div>
  );
}
```

If you don't need the `panelId` in props, use the `usePanelId()` hook — no changes to your component signature required:

```tsx
// panels/EditorPanel.tsx
import { usePanelId } from 'react-dockable-desktop';

export function EditorPanel() {
  const panelId = usePanelId();  // works in any panel container (docked, floating, modal, side)
  return (
    <div style={{ width: '100%', height: '100%', padding: '1rem' }}>
      Panel ID: {panelId}
    </div>
  );
}
```

## Step 4 — Save & restore layout

```ts
// Save before the tab closes:
window.addEventListener('beforeunload', () =>
  localStorage.setItem('workspace-layout', workspace.saveLayout())
);
```

Pass the saved string as `initialState` in the `WorkspaceClient` constructor (Step 1). The layout is restored automatically on the next load — no `openPanel` calls needed.

---

## Minimal single-file version

If you prefer to explore before structuring a project, here is the entire quick start inlined into one file:

::: details Click to expand — `App.tsx` (all-in-one)

```tsx
// App.tsx — everything in one file for quick exploration
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import 'react-dockable-desktop/styles.css';
import {
  WorkspaceClient,
  DockableDesktopProvider,
  WindowManager,
  ModalStackRenderer,
  SidePanelRenderer,
  usePanelId,
} from 'react-dockable-desktop';

function MapPanel() {
  const panelId = usePanelId();
  return <div style={{ padding: '1rem' }}>Map panel — ID: {panelId}</div>;
}

function EditorPanel() {
  const panelId = usePanelId();
  return <div style={{ padding: '1rem' }}>Editor panel — ID: {panelId}</div>;
}

const workspace = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
});

export default function App() {
  useEffect(() => {
    workspace.openPanel('main-map',    'map');
    workspace.openPanel('main-editor', 'editor');
  }, []);

  return (
    <DockableDesktopProvider client={workspace}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <WindowManager />
        <SidePanelRenderer />
      </div>
      <ModalStackRenderer />
    </DockableDesktopProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

:::

::: info `replace-react-contexify` peer dependency
The library uses [`replace-react-contexify`](https://www.npmjs.com/package/replace-react-contexify) to power right-click context menus on tabs and panels. Install it alongside `react-dockable-desktop` and import its stylesheet in your entry point:

```bash
npm install react-dockable-desktop replace-react-contexify
```

```ts
// main.tsx
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

Without the stylesheet, context menus will render without styles but the rest of the workspace works normally.
:::

---

## Troubleshooting

**Black screen, no errors in console**
: The CSS import is missing. Add `import 'react-dockable-desktop/styles.css'` to `main.tsx` as the first import.

**"Grid Empty" text / no panels visible**
: No panels have been opened. Call `workspace.openPanel(id, componentKey)` in a `useEffect` or pass a layout via `initialState`. The workspace starts with an empty canvas if neither is provided.

**Side drawer / modal renders in the wrong place**
: `SidePanelRenderer` must be a direct sibling of `WindowManager` **inside** the sized container. `ModalStackRenderer` goes **outside** that container (it is a full-screen overlay). See the structure in Step 2.

**`panelId` prop is `undefined`**
: The component is being rendered outside a `DockableDesktopProvider`. The prop and the `usePanelId()` hook both require the provider in the ancestor tree.

**Workspace collapses to zero height**
: The workspace wrapper needs an explicit height. Use `height: 100vh` (full viewport) or `height: 100%` with `height: 100%` on all ancestor elements up to `<html>`.

---

## Next steps

- [WorkspaceClient in depth →](./workspace-client)
- [Layout serialization →](./layout)
- [Advanced topics →](./advanced)
- [API Reference →](/api/)
