# Architecture — react-dockable-desktop

## Overview

`react-dockable-desktop` is a React component library that provides a complete window management and dockable layout engine. Its primary design goals are:

- **Zero-unmount DOM persistence** — heavy components (WebGL, maps, terminals, stateful forms) survive moves between layout positions without being unmounted.
- **Composable workspace zones** — a split-grid docking area, floating windows, a minimized taskbar, side-panel drawers, and a modal stack operate independently but share a unified state model.
- **Framework-neutral i18n** — all user-facing strings route through a single `MessageFormatter` hook so the host application can plug in any translation engine.
- **RTL-first layout** — text direction is observed dynamically via `MutationObserver` rather than requiring a prop-threading contract from the host.

---

## Repository Layout

```
react-dockable-desktop/
├── src/                     # Published library
│   ├── components/          # Core engine: state, layout, renderers
│   ├── forms/               # Reusable ConfirmationForm modal
│   ├── utils/               # Shared utilities (RTL detection)
│   ├── WorkspaceClient.ts       # WorkspaceClient class (scoped registry + imperative API)
│   ├── index.ts             # Public API surface
│   └── index.css            # CSS variable-driven design tokens
│
├── demo/                    # Leaflet + Monaco open-source demo
├── demo-luciadria/          # LuciadRIA 3D Earth demo (requires license)
├── demo-oldria/             # Legacy RIA demo (archived)
│
├── dist/                    # Build output (gitignored, CI-generated)
├── docs/                    # GitHub Pages target (Vite demo build)
│
├── tsup.config.ts           # Library bundle config (CJS + ESM + .d.ts)
├── vite.config.ts           # Demo app dev server and static build
└── vitest.config.ts         # Test runner
```

---

## Technology Stack

| Concern | Tool | Version |
|---------|------|---------|
| Language | TypeScript | ~6.0 |
| UI framework | React | ^19 |
| Library bundler | tsup (esbuild) | ^8 |
| Demo dev server | Vite | ^8 |
| Test runner | Vitest + jsdom | ^4 |
| Context menus | replace-react-contexify | ^1.1 |
| Styling foundation | Bootstrap 5 (CSS layer only) | ^5.3 |
| i18n (demo) | react-intl | ^10 |

**Peer dependencies** (host app must supply): `react >=16.8`, `react-dom >=16.8`, `replace-react-contexify ^1.1`.

---

## Build Pipeline

### Library build (`tsup`)

```
src/index.ts
  └─ tsup (esbuild) ──► dist/index.js   (CJS)
                    ──► dist/index.mjs  (ESM)
                    ──► dist/index.d.ts (TypeScript declarations)

src/index.css ──► dist/styles.css       (post-build file copy)
```

`react` and `react-dom` are marked `external` so they are never bundled. The output is minified with inline source maps.

### Demo build (`vite build`)

Vite compiles `demo/main.tsx` with root `demo/`, base `/react-dockable-desktop/`, and outputs to `docs/` — the GitHub Pages serving directory.

### CI/CD

`.github/workflows/deploy-pages.yml` runs on every push to `main`:

1. `npm ci`
2. `npm run build` — library bundle + style copy
3. `npm run demo:build` — Vite demo to `docs/`
4. Deploy `docs/` to GitHub Pages

---

## Core Architecture

### State Model

All mutable workspace state lives in a single React context provided by `WindowManagerProvider` (`WindowManagerContext.tsx`). There is no external state library — state is managed with `useState` and `useRef` inside the provider component.

```
WindowState
├── gridRoot: LayoutNode            # Recursive split-grid tree
├── floating: FloatingWindow[]      # Absolute-positioned windows
├── minimized: MinimizedEntry[]     # Taskbar dock queue
├── panels: Record<id, PanelInfo>  # Panel metadata registry
├── activePanelId: string | null
├── draggedPanelId: string | null
└── dir: 'ltr' | 'rtl'
```

**Layout tree** — `LayoutNode` is a discriminated union:

