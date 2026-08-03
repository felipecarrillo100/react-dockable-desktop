# Panel Overlay

The Panel Overlay system adds a **panel-scoped overlay layer** to any container — anchored toolbars, buttons, search, and corner-anchored floating info windows. Everything renders inside the panel's own DOM boundary and shares one unified infrastructure for z-ordering, drag state, and corner docking.

::: tip Distinct from `<Toolbar>`
`<Toolbar>` (see [Toolbar →](./toolbar)) is a **workspace-level** tool strip for radio tools, toggles, and action groups that live outside any individual panel. Panel Overlay is **panel-scoped** — it renders inside a single panel container and is invisible to every other panel.
:::

## When to use it

- A map, 3D viewer, or canvas editor that needs toolbar controls positioned over the panel content.
- Any panel that shows one or more togglable info widgets (layer list, feature detail, legend, camera feed) as small floating windows anchored to panel corners.
- Scenarios where N windows need to be spawned dynamically at runtime from data or event handlers.

---

## `PanelOverlayRoot`

`PanelOverlayRoot` is the provider and container for the entire overlay system. It must wrap all toolbar and floating window components.

```tsx
import {
  PanelOverlayRoot,
  PanelToolbar,
  ToolbarButton,
} from 'react-dockable-desktop';

function MapPanel() {
  return (
    <PanelOverlayRoot style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Your panel content goes here */}
      <div id="map-container" style={{ width: '100%', height: '100%' }} />

      {/* Toolbars and floating windows are siblings of the content */}
      <PanelToolbar position="top">
        <ToolbarButton icon={<ZoomInIcon />} title="Zoom in" onClick={zoomIn} />
      </PanelToolbar>
    </PanelOverlayRoot>
  );
}
```

**Requirements:**
- Must have an explicit size. Give the root element `position: relative` and a known width/height (usually `width: 100%; height: 100%` to fill the panel).
- All `PanelToolbar` and `PanelFloatingWindow` components must be **descendants** of the same `PanelOverlayRoot`.

### `PanelOverlayRootProps`

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Panel content plus toolbars and floating windows. |
| `className?` | `string` | Extra CSS class applied to the root `div`. |
| `style?` | `React.CSSProperties` | Inline style. Use to set dimensions and `position: relative`. |

---

## `PanelToolbar`

A toolbar strip that attaches to any edge of the `PanelOverlayRoot` container. Multiple toolbars can coexist — left/right toolbars automatically inset by the height of any registered top/bottom toolbars so they never overlap.

```tsx
<PanelToolbar position="top" variant="frosted" buttonVariant="ghost">
  {/* toolbar content */}
</PanelToolbar>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `ToolbarPosition` | — | **Required.** Which edge to attach to. One of `'top'`, `'bottom'`, `'left'`, `'right'`. |
| `variant` | `'transparent' \| 'frosted' \| 'solid'` | `'transparent'` | Background style. `frosted` adds a blur/tint; `solid` uses the panel background color. |
| `buttonVariant` | `'ghost' \| 'soft' \| 'outlined' \| 'filled'` | `'ghost'` | Default button appearance inherited by all child buttons. Overridable per-button. |
| `buttonSize` | `number` | — | Overrides the `--rdd-panel-toolbar-btn-size` CSS variable (pixels). |
| `className` | `string` | — | Extra CSS class. |
| `style` | `React.CSSProperties` | — | Inline styles merged after position styles. |

### Multi-toolbar inset behaviour

When you add both a `top` and a `left` toolbar, the library measures the top toolbar's height on mount and automatically insets the left toolbar so they don't overlap:

```tsx
<PanelOverlayRoot style={{ width: '100%', height: '100%', position: 'relative' }}>
  <div id="map" style={{ width: '100%', height: '100%' }} />

  {/* Top bar — 36px high */}
  <PanelToolbar position="top" variant="frosted">
    <ToolbarToggle icon={<LayersIcon />} active={showLayers} onToggle={() => setShowLayers(v => !v)} title="Layers" />
  </PanelToolbar>

  {/* Left bar — top edge insets by 36px automatically */}
  <PanelToolbar position="left">
    <ToolbarButton icon={<ZoomInIcon />} onClick={zoomIn} title="Zoom in" />
    <ToolbarButton icon={<ZoomOutIcon />} onClick={zoomOut} title="Zoom out" />
  </PanelToolbar>
