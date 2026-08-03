# Context Menus

Context menus in `react-dockable-desktop` work at two levels: the workspace automatically handles right-click on panel tabs, taskbar chips, and floating window headers — and your panels can add custom items or trigger their own menus with a single function call.

> **Using `DockableDesktopProvider`?** The context menu is set up automatically — you do not need to place any `<ContextMenu>` component. Jump to [`showContextMenu()`](#imperative-trigger-showcontextmenu) or [`usePanelContextMenu`](#usepanelcontextmenu-hook) for your use case.

## Quick reference

| Scenario | Solution |
|----------|----------|
| Right-click on panel tab / taskbar chip / floating header | Built-in — nothing to add |
| Add dynamic items to a panel's right-click tab menu | `usePanelContextMenu(items)` |
| Trigger a menu imperatively (WebGL canvas, map, game view) | `useWindowManagerActions().showContextMenu()` |
| Context menu on a surface outside all providers | Standalone `<ContextMenu ref>` |

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
- No panel ID is needed; the hook reads it from context via `usePanelId()`.
- When the panel unmounts, its items are automatically unregistered.
- Custom items appear after the built-in system items (Float, Minimize, Close) with a separator between them.
- The **`⋮`** button in the floating window header appears only when custom items exist.

For panels hosting WebGL canvases or other native surfaces where the browser's `contextmenu` event doesn't carry a meaningful cursor position, use `showContextMenu()` instead.

## Imperative trigger — `showContextMenu` <Badge type="tip" text="Added in 4.2.1" />

Panels that host WebGL canvases (maps, 3D viewers, game views) cannot use `usePanelContextMenu` for a canvas-level right-click because the browser's `contextmenu` event fires on the wrapping `<div>`, not in a meaningful position relative to the canvas content. Instead, call `showContextMenu()` from `useWindowManagerActions()` to open the shared workspace menu from any panel:

```tsx
import { useWindowManagerActions, type ContextMenuItem } from 'react-dockable-desktop';

function MapPanel() {
  const mapRef = useRef(null);
  const { showContextMenu } = useWindowManagerActions();

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

`showContextMenu` delegates to whichever `ContextMenuProvider` is active — by default the one managed automatically by `<DockableDesktopProvider>`. This means a single menu instance is shared across the entire workspace, regardless of how many map panels are open.

> **Which hook?** Use `useShowContextMenu()` when the context menu is the only thing you need. Use `useWindowManagerActions()` when you are already calling it in the same component for panel management (`openPanel`, `focusPanel`, etc.).

Both `showContextMenu()` and `usePanelContextMenu()` rely on the `ContextMenuProvider` that `DockableDesktopProvider` sets up automatically. The next section explains how to control that provider directly.

## `<ContextMenuProvider>` and `useShowContextMenu`

`<DockableDesktopProvider>` automatically mounts a `<ContextMenuProvider>` that wraps all of its children — `<WindowManager>`, `<Sidebar>`, `<SidePanelRenderer>`, `<ModalStackRenderer>` — so `showContextMenu()` and `useShowContextMenu()` work everywhere without any extra setup.

For advanced placement control — or when you want to use the context menu outside a `<DockableDesktopProvider>` entirely — mount a `<ContextMenuProvider>` manually anywhere in the tree:

```tsx
import { ContextMenuProvider, useShowContextMenu } from 'react-dockable-desktop';

function App() {
  return (
    <ContextMenuProvider>
      <MyApp />
    </ContextMenuProvider>
  );
}

function MyComponent() {
  const showContextMenu = useShowContextMenu();

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
| **Typical app** — `DockableDesktopProvider` manages the menu | Nothing extra needed. `showContextMenu()` and `useShowContextMenu()` work from any component in the provider tree, including siblings of `<WindowManager>`. |
| **Custom adapter** | Pass `contextMenuAdapter={myAdapter}` to `<DockableDesktopProvider>`. |
| **Standalone `WindowManager`** (no `DockableDesktopProvider`) | `WindowManager` manages its own internal adapter via its `contextMenuAdapter` prop. |
| **User-controlled placement** | Wrap with `<ContextMenuProvider>` above `<DockableDesktopProvider>`; both automatically detect and defer to it. |
| **Completely standalone** — no `WindowManager` | Mount `<ContextMenuProvider>` anywhere; call `useShowContextMenu()` inside it. |

When a `<ContextMenuProvider>` is present in the ancestor tree, both `<DockableDesktopProvider>` and `<WindowManager>` automatically detect it and defer — there is always exactly one mounted menu instance.

### `ContextMenuProvider` props

| Prop | Default | Description |
|------|---------|-------------|
| `adapter` | `DefaultContextMenuAdapter` | Context menu adapter to mount. |
| `formatMessageProvider` | — | i18n formatter forwarded to the adapter component. When using `DockableDesktopProvider`, the provider's own `formatMessage` prop is forwarded automatically. |
| `onShow` | — | Fired when the menu opens. |
| `onHide` | — | Fired when the menu closes. |
| All other `ContextMenuProps` | — | Forwarded directly to `adapter.Component`. |

Example — custom adapter with light theme:

```tsx
<ContextMenuProvider
  adapter={myCustomAdapter}
  theme="light"
  formatMessageProvider={intl.formatMessage}
>
  {children}
</ContextMenuProvider>
```

All three trigger patterns above accept `ContextMenuItem[]` arrays. The type reference below covers every available item shape.

## `ContextMenuAdapter` — custom implementation

If your project has its own design-system context menu (or requires a WCAG-certified accessible implementation), implement the `ContextMenuAdapter` interface and pass it to `<DockableDesktopProvider>`:

```tsx
import {
  type ContextMenuAdapter,
  type ContextMenuHandle,
  type ContextMenuProps,
} from 'react-dockable-desktop';

const MyMenu = forwardRef<ContextMenuHandle, ContextMenuProps>((props, ref) => {
  useImperativeHandle(ref, () => ({
    show({ event, x, y, items }) {
      // render your own menu here
    },
  }));
  return null; // or your menu portal
});

const myAdapter: ContextMenuAdapter = { Component: MyMenu };

// Preferred — covers WindowManager, Sidebar, SidePanelRenderer, and ModalStackRenderer:
<DockableDesktopProvider contextMenuAdapter={myAdapter} ... />

// Standalone WindowManager (without DockableDesktopProvider):
<WindowManager contextMenuAdapter={myAdapter} ... />
```

The adapter receives `items: ContextMenuItem[]` via `show()` and is responsible for rendering them. The built-in `DefaultContextMenuAdapter` is used when no adapter is provided.

## Item type reference

`ContextMenuItem` is a union of three shapes, all exported from `react-dockable-desktop`:

### Simple item

```typescript
interface ContextMenuSimpleItem {
  label: string | ContextMenuPredefinedMessage;
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
  label: string | ContextMenuPredefinedMessage;
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

## Standalone `<ContextMenu>` — outside any provider tree

If you need a context menu on a surface that lives entirely outside any provider tree — a third-party shell, an iframe, or a widget rendered outside the workspace — use the standalone component directly:

```tsx
import {
  ContextMenu,
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
      <ContextMenu ref={menuRef} />
    </>
  );
}
```

The component renders via `createPortal` to `document.body` at `position: fixed`, clamped to the viewport. It inherits the active skin's design tokens automatically when rendered inside a workspace.

### `ContextMenuHandle` API

| Method | Description |
|--------|-------------|
| `show({ event?, x?, y?, items })` | Open the menu at the event's cursor position (or explicit `x`/`y`). |

### `ContextMenuProps`

| Prop | Default | Description |
|------|---------|-------------|
| `theme` | `'dark'` | CSS modifier class suffix. Built-in: `'dark'`. Pass a custom string for a custom theme class. |
| `formatMessageProvider` | — | i18n formatter for `ContextMenuPredefinedMessage` labels. Pass `intl.formatMessage` here, or use `DockableDesktopProvider`'s `formatMessage` prop which forwards it automatically. |
| `onShow` | — | Fired when the menu opens. |
| `onHide` | — | Fired when the menu closes. |
| `onOpenChange` | — | Combined open/close callback: `(open: boolean) => void`. |

## Keyboard behaviour

| Key | Action |
|-----|--------|
| `Esc` | Close menu |

Full arrow-key navigation is planned for a future release.
