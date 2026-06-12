# Best Practices

## Create the WorkspaceClient outside React

The client holds the panel registry, initial layout, and imperative API. Create it as a **module-level singleton** or in a stable context — not inside a component body.

```ts
// ✅ Module-level singleton — stable across renders
export const client = new WorkspaceClient({
  panels: {
    map:    { component: MapPanel },
    editor: { component: EditorPanel },
  },
  initialState: localStorage.getItem('layout'),
});
```

```tsx
// ❌ Inside a component — recreated on every render
function App() {
  const client = new WorkspaceClient({ panels: { ... } }); // Wrong!
  return <WindowManagerProvider client={client}>...</WindowManagerProvider>;
}
```

## Use `isOpen` before opening a panel

Avoid duplicate panels by checking first:

```ts
if (!client.isOpen('my-map')) {
  client.openPanel('my-map', 'map', { title: 'Map' });
} else {
  client.focusPanel('my-map');
}
```

## Prefer `focusPanel` over re-opening

`openPanel(id, key)` on an already-open panel re-focuses it, but using `focusPanel(id)` is more explicit and semantically correct when you just want to bring a panel to the user's attention.

## Persist layouts with beforeunload

```ts
window.addEventListener('beforeunload', () => {
  localStorage.setItem('workspace-layout', client.saveLayout());
});
```

## Keep panel component keys stable

Component keys are stored inside `saveLayout()` JSON. Renaming a key breaks all saved layouts. If you must rename a key, add a migration step in `loadLayout` before passing the JSON to the client.

## Use dirty state for important editors

```ts
const actions = useWindowManagerActions();

// Mark dirty when the user edits
actions.setPanelDirty('editor-1', true);

// Clear when saved
actions.setPanelDirty('editor-1', false);
```

The built-in close guard will automatically prompt the user before closing a dirty panel.

## Keep panel components pure of layout concerns

Panel components should focus on content, not layout. Use the imperative API (`client.*`) or the `useWindowManagerActions()` hook for layout operations triggered by user interaction inside a panel.

```tsx
function MyPanel({ panelId }: { panelId: string }) {
  const actions = useWindowManagerActions();

  return (
    <button onClick={() => actions.floatPanel(panelId)}>
      Pop out
    </button>
  );
}
```