</PanelOverlayRoot>
```

---

## Toolbar primitives

### `ToolbarButton`

A single action button. Clicking fires `onClick` and does not change any toggle state.

```tsx
<ToolbarButton icon={<SaveIcon />} onClick={handleSave} title="Save" />
```

| Prop | Type | Description |
|------|------|-------------|
| `icon` | `ReactNode` | Button icon. Recommended: 16×16 SVG with `stroke="currentColor"`. |
| `onClick` | `() => void` | Called on click. |
| `title?` | `string` | Tooltip and accessible label. |
| `disabled?` | `boolean` | Disables the button (35% opacity). |
| `variant?` | `ButtonVariant` | Overrides the toolbar's `buttonVariant` for this button only. |

### `ToolbarToggle`

An on/off toggle button. The caller owns the boolean state.

```tsx
const [wrap, setWrap] = useState(false);

<ToolbarToggle
  icon={<WrapIcon />}
  active={wrap}
  onToggle={() => setWrap(v => !v)}
  title="Wrap lines"
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `icon` | `ReactNode` | Button icon. |
| `active` | `boolean` | Whether the button appears pressed. |
| `onToggle` | `() => void` | Called on click; you must flip `active` in response. |
| `title?` | `string` | Tooltip and accessible label. |
| `disabled?` | `boolean` | Disables the button. |
| `variant?` | `ButtonVariant` | Per-button variant override. |

### `PanelToolbarSeparator`

A thin visual divider for grouping related buttons.

```tsx
<ToolbarButton icon={<RunIcon />} onClick={run} title="Run" />
<PanelToolbarSeparator />
<ToolbarButton icon={<FormatIcon />} onClick={format} title="Format" />
<ToolbarButton icon={<WrapIcon />}  onClick={wrap}   title="Wrap" />
```

### `ToolbarSpacer`

A flex push spacer that pushes subsequent items to the opposite end.

```tsx
<PanelToolbar position="top">
  <ToolbarButton icon={<MenuIcon />} onClick={openMenu} title="Menu" />
  <ToolbarSpacer />                                      {/* pushes right */}
  <ToolbarButton icon={<SettingsIcon />} onClick={openSettings} title="Settings" />
</PanelToolbar>
```

### `ToolbarCenter`

Wraps children in a centered section (uses `margin: 0 auto`).

```tsx
<PanelToolbar position="top">
  <ToolbarCenter>
    <span style={{ fontSize: 12, opacity: 0.7 }}>Map View — London</span>
  </ToolbarCenter>
</PanelToolbar>
```

### `ToolbarSearchInput`

An async search box with debounced query dispatch and a portal-rendered dropdown.

```tsx
<ToolbarSearchInput
  placeholder="Search features…"
  onSearch={async (query, signal) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    return res.json(); // SearchResult[]
  }}
  onSelect={(result) => {
    map.flyTo(result.coords);
  }}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `placeholder?` | `string` | Input placeholder (default: `'Search…'`). |
| `onSearch` | `(query: string, signal: AbortSignal) => Promise<SearchResult[]> \| SearchResult[]` | Called 300 ms after the user stops typing. Receives an `AbortSignal` that fires when a new query cancels the previous one. |
| `onSelect` | `(result: SearchResult) => void` | Called when the user picks a result; closes the dropdown. |

#### `SearchResult` shape

```typescript
interface SearchResult {
  id: string;
  label: string;
  description?: string;  // shown as secondary text
  group?: string;        // optional group header in dropdown
  icon?: ReactNode;      // optional icon in result row
}
```

### Complete toolbar example

```tsx
<PanelToolbar position="top" variant="frosted">
  <ToolbarToggle icon={<LayersIcon />} active={showLayers} onToggle={() => setShowLayers(v => !v)} title="Layers" />
  <ToolbarToggle icon={<InfoIcon />}   active={showInfo}   onToggle={() => setShowInfo(v => !v)}   title="Info"   />
  <PanelToolbarSeparator />
  <ToolbarButton icon={<ZoomInIcon />}  onClick={zoomIn}  title="Zoom in"  />
  <ToolbarButton icon={<ZoomOutIcon />} onClick={zoomOut} title="Zoom out" />
  <ToolbarSpacer />
  <ToolbarSearchInput placeholder="Search…" onSearch={search} onSelect={goTo} />