```
LayoutNode
├── LayoutGridNode { type:'branch', orientation, children[], sizes[] }
└── LayoutLeafNode { type:'leaf', id, panels[], activePanelId }
```

Branch nodes split the viewport horizontally or vertically. Leaf nodes are tab groups holding an ordered list of panel IDs and a single active panel. Sizes are stored as fractions (0–1) and applied as `flexGrow`/`flexBasis` percentages during render.

---

### DOM Persistence

This is the most critical architectural decision in the library. Normally, moving a React component between positions in the tree causes it to unmount and remount — destroying WebGL contexts, map tile caches, terminal sessions, and form values.

The solution uses React Portals and a module-level `Map<id, HTMLDivElement>`:

```
                   ┌─────────────────────────────────┐
                   │  WindowManager render output     │
                   │                                  │
                   │  ┌──────────────────────────┐   │
                   │  │  Portal per panel id     │◄──┼── React renders component
                   │  │  target: domCache[id]    │   │   into a detached <div>
                   │  └──────────────────────────┘   │
                   └─────────────────────────────────┘
                                   │
                         domCache.get(id)
                                   │
              ┌────────────────────┴───────────────────┐
              │                                        │
     Panel is visible                          Panel not visible
              │                                        │
   PreservedDOMWrapper                    hiddenContainer (#preserved-dom-container)
   appends domCache[id]                   display:none in document.body
   to its host <div>                      caches domCache[id]
```

Every panel component is rendered exactly once into a detached `HTMLDivElement` via `createPortal`. When a panel becomes the active tab or appears in a floating window, `PreservedDOMWrapper` physically moves that cached element into its host slot using `appendChild`. When the panel is deactivated or minimized, the cleanup in `useEffect` moves it back to the hidden container. React never unmounts the portal — the DOM node simply relocates in the browser's live tree.

**Consequence:** Panel components render once at mount time and never re-render due to a position change. `ResizeObserver` on the host div propagates size changes to the panel lifecycle registry.

---

### Component Hierarchy

```
WindowManagerProvider              # State + actions context
└── PanelProvider                  # Overlay zones context (modals, side panels)
    └── WindowManager              # Main render output
        ├── WorkspaceGrid          # Recursive layout tree renderer
        │   └── LeafGroup          # Tab group: headers + active panel slot
        │       └── PreservedDOMWrapper   # Moves domCache[id] into/out of slot
        │
        ├── FloatingWindow[]       # Absolutely positioned draggable windows
        │   └── PreservedDOMWrapper
        │
        ├── Taskbar                # Minimized icons + hover preview tooltips
        │   └── PreviewDOMWrapper  # Scaled live preview of domCache[id]
        │
        ├── Portal per panel id    # Renders component into domCache[id]
        │   └── FormContainerProviderWrapper
        │       └── FormContainerProvider
        │           └── <PanelComponent panelId={id} />
        │
        └── JsonContextMenu        # replace-react-contexify instance
```

---

### FormContainerContract

Each panel is wrapped in a `FormContainerProvider` that exposes a typed contract to the panel component via `useFormContainer()`:

```typescript
interface FormContainerContract {
  setDirty(dirty: boolean): void;          // appends '*' to title, arms close guard
  onCloseRequested(handler): () => void;   // register async close interceptor
  setTitle(title): void;                   // override tab/titlebar label at runtime
  requestClose(options?): void;            // programmatic close (optionally forced)
  instanceId: string;
  onClose(handler): () => void;            // panel destroyed lifecycle event
  onMinimize(handler): () => void;
  onRestore(handler): () => void;
  onResize(handler): () => void;
}
```

When a close is requested on a dirty panel, `WindowManager` opens a `ConfirmationForm` modal via `PanelProvider.openModal()`. The panel's registered `onCloseRequested` handler resolves the confirmation promise — `true` allows the close, `false` cancels it.

---

### Overlay System (PanelProvider)

`PanelProviderContext` manages a second layout layer completely separate from the docked grid. It has its own state tree for left panels, right panels, and a modal stack.

