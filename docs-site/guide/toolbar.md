# Toolbar

`<Toolbar>` is a vertical (or horizontal) strip that hosts action buttons, mutually-exclusive radio tool groups, and independent toggle modifiers. Its state lives library-wide inside `DockableDesktopProvider`, so any panel can read or change the active tool via the `useToolbar()` hook.

## Basic usage

Place `<Toolbar>` as a sibling of `<Sidebar>` and `<WindowManager>` inside your workspace container. Both components sit side-by-side — neither wraps the other.

```tsx
import {
  DockableDesktopProvider,
  WindowManager,
  Sidebar,
  Toolbar,
  type ToolbarItem,
} from 'react-dockable-desktop';
import { useState } from 'react';

const toolbarItems: ToolbarItem[] = [
  {
    type: 'radio', id: 'tool-cursor', group: 'tool', label: 'Select',
    icon: <CursorIcon />,
  },
  {
    type: 'radio', id: 'tool-pen', group: 'tool', label: 'Draw',
    icon: <PenIcon />,
  },
  { type: 'separator' },
  {
    type: 'toggle', id: 'snap', label: 'Snap to Grid',
    icon: <SnapIcon />,
  },
  { type: 'separator' },
  {
    type: 'action', id: 'layers', label: 'Open Layers',
    icon: <LayersIcon />,
    onClick: () => openPanel('layertree-main', 'layertree'),
  },
];

export default function App() {
  return (
    <DockableDesktopProvider client={workspace}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <Toolbar position="left" items={toolbarItems} />
        <Sidebar position="right" tabs={sidebarTabs}>
          <WindowManager />
        </Sidebar>
      </div>
    </DockableDesktopProvider>
  );
}
```

## Item types

