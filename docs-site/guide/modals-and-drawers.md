# Modals & Side Panels

`react-dockable-desktop` includes a fully integrated overlay system: a **modal stack**, a **left drawer**, and a **right drawer**. All three share the same dirty-state and close-guard machinery as regular panels.

## Setup

The overlay system is part of `DockableDesktopProvider`. You only place the two renderer components in the correct positions in your tree:

```tsx
// App.tsx
import {
  DockableDesktopProvider,
  RddDesktop,
  RddModals,
  RddSidePanels,
} from 'react-dockable-desktop';

export default function App() {
  return (
    <DockableDesktopProvider workspace={workspace}>
      <div className="rdd-fill-viewport" style={{ position: 'relative' }}>
        <RddDesktop />
        <RddSidePanels />  {/* inside the sized container — used for positioning drawers */}
      </div>
      <RddModals />      {/* outside the sized container — full-screen overlay */}
    </DockableDesktopProvider>
  );
}
```

::: warning Placement matters
- `RddSidePanels` **must** be a sibling of `RddDesktop`, inside the positioned container. Drawers position themselves relative to this container.
- `RddModals` **must** be outside that container so modals can overlay the entire viewport.
:::

`RddSidePanels` renders both drawers. To render only one, pass `side="left"` or `side="right"` — for example to place each drawer in a different container. `defaultWidth` sets the width used when an `openLeft`/`openRight` call doesn't give one.

## `useModals()` and `useSidePanels()`

Overlay operations go through two hooks, available in any component inside the provider — `useModals()` for the modal stack and `useSidePanels()` for the drawers:

```ts
import { useModals, useSidePanels } from 'react-dockable-desktop';

function MyComponent() {
  const modals = useModals();          // open, close, closeAll, get, update, setDirty, stack, topmost
  const sidePanels = useSidePanels();  // openLeft, openRight, close, closeAll, get, update, setDirty, left, right
}
```

## Opening a modal

```ts
const id = modals.open(Component, props, options?);
```

`open` pushes a new modal onto the stack and returns the instance ID. The modal appears on top of the workspace.

```tsx
function LaunchButton() {
  const modals = useModals();

  const handleClick = () => {
    const id = modals.open(SettingsPanel, { section: 'general' }, {
      title: 'Settings',
      size:  'large',
    });
    // id can be used later: modals.close(id), modals.get(id), etc.
  };

  return <button onClick={handleClick}>Settings</button>;
}
```

### ModalOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Modal header title. |
| `icon` | `ReactNode` | — | Icon displayed in the title bar. |
| `size` | `'small' \| 'medium' \| 'large' \| 'fullscreen' \| 'auto'` | `'medium'` | Controls max-width of the modal. |
| `closable` | `boolean` | `true` | When `false`, hides the × button and disables backdrop click-to-close. |
| `bodyPadding` | `number \| string` | `0` | CSS padding for the modal body content. Numbers are treated as pixels; strings as any CSS value/shorthand (e.g. `'10px 16px'`). Default is edge-to-edge — pass `10` to restore the pre-v6.0.0 default. |

## Opening a side drawer

Drawers slide in from the left or right edge of the workspace container.

```ts
const id = await sidePanels.openLeft(Component, props, options?);
const id = await sidePanels.openRight(Component, props, options?);
```

```tsx
const sidePanels = useSidePanels();

const showDetails = async () => {
  const id = await sidePanels.openRight(DetailsPanel, { itemId: 'abc' }, {
    title: 'Item Details',
    width: 380,
  });
};
```

### SidePanelOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Drawer header title. |
| `icon` | `ReactNode` | — | Icon next to the title. |
| `width` | `number \| string` | `'320px'` | Drawer width. Numbers are treated as pixels; strings as CSS values (e.g. `'40%'`). |
| `bodyPadding` | `number \| string` | `0` | CSS padding for the panel body content. Numbers are treated as pixels; strings as any CSS value/shorthand (e.g. `'10px 16px'`). Default is edge-to-edge — pass `10` to restore the pre-v6.0.0 default. |

## Closing panels

```ts
// Close one instance by ID, on the hook for its kind:
modals.close(id);
sidePanels.close(id);

// Close all modals, leave drawers open:
modals.closeAll();

// Close both drawers:
sidePanels.closeAll();
```