```
PanelProvider state
├── leftPanels:  PanelInstance[]   # Slide-in drawer from the left edge
├── rightPanels: PanelInstance[]   # Slide-in drawer from the right edge
└── modals:      PanelInstance[]   # Stacked modal overlays

Actions: openLeftPanel, openRightPanel, openModal, closePanel
```

`SidePanelRenderer` (or its named exports `LeftPanelRenderer` / `RightPanelRenderer`) and `ModalStackRenderer` are placed independently in the host app's JSX, allowing them to portal into any DOM node.

Each instance rendered by these components is also wrapped in `FormContainerProvider`, so modals and side panels support the same dirty-state close guard as docked panels.

---

### RTL Detection

`src/utils/rtl.ts` exports `isElementRtl(el)` which walks `el.closest('[dir]')` and falls back to `document.documentElement.dir` / `document.body.dir`.

`WindowManager` runs three `MutationObserver` instances watching `dir` attribute changes on `document.documentElement`, `document.body`, and the closest ancestor `[dir]` element of the workspace container. Any change calls `setDirection()` on the state context, which sets `state.dir`. All rendered elements that need directional mirroring receive `dir={state.dir}` directly as a prop.

---

### Internationalization

The library uses a narrow message-passing contract:

```typescript
type MessageFormatter = (msg: ContextMenuPredefinedMessage) => string;

interface ContextMenuPredefinedMessage {
  id: string;
  defaultMessage?: string;
  values?: Record<string, string | number>;
}
```

`WindowManagerProvider` accepts an optional `formatMessage` prop. If omitted, a built-in template resolver handles `{placeholder}` substitution in `defaultMessage`. The hook `useFormatMessage()` returns whatever resolver is active. All internal UI labels are defined as `ContextMenuPredefinedMessage` objects in `predefinedMessages.ts` and resolved at render time, making the entire UI translatable with zero changes to the library.

---

### Inter-Panel Event Bus

`usePanelContext()` returns `{ publish, subscribe }`. The event bus is a `Map<eventName, Set<handler>>` held inside `WindowManagerContext`. `publish(event, payload)` calls all registered handlers synchronously. `subscribe` returns an unsubscribe function suitable for `useEffect` cleanup. Panels are decoupled — neither needs to import the other.

---

### PanelRegistry

`PanelRegistry` is a module-level singleton (`Map<string, RegistryEntry>`) kept for backward compatibility. `PanelRegistry.register(key, Component, defaultOptions)` stores a mapping of string key → component + metadata.

`PanelRegistryClass` is now exported so each `WorkspaceClient` can hold its own scoped instance — enabling multiple independent workspaces on the same page without shared global state. The global `PanelRegistry` singleton is an instance of `PanelRegistryClass` and continues to work unchanged for existing code.

`WindowManager`, `LeafGroup`, and `PreviewDOMWrapper` resolve panel components via the `useRegistry()` hook, which reads the scoped `PanelRegistryClass` instance from `RegistryContext` rather than importing the global singleton directly. When the `client` prop is omitted from `WindowManagerProvider`, `RegistryContext` falls back to the global singleton.

---

### WorkspaceClient

`WorkspaceClient` is the recommended way to configure a workspace. It follows the same pattern as TanStack `QueryClient` and Redux `store` — created once outside the React tree and passed to the provider:

```typescript
const client = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel, defaultOptions: { title: 'Map', canClose: false } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
  initialState: localStorage.getItem('workspace-layout'), // null → empty canvas
  formatMessage: (msg) => intl.formatMessage(msg),
  dir: 'ltr',
});

<WindowManagerProvider client={client}>
  ...
</WindowManagerProvider>
```

**Why outside the React tree?** Placing configuration and imperative calls outside avoids stale-closure problems and allows any module in the application to call `client.saveLayout()`, `client.openPanel()`, etc. without needing a hook.

