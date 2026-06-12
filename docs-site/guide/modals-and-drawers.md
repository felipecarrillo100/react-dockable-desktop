# Modals & Side Panels

`react-dockable-desktop` includes a fully integrated overlay system: a **modal stack**, a **left drawer**, and a **right drawer**. All three share the same dirty-state and close-guard machinery as regular panels.

## Setup

The overlay system is provided by `PanelProvider`. If you use `DockableDesktopProvider` (recommended), it is already included.

You must also place the two renderer components in the correct positions in your tree:

```tsx
// App.tsx
import {
  DockableDesktopProvider,
  WindowManager,
  ModalStackRenderer,
  SidePanelRenderer,
} from 'react-dockable-desktop';

export default function App() {
  return (
    <DockableDesktopProvider client={workspace}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <WindowManager />
        <SidePanelRenderer />  {/* inside the sized container — used for positioning drawers */}
      </div>
      <ModalStackRenderer />   {/* outside the sized container — full-screen overlay */}
    </DockableDesktopProvider>
  );
}
```

::: warning Placement matters
- `SidePanelRenderer` **must** be a sibling of `WindowManager`, inside the positioned container. Drawers position themselves relative to this container.
- `ModalStackRenderer` **must** be outside that container so modals can overlay the entire viewport.
:::

## `usePanelActions()`

All overlay operations go through the `usePanelActions()` hook, available in any component inside the provider:

```ts
import { usePanelActions } from 'react-dockable-desktop';

function MyComponent() {
  const { openModal, openLeftPanel, openRightPanel, close, closeAll } = usePanelActions();
}
```

## Opening a modal

```ts
const id = openModal(Component, props, options?);
```

`openModal` pushes a new modal onto the stack and returns the instance ID. The modal appears on top of the workspace.

```tsx
function LaunchButton() {
  const { openModal, close } = usePanelActions();

  const handleClick = () => {
    const id = openModal(SettingsPanel, { section: 'general' }, {
      title: 'Settings',
      size:  'large',
    });
    // id can be used later: close(id), actions.getInstance(id), etc.
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

## Opening a side drawer

Drawers slide in from the left or right edge of the workspace container.

```ts
const id = await openLeftPanel(Component, props, options?);
const id = await openRightPanel(Component, props, options?);
```

```tsx
const { openRightPanel, close } = usePanelActions();

const showDetails = async () => {
  const id = await openRightPanel(DetailsPanel, { itemId: 'abc' }, {
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

## Closing panels

```ts
// Close one instance by ID (works for modals and drawers):
close(id);

// Close everything — all modals and both drawers:
closeAll();

// Close only modals, leave drawers open:
closeAllModals();
```

From inside a panel component, use `useFormContainer().requestClose()` instead:

```ts
const container = useFormContainer();
container.requestClose();          // respects dirty-state guard
container.requestClose({ force: true }); // bypasses all guards
```

## Dirty state in modals

The same dirty-state mechanism works inside modals. Call `container.setDirty(true)` inside your modal component and the user will see the confirmation dialog before the modal closes:

```tsx
function EditModal() {
  const container = useFormContainer();
  const [saved, setSaved] = useState(false);

  const handleInput = () => container.setDirty(true);
  const handleSave  = () => { save(); setSaved(true); container.setDirty(false); };

  return (
    <div>
      <input onChange={handleInput} />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

## Stacking modals

Multiple `openModal` calls stack visually. The topmost modal is active; pressing ESC or clicking the backdrop closes only the topmost.

```ts
const id1 = openModal(StepOneModal, {});
// User action opens a second modal on top:
const id2 = openModal(ConfirmationForm, {
  message: 'Continue to step 2?',
  onOK:    () => { close(id2); advance(); },
  onCancel: () => close(id2),
});
```

## `ConfirmationForm` — built-in yes/no dialog

Import and use `ConfirmationForm` directly in `openModal` for quick confirmations without writing a custom component:

```tsx
import { ConfirmationForm } from 'react-dockable-desktop';

const { openModal, close } = usePanelActions();

const confirm = () => {
  const id = openModal(ConfirmationForm, {
    title:    'Delete item',
    message:  'This will permanently delete the item.',
    alert:    'This cannot be undone.',
    alertType: 'danger',
    useYesNoTitles: true,
    onOK:    () => { close(id); deleteItem(); },
    onCancel: () => close(id),
  });
};
```

See [Panel Lifecycle & Forms →](./forms-and-panels#confirmationform-component) for the full props reference.

## `Sidebar` component

`Sidebar` is a composite layout component that renders a vertical tab strip and a collapsible drawer panel. It handles all open/close animation, keyboard navigation, and state preservation internally.

```tsx
import { Sidebar, type SidebarHandle } from 'react-dockable-desktop';
import { useRef } from 'react';

const sidebarRef = useRef<SidebarHandle>(null);

<Sidebar
  ref={sidebarRef}
  position="right"
  drawerWidth="280px"
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
</Sidebar>
```

### `SidebarTab`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | ✓ | Unique key for this tab. |
| `label` | `string` | ✓ | Tooltip / accessible label for the tab icon button. |
| `icon` | `ReactNode` | ✓ | Icon displayed in the tab strip. |
| `renderContent` | `(tabId, onClose, onOpen) => ReactNode` | ✓ | Returns the drawer content. `onClose` collapses the drawer; `onOpen` expands it to this tab. |
| `eagerMount` | `boolean` | — | Mount immediately on sidebar render (before the user clicks). Implies `preserveState: true`. Use when other parts of the app need to interact with the panel before the user opens it. |
| `preserveState` | `boolean` | — | Keep the component alive in the DOM behind `display: none` when closed, instead of unmounting it. |

### `SidebarProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `SidebarTab[]` | — | **Required.** Tab definitions. |
| `position` | `'left' \| 'right'` | `'right'` | Side the tab strip and drawer appear on. |
| `drawerWidth` | `string` | `'220px'` | Width of the open drawer. |
| `activeTabId` | `string \| null` | — | Controlled active tab. Use with `onActiveTabChange` for fully-controlled mode. |
| `onActiveTabChange` | `(tabId: string \| null) => void` | — | Called when the active tab changes. |
| `children` | `ReactNode` | — | Main content (rendered in the area beside the sidebar). |

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

## `PanelActions` reference

```ts
interface PanelActions {
  openModal<P>(Component: ComponentType<P>, props: P, options?: ModalOptions): string;
  openLeftPanel<P>(Component: ComponentType<P>, props: P, options?: SidePanelOptions): Promise<string | null>;
  openRightPanel<P>(Component: ComponentType<P>, props: P, options?: SidePanelOptions): Promise<string | null>;
  close(id: string): void;
  closeAll(): void;
  closeAllModals(): void;
  getInstance(id: string): PanelInstance | undefined;
  setDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void;
}
```

## See also

- [Panel Lifecycle & Forms →](./forms-and-panels) — dirty state, close guards, `useFormContainer`
- [Event Bus & Communication →](./event-bus) — panels communicating via pub/sub
- [Quick Start →](./quick-start) — where to place `ModalStackRenderer` and `SidePanelRenderer`
