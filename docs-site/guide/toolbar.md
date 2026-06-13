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
| `'toggle'` | `onToggle?` | Independent on/off modifier. Multiple toggles can be active simultaneously. |
| `'separator'` | — | A thin visual divider between button groups. |

Every item except `'separator'` also accepts:

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Unique key for this item. |
| `label` | `string` | Tooltip / accessible label. |
| `icon` | `ReactNode` | Icon displayed in the button. Recommended: 16×16 SVG, `stroke="currentColor"`. |
| `disabled?` | `boolean` | Disables the button; renders at 35% opacity. |

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

The active accent border on radio items always faces the workspace (inward-facing edge). On a `left` toolbar, the accent bar is on the left edge of the button (flush with the workspace); on a `top` toolbar, it's on the bottom edge.

## Theming CSS variables

All toolbar colors use CSS custom properties that cascade from `[data-color-scheme]` and `[data-workspace-skin]`. You can override them for your own skin without touching component CSS:

| Variable | Light | Dark | Description |
|----------|-------|------|-------------|
| `--toolbar-btn-hover-bg` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.06)` | Button hover background. |
| `--toolbar-btn-radio-active-bg` | `rgba(0,102,204,.1)` | `rgba(56,189,248,.14)` | Radio active button background tint. |
| `--toolbar-btn-toggle-active-bg` | `rgba(0,102,204,.06)` | `rgba(56,189,248,.08)` | Toggle active button background tint. |
| `--toolbar-separator-color` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.09)` | Separator line color. |
| `--tab-icon-active` | `#0066cc` | `#38bdf8` | Accent color for active radio button icon and border. Shared with the Sidebar strip. |

The accent variables are automatically overridden per skin — Nord, Tokyo Night, Obsidian, Chrome, Slate, and macOS each set their own `--tab-icon-active` and toolbar background tints to match the WindowManager's accent color.

## See also

- [Sidebar →](./modals-and-drawers#sidebar-component) — collapsible tab strip, hooks
- [Event Bus & Communication →](./event-bus) — panels communicating via pub/sub
- [Quick Start →](./quick-start) — provider setup
