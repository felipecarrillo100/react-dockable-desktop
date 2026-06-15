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
  enabled: boolean;  // false = item is greyed out and non-interactive
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

Use the built-in context menu on any UI surface outside of panels:

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
| `formatMessageProvider` | — | i18n formatter for `ContextMenuPredefinedMessage` labels. Inside the workspace this is wired automatically. |
| `onShow` | — | Fired when the menu opens. |
| `onHide` | — | Fired when the menu closes. |
| `onOpenChange` | — | Combined open/close callback: `(open: boolean) => void`. |

## `ContextMenuAdapter` — custom implementation

If your project has its own design-system context menu (or requires a WCAG-certified accessible implementation), you can swap the default menu via the `contextMenuAdapter` prop on `<WindowManager>`:

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

// In your app:
<WindowManager contextMenuAdapter={myAdapter} ... />
```

The adapter receives `items: ContextMenuItem[]` via `show()` and is responsible for rendering them. The built-in `DefaultContextMenuAdapter` is used when no adapter is provided.

## Keyboard behaviour

| Key | Action |
|-----|--------|
| `Esc` | Close menu |

Full arrow-key navigation is planned for a future release.
