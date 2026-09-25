# Panel Lifecycle & Forms

This guide covers `usePanel()` and its companion hooks — `useBeforeClose()`, `useSaveState()` and `usePanelEvents()` — the API for panels that need to track unsaved state, guard against accidental closes, and respond to their own lifecycle events.

## Accessing the panel

Any component rendered inside a dockable panel (docked, floating, modal, or side drawer) can call `usePanel()` to get a handle to its own container:

```ts
import { usePanel } from 'react-dockable-desktop';

function MyPanel() {
  const panel = usePanel();
  // ...
}
```

The returned `PanelHandle` carries the panel's `id`, its live `containerType`, the flags `isActive`, `isMinimized` and `isFloating`, and the actions `close`, `minimize`, `setDirty`, `setTitle` and `setIcon`. The component re-renders when one of those values changes.

**Identity.** Since 7.0.1, the five actions never change identity for the panel's lifetime. The handle object itself does change, whenever one of the four live values changes. So never list the handle in a dependency array; depend on the action you call, and on the values you write.

### Updating the title and dirty flag from an effect

```tsx
function DocumentPanel({ doc }: { doc: { title: string; dirty: boolean } }) {
  const { setTitle, setDirty } = usePanel();

  useEffect(() => {
    setTitle(doc.title);
    setDirty(doc.dirty);
  }, [setTitle, setDirty, doc.title, doc.dirty]);   // not [panel, …]

  return <Editor doc={doc} />;
}
```

Writing a title or dirty value the panel already has is a no-op, so an effect like this settles after one write.

## Changing the icon

A panel's tab, floating title bar and taskbar button show its registration's `defaultOptions.icon`. `setIcon` replaces it for this panel instance (since 7.1); `setIcon(null)` goes back to the registration's icon. In a modal or drawer it changes the header icon.

```tsx
function BuildPanel({ status }: { status: 'running' | 'failed' | 'done' }) {
  const { setIcon } = usePanel();
  useEffect(() => { setIcon(<StatusIcon status={status} />); }, [setIcon, status]);
  // ...
}
```

Outside the panel, `workspace.setPanelIcon(id, icon)` does the same. The icon lives only in memory: `saveLayout()` never writes it, and `loadLayout()` keeps it for a panel that is still open.

## Marking unsaved changes (dirty state)

Call `panel.setDirty(true)` whenever the panel has unsaved changes. When the user tries to close a dirty panel, an **`RddConfirm`** modal fires automatically. The panel closes only if the user confirms.

```tsx
function MyPanel() {
  const panel = usePanel();
  const [value, setValue] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    panel.setDirty(true);   // panel is now dirty
  };

  const handleSave = () => {
    save(value);
    panel.setDirty(false);  // all changes saved — no longer dirty
  };

  return (
    <div style={{ padding: '1rem' }}>
      <textarea value={value} onChange={handleChange} />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

### Customising the confirmation dialog

Pass a `DirtyStateOptions` object as the second argument to `setDirty` to override any part of the default confirmation UI:

```ts
panel.setDirty(true, {
  title:     'Unsaved changes',
  message:   'You have unsaved edits. Discard them?',
  alert:     'This action cannot be undone.',
  alertType: 'warning',  // 'info' | 'warning' | 'success' | 'danger'
});
```

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Header text of the confirmation dialog. |
| `message` | `string` | Body text explaining the situation. |
| `alert` | `string` | Optional banner shown above the message. The banner appears only when this is set. |
| `alertType` | `'info' \| 'warning' \| 'success' \| 'danger'` | Color scheme for the alert banner. Default: `'danger'` for this automatic unsaved-changes dialog (`RddConfirm` used on its own defaults to `'info'`). |

`title` and `message` also accept localizable message descriptors (`{ id, defaultMessage, values }`) when using `formatMessage`.

## Blocking close programmatically

For async validation or complex multi-step guards, use `useBeforeClose`:

```ts
import { useBeforeClose } from 'react-dockable-desktop';

