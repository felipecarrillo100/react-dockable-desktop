# Panel Overlay

The Panel Overlay system adds a **panel-scoped overlay layer** to any container — anchored toolbars, buttons, search, and corner-anchored floating info windows. Everything renders inside the panel's own DOM boundary and shares one unified infrastructure for z-ordering, drag state, and corner docking.

::: tip Distinct from `<RddToolbar>`
`<RddToolbar>` (see [Toolbar →](./toolbar)) is a **workspace-level** tool strip for radio tools, toggles, and action groups that live outside any individual panel. Panel Overlay is **panel-scoped** — it renders inside a single panel container and is invisible to every other panel.
:::

## When to use it

- A map, 3D viewer, or canvas editor that needs toolbar controls positioned over the panel content.
- Any panel that shows one or more togglable info widgets (layer list, feature detail, legend, camera feed) as small floating windows anchored to panel corners.
- Scenarios where N windows need to be spawned dynamically at runtime from data or event handlers.

---

## `RddPanelOverlay`

`RddPanelOverlay` is the provider and container for the entire overlay system. It must wrap all toolbar and floating window components.

```tsx
import {
  RddPanelOverlay,
  RddPanelToolbar,
  RddToolbarButton,
} from 'react-dockable-desktop';

function MapPanel() {
  return (
    <RddPanelOverlay style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Your panel content goes here */}
      <div id="map-container" style={{ width: '100%', height: '100%' }} />

      {/* Toolbars and floating windows are siblings of the content */}
      <RddPanelToolbar position="top">
        <RddToolbarButton icon={<ZoomInIcon />} title="Zoom in" onClick={zoomIn} />
      </RddPanelToolbar>
    </RddPanelOverlay>
  );
}
```

**Requirements:**
- It fills its panel on its own (`.rdd-panel-overlay-root` is `position: relative` at 100% width and height). Give it a size only if you place it inside something smaller than the panel.
- All `RddPanelToolbar` and `RddFloatingWidget` components must be **descendants** of the same `RddPanelOverlay`.

### `RddPanelOverlayProps`

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Panel content plus toolbars and floating windows. |
| `className?` | `string` | Extra CSS class applied to the root `div`. |
| `style?` | `React.CSSProperties` | Inline style. Use to set dimensions and `position: relative`. |

---

## `RddPanelToolbar`

A toolbar strip that attaches to any edge of the `RddPanelOverlay` container. Multiple toolbars can coexist — left/right toolbars automatically inset by the height of any registered top/bottom toolbars so they never overlap.

```tsx
<RddPanelToolbar position="top" variant="frosted" buttonVariant="ghost">
  {/* toolbar content */}
</RddPanelToolbar>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `ToolbarPosition` | — | **Required.** Which edge to attach to. One of `'top'`, `'bottom'`, `'left'`, `'right'`. |
| `variant` | `'transparent' \| 'frosted' \| 'solid'` | `'transparent'` | Background style. `frosted` adds a blur/tint; `solid` uses the tab-bar background (`--rdd-bg-tab-bar`). |
| `buttonVariant` | `'ghost' \| 'soft' \| 'outlined' \| 'filled'` | `'ghost'` | Default button appearance inherited by all child buttons. Overridable per-button. |
| `buttonSize` | `number` | — | Overrides the `--rdd-panel-toolbar-btn-size` CSS variable (pixels). |
| `className` | `string` | — | Extra CSS class. |
| `style` | `React.CSSProperties` | — | Inline styles merged after position styles. |

### Multi-toolbar inset behaviour

When you add both a `top` and a `left` toolbar, the library measures the top toolbar's height on mount and automatically insets the left toolbar so they don't overlap:

```tsx
<RddPanelOverlay style={{ width: '100%', height: '100%', position: 'relative' }}>
  <div id="map" style={{ width: '100%', height: '100%' }} />

  {/* Top bar — 36px high */}
  <RddPanelToolbar position="top" variant="frosted">
    <RddToolbarToggle icon={<LayersIcon />} active={showLayers} onToggle={() => setShowLayers(v => !v)} title="Layers" />
  </RddPanelToolbar>

  {/* Left bar — top edge insets by 36px automatically */}
  <RddPanelToolbar position="left">
    <RddToolbarButton icon={<ZoomInIcon />} onClick={zoomIn} title="Zoom in" />
    <RddToolbarButton icon={<ZoomOutIcon />} onClick={zoomOut} title="Zoom out" />
  </RddPanelToolbar>