</PanelToolbar>
```

---

## `PanelFloatingWindow` — declarative pattern

Use `PanelFloatingWindow` when you have a **fixed, known set** of floating windows toggled by toolbar buttons. You own the open/close boolean.

```tsx
import {
  PanelFloatingWindow,
  usePanelFloatingWindow,
} from 'react-dockable-desktop';

function MapPanel() {
  const layerTree = usePanelFloatingWindow();
  const featureInfo = usePanelFloatingWindow();

  return (
    <PanelOverlayRoot style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div id="map" style={{ width: '100%', height: '100%' }} />

      <PanelToolbar position="top" variant="frosted">
        <ToolbarToggle
          icon={<LayersIcon />}
          active={layerTree.isOpen}
          onToggle={() => layerTree.isOpen ? layerTree.close() : layerTree.open()}
          title="Layers"
        />
        <ToolbarToggle
          icon={<InfoIcon />}
          active={featureInfo.isOpen}
          onToggle={() => featureInfo.isOpen ? featureInfo.close() : featureInfo.open()}
          title="Feature info"
        />
      </PanelToolbar>

      <PanelFloatingWindow
        id="layer-tree"
        title="Layers"
        icon={<LayersIcon />}
        open={layerTree.isOpen}
        onClose={layerTree.close}
        defaultAnchor="top-right"
        defaultWidth={280}
        defaultHeight={360}
      >
        <LayerTreeContent />
      </PanelFloatingWindow>

      <PanelFloatingWindow
        id="feature-info"
        title="Feature Info"
        open={featureInfo.isOpen}
        onClose={featureInfo.close}
        defaultAnchor="bottom-right"
        defaultWidth={300}
        defaultHeight={200}
      >
        <FeatureInfoContent />
      </PanelFloatingWindow>
    </PanelOverlayRoot>
  );
}
```

### `usePanelFloatingWindow()`

A convenience hook that manages the open/close boolean for a single `PanelFloatingWindow`. Returns a `UsePanelFloatingWindowReturn` object.

```typescript
const { isOpen, open, close } = usePanelFloatingWindow();
```

| Value | Type | Description |
|-------|------|-------------|
| `isOpen` | `boolean` | Current open state. |
| `open` | `() => void` | Opens the window. |
| `close` | `() => void` | Closes the window. |

To type a variable holding the hook result, import `UsePanelFloatingWindowReturn`:

```ts
import type { UsePanelFloatingWindowReturn } from 'react-dockable-desktop';

const layerTree: UsePanelFloatingWindowReturn = usePanelFloatingWindow();
```

### `PanelFloatingWindowProps`

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Unique identifier. Used as the key in z-order and stack tracking. |
| `title` | `string` | Text shown in the window header bar. |
| `icon?` | `ReactNode` | Optional icon shown to the left of the title in the header. Recommended: 12–14 px SVG with `stroke="currentColor"`. |
| `open` | `boolean` | Mounts/unmounts the window. |
| `onClose` | `() => void` | Called when the user clicks the × button; you must set `open` to `false` in response. |
| `defaultAnchor` | `FloatAnchor` | Which corner to dock to on first render. One of `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`. |
| `defaultWidth` | `number` | Initial width in pixels. |
| `defaultHeight` | `number` | Initial height in pixels. |
| `children?` | `ReactNode` | Window body content. |

---

## `usePanelFloatingWindowManager` — imperative pattern

Use the manager hook when you need to spawn **N windows dynamically** from data or event handlers — for example, clicking map markers to open camera feeds, feature cards, or drill-down charts.

### The inner-component pattern

`usePanelFloatingWindowManager` reads from the context provided by `PanelOverlayRoot`. The hook must be called **inside** a descendant of the root, not in the component that renders the root itself:

```tsx
// ✅ Correct — MapPanelInner is a descendant of PanelOverlayRoot
export function MapPanel() {
  return (
    <PanelOverlayRoot style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapPanelInner />
    </PanelOverlayRoot>
  );
}