| `type` | Extra props | Description |
|--------|-------------|-------------|
| `'action'` | `onClick` | One-shot action button. Click fires `onClick` and does not change radio/toggle state. |
| `'radio'` | `group`, `onActivate?` | Mutually-exclusive within a named `group`. Only one item per group can be active at a time. |
| `'toggle'` | `onToggle?`, `active?` | Independent on/off modifier. Multiple toggles can be active simultaneously. Omit `active` for uncontrolled (state lives in ToolbarContext, keyed by `id`); pass it (even `false`) for **controlled mode** — the component reads `active` instead and skips writing to context on click. |
| `'group'` | `defaultIcon`, `items`, `activeItemId?`, `onActiveItemChange?` | Collapsed tool-family that opens a flyout listing sub-tools with radio semantics. See [Group items](#group-items) below. |
| `'separator'` | — | A thin visual divider between button groups. |

Controlled toggles are what let independent panel instances report independent active state — see [Panel Contributions →](./panel-contributions) for the full pattern (e.g. two maps each with their own selected tool).

Every item except `'separator'` also accepts:

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Unique key for this item. |
| `label` | `string` | Tooltip / accessible label. |
| `icon` | `ReactNode` | Icon displayed in the button. Recommended: 16×16 SVG, `stroke="currentColor"`. |
| `disabled?` | `boolean` | Disables the button; renders at 35% opacity. |

## Group items

A `'group'` item is a single button that expands into a flyout panel listing mutually-exclusive sub-tools. The button's icon morphs to show whichever sub-tool is currently active. Sub-tools have the same radio semantics as `'radio'` items — only one can be active at a time.

```tsx
const toolbarItems: ToolbarItem[] = [
  {
    type: 'group',
    id: 'brush-tool',
    label: 'Brush tools',
    defaultIcon: <BrushIcon />,     // shown when nothing is selected
    items: [
      { id: 'brush-pencil', label: 'Pencil', icon: <PencilIcon />, shortcut: 'B',
        onActivate: id => console.log('activated', id) },
      { id: 'brush-eraser', label: 'Eraser', icon: <EraserIcon />, shortcut: 'E' },
      { type: 'separator' },
      { id: 'brush-fill',   label: 'Fill',   icon: <FillIcon /> },
    ],
  },
];
```

### `ToolbarGroupItem` props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `type` | `'group'` | ✓ | Item type discriminant. |
| `id` | `string` | ✓ | Button ID and radio group key in ToolbarContext. |
| `label` | `string` | ✓ | Tooltip shown when no sub-item is active. |
| `defaultIcon` | `ReactNode` | ✓ | Icon shown when no sub-item is active. |
| `items` | `ToolbarGroupEntry[]` | ✓ | Sub-items and separators in the flyout. |
| `disabled?` | `boolean` | — | Disables the entire group button. |
| `activeItemId?` | `string \| null` | — | **Controlled mode.** When provided (even as `null`), the component reads this prop instead of ToolbarContext and calls `onActiveItemChange` on click without updating context. Omit for uncontrolled. |
| `onActiveItemChange?` | `(id: string) => void` | — | **Controlled mode.** Called when the user selects a sub-item. You must update `activeItemId` in response. |

### Controlled vs uncontrolled

**Uncontrolled (default):** omit `activeItemId`. The active sub-item is stored in ToolbarContext and readable via `getActiveInGroup(id)`.

```tsx
// Uncontrolled — read via useToolbar()
const { getActiveInGroup } = useToolbar();
const activeBrush = getActiveInGroup('brush-tool'); // 'brush-pencil' | 'brush-eraser' | ... | null
```

**Controlled:** provide `activeItemId` and wire `onActiveItemChange` to your state. The Toolbar never modifies context — you are the single source of truth.

```tsx
const [activeBrush, setActiveBrush] = useState<string | null>(null);

<Toolbar items={[{
  type: 'group', id: 'brush-tool', label: 'Brush tools',
  defaultIcon: <BrushIcon />,
  items: brushSubItems,
  activeItemId: activeBrush,
  onActiveItemChange: setActiveBrush,
}]} />
```

## `ToolbarProps` reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `ToolbarItem[]` | — | **Required.** Ordered list of items to render. |
| `position` | `'left' \| 'right' \| 'top' \| 'bottom'` | `'left'` | Side the strip attaches to. Controls orientation (vertical vs horizontal) and border direction. |
| `visible` | `boolean` | `true` | Collapse the strip to zero width/height via CSS transition. State is preserved — no unmount. |
| `onVisibilityChange` | `(visible: boolean) => void` | — | Called when `show/hide/toggle` is invoked on the imperative handle. Wire to your state setter. |
| `className` | `string` | — | Additional CSS class applied to the root `div`. |
| `style` | `React.CSSProperties` | — | Inline style merged after the collapse style. |

## `visible` + `ToolbarHandle`

`visible` is a controlled prop — the consumer owns the boolean via `useState`:

```tsx
const [showToolbar, setShowToolbar] = useState(true);

<Toolbar
  position="left"
  items={toolbarItems}
  visible={showToolbar}
  onVisibilityChange={setShowToolbar}
/>

// Anywhere in the UI:
<button onClick={() => setShowToolbar(v => !v)}>Toggle Toolbar</button>
```

For imperative control, use `forwardRef` and `ToolbarHandle`:

```tsx
import { useRef } from 'react';
import type { ToolbarHandle } from 'react-dockable-desktop';

const toolbarRef = useRef<ToolbarHandle>(null);

<Toolbar ref={toolbarRef} ... visible={showToolbar} onVisibilityChange={setShowToolbar} />

// Imperative methods delegate to onVisibilityChange:
toolbarRef.current?.show();
toolbarRef.current?.hide();
toolbarRef.current?.toggle();
```

| Method | Description |
|--------|-------------|
| `show()` | Calls `onVisibilityChange(true)`. |
| `hide()` | Calls `onVisibilityChange(false)`. |
| `toggle()` | Calls `onVisibilityChange(!current)`. |

## `useToolbar()` hook

Read and write toolbar state from **any component** inside `<DockableDesktopProvider>` — including floating panels and docked panels far removed from the `<Toolbar>` component itself:

```tsx
import { useToolbar } from 'react-dockable-desktop';

function MapPanel() {
  const { getActiveInGroup, isModifierActive } = useToolbar();
  const activeTool = getActiveInGroup('tool'); // 'tool-cursor' | 'tool-pen' | null
  const snapActive  = isModifierActive('snap');

  // React to toolbar state in your map controller
}
```

| Value | Type | Description |
|-------|------|-------------|
| `getActiveInGroup(group)` | `(group: string) => string \| null` | Returns the active radio item id in a group, or `null` if none selected. |
| `setActiveInGroup(group, id)` | `(group: string, id: string \| null) => void` | Programmatically activate a radio item (or deselect with `null`). |
| `isModifierActive(id)` | `(id: string) => boolean` | Returns `true` if a toggle modifier is active. |
| `setModifierActive(id, active)` | `(id: string, active: boolean) => void` | Explicitly set a toggle modifier's state. |
| `toggleModifier(id)` | `(id: string) => void` | Flip a toggle modifier. |

::: tip
`useToolbar()` returns a no-op object (and logs a warning) when called outside `<DockableDesktopProvider>`. This makes it safe to use in reusable components that might be rendered in tests or outside the provider.
:::

## External control pattern

Toolbars often need to reflect state changes that originate outside the UI — for example, a map SDK that fires a `controllerchanged` event when the user activates a tool programmatically. Use `setActiveInGroup` to sync back:

```tsx
import { useToolbar } from 'react-dockable-desktop';

function MapController() {
  const { setActiveInGroup } = useToolbar();

  useEffect(() => {
    const unsubscribe = mapController.on('controllerchanged', ({ id }) => {
      // Mirror external tool change to the toolbar
      setActiveInGroup('tool', id);
    });
    return unsubscribe;
  }, [setActiveInGroup]);

  // ...
}
```

## Position variants

```tsx
// Vertical strips (width: 48px, height: 100%)
<Toolbar position="left"   items={items} />   // border on the right
<Toolbar position="right"  items={items} />   // border on the left

// Horizontal strips (height: 48px, width: 100%)
<Toolbar position="top"    items={items} />   // border on the bottom
<Toolbar position="bottom" items={items} />   // border on the top
```

The active accent border on radio items always faces the workspace (inward-facing edge). On a `left` toolbar, the accent bar is on the left edge of the button (flush with the workspace); on a `top` toolbar, it's on the bottom edge. On skins like `slate` and `macos` the bar is replaced entirely by a floating chip shape; on `nord` it becomes a short horizontal line drawn below the icon.

## Theming CSS variables

All toolbar colors use CSS custom properties that cascade from `[data-color-scheme]` and `[data-workspace-skin]`. You can override them for your own skin without touching component CSS:

| Variable | Light | Dark | Description |
|----------|-------|------|-------------|
| `--toolbar-btn-hover-bg` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.06)` | Button hover background. |
| `--toolbar-btn-radio-active-bg` | `rgba(0,102,204,.1)` | `rgba(56,189,248,.14)` | Radio active button background tint. |
| `--toolbar-btn-toggle-active-bg` | `rgba(0,102,204,.06)` | `rgba(56,189,248,.08)` | Toggle active button background tint. |
| `--toolbar-separator-color` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.09)` | Separator line color. |
| `--tab-icon-active` | `#0066cc` | `#38bdf8` | Accent color for active radio button icon and border. Shared with the Sidebar strip. |
| `--toolbar-btn-active-shadow` | `none` | `none` | `box-shadow` on active radio/group buttons. Obsidian/Tokyo override with an inset ambient glow. |
| `--toolbar-btn-active-glow` | `none` | `none` | `filter` on active radio/group buttons. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--toolbar-accent-bar-width` | `3px` | `3px` | Width of the edge accent bar on active buttons. Set to `0px` to replace the bar with a chip shape. |

The accent variables are automatically overridden per skin — Nord, Tokyo Night, Obsidian, Chrome, Slate, and macOS each set their own `--tab-icon-active` and toolbar active-state tokens to match their signature visual language. See [Per-skin active state design language →](./theming#per-skin-active-state-design-language) for details on customising this in your own skin.

## See also

- [Sidebar →](./modals-and-drawers#sidebar-component) — collapsible tab strip, hooks
- [Panel Contributions →](./panel-contributions) — let panels publish toolbar items only while active
- [Per-skin active state design language →](./theming#per-skin-active-state-design-language) — all 7 patterns, token reference, custom skin examples
- [Event Bus & Communication →](./event-bus) — panels communicating via pub/sub
- [Quick Start →](./quick-start) — provider setup