</RddPanelOverlay>
```

---

## Toolbar primitives

### `RddToolbarButton`

A single action button. Clicking fires `onClick` and does not change any toggle state.

```tsx
<RddToolbarButton icon={<SaveIcon />} onClick={handleSave} title="Save" />
```

| Prop | Type | Description |
|------|------|-------------|
| `icon` | `ReactNode` | Button icon. Recommended: 16×16 SVG with `stroke="currentColor"`. |
| `onClick` | `() => void` | Called on click. |
| `title?` | `string` | Tooltip and accessible label. |
| `disabled?` | `boolean` | Disables the button (38% opacity). |
| `variant?` | `ButtonVariant` | Overrides the toolbar's `buttonVariant` for this button only. |

### `RddToolbarToggle`

An on/off toggle button. The caller owns the boolean state.

```tsx
const [wrap, setWrap] = useState(false);

<RddToolbarToggle
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

### `RddToolbarSeparator`

A thin visual divider for grouping related buttons.

```tsx
<RddToolbarButton icon={<RunIcon />} onClick={run} title="Run" />
<RddToolbarSeparator />
<RddToolbarButton icon={<FormatIcon />} onClick={format} title="Format" />
<RddToolbarButton icon={<WrapIcon />}  onClick={wrap}   title="Wrap" />
```

### `RddToolbarSpacer`

A flex push spacer that pushes subsequent items to the opposite end.

```tsx
<RddPanelToolbar position="top">
  <RddToolbarButton icon={<MenuIcon />} onClick={openMenu} title="Menu" />
  <RddToolbarSpacer />                                      {/* pushes right */}
  <RddToolbarButton icon={<SettingsIcon />} onClick={openSettings} title="Settings" />
</RddPanelToolbar>
```

### `RddToolbarCenter`

Wraps children in a section centered on the toolbar itself (absolutely positioned at 50%), independent of the widths of what is on its left and right.

```tsx
<RddPanelToolbar position="top">
  <RddToolbarCenter>
    <span style={{ fontSize: 12, opacity: 0.7 }}>Map View — London</span>
  </RddToolbarCenter>
</RddPanelToolbar>
```

### `RddToolbarSearch`

An async search box with debounced query dispatch and a portal-rendered dropdown.

```tsx
<RddToolbarSearch
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
<RddPanelToolbar position="top" variant="frosted">
  <RddToolbarToggle icon={<LayersIcon />} active={showLayers} onToggle={() => setShowLayers(v => !v)} title="Layers" />
  <RddToolbarToggle icon={<InfoIcon />}   active={showInfo}   onToggle={() => setShowInfo(v => !v)}   title="Info"   />
  <RddToolbarSeparator />
  <RddToolbarButton icon={<ZoomInIcon />}  onClick={zoomIn}  title="Zoom in"  />
  <RddToolbarButton icon={<ZoomOutIcon />} onClick={zoomOut} title="Zoom out" />
  <RddToolbarSpacer />
  <RddToolbarSearch placeholder="Search…" onSearch={search} onSelect={goTo} />
</RddPanelToolbar>
```

---

## `RddFloatingWidget` — declarative pattern

Use `RddFloatingWidget` when you have a **fixed, known set** of floating windows toggled by toolbar buttons. You own the open/close boolean — a plain `useState` is all it takes.

