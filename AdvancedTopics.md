# Advanced Topics — react-dockable-desktop

This document is the second part of the developer guide. It assumes you have read [BestPractices.md](BestPractices.md) and have a working workspace application. Each section here picks up where the beginner guide left off.

---

## Topic 1 — Pre-Loading a Layout on Startup

In [BestPractices.md Step 12](BestPractices.md#step-12--saving-and-restoring-the-layout) you learned how to save and restore a layout. But what if you want to define a fixed starting layout in code — before the user has ever interacted with the app?

`WindowManagerProvider` starts with a hardcoded default layout defined inside the library. To replace it, call `loadLayout` inside a `useEffect` that runs once after the providers mount.

```typescript
import React, { useEffect } from 'react';
import {
  WindowManagerProvider,
  PanelProvider,
  WindowManager,
  ModalStackRenderer,
  SidePanelRenderer,
  useWindowManagerActions,
  PanelRegistry,
} from 'react-dockable-desktop';
import { MapPanel } from './panels/MapPanel';
import { ConsolePanel } from './panels/ConsolePanel';
import { PropertiesPanel } from './panels/PropertiesPanel';

PanelRegistry.register('map', MapPanel, { title: 'Map', canClose: false });
PanelRegistry.register('console', ConsolePanel, { title: 'Console' });
PanelRegistry.register('properties', PropertiesPanel, { title: 'Properties' });

// Define the layout as a plain object, then serialise it
const DEFAULT_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'horizontal',
    sizes: [0.7, 0.3],
    children: [
      {
        type: 'leaf',
        id: 'main-area',
        panels: ['map-1'],
        activePanelId: 'map-1',
      },
      {
        type: 'branch',
        orientation: 'vertical',
        sizes: [0.5, 0.5],
        children: [
          {
            type: 'leaf',
            id: 'top-right',
            panels: ['properties-1'],
            activePanelId: 'properties-1',
          },
          {
            type: 'leaf',
            id: 'bottom-right',
            panels: ['console-1'],
            activePanelId: 'console-1',
          },
        ],
      },
    ],
  },
  floating: [],
  minimized: [],
  panels: {
    'map-1':        { id: 'map-1',        title: 'Map',        component: 'map',        state: 'docked' },
    'properties-1': { id: 'properties-1', title: 'Properties', component: 'properties', state: 'docked' },
    'console-1':    { id: 'console-1',    title: 'Console',    component: 'console',    state: 'docked' },
  },
});

// Inner component can use hooks because it is inside the providers
const WorkspaceLoader: React.FC = () => {
  const { loadLayout } = useWindowManagerActions();

  useEffect(() => {
    const saved = localStorage.getItem('workspace-layout');
    loadLayout(saved ?? DEFAULT_LAYOUT);
  }, []); // runs once on mount

  return null;
};

export default function App() {
  return (
    <WindowManagerProvider>
      <PanelProvider>
        <WorkspaceLoader />
        <div style={{ width: '100vw', height: '100vh' }}>
          <WindowManager />
        </div>
        <ModalStackRenderer />
        <SidePanelRenderer />
      </PanelProvider>
    </WindowManagerProvider>
  );
}
```

> **Key point:** `WorkspaceLoader` is placed **inside** the providers so it can call `useWindowManagerActions`. The empty `useEffect` dependency array ensures `loadLayout` runs exactly once after the first render.

---

## Topic 2 — Programmatic Layout Control

Beyond `openPanel` and `closePanel`, `useWindowManagerActions` exposes a full set of layout manipulation methods. These are useful when your application logic needs to drive the workspace rather than leaving it entirely to user interaction.

```typescript
const {
  floatPanel,
  dockPanel,
  minimizePanel,
  restorePanel,
  maximizePanel,
  dockPanelToWorkspaceEdge,
  updateFloatingPosition,
  bringToFront,
  closePanel,
  updatePanelTitle,
  setPanelDirty,
  setActivePanel,
  setDirection,
} = useWindowManagerActions();
```

### Float a panel at a specific position

```typescript
floatPanel('map-1', { x: 100, y: 80, width: 600, height: 450 });
```

### Dock a floating panel back to the grid

```typescript
dockPanel('map-1');           // docks to the first available leaf group
dockPanel('map-1', 'main-area'); // docks to a specific leaf group by ID
```

### Dock a panel to a workspace edge

Programmatically reproduces what the user does by dragging to the screen edge:

```typescript
dockPanelToWorkspaceEdge('console-1', 'bottom'); // snaps console to full-width bottom row
dockPanelToWorkspaceEdge('properties-1', 'right'); // snaps to full-height right column
```

### Anchor a floating window to an edge

Floating windows can be made sticky — they follow the workspace edge when the workspace resizes:

```typescript
const { workspaceSize } = useWindowManagerState(); // not a real field — use updateFloatingPosition

updateFloatingPosition('properties-1', {
  x: 20,
  y: 20,
  width: 300,
  height: 400,
  stickyRight: true,  // window stays pinned to the right edge on resize
  stickyBottom: false,
});
```

### Update a panel's title at runtime

Useful when the panel represents a file and the filename changes:

```typescript
updatePanelTitle('editor-1', 'MyFile.ts *');
// or with an i18n descriptor:
updatePanelTitle('editor-1', { id: 'app.editorTitle', defaultMessage: 'Editor — {filename}', values: { filename: 'App.tsx' } });
```

### Mark a panel dirty from outside the panel

For cases where a service layer detects unsaved changes independently:

```typescript
setPanelDirty('editor-1', true, {
  title: 'Unsaved File',
  message: 'This file has unsaved changes. Discard them?',
  alert: 'Autosave is disabled.',
  alertType: 'warning',
});
```

The `DirtyStateOptions` object customises every part of the confirmation dialog that appears when the user tries to close the panel. See [BestPractices.md Step 8](BestPractices.md#step-8--tracking-unsaved-changes-dirty-state) for the basic usage.

---

## Topic 3 — The Sidebar Component

`Sidebar` is a navigation strip (icon column) with an attached slide-out drawer. It is independent of the docked grid and is typically placed to the left or right of `WindowManager`.

```typescript
import { Sidebar } from 'react-dockable-desktop';
import type { SidebarTab } from 'react-dockable-desktop';

const tabs: SidebarTab[] = [
  {
    id: 'layers',
    label: 'Layers',
    icon: <LayersIcon />,
    renderContent: (tabId, onClose) => (
      <LayersPanel onClose={onClose} />
    ),
  },
  {
    id: 'search',
    label: 'Search',
    icon: <SearchIcon />,
    renderContent: (tabId, onClose) => (
      <SearchPanel onClose={onClose} />
    ),
  },
];

function App() {
  return (
    <WindowManagerProvider>
      <PanelProvider>
        <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
          <Sidebar position="left" tabs={tabs} drawerWidth="280px">
            <WindowManager />
          </Sidebar>
        </div>
        <ModalStackRenderer />
        <SidePanelRenderer />
      </PanelProvider>
    </WindowManagerProvider>
  );
}
```

The `children` of `Sidebar` fill the space next to the strip and drawer. The drawer opens when a tab icon is clicked and closes when the same icon is clicked again.

### eagerMount and preserveState

By default, a sidebar panel is not mounted until the user first clicks its tab, and it is unmounted when the drawer closes. Two options change this behaviour:

```typescript
{
  id: 'heavy-panel',
  label: 'Heavy Panel',
  icon: <Icon />,
  eagerMount: true,      // mount immediately when Sidebar first renders, not on first click
  preserveState: true,   // keep mounted (display: none) when drawer closes — never unmount
  renderContent: (tabId, onClose) => <HeavyPanel />,
}
```

Use `eagerMount` when another part of the app needs to push data into the panel before the user has opened it. Use `preserveState` for panels with expensive local state (long forms, WebGL scenes) that would be costly to reinitialise.

> `eagerMount: true` implies `preserveState: true`. An eagerly mounted panel is always preserved.

### Imperative Control via ref

You can open or close a specific sidebar tab from external code — for example, when a user action in a map panel should auto-open the properties tab:

```typescript
import { useRef } from 'react';
import type { SidebarHandle } from 'react-dockable-desktop';

const sidebarRef = useRef<SidebarHandle>(null);

// Open programmatically from anywhere
sidebarRef.current?.openTab('layers');

// Close drawer
sidebarRef.current?.closeDrawer();

// Read current active tab
const active = sidebarRef.current?.getActiveTab();

// In JSX:
<Sidebar ref={sidebarRef} position="left" tabs={tabs}>
  <WindowManager />
</Sidebar>
```

### Controlled Mode

If you manage active tab state yourself (e.g. persisting it to a store), use controlled mode:

```typescript
const [activeTab, setActiveTab] = React.useState<string | null>(null);

<Sidebar
  position="left"
  tabs={tabs}
  activeTabId={activeTab}
  onActiveTabChange={setActiveTab}
>
  <WindowManager />
</Sidebar>
```

---

## Topic 4 — Internationalization with react-intl

The library is designed to slot into an existing `react-intl` setup with no changes to its source. Pass the intl formatter to `WindowManagerProvider`:

```typescript
import { IntlProvider, useIntl } from 'react-intl';
import { WindowManagerProvider } from 'react-dockable-desktop';

const messages = {
  en: {
    'dockable-desktop-closeTab':      'Close Tab',
    'dockable-desktop-floatWindow':   'Pop Out',
    'dockable-desktop-minimizePanel': 'Minimise',
    // ... remaining keys
    'app.mapTitle': 'Satellite View',
  },
  ar: {
    'dockable-desktop-closeTab':      'إغلاق',
    'dockable-desktop-floatWindow':   'إنبثاق',
    'dockable-desktop-minimizePanel': 'تصغير',
    // ...
    'app.mapTitle': 'عرض الأقمار الصناعية',
  },
};

const WorkspaceShell: React.FC = () => {
  const intl = useIntl();

  return (
    <WindowManagerProvider
      formatMessage={(msg) =>
        intl.formatMessage(
          { id: msg.id, defaultMessage: msg.defaultMessage },
          msg.values
        )
      }
    >
      {/* ... */}
    </WindowManagerProvider>
  );
};

export default function App() {
  const [locale, setLocale] = React.useState('en');

  return (
    <IntlProvider locale={locale} messages={messages[locale]}>
      <WorkspaceShell />
    </IntlProvider>
  );
}
```

### Type-safe message keys

The library exports `PredefinedMessageKey` — a union type of every built-in message key. Use it to get a compile error if you miss a key in your translation table:

```typescript
import type { PredefinedMessageKey } from 'react-dockable-desktop';

// TypeScript will error if any dockable-desktop key is missing
const dockableMessages: Record<PredefinedMessageKey, string> = {
  floatWindow:        'Pop Out',
  minimizePanel:      'Minimise',
  closeTab:           'Close Tab',
  restorePanel:       'Restore',
  maximizePanel:      'Maximise',
  closePanel:         'Close Panel',
  dockWindow:         'Dock',
  minimize:           'Minimise',
  maximize:           'Maximise',
  restoreSize:        'Restore Size',
  close:              'Close',
  closeEmptyGroup:    'Close Empty Group',
  anchorToRightEdge:  'Pin to Right',
  anchorToBottomEdge: 'Pin to Bottom',
  windowAnchoringOptions: 'Anchoring',
  unsavedChangesTitle:   'Unsaved Changes',
  unsavedChangesMessage: '"{title}" has unsaved changes.',
  discardChanges: 'Discard',
  cancel: 'Cancel',
  yes: 'Yes',
  no: 'No',
  ok: 'OK',
  closePanelTooltip: 'Close panel',
  closeTooltip: 'Close',
};
```

### Translatable panel titles

Panel titles passed to `openPanel` or `PanelRegistry.register` can be either a plain string or an i18n descriptor:

```typescript
openPanel('map-1', 'map', {
  title: { id: 'app.mapTitle', defaultMessage: 'Map' },
});
```

The tab header, floating window titlebar, and minimized taskbar icon tooltip all resolve the descriptor through your `formatMessage` function automatically.

---

## Topic 5 — Overriding Built-in UI Strings

If you are not using `react-intl` but still need to change the default labels in context menus and tooltips (for example to translate them without a full i18n setup), pass a `predefinedMessages` override to the provider:

```typescript
import { defaultPredefinedMessages } from 'react-dockable-desktop';

<WindowManagerProvider
  predefinedMessages={{
    ...defaultPredefinedMessages,
    closeTab:      { id: 'closeTab',      defaultMessage: 'Fermer l\'onglet' },
    floatWindow:   { id: 'floatWindow',   defaultMessage: 'Flotter' },
    minimizePanel: { id: 'minimizePanel', defaultMessage: 'Réduire' },
  }}
>
```

This is a partial merge — you only need to supply the keys you want to override. The rest fall back to the English defaults.

---

## Topic 6 — Custom Style Classes

`WindowManagerProvider` accepts six class name props that inject CSS classes into specific layout zones. This is the primary integration point for making the workspace feel native inside a host design system.

```typescript
<WindowManagerProvider
  windowClass="my-panel-chrome"         // applied to every docked tab group container
  windowBodyClass="my-panel-body"       // applied to the content area of every docked panel
  modalClass="my-modal-chrome"          // applied to every modal container
  modalBodyClass="my-modal-body"        // applied to the content area of every modal
  sidePanelClass="my-drawer-chrome"     // applied to every side-panel drawer container
  sidePanelBodyClass="my-drawer-body"   // applied to the content area of every side panel
>
```

### Example: darker panel bodies with a custom border

```css
.my-panel-chrome {
  border: 1px solid #333;
  border-radius: 4px;
}

.my-panel-body {
  background: #0d0d0d;
}
```

### Example: floating windows that match Material UI Paper

```css
.my-panel-chrome {
  background: var(--mui-palette-background-paper);
  box-shadow: var(--mui-shadows-8);
  border-radius: 4px;
}
```

---

## Topic 7 — Detecting Container Type Inside a Panel

A panel component may be rendered inside a docked tab group, a floating window, a modal, or a side-panel drawer. The `useFormContainer` hook exposes `containerType` so the panel can adapt its layout:

```typescript
import { useFormContainer } from 'react-dockable-desktop';

const AdaptivePanel: React.FC = () => {
  const { containerType, instanceId } = useFormContainer();

  const isModal   = containerType === 'modal';
  const isDrawer  = containerType === 'left-panel' || containerType === 'right-panel';
  const isDocked  = containerType === 'dockable-panel';

  return (
    <div style={{ padding: isModal ? '1.5rem' : '0.75rem' }}>
      {isModal && <h2>Full Edit Mode</h2>}
      {isDocked && <h4>Compact View</h4>}
      <p>Instance: {instanceId}</p>
    </div>
  );
};
```

Possible values: `'dockable-panel'`, `'modal'`, `'left-panel'`, `'right-panel'`, `'standalone'`.

---

## Topic 8 — Dynamic Icon Updates

In addition to `setTitle`, `FormContainerContract` exposes `setIcon` to change the icon shown in the tab header and floating window titlebar at runtime:

```typescript
const { setIcon, setTitle } = useFormContainer();

// When a file is modified
const handleChange = () => {
  setTitle('MyFile.ts *');
  setIcon(<UnsavedIcon />);
};

// When saved
const handleSave = () => {
  setTitle('MyFile.ts');
  setIcon(<SavedIcon />);
};
```

---

## Topic 9 — Panel Lifecycle Events

`FormContainerContract` gives panels access to four lifecycle events that fire when the container changes state. Register handlers inside `useEffect` so they clean up automatically:

```typescript
const container = useFormContainer();

useEffect(() => {
  const offClose    = container.onClose?.(() => {
    console.log('Panel was closed — run cleanup here');
  });
  const offMinimize = container.onMinimize?.(() => {
    console.log('Panel minimized — pause animation loops here');
  });
  const offRestore  = container.onRestore?.(() => {
    console.log('Panel restored — resume animation loops here');
  });
  const offResize   = container.onResize?.((width, height) => {
    myWebGLRenderer.setSize(width, height);
  });

  return () => {
    offClose?.();
    offMinimize?.();
    offRestore?.();
    offResize?.();
  };
}, [container]);
```

`onResize` is fired by a `ResizeObserver` watching the panel's host element — it gives you the actual pixel dimensions every time the panel is resized by the user dragging a split handle or the workspace resizing.

> This is the correct integration point for WebGL renderers, canvas elements, and charting libraries that need explicit size management.

---

## Topic 10 — WebGL and Heavy Components

Panels containing WebGL viewports, large canvas elements, or video streams need two special considerations.

### Disable live preview in the taskbar

By default, minimized panels show a live scaled-down thumbnail when the user hovers over the taskbar icon. For a WebGL context this can cause rendering artefacts. Disable it in the registry:

```typescript
PanelRegistry.register('globe', GlobePanel, {
  title: '3D Globe',
  disableLivePreview: true, // shows the first letter of the title instead
});
```

With `disableLivePreview: true` the hover preview shows the uppercase initial character of the panel title in a neutral placeholder box — no WebGL interaction occurs.

### Use onResize to drive the render loop

WebGL renderers need to know about size changes. Use the lifecycle event from Topic 9:

```typescript
const GlobePanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer>(null);
  const container = useFormContainer();

  useEffect(() => {
    rendererRef.current = new WebGLRenderer(canvasRef.current);

    const offResize = container.onResize?.((w, h) => {
      rendererRef.current?.setSize(w, h);
      rendererRef.current?.getCamera().setAspect(w / h);
    });

    return () => {
      offResize?.();
      rendererRef.current?.dispose();
    };
  }, [container]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};
```

Because the library never unmounts the panel, the WebGL context is created once and its canvas is physically moved to new positions in the DOM as the user drags the panel. The context is preserved throughout.

---

## Topic 11 — Typed Event Bus

The built-in pub/sub bus from [BestPractices.md Step 11](BestPractices.md#step-11--inter-panel-communication) uses `any` typed payloads. For larger applications you can add a thin typed wrapper at the application level:

```typescript
// src/events.ts — define all event contracts here
interface AppEvents {
  'feature-selected': { id: number; name: string; geometry: GeoJSON };
  'layer-visibility-changed': { layerId: string; visible: boolean };
  'export-requested': { format: 'pdf' | 'png' | 'csv' };
}

import { usePanelContext } from 'react-dockable-desktop';

export function useAppEvents() {
  const { publish, subscribe } = usePanelContext();

  return {
    publish<K extends keyof AppEvents>(event: K, data: AppEvents[K]) {
      publish(event, data);
    },
    subscribe<K extends keyof AppEvents>(
      event: K,
      handler: (data: AppEvents[K]) => void
    ) {
      return subscribe(event, handler as (data: any) => void);
    },
  };
}
```

Usage in a panel:

```typescript
const { publish, subscribe } = useAppEvents();

// Publish — TypeScript enforces the correct payload shape
publish('feature-selected', { id: 42, name: 'Tower A', geometry: { ... } });

// Subscribe — payload is correctly typed, no cast needed
useEffect(() => {
  return subscribe('feature-selected', (feature) => {
    setSelectedFeature(feature); // feature is { id: number; name: string; geometry: GeoJSON }
  });
}, [subscribe]);
```

---

## Topic 12 — RTL Layout

The library detects text direction automatically from the nearest ancestor element with a `dir` attribute. See [BestPractices.md](BestPractices.md) for the basic setup. Two advanced patterns:

### Forcing direction from the provider

Override automatic detection entirely when your application manages locale state centrally:

```typescript
const [locale, setLocale] = React.useState('en');
const isRtl = ['ar', 'he', 'fa', 'ur'].includes(locale);

<WindowManagerProvider dir={isRtl ? 'rtl' : 'ltr'}>
```

### Reading direction state inside a panel

If a panel needs to know the current direction to mirror its own layout:

```typescript
import { useWindowManagerState } from 'react-dockable-desktop';

const MyPanel: React.FC = () => {
  const { isRtl } = useWindowManagerState();

  return (
    <div style={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}>
      ...
    </div>
  );
};
```

---

## Topic 13 — keepOnEmpty Leaf Groups

By default, when the last panel in a tab group is closed, the leaf group is removed and the layout collapses. You can prevent this by setting `keepOnEmpty: true` on a leaf in the layout JSON. This is useful for fixed zones — for example an always-visible bottom console area — that should remain even when empty.

```typescript
const FIXED_LAYOUT = JSON.stringify({
  gridRoot: {
    type: 'branch',
    orientation: 'vertical',
    sizes: [0.75, 0.25],
    children: [
      {
        type: 'leaf',
        id: 'main',
        panels: [],
        activePanelId: null,
      },
      {
        type: 'leaf',
        id: 'console-zone',
        panels: [],
        activePanelId: null,
        keepOnEmpty: true,   // this zone stays even when all tabs are closed
        canClose: false,     // hide the × button on the empty group header
      },
    ],
  },
  floating: [],
  minimized: [],
  panels: {},
});
```

When `keepOnEmpty` is true and the group has no panels, it renders an "Empty Workspace Section" placeholder. The user can drag panels into it. This is the correct pattern for defining a fixed application structure that panels can populate dynamically.

---

## Topic 14 — Reacting to Layout State

`useWindowManagerState` gives you the full state tree. You can derive any information from it — for example, showing a different toolbar when a specific panel is open:

```typescript
const { panels, floating, minimized } = useWindowManagerState();

// Check if a panel instance is currently open (docked or floating)
const isMapOpen = 'map-1' in panels;

// Check if any panel is floating
const hasFloating = floating.length > 0;

// Check if a specific panel is minimized
const isConsoleMinimized = minimized.some(m => m.id === 'console-1');

// Count open panels
const openCount = Object.keys(panels).length;
```

A common pattern is to drive a navigation sidebar's badge counts or icon states from the layout state:

```typescript
const LayersPanelTab: React.FC = () => {
  const { panels } = useWindowManagerState();
  const isOpen = 'layers-1' in panels;

  return (
    <button
      className={isOpen ? 'tab-active' : 'tab-inactive'}
      onClick={() => openPanel('layers-1', 'layers')}
    >
      <LayersIcon />
    </button>
  );
};
```

---

## Topic 15 — Testing Panels in Isolation

Panels use `useFormContainer` and `usePanelContext`, both of which read from React context. When testing a panel component in isolation (without a full `WindowManagerProvider`) these hooks return safe defaults from the library — `requestClose` logs a warning, `setDirty` is a no-op, and `subscribe`/`publish` are no-ops. Your panel will render without errors.

```typescript
import { render, screen } from '@testing-library/react';
import { EditPanel } from './EditPanel';

// No providers needed — FormContainerContext returns safe defaults
test('renders the edit form', () => {
  render(<EditPanel />);
  expect(screen.getByRole('textbox')).toBeInTheDocument();
});
```

When you need to test the dirty state interaction, supply a minimal mock contract using the exported context directly:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { FormContainerContext } from 'react-dockable-desktop';
import { EditPanel } from './EditPanel';

test('marks dirty on input change', () => {
  const setDirty = vi.fn();

  render(
    <FormContainerContext.Provider
      value={{
        setDirty,
        requestClose: vi.fn(),
        onCloseRequested: () => () => {},
        setTitle: vi.fn(),
        instanceId: 'test-panel',
        containerType: 'dockable-panel',
        onClose: () => () => {},
        onMinimize: () => () => {},
        onRestore: () => () => {},
        onResize: () => () => {},
      }}
    >
      <EditPanel />
    </FormContainerContext.Provider>
  );

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
  expect(setDirty).toHaveBeenCalledWith(true);
});
```

---

## Quick Reference — All Actions

| Action | Description |
|--------|-------------|
| `openPanel(id, component, options?)` | Open or focus a panel |
| `closePanel(id)` | Force-close a panel (bypasses dirty check) |
| `requestClosePanel(id)` | Close with dirty check and confirmation dialog |
| `minimizePanel(id)` | Send to taskbar |
| `restorePanel(id)` | Restore from taskbar |
| `floatPanel(id, rect?)` | Convert docked panel to floating window |
| `dockPanel(id, leafId?)` | Convert floating window back to docked tab |
| `maximizePanel(id)` | Toggle maximize on a floating window |
| `dockPanelToWorkspaceEdge(id, edge)` | Snap panel to `'left'`, `'right'`, `'top'`, `'bottom'` |
| `updateFloatingPosition(id, updates)` | Move or resize a floating window |
| `bringToFront(id)` | Raise z-index of a floating window |
| `updatePanelTitle(id, title)` | Change the tab/titlebar label |
| `setPanelDirty(id, dirty, options?)` | Set dirty state with optional custom dialog text |
| `setActivePanel(id)` | Focus a panel |
| `setDirection(dir)` | Override layout direction `'ltr'` \| `'rtl'` |
| `saveLayout()` | Serialise workspace to JSON string |
| `loadLayout(json)` | Reconstruct workspace from JSON string |
| `publish(event, data)` | Emit an inter-panel event |
| `subscribe(event, handler)` | Listen for an inter-panel event (returns unsubscribe) |

---

## Further Reading

- [BestPractices.md](BestPractices.md) — Step-by-step beginner guide from installation to a complete application
- [README.md](README.md) — API reference and hook documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) — Internal design: layout tree model, DOM persistence, RTL detection, build pipeline
- [Live Demo](https://felipecarrillo100.github.io/react-dockable-desktop/) — Interactive example with Leaflet maps and Monaco editor
