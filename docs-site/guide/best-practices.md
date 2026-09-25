# Best Practices

## Create the workspace outside React

The workspace holds the panel registry, initial layout, and imperative API. Create it as a **module-level singleton** or in a stable context — not inside a component body.

```ts
// ✅ Module-level singleton — stable across renders
export const workspace = createWorkspace({
  panels: {
    map:    { component: MapPanel },
    editor: { component: EditorPanel },
  },
  initialState: localStorage.getItem('layout'),
});
```

```tsx
// ❌ Inside a component — a new workspace on every render. The provider keeps the FIRST one it
//    received and silently ignores the rest, so config in the later ones never applies.
function App() {
  const workspace = createWorkspace({ panels: { ... } }); // Wrong!
  return <DockableDesktopProvider workspace={workspace}>...</DockableDesktopProvider>;
}
```

## Use `isOpen` before opening a panel

Avoid duplicate panels by checking first:

```ts
if (!workspace.isOpen('my-map')) {
  workspace.openPanel('my-map', 'map', { title: 'Map' });
} else {
  workspace.focusPanel('my-map');
}
```

## Prefer `focusPanel` over re-opening

`openPanel(id, key)` on an already-open panel re-focuses it, but using `focusPanel(id)` is more explicit and semantically correct when you just want to bring a panel to the user's attention.

## Use `dedupeKey` when call sites can't agree on an `id`

`isOpen`/`focusPanel` above assume every call site already knows and reuses the same literal `id` for a given entity. When that's not guaranteed — multiple places in your app can open "the panel for this document" without necessarily generating the same id — use `dedupeKey` instead of hand-rolling an id → panel lookup:

```ts
workspace.openPanel(crypto.randomUUID(), 'document', {
  props: { path: doc.path },
  dedupeKey: doc.path,
});
```

Any later call with the same `component` and `dedupeKey` focuses the existing panel instead of opening a duplicate — the new call's `id`/`props` are ignored when a match is found.

## Keep per-panel `props` small, and prefer `useSaveState` for anything that changes

`props` on `openPanel` rides through `saveLayout()`'s JSON wholesale on every save. That's fine for small identity/config values (a document id, a filename, a filter selection) but the wrong tool for anything content-sized or high-frequency-changing (a whole document's text, a large dataset) — bundling that into the layout blob means re-serializing it on every save, not just when it actually changes. Keep large/volatile content in your own store keyed by `panelId`, and use `props`/`useSaveState` only for what you actually want persisted alongside the layout.

## Persist layouts with beforeunload

```ts
window.addEventListener('beforeunload', () => {
  localStorage.setItem('workspace-layout', workspace.saveLayout());
});
```

## Keep panel component keys stable

Component keys are stored inside `saveLayout()` JSON. Renaming a key breaks all saved layouts. If you must rename a key, add a migration step in `loadLayout` before passing the JSON to the workspace.

## Use dirty state for important editors

```ts
const panel = usePanel();

// Mark dirty when the user edits
panel.setDirty(true);

// Clear when saved
panel.setDirty(false);
```

Outside the panel, `workspace.setPanelDirty(id, dirty)` does the same.

## Don't put the `usePanel()` handle in dependency arrays

The handle carries live state (`isActive`, `isMinimized`, `isFloating`, `containerType`), so it changes identity; its actions (`setTitle`, `setDirty`, `close`, …) never do. Depend on the action and on the values you write:

```tsx
const { setTitle } = usePanel();
useEffect(() => { setTitle(doc.title); }, [setTitle, doc.title]);   // not [panel, doc.title]
```

The built-in close guard will automatically prompt the user before closing a dirty panel.

## Keep panel components pure of layout concerns

Panel components should focus on content, not layout. Use the imperative API (`workspace.*`) or the `useWorkspace()` hook for layout operations triggered by user interaction inside a panel.

```tsx
function MyPanel({ panelId }: { panelId: string }) {
  const workspace = useWorkspace();

  return (
    <button onClick={() => workspace.floatPanel(panelId)}>
      Pop out
    </button>
  );
}
```