```tsx
import { useState } from 'react';
import {
  RddPanelOverlay,
  RddPanelToolbar,
  RddToolbarToggle,
  RddFloatingWidget,
} from 'react-dockable-desktop';

function MapPanel() {
  const [showLayers, setShowLayers] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <RddPanelOverlay style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div id="map" style={{ width: '100%', height: '100%' }} />

      <RddPanelToolbar position="top" variant="frosted">
        <RddToolbarToggle
          icon={<LayersIcon />}
          active={showLayers}
          onToggle={() => setShowLayers(v => !v)}
          title="Layers"
        />
        <RddToolbarToggle
          icon={<InfoIcon />}
          active={showInfo}
          onToggle={() => setShowInfo(v => !v)}
          title="Feature info"
        />
      </RddPanelToolbar>

      <RddFloatingWidget
        id="layer-tree"
        title="Layers"
        icon={<LayersIcon />}
        open={showLayers}
        onClose={() => setShowLayers(false)}
        defaultAnchor="top-right"
        defaultWidth={280}
        defaultHeight={360}
      >
        <LayerTreeContent />
      </RddFloatingWidget>

      <RddFloatingWidget
        id="feature-info"
        title="Feature Info"
        open={showInfo}
        onClose={() => setShowInfo(false)}
        defaultAnchor="bottom-right"
        defaultWidth={300}
        defaultHeight={200}
      >
        <FeatureInfoContent />
      </RddFloatingWidget>
    </RddPanelOverlay>
  );
}
```

