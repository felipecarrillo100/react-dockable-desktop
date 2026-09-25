# Context Menus

Context menus in `react-dockable-desktop` work at two levels: the workspace automatically handles right-click on panel tabs, taskbar chips, and floating window headers — and your panels can add custom items or trigger their own menus with a single function call.

> **Using `DockableDesktopProvider`?** The context menu is set up automatically — you do not need to place any `<RddContextMenu>` component. Jump to [`showContextMenu()`](#imperative-trigger-—-showcontextmenu) or [`usePanelContextMenu`](#usepanelcontextmenu-hook) for your use case.

## Quick reference

| Scenario | Solution |
|----------|----------|
| Right-click on panel tab / taskbar chip / floating header | Built-in — nothing to add |
| Add dynamic items to a panel's right-click tab menu | `usePanelContextMenu(items)` |
| Trigger a menu imperatively (WebGL canvas, map, game view) | `useContextMenu()` or `useWorkspace().showContextMenu()` |
| Context menu on a surface outside all providers | `<RddContextMenu>` — with children, or standalone with a `ref` |

---

## Built-in trigger surfaces

| Where | How to trigger |
|-------|----------------|
| Docked panel tab | Right-click the tab |
| Minimized taskbar chip | Right-click the chip |
| Floating window header **`⋮`** button | Appears automatically when a panel has custom items |
| Floating window anchor button | Click to toggle corner anchoring |

## `usePanelContextMenu` hook

Inject dynamic custom items into a panel's right-click menu from inside the panel component:

```tsx
import { usePanelContextMenu, type ContextMenuItem } from 'react-dockable-desktop';

function MyPanel() {
  const [isDirty, setIsDirty] = useState(false);

  const items: ContextMenuItem[] = isDirty
    ? [
        { label: 'Save', icon: <SaveIcon />, action: handleSave },
        { separator: true },
        { label: 'Discard Changes', icon: <ResetIcon />, action: handleDiscard },
      ]
    : [{ label: 'Discard Changes', icon: <ResetIcon />, action: handleDiscard }];

  usePanelContextMenu(items);

  return <Editor onChange={() => setIsDirty(true)} />;
}
```

**Key behaviours:**
- Items are re-read on every menu open — state-driven enable/disable updates automatically.
- No panel ID is needed; the hook reads it from the panel's context.
- When the panel unmounts, its items are automatically unregistered.
- Custom items appear after the built-in system items (Float, Minimize, Close) with a separator between them.
- The **`⋮`** button in the floating window header appears only when custom items exist.

For panels hosting WebGL canvases or other native surfaces where the browser's `contextmenu` event doesn't carry a meaningful cursor position, use `showContextMenu()` instead.

## Imperative trigger — `showContextMenu` <Badge type="tip" text="Added in 4.2.1" />

Panels that host WebGL canvases (maps, 3D viewers, game views) cannot use `usePanelContextMenu` for a canvas-level right-click because the browser's `contextmenu` event fires on the wrapping `<div>`, not in a meaningful position relative to the canvas content. Instead, call `showContextMenu()` from `useWorkspace()` to open the shared workspace menu from any panel:

```tsx
import { useWorkspace, type ContextMenuItem } from 'react-dockable-desktop';

function MapPanel() {
  const mapRef = useRef(null);
  const { showContextMenu } = useWorkspace();

  useEffect(() => {
    const map = createMap(mapRef.current);

    // LuciadRIA example — fires from the native map interaction pipeline
    map.onShowContextMenu = (position, contextMenu) => {
      if (contextMenu.items.length === 0) return;
      const items: ContextMenuItem[] = contextMenu.items.map(item =>
        item.separator
          ? { separator: true as const }
          : { label: item.label, action: item.action }
      );
      showContextMenu({ x: position[0], y: position[1], items });
    };

    return () => map.destroy();
  }, [showContextMenu]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}
```

`showContextMenu` delegates to whichever context menu is provided above it — by default the one `<DockableDesktopProvider>` sets up automatically. This means a single menu instance is shared across the entire workspace, regardless of how many map panels are open.

> **Which hook?** Use `useContextMenu()` when the context menu is the only thing you need. Use `useWorkspace()` when you are already calling it in the same component for panel management (`openPanel`, `focusPanel`, etc.).

Both `showContextMenu()` and `usePanelContextMenu()` rely on the context menu that `DockableDesktopProvider` sets up automatically. The next section explains how to provide one yourself.

## `<RddContextMenu>` and `useContextMenu`

`<DockableDesktopProvider>` automatically provides a context menu to all of its children — `<RddDesktop>`, `<RddSidebar>`, `<RddSidePanels>`, `<RddModals>` — so `showContextMenu()` and `useContextMenu()` work everywhere without any extra setup.

For advanced placement control — or when you want to use the context menu outside a `<DockableDesktopProvider>` entirely — wrap part of the tree in `<RddContextMenu>`. With children, it provides a menu to them:

```tsx
import { RddContextMenu, useContextMenu } from 'react-dockable-desktop';

function App() {
  return (
    <RddContextMenu>
      <MyApp />
    </RddContextMenu>
  );
}

function MyComponent() {
  const showContextMenu = useContextMenu();

  return (
    <div
      onContextMenu={e => {
        e.preventDefault();
        showContextMenu({ event: e, items: [...] });
      }}
    />
  );
}
```

### Placement options

| Scenario | Setup |
|----------|-------|
| **Typical app** — `DockableDesktopProvider` manages the menu | Nothing extra needed. `showContextMenu()` and `useContextMenu()` work from any component in the provider tree, including siblings of `<RddDesktop>`. |
| **Custom adapter** | Pass `contextMenuAdapter={myAdapter}` to `<DockableDesktopProvider>`. |
| **User-controlled placement** | Wrap `<DockableDesktopProvider>` in `<RddContextMenu>`; the provider detects it and defers to it. |
| **Completely standalone** — no desktop | Wrap any surface in `<RddContextMenu>`; call `useContextMenu()` inside it. |

When an `<RddContextMenu>` with children is present in the ancestor tree, `<DockableDesktopProvider>` detects it and defers — there is always exactly one mounted menu instance.

### `RddContextMenu` props (with children)

| Prop | Default | Description |
|------|---------|-------------|
| `adapter` | the built-in menu | Context menu adapter to mount. |
| `formatMessageProvider` | — | i18n formatter forwarded to the adapter component. When using `DockableDesktopProvider`, the provider's own `formatMessage` prop is forwarded automatically. |
| `onShow` | — | Fired when the menu opens. |
| `onHide` | — | Fired when the menu closes. |
| All other props | — | Forwarded directly to `adapter.Component` (see [`RddContextMenuProps`](#rddcontextmenuprops)). |

Example — custom adapter with light theme:

```tsx
<RddContextMenu
  adapter={myCustomAdapter}
  theme="light"
  formatMessageProvider={intl.formatMessage}
>
  {children}
</RddContextMenu>
```

All three trigger patterns above accept `ContextMenuItem[]` arrays. The type reference below covers every available item shape.

## `ContextMenuAdapter` — custom implementation

If your project has its own design-system context menu (or requires a WCAG-certified accessible implementation), implement the `ContextMenuAdapter` interface and pass it to `<DockableDesktopProvider>`:

```tsx
import {
  type ContextMenuAdapter,
  type ContextMenuHandle,
  type RddContextMenuProps,
} from 'react-dockable-desktop';

type MenuProps = Omit<RddContextMenuProps, 'adapter' | 'children'>;

const MyMenu = forwardRef<ContextMenuHandle, MenuProps>((props, ref) => {
  useImperativeHandle(ref, () => ({
    show({ event, x, y, items }) {
      // render your own menu here
    },
  }));
  return null; // or your menu portal
});

const myAdapter: ContextMenuAdapter = { Component: MyMenu };

// Covers RddDesktop, RddSidebar, RddSidePanels and RddModals:
<DockableDesktopProvider contextMenuAdapter={myAdapter} ... />

// A surface outside the provider:
<RddContextMenu adapter={myAdapter}>...</RddContextMenu>
```

The adapter receives `items: ContextMenuItem[]` via `show()` and is responsible for rendering them. The built-in menu is used when no adapter is provided.

## Item type reference

`ContextMenuItem` is a union of three shapes, all exported from `react-dockable-desktop`:

### Simple item

```typescript
interface ContextMenuSimpleItem {
  label: string | MessageDescriptor;
  icon?: ReactNode;          // SVG or any node; shown in fixed-width column
  title?: string;            // tooltip on hover
  action?: () => void;       // called on click, then menu closes
  cyAction?: string;         // data-cy-action attribute for Cypress tests
  disabled?: boolean;        // true = greyed out, non-interactive (default: false)
  checkbox?: ContextMenuCheckbox;
}
```

### Separator

```typescript
interface ContextMenuSeparator {
  separator: true;
}
```

### Sub-menu

```typescript
interface ContextMenuSubMenu {
  label: string | MessageDescriptor;
  title?: string;
  items?: ContextMenuItem[];  // one level of nesting supported
}
```

### Checkbox variant

Add a `checkbox` field to a simple item to show a checkmark column:

```typescript
interface ContextMenuCheckbox {
  active?: boolean;  // false hides the checkbox column entirely (default: true)
  enabled?: boolean; // false = item is greyed out and non-interactive (default: true)
  value: boolean;    // true = checkmark shown
}
```

Example — a "Wrap lines" toggle:

```tsx
{
  label: 'Wrap Lines',
  checkbox: { enabled: true, value: wrapLines },
  action: () => setWrapLines(v => !v),
}
```

### Icons

Always pass an `icon` node to items that appear alongside built-in actions — the icon column is fixed-width and keeps text aligned:

```tsx
const SaveIcon = (
  <span className="rdd-menu-icon">
    <svg width="14" height="14" viewBox="0 0 24 24" ...>...</svg>
  </span>
);

{ label: 'Save', icon: SaveIcon, action: handleSave }
```

---

## Standalone `<RddContextMenu ref>` — outside any provider tree

If you need a context menu on a surface that lives entirely outside any provider tree — a third-party shell, an iframe, or a widget rendered outside the workspace — render `<RddContextMenu>` without children and drive it through its `ref`:

```tsx
import {
  RddContextMenu,
  type ContextMenuHandle,
  type ContextMenuItem,
} from 'react-dockable-desktop';

function MyMap() {
  const menuRef = useRef<ContextMenuHandle>(null);

  const items: ContextMenuItem[] = [
    { label: 'Copy coordinates', action: copyCoords },
    { separator: true },
    { label: 'Zoom in', action: zoomIn },
    { label: 'Zoom out', action: zoomOut },
  ];

  return (
    <>
      <canvas
        onContextMenu={e => {
          e.preventDefault();
          menuRef.current?.show({ event: e, items });
        }}
      />
      <RddContextMenu ref={menuRef} />
    </>
  );
}
```

The component renders via `createPortal` to `document.body` at `position: fixed`, clamped to the viewport. It inherits the active skin's design tokens automatically when rendered inside a workspace.

### `ContextMenuHandle` API

| Method | Description |
|--------|-------------|
| `show({ event?, x?, y?, items })` | Open the menu at the event's cursor position (or explicit `x`/`y`). |

### `RddContextMenuProps`

| Prop | Default | Description |
|------|---------|-------------|
| `theme` | `'dark'` | CSS modifier class suffix. Built-in: `'dark'`. Pass a custom string for a custom theme class. |
| `formatMessageProvider` | — | i18n formatter for `MessageDescriptor` labels. Pass `intl.formatMessage` here, or use `DockableDesktopProvider`'s `formatMessage` prop which forwards it automatically. |
| `onShow` | — | Fired when the menu opens. |
| `onHide` | — | Fired when the menu closes. |
| `onOpenChange` | — | Combined open/close callback: `(open: boolean) => void`. |
| `className`, `style` | — | Applied to the menu element. |
| `adapter` | the built-in menu | With children only: the implementation to provide. |
| `children` | — | With children, the component provides a menu to them instead of being a single `ref`-driven menu. |

## Keyboard behaviour

Opening a menu moves focus to its first enabled item. The menu follows the WAI-ARIA menu pattern:

| Key | Action |
|-----|--------|
| `↓` / `↑` | Next / previous item (disabled items are skipped; wraps around) |
| `Home` / `End` | First / last item |
| `→` (`←` under RTL), `Enter`, `Space` | Open a sub-menu and focus its first item |
| `←` (`→` under RTL) in a sub-menu | Close it and return to its parent item |
| `Enter` / `Space` | Activate the focused item |
| `Esc`, `Tab` | Close the menu; focus returns to where it was before the menu opened |

A sub-menu also opens on click or tap. ContextMenu and Shift+F10 on a focused tab or taskbar item open that element's menu, placed at the element.