The open overlays are on the hooks too: `modals.stack` (bottom to top), `modals.topmost`, and `sidePanels.left` / `sidePanels.right`.

From inside the overlay's own component, use `usePanel().close()` instead:

```ts
const panel = usePanel();
panel.close();                  // respects dirty-state guard
panel.close({ force: true });   // bypasses all guards
```

## Dirty state in modals

The same dirty-state mechanism works inside modals. Call `panel.setDirty(true)` inside your modal component and the user will see the confirmation dialog before the modal closes. `useBeforeClose()` works in modals and drawers too:

```tsx
function EditModal() {
  const panel = usePanel();
  const [saved, setSaved] = useState(false);

  const handleInput = () => panel.setDirty(true);
  const handleSave  = () => { save(); setSaved(true); panel.setDirty(false); };

  return (
    <div>
      <input onChange={handleInput} />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

## Stacking modals

Multiple `modals.open` calls stack visually. The topmost modal is active; pressing ESC or clicking the backdrop closes only the topmost.

One ESC closes one overlay — the one on top. Context menus and toolbar flyouts come first, then modals (topmost first), then side drawers (the one opened last first). A modal with `closable: false` swallows ESC rather than letting it close the drawer behind it. A control inside an overlay that handles ESC itself — a search box clearing its query, say — can keep the overlay open by calling `event.preventDefault()` in its own `onKeyDown`.

```ts
const id1 = modals.open(StepOneModal, {});
// User action opens a second modal on top:
const id2 = modals.open(RddConfirm, {
  message: 'Continue to step 2?',
  onOK:    () => { modals.close(id2); advance(); },
  onCancel: () => modals.close(id2),
});
```

## `RddConfirm` — built-in yes/no dialog

Import and use `RddConfirm` directly in `modals.open` for quick confirmations without writing a custom component:

```tsx
import { RddConfirm, useModals } from 'react-dockable-desktop';

const modals = useModals();

const confirm = () => {
  const id = modals.open(RddConfirm, {
    title:    'Delete item',
    message:  'This will permanently delete the item.',
    alert:    'This cannot be undone.',
    alertType: 'danger',
    useYesNoTitles: true,
    onOK:    () => { modals.close(id); deleteItem(); },
    onCancel: () => modals.close(id),
  });
};
```

See [Panel Lifecycle & Forms →](./forms-and-panels#rddconfirm-component) for how the dirty-state dialog uses it; its props type is `RddConfirmProps`.

## `RddSidebar` component

`RddSidebar` is a composite layout component that renders a vertical tab strip and a collapsible drawer panel. It handles all open/close animation, keyboard navigation, and state preservation internally.

```tsx
import { RddSidebar, type SidebarHandle } from 'react-dockable-desktop';
import { useRef } from 'react';

const sidebarRef = useRef<SidebarHandle>(null);

<RddSidebar
  ref={sidebarRef}
  position="right"
  defaultWidth={280}
  tabs={[
    {
      id: 'layers',
      label: 'Layers',
      icon: <LayersIcon />,
      renderContent: (tabId, onClose, onOpen) => (
        <LayerTree onLayerSelect={() => onOpen()} />
      ),
    },
    {
      id: 'properties',
      label: 'Properties',
      icon: <SettingsIcon />,
      preserveState: true,           // keep alive when not visible
      renderContent: () => <PropertiesPanel />,
    },
  ]}
>
  <MainMapArea />   {/* rendered in the space beside the sidebar */}