### `RddFloatingWidgetProps`

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Unique identifier. Used as the key in z-order and stack tracking. |
| `title` | `PanelTitle` | Text shown in the window header bar. A plain string, or an i18n message descriptor — see [Localised titles](#localised-titles). |
| `icon?` | `ReactNode` | Optional icon shown to the left of the title in the header. Recommended: 12–14 px SVG with `stroke="currentColor"`. |
| `open` | `boolean` | Mounts/unmounts the window. |
| `onClose` | `() => void` | Called when the user clicks the × button; you must set `open` to `false` in response. |
| `defaultAnchor` | `FloatAnchor` | Which corner to dock to on first render. One of `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`. |
| `defaultWidth` | `number` | Initial width in pixels. Ignored while the inline axis is spanning, and returned to when it is released. |
| `defaultHeight` | `number` | Initial height in pixels. Ignored while the block axis is spanning, and returned to when it is released. |
| `defaultStretch?` | `Stretch` | Which axes span the panel on first render — `'width'`, `'height'` or `'both'`. Uncontrolled: gestures update it from here. See [Spanning the panel](#spanning-the-panel). |
| `stretch?` | `Stretch \| null` | Controlled spanning state. Supplying it — including as `null` — makes you the source of truth; gestures report through `onPlacementChange` instead of applying themselves. |
| `onPlacementChange?` | `(p: PanelFloatPlacement) => void` | Called when a gesture changes where the window sits. Reports `{ anchor, stretch }` together, as one atomic value. |
| `stretchable?` | `boolean` | Whether the window may span the panel at all. `false` disables resize-to-span snapping. Default `true`. |
| `children?` | `ReactNode` | Window body content. |

---

## `useFloatingWidgets` — imperative pattern

Use the manager hook when you need to spawn **N windows dynamically** from data or event handlers — for example, clicking map markers to open camera feeds, feature cards, or drill-down charts.

### The inner-component pattern

`useFloatingWidgets` reads from the context provided by `RddPanelOverlay`. The hook must be called **inside** a descendant of the root, not in the component that renders the root itself:

```tsx
// ✅ Correct — MapPanelInner is a descendant of RddPanelOverlay
export function MapPanel() {
  return (
    <RddPanelOverlay style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapPanelInner />
    </RddPanelOverlay>
  );
}

// ❌ Wrong — useFloatingWidgets() called before RddPanelOverlay is in the tree
export function MapPanel() {
  const floats = useFloatingWidgets(); // ctx is null here!
  return (
    <RddPanelOverlay ...>
      ...
    </RddPanelOverlay>
  );
}
```

### Full example

```tsx
import { useRef, useEffect, useCallback } from 'react';
import {
  RddPanelOverlay,
  RddPanelToolbar,
  RddToolbarToggle,
  useFloatingWidgets,
  type ManagedWidget,
} from 'react-dockable-desktop';

const CAMERAS = [
  { id: 'cam-north', name: 'North Gate',   coords: [51.51, -0.12] as [number, number] },
  { id: 'cam-south', name: 'South Lobby',  coords: [51.50, -0.13] as [number, number] },
];

export function SurveillanceMap() {
  return (
    <RddPanelOverlay style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SurveillanceMapInner />
    </RddPanelOverlay>
  );
}

function SurveillanceMapInner() {
  const floats = useFloatingWidgets();
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
      <RddPanelToolbar position="top" variant="frosted">
        <RddToolbarToggle
          icon={<CameraIcon />}
          active={floats.openIds.length > 0}
          onToggle={floats.closeAll}
          title={floats.openIds.length > 0 ? 'Close all feeds' : 'No feeds open'}
        />
      </RddPanelToolbar>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
```

### `FloatingWidgetsApi` API

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `open(id, config)` | `(id: string, config: ManagedWidget) => void` | Opens a managed window. If `id` is already open, the existing window is replaced with the new config. |
| `close(id)` | `(id: string) => void` | Closes and unmounts the managed window with this ID. |
| `closeAll()` | `() => void` | Closes all currently open managed windows. |
| `isOpen(id)` | `(id: string) => boolean` | Returns `true` if a managed window with this ID is open. |
| `openIds` | `string[]` | Array of IDs of all currently open managed windows. |

### `ManagedWidget`

```typescript
interface ManagedWidget {
  title: PanelTitle;        // header text — string or i18n descriptor
  icon?: React.ReactNode;   // optional icon left of the title
  content: React.ReactNode; // window body
  anchor?: FloatAnchor;     // default: 'top-right'
  width?: number;           // default: 320
  height?: number;          // default: 240
  stretch?: Stretch;        // axes that span the panel; default: none
}
```

### Localised titles

`title` is a `PanelTitle` — a string or an `{ id, defaultMessage?, values? }` descriptor — the same type
[`openPanel()`](./workspace-client) and [modals](./modals-and-drawers) accept. Pass a descriptor and
the header is re-resolved on every render, so it follows a language change with no reopen:

```tsx
manager.open('legend', {
  title: { id: 'legend.title', defaultMessage: 'SLD Legend' },
  content: <Legend />,
});
```

This matters most on the managed path, because the overlay *stores* your config: a plain string
handed to `open()` is frozen at the language that was active at the time, and the only way to change
it is to call `open()` again with the same ID. A descriptor has no such problem. Plain strings keep
working exactly as before — `formatLabel` passes them straight through — so nothing needs migrating.

::: warning `content` is captured, not re-created
A descriptor fixes the *title*. `config.content` is a React element built when you called `open()`,
and its props never change afterwards, so text you resolved yourself and passed in as a prop stays
in the original language. Let the body read the locale itself — `useFormatMessage()`, or your own
`useIntl()` — rather than receiving already-translated strings from the call site.
:::

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

`ManagedWidget.content` is a `ReactNode` — it is not JSON-serializable. If you need to persist which windows are open across page reloads, store `manager.openIds` yourself and re-call `manager.open()` on startup with content rebuilt from your own config:

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

### Which resize handles appear

A docked window has one **pinned** edge per axis — the ones its anchor holds it by — and offers handles only on the edges that can actually move. Dragging a pinned edge would move the *opposite* edge instead of the one under the cursor, so no handle is offered there.

| Anchor | Pinned edges | Handles offered |
|--------|--------------|-----------------|
| `top-left` | top, inline-start | `s`, `e`, `se` |
| `top-right` | top, inline-end | `s`, `w`, `sw` |
| `bottom-left` | bottom, inline-start | `n`, `e`, `ne` |
| `bottom-right` | bottom, inline-end | `n`, `w`, `nw` |

A free-floating window is pinned by nothing, so it offers all eight. Docked resizing also stops at any `RddPanelToolbar` on the far side rather than running underneath it.

---

## Spanning the panel

A docked window normally carries a fixed width and height. Sometimes you want one anchored to an edge and spanning the panel's full width — a timeline, a status strip — so that it **resizes with the panel**.

The mechanism is that "full width" isn't a width, it's a *second pin*. A spanning axis pins **both** ends and carries no size at all, so the browser keeps it tracking the panel. There is no `ResizeObserver` and no JavaScript involved, and nothing to keep in sync.

Each axis is independent, so a placement is a corner plus zero, one, or both stretched axes:

|  | inline pinned at start | inline pinned at end | **inline spanning** |
|---|---|---|---|
| **block pinned at top** | `top-left` | `top-right` | full-width strip at the top |
| **block pinned at bottom** | `bottom-left` | `bottom-right` | full-width strip at the bottom |
| **block spanning** | full-height column at the start | full-height column at the end | fills the panel |

### Declaring it

```tsx
<RddFloatingWidget
  id="timeline"
  title="Timeline"
  open={showTimeline}
  onClose={() => setShowTimeline(false)}
  defaultAnchor="bottom-left"
  defaultStretch="width"   // spans the panel's width; height stays 120px
  defaultWidth={240}
  defaultHeight={120}
>
  <TimelineContent />
</RddFloatingWidget>
```

`defaultWidth`/`defaultHeight` are still worth passing: a spanning axis ignores its size while spanning, and **returns to it** when released.

Via the imperative manager, the field is simply `stretch`:

```ts
floats.open('timeline', {
  title: 'Timeline',
  content: <TimelineContent />,
  anchor: 'bottom-left',
  stretch: 'width',
  height: 120,
});
```

### Resize to span

Drag a free edge outward. As it reaches the point where a spanning axis would sit, the window picks up a dashed accent outline — release there and the axis becomes spanning.

The thresholds are deliberately asymmetric: arming happens within 16 px of the full extent, but releasing requires pulling back 40 px. Without that gap, releasing a spanning axis by dragging slightly inward would immediately re-arm and snap back.

On release the axis returns to the size it had **before** that drag, not the full-bleed value the drag passed through — so the size you get back is the one you last chose on purpose.

Pass `stretchable={false}` to opt a window out of snapping entirely, for content that only makes sense at a bounded size.

### Releasing a spanning axis

A spanning axis has both ends pinned, so it offers handles on **both** — and the rule is:

> The edge you grab is the edge that moves. The opposite end becomes the new pin.

Grab the right end of a full-width strip and pull left: the right edge follows your pointer, the left stays put, and the window lands anchored to the inline start at the width you dragged. Grab the left end instead and it anchors to the end.

This is why a window that fills the panel is never stuck: all four of its edges are live, each releasing one axis. Dragging its header also detaches it — which materialises whatever size it was occupying and clears spanning, since a free-floating window positions from an explicit box.

### Spanning and corner stacking

Windows stacked in a corner offset each other along the block axis. A full-width strip overlaps **both** corners of its edge, so it clears whatever is stacked in either of them:

```
┌──────────────────────────────────────┐
│                                      │
│  ┌────────────┐        ┌──────────┐  │  120px card      90px card
│  │ left card  │        │ right    │  │  (bottom-left)   (bottom-right)
│  └────────────┘        └──────────┘  │
│  ┌────────────────────────────────┐  │  strip sits at bottom: 128px
│  │ full-width strip               │  │  = max(120, 90) + 8px gap
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

Neither card moves; the strip positions itself clear of both. Windows that never span stack exactly as they always did.

A **block**-spanning window is different: it covers the very axis stacking uses to separate siblings, so it cannot stack at all. It takes no part in stacking and will overlap anything anchored to the same side, with z-order deciding what's on top. In development the library warns once when it sees that combination — either give the window a fixed height or move the others to the opposite side.

### Controlling it, and making it stick

Nothing about overlay windows is written into `saveLayout()` (see [Serialization note](#serialization-note)), so a spanning axis is lost when the window unmounts — exactly as a manual resize is. To persist it, take ownership of the placement:

```tsx
const [placement, setPlacement] = useState<PanelFloatPlacement>(
  () => loadSavedPlacement() ?? { anchor: 'bottom-left', stretch: 'width' }
);

<RddFloatingWidget
  id="timeline"
  defaultAnchor={placement.anchor}
  stretch={placement.stretch}          // controlled: you are the source of truth
  onPlacementChange={next => { setPlacement(next); savePlacement(next); }}
  /* ... */
/>
```

Supplying `stretch` — **including as `null`** — switches the window to controlled mode: gestures report through `onPlacementChange` instead of applying themselves, and you must echo the value back for anything to change. Omit the prop entirely for uncontrolled behaviour. This matches the controlled/uncontrolled pattern of an `RddToolbar` toggle item's `active` and `RddSidebar`'s `activeTabId`.

`onPlacementChange` reports the anchor and the stretch **together**, as one value, because a single gesture can change both: dragging a strip's left end pins its right end and stops it spanning in the same motion. Two separate callbacks would expose an intermediate state that never actually exists.

Window *size* is not controllable — it changes on every pointer move during a resize, so routing it through your state would cost a round trip per frame.

### RTL

Spanning is defined per axis, not per side, so `'width'` and `'height'` mean the same thing in both directions. The handles that release a spanning axis are mapped to the correct physical edges automatically.

---

## TypeScript exports

All exported from `'react-dockable-desktop'`:

| Export | Kind | Description |
|--------|------|-------------|
| `RddPanelOverlay` | Component | Overlay provider and container |
| `RddPanelOverlayProps` | Interface | Props for `RddPanelOverlay` |
| `RddPanelToolbar` | Component | Panel-scoped toolbar strip |
| `RddPanelToolbarProps` | Interface | Props for `RddPanelToolbar` |
| `RddToolbarButton` | Component | Single action button |
| `RddToolbarButtonProps` | Interface | — |
| `RddToolbarToggle` | Component | On/off toggle button |
| `RddToolbarToggleProps` | Interface | — |
| `RddToolbarSeparator` | Component | Visual divider |
| `RddToolbarSpacer` | Component | Flex push spacer |
| `RddToolbarCenter` | Component | Centered section wrapper |
| `RddToolbarItem` | Component | Custom control wrapper |
| `RddToolbarSearch` | Component | Debounced async search with dropdown |
| `RddToolbarSearchProps` | Interface | — |
| `SearchResult` | Interface | `{ id, label, description?, group?, icon? }` |
| `RddFloatingWidget` | Component | Declarative single floating window |
| `RddFloatingWidgetProps` | Interface | — |
| `useFloatingWidgets` | Hook | Imperative multi-window manager |
| `ToolbarPosition` | Type | `'top' \| 'bottom' \| 'left' \| 'right'` |
| `FloatAnchor` | Type | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` |
| `Stretch` | Type | `'width' \| 'height' \| 'both'` — which axes span the panel |
| `PanelFloatPlacement` | Interface | `{ anchor, stretch }` — reported by `onPlacementChange` |
| `ManagedWidget` | Interface | Config for `manager.open(id, config)` |
| `FloatingWidgetsApi` | Interface | Return type of `useFloatingWidgets` |
| `ToolbarVariant` | Type | `'transparent' \| 'frosted' \| 'solid'` |
| `ButtonVariant` | Type | `'ghost' \| 'soft' \| 'outlined' \| 'filled'` |

---

## See also

- [Toolbar →](./toolbar) — workspace-level tool strip with radio, toggle, and group items
- [Panel Contributions →](./panel-contributions) — the other direction: publish content *out* to the workspace Toolbar/Sidebar
- [Context Menus →](./context-menus) — `usePanelContextMenu`, right-click menus
- [Event Bus & Communication →](./event-bus) — inter-panel pub/sub
