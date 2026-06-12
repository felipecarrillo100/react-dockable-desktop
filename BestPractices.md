# Best Practices — react-dockable-desktop

A progressive guide for beginner React developers. By the end of this document you will have a working desktop-style application with dockable panels, floating windows, modals, and inter-panel communication.

---

## What is this library?

`react-dockable-desktop` gives your React application a professional workspace layout engine — the kind you see in tools like VS Code, Figma, or Photoshop. Users can drag panels around, split the screen, pop panels into floating windows, minimize them to a taskbar, and restore them. Your components inside those panels never lose their state, even when moved.

---

## Prerequisites

You should be comfortable with:
- Creating a React application (e.g. with Vite)
- Writing functional components with hooks (`useState`, `useEffect`)
- Basic JSX and TypeScript

You do **not** need to know anything about window managers or layout engines before reading this.

---

## Framework Agnostic

`react-dockable-desktop` works alongside **any** React UI framework. You are free to build your panel components using whatever you prefer:

- **React Bootstrap** (`react-bootstrap`)
- **Material UI** (`@mui/material`)
- **Ant Design** (`antd`)
- **Tailwind CSS**
- Plain CSS or CSS Modules

The library manages the workspace layout (where panels go, how they resize, how they float). What you put **inside** each panel is entirely up to you and your chosen styling approach. The examples below use plain HTML with inline styles so nothing is hidden behind a UI framework.

---

## Step 1 — Installation

```bash
npm install react-dockable-desktop replace-react-contexify
```

Then import the required styles in your entry file (`main.tsx` or `index.tsx`):

```typescript
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

> **Why two style imports?** The context menu (right-click menus) is provided by the `replace-react-contexify` peer dependency. It needs its own styles. The second import is the layout engine's own styles.

---

## Step 2 — Understand the Three Moving Parts

Before writing any code it helps to understand the three concepts the library is built around.

### The Registry

The panel catalog. Register your React components under string keys so the layout engine can spawn them. There are two ways:

**Recommended — WorkspaceClient (v1.2.0+)**
Panels are declared inside `WorkspaceClient` alongside layout configuration. No module-level side effects, scoped per client instance.

**Legacy — Global PanelRegistry**
`PanelRegistry.register('my-key', MyComponent, options)` — module-level singleton. Still fully supported for backward compatibility.

### The Providers

Two context providers that must wrap your application:

- `WindowManagerProvider` — holds the state of the docked grid, floating windows, and taskbar.
- `PanelProvider` — holds the state of modals and slide-in side panels.

### The Renderers

Components that actually draw the workspace on screen:

- `WindowManager` — renders the split-grid, floating windows, and taskbar.
- `ModalStackRenderer` — renders modals.
- `SidePanelRenderer` — renders left and right slide-in drawers.

---

## Step 3 — A Minimal Working Application

Create a file `src/App.tsx`:

```typescript
import React from 'react';
import {
  WorkspaceClient,
  WindowManagerProvider,
  PanelProvider,
  WindowManager,
  ModalStackRenderer,
  SidePanelRenderer,
} from 'react-dockable-desktop';

// 1. Define a simple panel component
const HelloPanel: React.FC = () => (
  <div style={{ padding: '2rem', color: 'white' }}>
    <h2>Hello from a panel!</h2>
    <p>You can drag this tab, split it, float it, or minimize it.</p>
  </div>
);

// 2. Create a WorkspaceClient and declare panels inside it
const client = new WorkspaceClient({
  panels: {
    hello: { component: HelloPanel, defaultOptions: { title: 'Hello Panel' } },
  },
});

// 3. Build the application shell
function App() {
  return (
    <WindowManagerProvider client={client}>
      <PanelProvider>
        <div style={{ width: '100vw', height: '100vh' }}>
          <WindowManager />
        </div>
        <ModalStackRenderer />
        <SidePanelRenderer />
      </PanelProvider>
    </WindowManagerProvider>
  );
}

export default App;
```

The workspace starts empty. Panels are opened programmatically, which you will do in the next step.

---

## Step 4 — Opening Panels

Panels are opened using the `useWindowManagerActions` hook. Create a simple toolbar inside the workspace:

```typescript
import React from 'react';
import { useWindowManagerActions } from 'react-dockable-desktop';