// ❌ Wrong — usePanelFloatingWindowManager() called before PanelOverlayRoot is in the tree
export function MapPanel() {
  const floats = usePanelFloatingWindowManager(); // ctx is null here!
  return (
    <PanelOverlayRoot ...>
      ...
    </PanelOverlayRoot>
  );
}
```

### Full example

```tsx
import { useRef, useEffect, useCallback } from 'react';
import {
  PanelOverlayRoot,
  PanelToolbar,
  ToolbarToggle,
  usePanelFloatingWindowManager,
  type ManagedWindowConfig,
} from 'react-dockable-desktop';

const CAMERAS = [
  { id: 'cam-north', name: 'North Gate',   coords: [51.51, -0.12] as [number, number] },
  { id: 'cam-south', name: 'South Lobby',  coords: [51.50, -0.13] as [number, number] },
];

export function SurveillanceMap() {
  return (
    <PanelOverlayRoot style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SurveillanceMapInner />
    </PanelOverlayRoot>
  );
}

function SurveillanceMapInner() {
  const floats = usePanelFloatingWindowManager();
  const mapRef = useRef<HTMLDivElement>(null);

  // Keep a stable ref so Leaflet event handlers always see the latest manager
  const floatsRef = useRef(floats);
  useEffect(() => { floatsRef.current = floats; });

  useEffect(() => {
    // Leaflet setup — handlers capture floatsRef, not floats directly
    const map = L.map(mapRef.current!).setView([51.505, -0.09], 13);

    CAMERAS.forEach(cam => {
      L.marker(cam.coords)
        .addTo(map)
        .on('click', () => {
          const f = floatsRef.current;
          if (f.isOpen(cam.id)) {
            f.close(cam.id);
          } else {
            f.open(cam.id, {
              title: cam.name,
              icon: <CameraIcon />,
              content: <CameraFeed cameraId={cam.id} />,
              anchor: 'top-right',
              width: 320,
              height: 240,
            });
          }
        });
    });

    return () => { map.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PanelToolbar position="top" variant="frosted">
        <ToolbarToggle
          icon={<CameraIcon />}
          active={floats.openIds.length > 0}
          onToggle={floats.closeAll}
          title={floats.openIds.length > 0 ? 'Close all feeds' : 'No feeds open'}
        />
      </PanelToolbar>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
```

### `PanelFloatingWindowManagerHandle` API

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `open(id, config)` | `(id: string, config: ManagedWindowConfig) => void` | Opens a managed window. If `id` is already open, the existing window is replaced with the new config. |
| `close(id)` | `(id: string) => void` | Closes and unmounts the managed window with this ID. |
| `closeAll()` | `() => void` | Closes all currently open managed windows. |
| `isOpen(id)` | `(id: string) => boolean` | Returns `true` if a managed window with this ID is open. |
| `openIds` | `string[]` | Array of IDs of all currently open managed windows. |

### `ManagedWindowConfig`

```typescript
interface ManagedWindowConfig {
  title: string;            // header text
  icon?: React.ReactNode;   // optional icon left of the title
  content: React.ReactNode; // window body
  anchor?: FloatAnchor;     // default: 'top-right'
  width?: number;           // default: 320
  height?: number;          // default: 240
}
```

### The `floatsRef` pattern for event handlers

Libraries like Leaflet and canvas APIs register event handlers inside `useEffect`. These handlers form a closure over the values that existed when `useEffect` ran — if you capture `floats` directly, the handler will always see the stale initial value.

The solution is a ref that you update on every render:

```tsx
const floatsRef = useRef(floats);
useEffect(() => { floatsRef.current = floats; }); // no dep array — runs every render

// Inside Leaflet or canvas handlers, read from the ref:
marker.on('click', () => {
  floatsRef.current.open(id, config); // always current
});
```

### Serialization note

`ManagedWindowConfig.content` is a `ReactNode` — it is not JSON-serializable. If you need to persist which windows are open across page reloads, store `manager.openIds` yourself and re-call `manager.open()` on startup with content rebuilt from your own config:

```tsx
// On restore:
const savedIds = JSON.parse(localStorage.getItem('open-feeds') ?? '[]');
savedIds.forEach(id => {
  const cam = CAMERAS.find(c => c.id === id);
  if (cam) floats.open(cam.id, { title: cam.name, icon: <CameraIcon />, content: <CameraFeed cameraId={cam.id} /> });
});

// On unload:
localStorage.setItem('open-feeds', JSON.stringify(floats.openIds));
```

---

## Anchoring and corner stacking

`FloatAnchor` is `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`.

- **Docked mode** — on first render a window snaps to `defaultAnchor`. Multiple windows in the same corner **stack vertically** with smooth animated offsets.
- **Free-float mode** — drag the window header away from a corner. The window detaches and moves freely. Resize handles appear on all 8 edges/corners.
- **Re-dock** — while dragging, semi-transparent drop-zone targets appear at all four corners. Release over a target to dock the window there.
- **Active window** — the most recently focused window gains a highlighted header. Click anywhere on a window to bring it to the front.

---

## TypeScript exports

All exported from `'react-dockable-desktop'`:

| Export | Kind | Description |
|--------|------|-------------|
| `PanelOverlayRoot` | Component | Overlay provider and container |
| `PanelOverlayRootProps` | Interface | Props for `PanelOverlayRoot` |
| `PanelToolbar` | Component | Panel-scoped toolbar strip |
| `PanelToolbarProps` | Interface | Props for `PanelToolbar` |
| `ToolbarButton` | Component | Single action button |
| `ToolbarButtonProps` | Interface | — |
| `ToolbarToggle` | Component | On/off toggle button |
| `ToolbarToggleProps` | Interface | — |
| `PanelToolbarSeparator` | Component | Visual divider (alias of `ToolbarSeparator`) |
| `ToolbarSpacer` | Component | Flex push spacer |
| `ToolbarCenter` | Component | Centered section wrapper |
| `PanelToolbarItem` | Component | Custom control wrapper (alias of `ToolbarItem`) |
| `ToolbarSearchInput` | Component | Debounced async search with dropdown |
| `ToolbarSearchInputProps` | Interface | — |
| `SearchResult` | Interface | `{ id, label, description?, group?, icon? }` |
| `PanelFloatingWindow` | Component | Declarative single floating window |
| `PanelFloatingWindowProps` | Interface | — |
| `usePanelFloatingWindow` | Hook | Returns `UsePanelFloatingWindowReturn` |
| `usePanelFloatingWindowManager` | Hook | Imperative multi-window manager |
| `ToolbarPosition` | Type | `'top' \| 'bottom' \| 'left' \| 'right'` |
| `FloatAnchor` | Type | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` |
| `ManagedWindowConfig` | Interface | Config for `manager.open(id, config)` |
| `PanelFloatingWindowManagerHandle` | Interface | Return type of `usePanelFloatingWindowManager` |
| `UsePanelFloatingWindowReturn` | Interface | Return type of `usePanelFloatingWindow` |
| `ToolbarVariant` | Type | `'transparent' \| 'frosted' \| 'solid'` |
| `ButtonVariant` | Type | `'ghost' \| 'soft' \| 'outlined' \| 'filled'` |

---

## See also

- [Toolbar →](./toolbar) — workspace-level tool strip with radio, toggle, and group items
- [Panel Contributions →](./panel-contributions) — the other direction: publish content *out* to the workspace Toolbar/Sidebar
- [Context Menus →](./context-menus) — `usePanelContextMenu`, right-click menus
- [Event Bus & Communication →](./event-bus) — inter-panel pub/sub