**Scoped registry** — each `WorkspaceClient` holds its own `PanelRegistryClass` instance (`client.registry`). When the provider mounts, it passes the scoped registry through `RegistryContext` so all rendering components (`WindowManager`, `LeafGroup`, `PreviewDOMWrapper`) resolve panel components from the correct registry. This enables multiple independent `WorkspaceClient` instances on the same page.

**Empty canvas default** — when `initialState` is `null` or omitted, the provider initialises with a single empty `LayoutLeafNode` (`EMPTY_LEAF`). No panels are pre-opened. The old hard-coded default layout was removed.

**Backward compatibility** — the `client` prop is optional. When omitted, the provider falls back to the global `PanelRegistry` singleton and an empty canvas. Existing code using `PanelRegistry.register` at module scope continues to work unchanged.

---

## Skin System

`WindowManager` accepts a `skin` prop (default `'vscode'`) applied as `data-workspace-skin={skin}` on the root element. All visual styling uses CSS custom properties, so skins override variables without touching component code.

The `data-color-scheme` attribute (`"dark"` | `"light"`) is observed via `MutationObserver` on `document.documentElement` and synced onto the workspace root, ensuring CSS custom property overrides for light mode resolve correctly inside the workspace even when the host app switches themes dynamically.

---

## Testing Strategy

Tests live in `src/components/__tests__/` and run under Vitest with a jsdom environment.

| File | Coverage area |
|------|---------------|
| `CoreLayout.test.tsx` | Grid mutations, split sizing, empty group cleanup |
| `TabOperations.test.tsx` | Tab reordering, active panel switching |
| `SpawnLifecycle.test.tsx` | Panel instantiation, registry validation |
| `PanelSystem.test.tsx` | Panel state transitions, metadata |
| `DomStability.test.tsx` | Zero-unmount DOM preservation during moves |
| `FormContainer.test.tsx` | Dirty state, close guards, title overrides |
| `StateTransitions.test.tsx` | Layout tree transformations |

Visual and drag-and-drop behaviour is not covered by automated tests. The live demo at `https://felipecarrillo100.github.io/react-dockable-desktop/` serves as the manual integration verification surface.

---

## Public API Surface

Exported from `src/index.ts`:

| Export | Type | Description |
|--------|------|-------------|
| `WindowManager` | Component | Main workspace renderer |
| `WindowManagerProvider` | Component | State context provider |
| `PanelRegistry` | Singleton | Component registration catalog |
| `WorkspaceClient` | Class | Configuration + imperative API object (create outside React tree) |
| `WorkspaceClientConfig` | Type | Constructor config: `panels`, `initialState`, `formatMessage`, `predefinedMessages`, `dir` |
| `PanelDefinition` | Type | `{ component, defaultOptions? }` — panel entry in `WorkspaceClientConfig.panels` |
| `PanelRegistryClass` | Class | Exported registry class for scoped instances (used by `WorkspaceClient`) |
| `useRegistry` | Hook | Returns the scoped `PanelRegistryClass` for the current provider |
| `useWindowManagerState` | Hook | Read layout state |
| `useWindowManagerActions` | Hook | Mutate layout (open, close, float, dock…) |
| `useFormatMessage` | Hook | Active message formatter |
| `usePanelContext` | Hook | Inter-panel pub/sub event bus |
| `useFormContainer` | Hook | Panel close guard / dirty state contract |
| `PanelProvider` | Component | Overlay zone context provider |
| `usePanelState` | Hook | Read overlay state |
| `usePanelActions` | Hook | Open modals and side panels |
| `ModalStackRenderer` | Component | Renders modal stack |
| `SidePanelRenderer` | Component | Renders both side drawers |
| `LeftPanelRenderer` | Component | Left drawer only |
| `RightPanelRenderer` | Component | Right drawer only |
| `Sidebar` | Component | Navigation tab strip |
| `ConfirmationForm` | Component | Reusable two-button confirmation modal |
| `formatLabel` | Function | Resolves a title value to a string |
| `defaultPredefinedMessages` | Object | Default i18n message catalog |
| TypeScript types | — | Full type export for all interfaces |