const Toolbar: React.FC = () => {
  const { openPanel } = useWindowManagerActions();

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', display: 'flex', gap: '0.5rem' }}>
      <button onClick={() => openPanel('hello-1', 'hello')}>
        Open Hello Panel
      </button>
    </div>
  );
};
```

> **Two arguments to `openPanel`:** The first is a unique **instance ID** (you choose it — like a database row ID). The second is the **registry key** you used when declaring panels in `WorkspaceClient`. Using a fixed instance ID means calling `openPanel` again with the same ID will focus the existing panel rather than opening a second copy.

Place the toolbar inside your app, above the `WindowManager`:

```typescript
function App() {
  return (
    <WindowManagerProvider client={client}>
      <PanelProvider>
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Toolbar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WindowManager />
          </div>
        </div>
        <ModalStackRenderer />
        <SidePanelRenderer />
      </PanelProvider>
    </WindowManagerProvider>
  );
}
```

Now clicking the button opens the panel in the docked grid. Try right-clicking the tab to see the context menu — float, minimize, close.

---

## Step 5 — Adding a Second Panel

Add the second panel component and declare it in the `WorkspaceClient`:

```typescript
const NotesPanel: React.FC = () => {
  const [text, setText] = React.useState('');

  return (
    <div style={{ padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: 'white' }}>Notes</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ flex: 1, background: '#2d2d2d', color: 'white', border: 'none', padding: '0.5rem' }}
        placeholder="Type your notes here..."
      />
    </div>
  );
};

const client = new WorkspaceClient({
  panels: {
    hello: { component: HelloPanel, defaultOptions: { title: 'Hello Panel' } },
    notes: { component: NotesPanel, defaultOptions: { title: 'Notes', canMinimize: true, canClose: true } },
  },
});
```

Add a button to the toolbar:

```typescript
<button onClick={() => openPanel('notes-1', 'notes')}>
  Open Notes
</button>
```

Open both panels. Then drag one tab onto the other — they group into a tabbed container. Drag one to the edge of the screen to split the workspace into two columns. Everything is handled by the library.

> **Zero-unmount guarantee:** Type something in the Notes textarea, then drag the tab to a different position. Your text is still there. The library never destroys the component — it physically moves the DOM node to the new position.

---

## Step 6 — Floating Windows

You can open a panel directly into a floating window instead of the docked grid:

```typescript
openPanel('notes-float', 'notes', {
  title: 'Floating Notes',
  initialTarget: 'floating',
  favoritePosition: { x: 200, y: 150, width: 400, height: 300 },
});
```

`initialTarget` accepts `'docked'` (default) or `'floating'`. `favoritePosition` sets the initial position and size of the floating window.

---

## Step 7 — Registry Options Reference

The full set of options available for each panel entry in `WorkspaceClient`:

```typescript
const client = new WorkspaceClient({
  panels: {
    'my-panel': {
      component: MyComponent,
      defaultOptions: {
        title: 'Panel Title',       // string or i18n descriptor
        canClose: true,             // show close button (default: true)
        canMinimize: true,          // show minimize button (default: true)
        canDrag: true,              // allow dragging the tab (default: true)
        initialTarget: 'docked',   // 'docked' | 'floating'
        favoritePosition: {         // default floating position
          x: 100,
          y: 100,
          width: 500,
          height: 400,
        },
        icon: <MyIcon />,           // icon shown in tab header and taskbar
        renderHeaderActions: (panelId) => (
          <button onClick={() => console.log(panelId)}>⚙</button>
        ),
        disableLivePreview: false,  // set true for WebGL panels (uses initial letter instead)
      },
    },
  },
});
```

---

## Step 8 — Tracking Unsaved Changes (Dirty State)

If a user edits something in a panel and tries to close it without saving, you want a warning. The library provides this via the `useFormContainer` hook.

```typescript
import { useFormContainer } from 'react-dockable-desktop';

const EditPanel: React.FC = () => {
  const container = useFormContainer();
  const [value, setValue] = React.useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    container.setDirty(true);   // tab title shows an asterisk: "Edit *"
  };

  const handleSave = () => {
    // ... save logic ...
    container.setDirty(false);  // asterisk disappears
  };

  return (
    <div style={{ padding: '1rem' }}>
      <textarea value={value} onChange={handleChange} />
      <button onClick={handleSave}>Save</button>
    </div>
  );
};
```

When `dirty` is true and the user clicks the close button, the library automatically shows a confirmation dialog. No extra code needed.

### Intercepting the Close Yourself

If you need custom logic before a panel closes, register a close guard:

```typescript
React.useEffect(() => {
  const unregister = container.onCloseRequested(() => {
    if (value !== '') {
      // return false to block the close
      return window.confirm('You have unsaved changes. Close anyway?');
    }
    return true; // allow close
  });
  return unregister; // clean up when component unmounts
}, [container, value]);
```

---

## Step 9 — Modals

Modals are opened using `usePanelActions` from `PanelProvider`:

```typescript
import { usePanelActions } from 'react-dockable-desktop';

