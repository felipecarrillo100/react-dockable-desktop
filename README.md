# React Dockable Desktop

[![npm version](https://img.shields.io/badge/npm-v1.0.0-blue.svg)](#)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#)
[![Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://felipecarrillo100.github.io/react-dockable-desktop/)

A beautiful, premium, state-of-the-art React window manager and dockable layout engine. It features fluid split-docking grids, resizable floating windows, dynamic taskbars, and tabbed panels with **zero-unmount DOM persistence** and **built-in internationalization (i18n) support**.

[**Live Interactive Demo 🚀**](https://felipecarrillo100.github.io/react-dockable-desktop/)

---

## 🌟 Key Features

* **📦 Dockable Splits & Tab Grid**: Drag-and-drop panels to split screens or group them together into tabbed containers.
* **🗺️ Workspace Edge Docking**: Drag a tab or floating window to the outer edges of the screen (left, right, top, bottom) to instantly dock it as a full-width or full-height column/row.
* **🪐 Floating Windows**: Seamlessly pop panels out into floating windows with smooth drag-and-drop movement, custom resizing, maximize, and minimize behaviors.
* **🎨 Custom Global Style Classes**: Inject custom, global styles at the provider level (`modalClass`, `modalBodyClass`, `sidePanelClass`, `sidePanelBodyClass`, `windowClass`, and `windowBodyClass`) to style widgets uniformly.
* **🥞 Aspect-Ratio Modal Engine**: Modals automatically wrap and shrink-to-fit content snugly, but cap height and scroll gracefully at visual aspect-ratio thresholds (4:3 for small/medium, 16:10 for large layouts).
* **🔬 Zero-Unmount DOM Persistence**: Heavy widgets (like Leaflet Maps, WebGL viewports, terminal consoles, or stateful forms) maintain their DOM nodes and state. The engine moves existing DOM structures into a hidden document fragment host rather than unmounting them.
* **🌍 i18n Ready**: Native translation pipeline designed to adapt with tools like `react-intl` (`intl.formatMessage`) or custom formatting libraries. Translate tab headers, floating window titles, taskbars, and right-click context actions dynamically.
* **💎 Glassmorphic & Modern Styling**: Sleek dark mode aesthetics, interactive micro-animations, and fluid transitions.
* **🔌 Inter-Panel Pub/Sub Event Bus**: A robust messaging system for lightweight, decoupled communication between active panels.

---

## 🚀 Installation

```bash
npm install react-dockable-desktop replace-react-contexify
```

Ensure the styling for both the layout engine and context menu is imported in your main entry file (e.g., `index.js` or `main.tsx`):

```typescript
import 'replace-react-contexify/styles.css';
import 'react-dockable-desktop/styles.css';
```

---

## 💻 Running the Demo Environments

The project includes two built-in demo setups to explore and test the window manager layout features:

### 1. Leaflet & Monaco Open Source Demo (Default)
A clean, lightweight dashboard demo suitable for public deployment. It showcases Leaflet 2D/3D map integration (with dynamic CARTO Light/Dark tile styles mapping to dashboard theme switches) and Monaco Editor panels.
```bash
npm run dev
```

### 2. LuciadRIA Earth 3D Demo (Isolated)
An isolated sandbox dashboard demonstrating premium 3D Earth visualizations in the `EPSG:4978` reference reference frame using LuciadRIA. *Note: Requires a valid LuciadRIA developer license locally to run.*
```bash
npm run dev:ria
```

---

## 🛠️ Getting Started

### 1. Define and Register Custom Panels

Register your components with `PanelRegistry`. This exposes them to the window manager layout engine for spawning and custom configuration.

```typescript
import React from 'react';
import { PanelRegistry } from 'react-dockable-desktop';

// Example Panel Component
const MapView: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%', padding: '1rem', color: '#fff' }}>
      <h3>Interactive Map</h3>
      <p>This DOM is preserved across tabs, floats, and minimizations!</p>
    </div>
  );
};

// Register
PanelRegistry.register('mainMap', MapView, {
  title: { id: 'app.mapTitle', defaultMessage: 'Satellite Map View' },
  canClose: false,      // Permanent panel
  canMinimize: true,
  canDrag: true,
  favoritePosition: { x: 100, y: 120, width: 600, height: 400 }
});
```

### 2. Set Up the WindowManager Context Provider

Wrap your workspace inside the `WindowManagerProvider` and render the `Desktop` component:

```typescript
import React from 'react';
import { WindowManagerProvider, Desktop } from 'react-dockable-desktop';

function App() {
  return (
    <WindowManagerProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <Desktop />
      </div>
    </WindowManagerProvider>
  );
}

export default App;
```

---

## 🌍 Internationalization (i18n)

`react-dockable-desktop` is built with dynamic translation in mind. Titles and context menus can accept either raw `string` values or a structured descriptor object resembling `ContextMenuPredefinedMessage`.

### Message Descriptor Format

```typescript
interface ContextMenuPredefinedMessage {
  id: string;
  defaultMessage?: string;
  values?: Record<string, string | number>;
}
```

### Integrating custom formatters (e.g., `react-intl`)

To route messages through your application's translation engine, pass a `formatMessage` callback to the `WindowManagerProvider`.

```typescript
import React from 'react';
import { useIntl } from 'react-intl';
import { WindowManagerProvider, Desktop } from 'react-dockable-desktop';

function App() {
  const intl = useIntl();

  // Map descriptor payload directly to react-intl formatter
  const handleFormatMessage = (msg: { id: string; defaultMessage?: string; values?: any }) => {
    return intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage }, msg.values);
  };

  return (
    <WindowManagerProvider formatMessage={handleFormatMessage}>
      <div style={{ width: '100vw', height: '100vh' }}>
        <Desktop />
      </div>
    </WindowManagerProvider>
  );
}
```

*If no `formatMessage` function is provided, the engine defaults to a fallback formatting template parser resolving placeholders like `Hello {user}` using values.*

---

## 🎛️ Programmatic Spawning and Layout API

Consume actions from the layout context anywhere inside or outside your panel components using the provided hooks.

```typescript
import { useWindowManagerActions, useWindowManagerState } from 'react-dockable-desktop';

const SidebarControls = () => {
  const { openPanel, closePanel, saveLayout, loadLayout } = useWindowManagerActions();
  const state = useWindowManagerState();

  const handleOpenConsole = () => {
    openPanel('debug-console', 'terminal', {
      title: { id: 'app.console', defaultMessage: 'System Console Log' },
      initialTarget: 'floating' // Options: 'docked' | 'floating' | 'tabbed'
    });
  };

  return (
    <div>
      <button onClick={handleOpenConsole}>Spawn Console</button>
      <button onClick={() => alert(saveLayout())}>Backup Layout</button>
    </div>
  );
};
```

### Hook Reference

| Hook Name | Return Type | Description |
| :--- | :--- | :--- |
| `useWindowManagerState()` | `WindowState` | Access grid layout trees, list of active floating windows, minimized windows list, and general dragging statuses. |
| `useWindowManagerActions()` | `WindowActions` | Spawns, minimizes, restores, docks, floats, maximizes, or closes panels. Also handles split sizing, custom locations, and layout serialization (`saveLayout` / `loadLayout`). |
| `useFormatMessage()` | `(msg: ContextMenuPredefinedMessage) => string` | Returns the translation message formatter hook matching the provider preset configuration. |
| `usePanelContext()` | `{ publish, subscribe }` | Dynamic decoupled event bus helper for active panels. |
| `usePanelId()` | `string` | Returns the unique instance ID of the panel calling the hook. |

---

## 🛡️ Form Container Context (Close Interception & Dirty States)

`react-dockable-desktop` provides a context-driven panel container contract to support dirty form tracking, dynamic title overrides, and close action guards. Child elements can access this container context using the `useFormContainer()` hook.

### Context Hook Functions

| Function / Property | Type | Description |
| :--- | :--- | :--- |
| `setDirty(dirty)` | `(dirty: boolean) => void` | Marks the container as dirty. An asterisk `*` will be appended to the panel title (in tabs, minimized taskbars, and floating headers). Attempting to close the panel will trigger a confirmation warning modal. |
| `onCloseRequested(handler)` | `(handler: () => boolean \| Promise<boolean>) => () => void` | Registers an interception handler. When the panel is closed, this function is triggered. If it returns `false`, the closing is cancelled. Returns an unregister cleanup function. |
| `setTitle(title)` | `(title: string \| ContextMenuPredefinedMessage) => void` | Overrides the tab / window title dynamically from the child element. |
| `requestClose(options)` | `(options?: { force?: boolean }) => void` | Request the parent panel container to close programmatically. If `force: true` is passed, it closes immediately, bypassing any dirty checks or guards. |
| `instanceId` | `string` | The unique ID of the panel. |

### Implementation Example

```typescript
import React, { useState, useEffect } from 'react';
import { useFormContainer } from 'react-dockable-desktop';

const EditFormPanel: React.FC = () => {
  const container = useFormContainer();
  const [text, setText] = useState('');

  // 1. Mark dirty when typing
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    container.setDirty(true); // Appends '*' to tab header and prompts warning on close
  };

  const handleSave = () => {
    container.setDirty(false); // Resets dirty state
    alert('Saved successfully!');
  };

  // 2. Intercept and block closing based on conditions
  useEffect(() => {
    const unregister = container.onCloseRequested(() => {
      if (text.includes('BLOCK')) {
        alert('Cannot close while the word "BLOCK" is present!');
        return false; // Blocks closure
      }
      return true; // Allows closure
    });
    return unregister;
  }, [container, text]);

  return (
    <div style={{ padding: '1rem', color: '#fff' }}>
      <h5>Dynamic Form Editor</h5>
      <textarea value={text} onChange={handleChange} />
      <button onClick={handleSave}>Save</button>
      <button onClick={() => container.requestClose()}>Cancel & Close</button>
    </div>
  );
};
```

---

## 🔌 Inter-Panel Event Communication Bus

Avoid complex state management boilerplate. Active panels can broadcast lightweight messages across the workspace seamlessly:

```typescript
import React, { useEffect } from 'react';
import { usePanelContext } from 'react-dockable-desktop';

// Subscriber Panel (e.g. Console Log Viewer)
const ConsoleView: React.FC = () => {
  const { subscribe } = usePanelContext();

  useEffect(() => {
    const unsubscribe = subscribe('CONSOLE_LOG', (payload) => {
      console.log('Received log message: ', payload.message);
    });
    return () => unsubscribe();
  }, [subscribe]);

  return <div>Console Viewer</div>;
};

// Publisher Panel (e.g. Map View)
const MapView: React.FC = () => {
  const { publish } = usePanelContext();

  const handleInteract = () => {
    publish('CONSOLE_LOG', { message: 'User zoomed map viewport.' });
  };

  return <button onClick={handleInteract}>Click Map</button>;
};
```

---

## 🎨 Layout Presets & Configuration Options

You can customized defaults, positioning attributes, and sizes using the registry builder options:

```typescript
PanelRegistry.register('unique-panel-key', PanelComponent, {
  title: 'Default Title String', // fallback
  canMinimize: true,
  canDrag: true,
  canClose: true,
  initialTarget: 'docked', // or 'floating'
  favoritePosition: {
    x: 400, 
    y: 200, 
    width: 500, 
    height: 350
  }
});
```

To customize CSS layout attributes, you can override variables in your stylesheet:
```css
:root {
  --accent-color: #00f0ff;
  --bg-dark-color: #12131a;
  --glass-bg: rgba(18, 19, 26, 0.65);
  --border-color: rgba(255, 255, 255, 0.08);
}
```

---

## 📄 License

MIT. Free to use, adapt, and build upon.
