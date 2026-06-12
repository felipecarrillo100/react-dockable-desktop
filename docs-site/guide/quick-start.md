# Quick Start

A minimal working application in four steps.

## 1. Create a WorkspaceClient

Define your panel catalog and optional initial layout outside the React tree:

```ts
// workspaceClient.ts
import { WorkspaceClient } from 'react-dockable-desktop';
import { MapPanel }    from './panels/MapPanel';
import { EditorPanel } from './panels/EditorPanel';

export const client = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel,    defaultOptions: { title: 'Map' } },
    editor: { component: EditorPanel, defaultOptions: { title: 'Editor' } },
  },
  // Restore last session, or start with an empty canvas
  initialState: localStorage.getItem('workspace-layout'),
});
```

> **Tip:** Export `client` and use it imperatively from anywhere in your application — no hook required.

## 2. Set up the Provider

```tsx
// App.tsx
import {
  WindowManagerProvider,
  WindowManager,
  PanelProvider,
  ModalStackRenderer,
  SidePanelRenderer,
} from 'react-dockable-desktop';
import { client } from './workspaceClient';

export default function App() {
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
```

## 3. Write a panel component

Panel components receive a `panelId` prop:

```tsx
// panels/MapPanel.tsx
import type { FC } from 'react';

interface Props { panelId: string }

const MapPanel: FC<Props> = ({ panelId }) => (
  <div style={{ width: '100%', height: '100%' }}>
    Hello from panel {panelId}
  </div>
);

export default MapPanel;
```

## 4. Open a panel

Call `client.openPanel()` from a button handler, a keyboard shortcut, or anywhere else:

```ts
// From a toolbar button, a menu item, or an effect:
client.openPanel('my-map', 'map', { title: 'Satellite View' });

// Save the current layout before the user leaves:
window.addEventListener('beforeunload', () => {
  localStorage.setItem('workspace-layout', client.saveLayout());
});
```

## Next steps

- [WorkspaceClient in depth →](./workspace-client)
- [Layout serialization →](./layout)
- [API Reference →](/api/)