const MyToolbar: React.FC = () => {
  const { openModal } = usePanelActions();

  const handleSettings = () => {
    openModal(SettingsForm, {}, { title: 'Settings', size: 'medium' });
  };

  return <button onClick={handleSettings}>Settings</button>;
};
```

The first argument is any React component. The second is its props. The third is modal options (`size` can be `'small'`, `'medium'`, `'large'`, `'fullscreen'`, or `'auto'`).

The modal component itself can call `useFormContainer()` just like any panel — dirty state, close guards, and dynamic title overrides all work the same way inside modals.

---

## Step 10 — Side Panels (Drawers)

Slide-in side panels work the same way as modals but appear from the left or right edge:

```typescript
const { openLeftPanel, openRightPanel } = usePanelActions();

// Open a 320px wide drawer from the right
openRightPanel(PropertiesPanel, {}, { title: 'Properties', width: 320 });
```

---

## Step 11 — Inter-Panel Communication

Panels should not import each other. Instead, use the built-in event bus:

```typescript
// Publisher — in MapPanel.tsx
import { usePanelContext } from 'react-dockable-desktop';

const MapPanel: React.FC = () => {
  const { publish } = usePanelContext();

  const handleClick = () => {
    publish('feature-selected', { id: 42, name: 'Tower A' });
  };

  return <button onClick={handleClick}>Select Feature</button>;
};
```

```typescript
// Subscriber — in PropertiesPanel.tsx
import { usePanelContext } from 'react-dockable-desktop';

const PropertiesPanel: React.FC = () => {
  const { subscribe } = usePanelContext();
  const [feature, setFeature] = React.useState(null);

  React.useEffect(() => {
    const unsubscribe = subscribe('feature-selected', (payload) => {
      setFeature(payload);
    });
    return unsubscribe;
  }, [subscribe]);

  return <div>{feature ? feature.name : 'Nothing selected'}</div>;
};
```

Both panels can live anywhere in the layout. When `MapPanel` publishes, every active subscriber receives the event immediately.

---

## Step 12 — Saving and Restoring the Layout

Users expect their workspace to look the same next time they open the app. Use `saveLayout` and `loadLayout`:

```typescript
import { useWindowManagerActions } from 'react-dockable-desktop';

const LayoutControls: React.FC = () => {
  const { saveLayout, loadLayout } = useWindowManagerActions();

  const save = () => {
    const snapshot = saveLayout();
    localStorage.setItem('workspace-layout', snapshot);
  };

  const restore = () => {
    const snapshot = localStorage.getItem('workspace-layout');
    if (snapshot) loadLayout(snapshot);
  };

  return (
    <>
      <button onClick={save}>Save Layout</button>
      <button onClick={restore}>Restore Layout</button>
    </>
  );
};
```

`saveLayout` returns a JSON string. Store it anywhere — `localStorage`, a database, a user profile API. `loadLayout` accepts the same string and reconstructs the entire workspace.

You can also call `client.saveLayout()` from **outside** the React tree — useful for toolbar button handlers, keyboard shortcuts, or any imperative code that doesn't have access to hooks:

```typescript
// From outside the React tree (e.g. in a toolbar button handler, a keyboard shortcut)
const saveButton = document.getElementById('save-btn');
saveButton?.addEventListener('click', () => {
  localStorage.setItem('workspace-layout', client.saveLayout());
});
```

---

## Step 13 — Working with React Bootstrap

Here is the same `HelloPanel` written with React Bootstrap components. Nothing changes in how you register or open it — only the markup inside the panel:

```typescript
import { Card, Button, Badge } from 'react-bootstrap';

const HelloPanel: React.FC = () => {
  return (
    <Card className="h-100 border-0 rounded-0 bg-dark text-white">
      <Card.Body>
        <Card.Title>Hello <Badge bg="success">Live</Badge></Card.Title>
        <Card.Text>This panel is built with React Bootstrap.</Card.Text>
        <Button variant="primary">Click me</Button>
      </Card.Body>
    </Card>
  );
};
```

---

## Step 14 — Working with Material UI

The same panel using Material UI:

```typescript
import { Box, Typography, Button, Chip } from '@mui/material';

