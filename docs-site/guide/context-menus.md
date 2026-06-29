# Context Menus

`react-dockable-desktop` ships a built-in `<ContextMenu>` component. It powers the right-click menus on panel tabs, minimized taskbar chips, and floating window headers — and it is also exported as a standalone component for use on your own UI surfaces.

## Built-in trigger surfaces

| Where | How to trigger |
|-------|----------------|
| Docked panel tab | Right-click the tab |
| Minimized taskbar chip | Right-click the chip |
| Floating window header `⋮` button | Appears when a panel has custom items |
| Floating window anchor button | Click to toggle sticky-right / sticky-bottom |

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
- The `⋮` button in the floating window header appears only when custom items exist.

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
  <span className="wm-menu-icon">
    <svg width="14" height="14" viewBox="0 0 24 24" ...>...</svg>
  </span>
);

{ label: 'Save', icon: SaveIcon, action: handleSave }
```

## Standalone `<ContextMenu>`

> **Prefer `showContextMenu()` when inside a `DockableDesktopProvider` tree.** The pattern below is for surfaces that live completely outside any `<ContextMenuProvider>` — for example, a widget in a third-party shell or a tooltip rendered outside the workspace. Inside a `DockableDesktopProvider`, use `useWindowManagerActions().showContextMenu()` or `useShowContextMenu()` instead of a per-component ref.

Use the built-in context menu on a UI surface outside of any provider tree:

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
| `formatMessageProvider` | — | i18n formatter for `ContextMenuPredefinedMessage` labels. When using `DockableDesktopProvider`, its `formatMessage` prop is forwarded automatically. |
| `onShow` | — | Fired when the menu opens. |
| `onHide` | — | Fired when the menu closes. |
| `onOpenChange` | — | Combined open/close callback: `(open: boolean) => void`. |

## Imperative trigger from any panel — `showContextMenu`

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

## Keyboard behaviour

| Key | Action |
|-----|--------|
| `Esc` | Close menu |

Full arrow-key navigation is planned for a future release.