useBeforeClose(async () => {
  const ok = await validateBeforeClose();  // your async check
  return ok;  // return false to block, true to allow
});
```

The guard is called before the dirty-state dialog. If it returns (or resolves to) `false`, the close is blocked and **no dialog is shown**. Return `true` to proceed: in a docked or floating panel, the dirty-state dialog then fires if the panel is dirty; in a modal or drawer, a guard that returns `true` closes it straight away, without the dirty-state dialog.

Call it at the top level of the component, like any hook. It always calls the latest function you pass — no dependency array — and cleans up on unmount. To register a guard only some of the time, pass `null` otherwise:

```ts
useBeforeClose(isDirty ? () => confirmDiscard() : null);
```

## Force-closing

Bypass all guards with `{ force: true }`:

```ts
panel.close({ force: true });
```

This skips both the `useBeforeClose` guard and the dirty-state dialog. Use it for explicit "Discard and close" actions where the user has already confirmed intent in your own UI.

## Reporting state to be saved

For a **docked or floating** panel opened with `openPanel(id, key, { props })`, static `props` are frozen at open time — fine for identity/config, but they can't capture state the panel accumulates afterward (scroll position, an in-progress edit, a view-mode toggle). Report it with `useSaveState()` instead, and `saveLayout()` pulls it fresh every time it's called:

```tsx
import { useRef } from 'react';
import { useSaveState } from 'react-dockable-desktop';

function MyDocumentPanel() {
  const scrollLineRef = useRef(0);

  useSaveState(() => ({ scrollLine: scrollLineRef.current }));

  // ...
}
```

Return `undefined` (or pass `null` instead of a function) to fall back to the panel's static `props` for that particular save. Only meaningful for docked/floating panels — left/right side panels and modals already have a complete, different answer to per-instance data (their own `props` argument on `useSidePanels().openLeft`/`openRight` and `useModals().open`, plus `update(id, …)`).

See [Workspace → Per-panel props](./workspace-client#per-panel-props) for the full picture, including what makes a value "serializable enough" to survive `saveLayout()`, and the `'layout:panels-excluded'` event that fires when it doesn't.

## Dynamic panel title

Update the tab or window title at runtime:

```ts
panel.setTitle('My Panel — Unsaved');

// Reset to the registered default:
panel.setTitle('My Panel');
```

This also accepts a localizable descriptor:

```ts
panel.setTitle({ id: 'panel.title.editing', defaultMessage: 'Editing...' });
```

## Reading the panel ID

```ts
const { id } = usePanel();
```

The panel component also receives it as the `panelId` prop.

## Responding to lifecycle events

`usePanelEvents()` subscribes to every meaningful panel state change. Pass only the callbacks you need; like `useBeforeClose`, it always calls the latest ones and cleans up on unmount.

### Close, minimize, restore, resize

```tsx
import { usePanelEvents } from 'react-dockable-desktop';

function MyPanel() {
  usePanelEvents({
    onClose: () => {
      // Panel is about to be removed from the DOM
      pauseAnimation();
    },
    onMinimize: () => {
      // Panel was sent to the taskbar
      pauseAudio();
    },
    onRestore: () => {
      // Panel came back from the taskbar
      resumeAudio();
    },
    onResize: (width, height) => {
      // Container was resized (split resize, float resize)
      myChart.resize(width, height);
    },
  });
}
```

::: tip Zero-unmount DOM preservation
Panel components are **never unmounted** when hidden, minimized, or covered by another tab. React lifecycle events (`useEffect` cleanup) do not reliably signal visibility changes. Use the `onMinimize` / `onRestore` callbacks above instead.
:::

### Active panel (focus)

`onActivate` fires when this panel becomes the globally active panel (the one highlighted in the taskbar and tab strip). `onDeactivate` fires when focus moves to another panel, **and also** when the panel is destroyed while active — so it always fires before `onClose` in that case.

```tsx
usePanelEvents({
  onActivate: () => {
    // e.g. reload live data, resume polling
    startDataStream();
  },
  onDeactivate: () => {
    // e.g. pause background work when not visible
    stopDataStream();
  },
});
```

To render from it instead, read `usePanel().isActive`.

::: info What "active" means
The active panel is determined by `openPanel()`, `focusPanel()` and the user's tab clicks, not by visibility. A minimized panel is never made active by the library itself; `focusPanel()` called on one does make it active. `openPanel()` makes the panel active unless you pass `focus: false`; `focusPanel(id)` makes an already-open one active.
:::

### Container type changes (docked ↔ floating)

`onContainerTypeChange` fires whenever the panel moves between the docked grid and a detached floating window. It does **not** fire during minimize/restore — use `onMinimize` / `onRestore` for those.

The handler receives the new `ContainerType` value: `'dockable-panel'` or `'floating-window'`.

```tsx
usePanelEvents({
  onContainerTypeChange: (type) => {
    if (type === 'floating-window') {
      // Panel is now free-floating — map may need a resize
      mapInstance.resize();
    } else {
      // Panel docked back into the grid
      mapInstance.resize();
    }
  },
});
```

::: tip Reading the current type
`usePanel().containerType` is the current type — the component re-renders when it changes, so you don't need to mirror it into state. (While minimized, it reads `'dockable-panel'`, also for a panel that was floating; `isMinimized` tells you it is minimized.)

```ts
const { containerType } = usePanel();
```
:::

### Reactive dimensions with `usePanelSize()`

`usePanelSize()` returns the panel's current `{ width, height }` (or `null` before layout) and re-renders your component whenever it changes — no manual `onResize` subscription mirrored into state:

```tsx
import { usePanelSize } from 'react-dockable-desktop';

