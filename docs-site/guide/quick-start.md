# Quick Start

A complete, runnable minimal application. Every file shown is copy-paste ready — no guesswork.

## Step 0 — Import the CSS

The library stylesheet **must be imported in your entry point**. It provides the layout rules and the CSS custom properties for all skins. Without it the workspace renders as a **black screen with no errors**.

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

Create a workspace with `createWorkspace()` **outside the React tree**. It holds your panel catalog and the imperative API. Think of it like a TanStack `QueryClient` — one instance, referenced from anywhere.

```ts
// workspace.ts
import { createWorkspace } from 'react-dockable-desktop';
import { MapPanel }    from './panels/MapPanel';
import { EditorPanel } from './panels/EditorPanel';

export const workspace = createWorkspace({
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

`DockableDesktopProvider` is the only provider you need. Open your initial panels in a `useEffect`, or anywhere else — the workspace is live from the moment `createWorkspace()` returns, so calls apply immediately even before the provider mounts.

```tsx
// App.tsx
import { useEffect } from 'react';
import {
  DockableDesktopProvider,
  RddDesktop,
  RddModals,
  RddSidePanels,
} from 'react-dockable-desktop';
import { workspace } from './workspace';

export default function App() {
  useEffect(() => {
    // Open panels on first load.
    workspace.openPanel('main-map',    'map');
    workspace.openPanel('main-editor', 'editor');
  }, []);

  return (
    <DockableDesktopProvider workspace={workspace}>
      {/* The workspace must have an explicit height — rdd-fill-viewport makes it fill the window. */}
      <div className="rdd-fill-viewport" style={{ position: 'relative' }}>
        <RddDesktop />
        <RddSidePanels />   {/* must be a sibling of RddDesktop, inside the sized container */}
      </div>
      <RddModals />         {/* full-screen overlay — lives outside the workspace div */}
    </DockableDesktopProvider>
  );
}
```

The stylesheet styles nothing outside the library's own elements, so the browser's default `8px` body margin is still there. Remove it in your app CSS (`body { margin: 0 }`), or skip the class and add `html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }` instead.

::: tip Why `useEffect` and not a top-level call?
Both work: the workspace is live before the provider mounts, so a top-level `workspace.openPanel(...)` applies immediately. The `useEffect` form makes React StrictMode behaviour explicit (the effect runs once in production). If you have a saved layout in `initialState`, you can skip `openPanel` entirely — the layout is restored automatically.
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

If you don't need the `panelId` in props, read it from the `usePanel()` hook — no changes to your component signature required:

```tsx
// panels/EditorPanel.tsx
import { usePanel } from 'react-dockable-desktop';

export function EditorPanel() {
  const panelId = usePanel().id;  // works in any panel container (docked, floating, modal, side)
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

Pass the saved string as `initialState` to `createWorkspace()` (Step 1). The layout is restored automatically on the next load — no `openPanel` calls needed.

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
  createWorkspace,
  DockableDesktopProvider,
  RddDesktop,
  RddModals,
  RddSidePanels,
  usePanel,
} from 'react-dockable-desktop';

function MapPanel() {
  const { id } = usePanel();
  return <div style={{ padding: '1rem' }}>Map panel — ID: {id}</div>;
}

function EditorPanel() {
  const { id } = usePanel();
  return <div style={{ padding: '1rem' }}>Editor panel — ID: {id}</div>;
}

const workspace = createWorkspace({
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
    <DockableDesktopProvider workspace={workspace}>
      <div className="rdd-fill-viewport" style={{ position: 'relative' }}>
        <RddDesktop />
        <RddSidePanels />
      </div>
      <RddModals />
    </DockableDesktopProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

:::

::: tip Context menus are built-in
Right-click context menus (on tabs and taskbar chips; a floating window gets a ⋮ button when its panel adds its own items) are built into `DockableDesktopProvider` — no extra package or component needed.
:::

---

## Troubleshooting

**Black screen, no errors in console**
: The CSS import is missing. Add `import 'react-dockable-desktop/styles.css'` to `main.tsx` as the first import.

**"Grid Empty" text / no panels visible**
: No panels have been opened. Call `workspace.openPanel(id, componentKey)` in a `useEffect` or pass a layout via `initialState`. The workspace starts with an empty canvas if neither is provided.

**Side drawer / modal renders in the wrong place**
: `RddSidePanels` must be a direct sibling of `RddDesktop` **inside** the sized container. `RddModals` goes **outside** that container (it is a full-screen overlay). See the structure in Step 2.

**`panelId` prop is `undefined`**
: The component is being rendered outside a `DockableDesktopProvider`. The prop and `usePanel()` both require the provider in the ancestor tree.

**Workspace collapses to zero height**
: The workspace wrapper needs an explicit height. Use `className="rdd-fill-viewport"` (full viewport), `height: 100vh`, or `height: 100%` with `height: 100%` on all ancestor elements up to `<html>` — the library stylesheet doesn't set them for you.

---

## Next steps

- [The workspace in depth →](./workspace-client)
- [Layout serialization →](./layout)
- [Advanced topics →](./advanced)
- [API Reference →](/api/)