</RddSidebar>
```

### `SidebarTab`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | ✓ | Unique key for this tab. |
| `label` | `string` | ✓ | Tooltip / accessible label for the tab icon button. |
| `icon` | `ReactNode` | — | Icon displayed in the tab strip. Required unless `hidden` is true. |
| `renderContent` | `(tabId, onClose, onOpen) => ReactNode` | ✓ | Returns the drawer content. `onClose` collapses the drawer; `onOpen` expands it to this tab. |
| `eagerMount` | `boolean` | — | Mount immediately on sidebar render (before the user clicks). Implies `preserveState: true`. Use when other parts of the app need to interact with the panel before the user opens it. |
| `preserveState` | `boolean` | — | Keep the component alive in the DOM behind `display: none` when closed, instead of unmounting it. |
| `hidden` | `boolean` | — | Omit this tab's rail button entirely — no icon, no click target — while it stays fully openable via `openTab()`/`useSidebar().openTab()`/a controlled `activeTabId`. Use for menu-driven panels with no persistent icon (e.g. a Google-Maps-style hamburger that opens content not otherwise pinned to the rail). Default `false`. |

### `RddSidebarProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `SidebarTab[]` | — | **Required.** Tab definitions. |
| `headerAction` | an entry or an array of entries — each a `SidebarActionButton`, `SidebarCustomEntry` or `SidebarTab` | — | One or more non-toggling action buttons and/or real tabs shown above the tabs. See [`headerAction`/`footerAction`](#headeraction-footeraction) below. |
| `footerAction` | same as `headerAction` | — | Mirror of `headerAction`, pinned to the bottom of the tab strip regardless of tab count. See [`headerAction`/`footerAction`](#headeraction-footeraction) below. |
| `showCloseButton` | `boolean` | `false` | Show an "X" close button in the expanded drawer's header — an extra way to collapse the sidebar besides clicking the active tab's own icon again. Has no effect once the default header is suppressed — via `hideDefaultHeader`, or simply by passing `renderHeader` (either one is sufficient) — since the entire default header, this button included, is skipped for every tab in that case. |
| `hideDefaultHeader` | `boolean` | `false` | Suppress the library's own drawer header (title + `showCloseButton`'s close button) for **every** tab — not per-tab — so `renderHeader` (or each tab's own `renderContent`) can supply a header, border, and styling instead. Passing `renderHeader` by itself has the same suppressing effect even if this is left unset — the two props are combined with OR, so supplying `renderHeader` alone is never a silent no-op. The close mechanism works the same either way: the `onClose` parameter passed to `renderContent`/`renderHeader`, or `useSidebarTab().onClose` from anywhere in a tab's content tree. |
| `renderHeader` | `(tab: SidebarTab, onClose, onOpen) => ReactNode` | — | Custom header renderer used in place of the library's own drawer header. Passing `renderHeader` is by itself sufficient to suppress the default header, whether or not `hideDefaultHeader` is also set. Called once for whichever tab is currently active, so one header implementation is shared uniformly across every tab instead of being repeated inside each tab's `renderContent`. Omit `renderHeader` and set `hideDefaultHeader: true` to render no header at all. |
| `position` | `'left' \| 'right'` | `'right'` | Side the tab strip and drawer appear on. |
| `defaultWidth` | `number` | `280` | Initial drawer width in pixels. |
| `minWidth` | `number` | `150` | Minimum drawer width in pixels during drag-resize. |
| `maxWidth` | `number` | `600` | Maximum drawer width in pixels during drag-resize. |
| `onWidthChange` | `(px: number) => void` | — | Called during drag-resize and when `setWidth()` is invoked. |
| `activeTabId` | `string \| null` | — | Controlled active tab. Use with `onActiveTabChange` for fully-controlled mode. |
| `onActiveTabChange` | `(tabId: string \| null) => void` | — | Called when the active tab changes. |
| `visible` | `boolean` | `true` | Collapse the entire sidebar (strip + drawer) to zero width via CSS transition. State is preserved — no unmount. |
| `onVisibilityChange` | `(visible: boolean) => void` | — | Called when `show/hide/toggle` is invoked on the imperative handle. Wire to your `useState` setter. |
| `stripVisible` | `boolean` | `true` | Collapse only the activity bar strip, leaving the drawer unaffected. |
| `onStripVisibilityChange` | `(visible: boolean) => void` | — | Called when `showStrip/hideStrip` is invoked on the imperative handle. |
| `children` | `ReactNode` | — | Main content (rendered in the area beside the sidebar). |

**Active tab styling** — The visual treatment of the active tab button (shape, fill, indicator) is controlled entirely by CSS design tokens and varies per skin. `vscode` uses a transparent fill with a 2 px accent bar; `macos` renders a floating glass chip; `nord` draws a short horizontal line below the icon. See [Per-skin active state design language →](./theming#per-skin-active-state-design-language) to customise this in your own skin.

### Dual sidebars

`RddSecondarySidebar` is a second, independent `RddSidebar` instance for the opposite edge of the screen — same component, same behavior, no forked implementation. It must be rendered inside a primary `RddSidebar`'s `children` (this is a hard requirement, not just a recommendation — it detects the primary via context, which only flows to descendants) and automatically takes whichever side the primary *isn't* using, so you never specify a side yourself:

```tsx
import { RddSidebar, RddSecondarySidebar } from 'react-dockable-desktop';

<RddSidebar position="left" tabs={primaryTabs}>
  <RddSecondarySidebar tabs={secondaryTabs}>
    {/* Your app content */}
  </RddSecondarySidebar>
</RddSidebar>
```

`RddSecondarySidebarProps` is identical to `RddSidebarProps` except `position` isn't settable (it's always the opposite of the primary) — everything else (`tabs`, `headerAction`/`footerAction`, `hideDefaultHeader`/`renderHeader`, controlled `activeTabId`, `showCloseButton`, and so on) works exactly the same as on a primary `RddSidebar`.

::: warning
`RddSecondarySidebar` throws if rendered without a primary `RddSidebar` ancestor, or if nested inside another `RddSecondarySidebar` — this library supports exactly one primary and one secondary sidebar, nothing deeper.
:::

Reach either sidebar's actions from anywhere in its own tree via `useSidebar()` — `position`/`isSecondary` on its return value (see [`useSidebar()`](#usesidebar) below) tell you which one you're inside. Content nested inside the secondary that needs to control the *primary* (or vice versa) needs a `ref`/`SidebarHandle` passed down explicitly — `useSidebar()` always resolves to the nearest instance, not a specific one.

### `headerAction`/`footerAction`

One or more non-toggling action buttons — a hamburger menu, for example — shown above (`headerAction`)
or pinned below (`footerAction`) the tabs. Pass a single object (the common case) or an array to
show several. An array can also mix in real `SidebarTab` entries — a tab placed in `headerAction`/
`footerAction` behaves exactly like a main-list tab (it mounts, activates, renders its drawer
content, and closes through the same lifecycle); only its position in the rail differs. A classic
use case: end `footerAction` with a "Settings" tab that expands like any other tab, preceded by one
or more simple action buttons.

Action button entries never affect `activeTabId` or the drawer: `RddSidebar` only renders them and
forwards the click. What happens next (opening a side panel, a modal, a custom menu, or nothing at
all) is entirely up to you.

```tsx
<RddSidebar
  tabs={tabs}
  headerAction={{
    icon: <MenuIcon />,
    label: 'Menu',
    onClick: () => sidePanels.openLeft(MainMenu, {}, { title: 'Menu' }),
  }}
  footerAction={[
    { icon: <InfoIcon />, label: 'About', onClick: () => modals.open(About, {}) },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SettingsIcon />,
      renderContent: () => <SettingsPanel />,
    },
  ]}
>
  <MainMapArea />
</RddSidebar>
```

Each entry takes one of three forms:

| Form | Shape | Description |
|------|-------|--------------|
| Default button | `{ icon, label, onClick, disabled? }` | Renders a button visually consistent with the regular tab buttons — same styling, current skin, `aria-label` (not `aria-pressed`, since it's never in a pressed state). |
| Fully custom | `{ render: () => ReactNode }` | Renders exactly what you return, with no wrapping element — a Material UI `IconButton`, a Bootstrap `Button`, a Tailwind-styled `<button>`, or anything else keeps its own hover/active/focus/ripple behavior and click handling completely untouched. |
| Real tab | `SidebarTab` (`{ id, label, icon?, renderContent, hidden?, ... }`) | Behaves exactly like an entry in `tabs` — toggles active/inactive, opens the drawer, participates in `eagerMount`/`preserveState`, and is subject to the same auto-close-when-removed guard. `hidden: true` works here too — e.g. a menu-driven entry with no rail button, opened only via `openTab()`. |

```tsx
// Fully custom — a Bootstrap button, unmodified:
<RddSidebar
  tabs={tabs}
  headerAction={{
    render: () => (
      <button type="button" className="btn btn-outline-secondary" onClick={openMenu}>
        <MenuIcon />
      </button>
    ),
  }}
/>
```

`headerAction` renders inside its own `.rdd-sidebar-header-area`; `footerAction` renders inside a
mirror `.rdd-sidebar-footer-area`, pushed to the bottom of the strip regardless of tab count. Both
are independent of the tabs' own inter-item spacing (owned by a separate `.rdd-sidebar-tabs-list`
wrapper). Override `--rdd-sidebar-header-area-padding-top`/`-bottom` and
`--rdd-sidebar-footer-area-padding-top`/`-bottom` (all default `8px`) to adjust their spacing —
and, by extension, their effective height, since height is just padding plus whatever you render.

### `SidebarHandle` imperative ref

Obtain with `useRef<SidebarHandle>()`:

```ts
// Open a specific tab programmatically (e.g. when new data arrives):
sidebarRef.current?.openTab('layers');

// Collapse the drawer:
sidebarRef.current?.closeDrawer();

// Query current state:
const activeTab = sidebarRef.current?.getActiveTab();  // → string | null
```

| Method | Returns | Description |
|--------|---------|-------------|
| `openTab(tabId)` | `void` | Expand drawer and activate the specified tab. |
| `closeDrawer()` | `void` | Collapse the drawer. |
| `getActiveTab()` | `string \| null` | Currently active tab ID, or `null` if collapsed. |
| `show()` | `void` | Show the entire sidebar (calls `onVisibilityChange(true)`). |
| `hide()` | `void` | Hide the entire sidebar (calls `onVisibilityChange(false)`). |
| `toggle()` | `void` | Toggle sidebar visibility. |
| `showStrip()` | `void` | Show only the activity bar strip (calls `onStripVisibilityChange(true)`). |
| `hideStrip()` | `void` | Hide only the activity bar strip (calls `onStripVisibilityChange(false)`). |
| `setWidth(px)` | `void` | Programmatically set the drawer width in pixels (respects `minWidth`/`maxWidth`). |
| `getWidth()` | `number` | Returns the current drawer width in pixels. |

### Sidebar hooks

Two hooks let panels control the sidebar without a ref or prop drilling.

#### `useSidebar()`

Available to **any component inside an `<RddSidebar>` tree** — including floating panels and docked panels rendered via `{children}`:

```tsx
import { useSidebar } from 'react-dockable-desktop';

function LayerTree() {
  const { openTab, closeDrawer, getActiveTab } = useSidebar();

  return (
    <button onClick={() => openTab('search')}>
      Show Search Results
    </button>
  );
}
```

| Value | Type | Description |
|-------|------|-------------|
| `openTab(tabId)` | `(tabId: string) => void` | Expand the drawer and activate the given tab. |
| `closeDrawer()` | `() => void` | Collapse the drawer. |
| `getActiveTab()` | `() => string \| null` | Returns the current tab ID, or `null` if collapsed. |
| `position` | `'left' \| 'right'` | Which side this sidebar instance is rendering on. |
| `isSecondary` | `boolean` | `true` if this instance is an [`RddSecondarySidebar`](#dual-sidebars), `false` for a primary `RddSidebar`. |

::: warning
`useSidebar()` throws if called outside an `<RddSidebar>` tree. A reusable panel component that may render with or without a surrounding sidebar should check for that possibility itself (e.g. a prop indicating whether one is present) rather than relying on this hook to degrade gracefully.
:::

#### `useSidebarTab()`

Available to components rendered inside a tab's `renderContent` tree. Provides both self-control and cross-tab navigation:

```tsx
import { useSidebarTab } from 'react-dockable-desktop';

function SearchResultsPanel() {
  const { tabId, onOpen, onClose, openTab } = useSidebarTab();

  return (
    <div>
      <button onClick={onClose}>Collapse</button>
      <button onClick={() => openTab('settings')}>Open Settings</button>
    </div>
  );
}

// In your tab config — the content must be a React component, not an inline arrow function,
// because useSidebarTab() uses React hooks internally:
{
  id: 'search',
  label: 'Search Results',
  icon: <SearchIcon />,
  renderContent: () => <SearchResultsPanel />,
}
```

| Value | Type | Description |
|-------|------|-------------|
| `tabId` | `string` | The ID of this tab. |
| `onOpen()` | `() => void` | Expand the drawer and activate this tab. |
| `onClose()` | `() => void` | Collapse the drawer. |
| `openTab(tabId)` | `(tabId: string) => void` | Switch to a different tab. |

#### Cross-panel pattern: floating window → sidebar tab

A floating panel can open a sidebar tab and broadcast data in a single action:

```tsx
import { useSidebar, useWorkspace } from 'react-dockable-desktop';

function LayerTree() {
  const { openTab } = useSidebar();
  const { publish } = useWorkspace();

  const handleSearch = (query: string) => {
    const results = performSearch(query);
    publish('search:results', results);   // SearchResultsPanel subscribes to this
    openTab('search');                    // expand sidebar to show it
  };

  // ...
}
```

For the reactive variant — where the sidebar tab opens itself when it receives data — see [Event Bus & Communication →](./event-bus).

### Opening a tab in response to data

Use `eagerMount` + `onOpen` when a background process needs to surface data in the sidebar before the user has clicked:

```tsx
{
  id: 'alerts',
  label: 'Alerts',
  icon: <AlertIcon />,
  eagerMount: true,   // mount immediately so the panel can receive events
  renderContent: (tabId, onClose, onOpen) => (
    <AlertsPanel
      onNewAlert={() => onOpen()}  // expand sidebar when a new alert arrives
    />
  ),
}
```

## `usePanelContextMenu()` hook

Inject custom items into a panel's right-click context menu from **inside** the panel component. The hook reads the panel ID internally — no prop needed. Items are dynamic: the array is re-read every time the menu opens, so state-driven changes (enable/disable, add/remove) take effect automatically.

```tsx
import { usePanelContextMenu } from 'react-dockable-desktop';

function EditorPanel() {
  const [dirty, setDirty] = useState(false);

  usePanelContextMenu([
    { label: 'Save',   action: () => save(),   disabled: !dirty },
    { label: 'Revert', action: () => revert(), disabled: !dirty },
    { type: 'separator' },
    { label: 'Copy Panel Link', action: () => copyLink() },
  ]);

  return <Editor onChange={() => setDirty(true)} />;
}
```

The `items` array accepts `ContextMenuItem` entries exported from `react-dockable-desktop`:

| Shape | Description |
|-------|-------------|
| `{ label, icon?, action, title? }` | A clickable menu item. |
| `{ separator: true }` | A visual divider. |
| `{ label, items: [...] }` | A sub-menu (one level deep). |
| `{ label, checkbox: { active?, enabled, value }, action }` | A checkbox item. |

See the [Context Menus guide](./context-menus) for the full type reference.

::: tip
`usePanelContextMenu` is safe to call unconditionally — it is a no-op when the component renders outside a `DockableDesktopProvider` (e.g., in tests).
:::

## `ModalsApi` / `SidePanelsApi` reference

```ts
interface ModalsApi {
  stack: OverlayInstance[];                 // open modals, bottom to top
  topmost: OverlayInstance | null;
  open<P>(Component: ComponentType<P>, props: P, options?: ModalOptions): OverlayId;
  close(id: OverlayId): void;
  closeAll(): void;
  get(id: OverlayId): OverlayInstance | undefined;
  update(id: OverlayId, updates: { props?, options?, dirty?, dirtyOptions? }): void;
  setDirty(id: OverlayId, dirty: boolean, options?: DirtyStateOptions): void;
}

interface SidePanelsApi {
  left: OverlayInstance | null;
  right: OverlayInstance | null;
  openLeft<P>(Component: ComponentType<P>, props: P, options?: SidePanelOptions): Promise<OverlayId | null>;
  openRight<P>(Component: ComponentType<P>, props: P, options?: SidePanelOptions): Promise<OverlayId | null>;
  close(id: OverlayId): void;
  closeAll(): void;                         // closes both drawers
  get(id: OverlayId): OverlayInstance | undefined;
  update(id: OverlayId, updates: { props?, options?, dirty?, dirtyOptions? }): void;
  setDirty(id: OverlayId, dirty: boolean, options?: DirtyStateOptions): void;
}
```

## See also

- [Panel Lifecycle & Forms →](./forms-and-panels) — dirty state, close guards, `usePanel`
- [Event Bus & Communication →](./event-bus) — panels communicating via pub/sub
- [Quick Start →](./quick-start) — where to place `RddModals` and `RddSidePanels`