function MyMapPanel() {
  const size = usePanelSize();

  useEffect(() => {
    if (size) map.invalidateSize();
  }, [size]);

  return <div ref={containerRef} />;
}
```

It's backed by the same `ResizeObserver`-driven mechanism as `onResize` — this correctly follows the panel's actual rendered box across docking, floating, and tab-activation changes, so there's no need for panel content to set up its own second `ResizeObserver` on its own container element to detect the same thing.

### Minimizing imperatively

`panel.minimize()` sends the panel to the taskbar without requiring access to `useWorkspace()`. It is a no-op in modals and side drawers.

```tsx
<button onClick={() => panel.minimize()}>
  Minimize
</button>
```

## `RddConfirm` component

`RddConfirm` is a reusable yes/no dialog you can open from any panel. For the full API reference and usage examples, see [Modals & Side Panels — RddConfirm](./modals-and-drawers#rddconfirm-—-built-in-yes-no-dialog).

::: info Dirty-state dialog
When a panel is marked dirty, `react-dockable-desktop` opens an `RddConfirm` modal automatically. You do not need to wire this up manually — just call `panel.setDirty(true)`.
:::

## Reference

```ts
type ContainerType =
  | 'dockable-panel'   // panel is docked in the workspace grid
  | 'floating-window'  // panel is in a detached floating window
  | 'left-panel'       // rendered inside the left side drawer
  | 'right-panel'      // rendered inside the right side drawer
  | 'modal'            // rendered inside a modal overlay
  | 'standalone';      // rendered outside the desktop (default / no context)

interface PanelHandle {
  // ── Identity and state ────────────────────────────────────────────────────
  id:            string;
  containerType: ContainerType;         // updates live
  isActive:      boolean;               // the globally active panel; always false in a modal or drawer
  isMinimized:   boolean;
  isFloating:    boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  close:    (options?: CloseOptions) => void;  // { force?: boolean }
  minimize: () => void;                         // no-op for modals/drawers
  setDirty: (dirty: boolean, options?: DirtyStateOptions) => void;
  setTitle: (title: string | MessageDescriptor) => void;
  setIcon:  (icon: React.ReactNode) => void;   // null restores the registration's icon; not saved
}

// Hooks — call at the top level of the panel component; each cleans up on unmount
function usePanel(): PanelHandle;
function useBeforeClose(guard: (() => boolean | Promise<boolean>) | null): void;
function useSaveState(getState: (() => unknown) | null): void;  // docked/floating only
function usePanelEvents(events: PanelEvents): void;
function usePanelSize(): { width: number; height: number } | null;  // null before first layout

interface PanelEvents {
  onActivate?:            () => void;
  onDeactivate?:          () => void;
  onMinimize?:            () => void;
  onRestore?:             () => void;
  onClose?:               () => void;
  onResize?:              (width: number, height: number) => void;
  onContainerTypeChange?: (type: ContainerType) => void;
}
```

## See also

- [Modals & Side Panels →](./modals-and-drawers) — open an `RddConfirm` as a modal from outside a panel
- [Event Bus & Communication →](./event-bus) — communicate between panels without prop drilling
- [Advanced Topics →](./advanced) — zero-unmount DOM preservation details