const HelloPanel: React.FC = () => {
  return (
    <Box sx={{ p: 3, height: '100%' }}>
      <Typography variant="h5" gutterBottom>
        Hello <Chip label="Live" color="success" size="small" />
      </Typography>
      <Typography variant="body1" sx={{ mb: 2 }}>
        This panel is built with Material UI.
      </Typography>
      <Button variant="contained">Click me</Button>
    </Box>
  );
};
```

You can even mix both frameworks in the same workspace — one panel using Bootstrap, another using MUI. The layout engine does not care what is inside the panels.

---

## Step 15 — Customising the Look

The library exposes CSS custom properties. Override them in your global stylesheet to match your brand:

```css
:root {
  --accent-color: #007bff;       /* highlight / active colour */
  --bg-dark-color: #1a1a2e;      /* workspace background */
  --glass-bg: rgba(26, 26, 46, 0.75);
  --border-color: rgba(255, 255, 255, 0.1);
}
```

The `skin` prop on `WindowManager` applies a `data-workspace-skin` attribute to the root element, which you can target in CSS for per-skin overrides:

```css
[data-workspace-skin="light"] {
  --bg-dark-color: #f5f5f5;
  --border-color: rgba(0, 0, 0, 0.1);
}
```

---

## Common Mistakes

**Registering components inside a React component (legacy PanelRegistry)**

If you use the global `PanelRegistry`, register at module scope — not inside a component body. With `WorkspaceClient`, this problem doesn't exist because panels are declared once at client construction time.

```typescript
// Wrong — re-registers on every render (legacy PanelRegistry only)
function App() {
  PanelRegistry.register('map', MapPanel, { title: 'Map' }); // ❌
  return ...;
}

// Correct — register once at module level (legacy approach)
PanelRegistry.register('map', MapPanel, { title: 'Map' }); // ✓

function App() {
  return ...;
}

// Recommended — declare panels in WorkspaceClient at construction time
const client = new WorkspaceClient({
  panels: {
    map: { component: MapPanel, defaultOptions: { title: 'Map' } },
  },
}); // ✓ no side effects, scoped, safe to export
```

**Using the same instance ID for different components**

```typescript
// This will open MapPanel but title it 'Notes' and show the wrong component
openPanel('panel-1', 'map', { title: 'Map' });
openPanel('panel-1', 'notes', { title: 'Notes' }); // ❌ same ID, reuses first
```

Use distinct instance IDs when you want two separate panel instances open at the same time:

```typescript
openPanel('map-main', 'map');
openPanel('map-compare', 'map'); // ✓ second instance of the same component
```

**Forgetting `PanelProvider` when using modals or side panels**

`usePanelActions` requires `PanelProvider` to be in the tree above it. If you see a context error, make sure `PanelProvider` wraps both your toolbar and the `WindowManager`.

**Placing `WindowManager` without a fixed height**

The workspace fills its container. If the container has no height the workspace collapses to zero. Always give the container an explicit height:

```typescript
<div style={{ width: '100vw', height: '100vh' }}>
  <WindowManager />
</div>
```

---

## Complete Minimal Template

Copy this as a starting point for any new project:

```typescript
// src/workspaceClient.ts — create client and register panels here
import { WorkspaceClient } from 'react-dockable-desktop';
import { WelcomePanel } from './panels/WelcomePanel';
import { NotesPanel } from './panels/NotesPanel';

export const client = new WorkspaceClient({
  panels: {
    welcome: { component: WelcomePanel, defaultOptions: { title: 'Welcome', canClose: false } },
    notes:   { component: NotesPanel,   defaultOptions: { title: 'Notes' } },
  },
  initialState: localStorage.getItem('workspace-layout'),
});
```

```typescript
// src/App.tsx
import React from 'react';
import {
  WindowManagerProvider,
  PanelProvider,
  WindowManager,
  ModalStackRenderer,
  SidePanelRenderer,
  useWindowManagerActions,
} from 'react-dockable-desktop';
import { client } from './workspaceClient';

const Toolbar: React.FC = () => {
  const { openPanel } = useWindowManagerActions();
  return (
    <div style={{ padding: '0.5rem', background: '#111', display: 'flex', gap: '0.5rem' }}>
      <button onClick={() => openPanel('welcome', 'welcome')}>Welcome</button>
      <button onClick={() => openPanel('notes-1', 'notes')}>Notes</button>
      <button onClick={() => localStorage.setItem('workspace-layout', client.saveLayout())}>Save Layout</button>
    </div>
  );
};

export default function App() {
  return (
    <WindowManagerProvider client={client}>
      <PanelProvider>
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Toolbar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WindowManager />
          </div>
        </div>
        <ModalStackRenderer />
        <SidePanelRenderer />
      </PanelProvider>
    </WindowManagerProvider>
  );
}
```

---

## Further Reading

- [AdvancedTopics.md](AdvancedTopics.md) — Second part of this guide: pre-loading layouts, programmatic layout control, Sidebar, i18n, WebGL panels, typed event bus, testing, and more
- [README.md](README.md) — Installation, API reference, and hook documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) — How the layout engine works internally
- [Live Demo](https://felipecarrillo100.github.io/react-dockable-desktop/) — Interactive example with Leaflet maps and Monaco editor
