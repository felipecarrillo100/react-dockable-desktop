# Event Bus & Communication

Panels communicate with each other — and with code outside React — through `react-dockable-desktop`'s built-in pub/sub event bus. No shared state, no prop drilling, no context bridge required.

## Why an event bus?

In a multi-panel application, panels don't share a common parent (each may live in a different split leaf or floating window). The event bus gives any panel a way to tell any other panel that something happened, without the usual React tradeoffs:

- No re-renders on the common ancestor (the bus sits outside React state)
- No prop tunnel through `WindowManager` → leaf → panel
- Works from outside React (keyboard shortcuts, WebSocket handlers, analytics)

## `usePanelContext()`

The simplest entry point — call it inside any panel component to get `publish` and `subscribe`:

```tsx
import { usePanelContext } from 'react-dockable-desktop';

function LayerTreePanel() {
  const { publish, subscribe } = usePanelContext();

  const handleLayerClick = (layerId: string) => {
    publish('layer:select', { layerId });
  };

  return <LayerTree onLayerClick={handleLayerClick} />;
}
```

```tsx
function MapPanel() {
  const { subscribe } = usePanelContext();

  useEffect(() => {
    const unsubscribe = subscribe('layer:select', ({ layerId }) => {
      map.setVisibleLayer(layerId);
    });
    return unsubscribe;  // unsubscribed when MapPanel unmounts
  }, [subscribe]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}
```

`subscribe` returns an unsubscribe function. Always clean it up in a `useEffect` return.

## Minimal end-to-end example

Two panels, one publishes a counter, the other listens:

```tsx
// CounterPanel.tsx
function CounterPanel() {
  const { publish } = usePanelContext();
  const [count, setCount] = useState(0);

  const increment = () => {
    const next = count + 1;
    setCount(next);
    publish('counter:update', { count: next });
  };

  return <button onClick={increment}>Clicks: {count}</button>;
}

// DisplayPanel.tsx
function DisplayPanel() {
  const { subscribe } = usePanelContext();
  const [value, setValue] = useState(0);

  useEffect(() => {
    return subscribe('counter:update', ({ count }) => setValue(count));
  }, [subscribe]);

  return <div>Remote count: {value}</div>;
}
```

## WorkspaceClient typed event bus

When working outside a panel component — or when you want TypeScript to verify every event name and payload — use the `WorkspaceClient` generic:

```ts
// workspace.ts
interface AppEvents {
  'layer:select':  { layerId: string };
  'layer:toggle':  { layerId: string; visible: boolean };
  'selection:set': { ids: string[] };
}

export const workspace = new WorkspaceClient<AppEvents>({
  panels: { ... },
});
```

With the type parameter, `publish` and `subscribe` are fully typed:

```ts
workspace.publish('layer:select', { layerId: 'roads' });      // ✓
workspace.publish('layer:select', { wrong: true });            // TypeScript error ✓
workspace.subscribe('layer:toggle', data => {
  data.layerId;   // string ✓
  data.visible;   // boolean ✓
});
```

Without a type parameter, `WorkspaceClient` accepts any string key with `unknown` data — fully backward-compatible.

## Built-in lifecycle events (`BuiltInPanelEvents`)

The bus also carries internal lifecycle events emitted by the workspace engine. Subscribe to them from outside React for analytics, routing, or auto-save:

```ts
workspace.subscribe('panel:opened',    data => {
  console.log(data.id, data.component);  // instance ID, component key
});
workspace.subscribe('panel:closed',    data => console.log(data.id));
workspace.subscribe('panel:minimized', data => console.log(data.id));
workspace.subscribe('panel:restored',  data => console.log(data.id));
```

### Built-in event payloads

| Event | Payload | Description |
|-------|---------|-------------|
| `'panel:opened'` | `{ id: string; component: string }` | A panel was opened (or restored from layout). |
| `'panel:closed'` | `{ id: string }` | A panel was closed. |
| `'panel:minimized'` | `{ id: string }` | A panel was sent to the taskbar. |
| `'panel:restored'` | `{ id: string }` | A minimized panel was restored. |

Built-in events are available on typed clients too — they are intersected in automatically via `BuiltInPanelEvents`.

## Lifecycle convenience methods (v3)

`WorkspaceClient` exposes shorthand methods that wrap the four built-in events:

```ts
// Each returns an unsubscribe function:
const unsubOpen    = workspace.onPanelOpen((id, component) => {
  analytics.track('panel_opened', { id, component });
});

const unsubClose   = workspace.onPanelClose(id => {
  saveState(id);
});

const unsubMin     = workspace.onPanelMinimize(id => {
  pauseWork(id);
});

const unsubRestore = workspace.onPanelRestore(id => {
  resumeWork(id);
});

// Unsubscribe when done:
unsubOpen();
```

Use these at module level for application-wide side effects (analytics, auto-save, routing). The unsubscribe functions are safe to call multiple times.

## Pre-mount subscriptions

Subscriptions registered **before the provider mounts** are buffered and replayed once the workspace connects. This means you can subscribe at module level safely:

```ts
// workspace.ts — runs before React renders
const workspace = new WorkspaceClient({ panels: { ... } });

workspace.onPanelOpen((id, component) => {
  console.log(`Panel ${id} (${component}) opened`);
});

export { workspace };
```

The same buffering applies to `workspace.subscribe(...)` calls.

## Combining typed events with built-in events

```ts
interface AppEvents {
  'layer:select': { layerId: string };
}

const workspace = new WorkspaceClient<AppEvents>({ panels: { ... } });

// App event — fully typed:
workspace.publish('layer:select', { layerId: 'roads' });

// Built-in lifecycle event — also typed via BuiltInPanelEvents intersection:
workspace.subscribe('panel:opened', data => {
  data.id;         // string ✓
  data.component;  // string ✓
});
```

## Summary

| API | Where to use | Notes |
|-----|-------------|-------|
| `usePanelContext().publish/subscribe` | Inside a panel component | Easiest for panel-to-panel communication |
| `workspace.publish/subscribe` | Outside React (module level, event handlers) | Use the generic for type safety |
| `workspace.onPanelOpen/Close/Minimize/Restore` | Module level, analytics, routing | Convenience wrappers; return unsubscribe |
| `BuiltInPanelEvents` | TypeScript event maps | Type the four built-in lifecycle events |

## See also

- [Panel Lifecycle & Forms →](./forms-and-panels) — lifecycle hooks inside a panel (`onClose`, `onMinimize`, `onRestore`)
- [WorkspaceClient →](./workspace-client) — full `WorkspaceClient` API including typed event bus
- [Advanced Topics →](./advanced) — state selectors that complement the event bus
