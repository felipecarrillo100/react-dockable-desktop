# Panel Lifecycle & Forms

This guide covers the `useFormContainer()` hook — the primary API for panels that need to track unsaved state, guard against accidental closes, and respond to their own lifecycle events.

## Accessing the container

Any component rendered inside a dockable panel (docked, floating, modal, or side drawer) can call `useFormContainer()` to get a handle to its own container:

```ts
import { useFormContainer } from 'react-dockable-desktop';

function MyPanel() {
  const container = useFormContainer();
  // ...
}
```

The returned `FormContainerContract` object is stable — the same reference for the lifetime of the panel instance. It is safe to destructure inside hooks with an empty dependency array.

## Marking unsaved changes (dirty state)

Call `container.setDirty(true)` whenever the panel has unsaved changes. When the user tries to close a dirty panel, a **ConfirmationForm** modal fires automatically. The panel closes only if the user confirms.

```tsx
function MyPanel() {
  const container = useFormContainer();
  const [value, setValue] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    container.setDirty(true);   // panel is now dirty
  };

  const handleSave = () => {
    save(value);
    container.setDirty(false);  // all changes saved — no longer dirty
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
container.setDirty(true, {
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
| `alert` | `string` | Optional banner shown above the message. |
| `alertType` | `'info' \| 'warning' \| 'success' \| 'danger'` | Color scheme for the alert banner. Default: `'info'`. |

All fields also accept localizable message descriptors (`{ id, defaultMessage, values }`) when using `formatMessage`.

## Blocking close programmatically

For async validation or complex multi-step guards, use `onCloseRequested`:

```ts
useEffect(() => {
  const unsubscribe = container.onCloseRequested(async () => {
    const ok = await validateBeforeClose();  // your async check
    return ok;  // return false to block, true to allow
  });
  return unsubscribe;
}, [container]);
```

The handler is called before the dirty-state dialog. If it returns (or resolves to) `false`, the close is blocked and **no dialog is shown**. Return `true` to proceed (the dirty-state dialog fires next if the panel is dirty).

## Force-closing

Bypass all guards with `{ force: true }`:

```ts
container.requestClose({ force: true });
```

This skips both the `onCloseRequested` handler and the dirty-state dialog. Use it for explicit "Discard and close" actions where the user has already confirmed intent in your own UI.

## Dynamic panel title

Update the tab or window title at runtime:

```ts
container.setTitle('My Panel — Unsaved');

// Reset to the registered default:
container.setTitle('My Panel');
```

This also accepts a localizable descriptor:

```ts
container.setTitle({ id: 'panel.title.editing', defaultMessage: 'Editing...' });
```

## Reading the panel ID

Two equivalent ways to get the current panel instance ID from inside a component:

```ts
// Option 1 — useFormContainer (also gives you the full container API)
const container = useFormContainer();
const panelId = container.instanceId;

// Option 2 — usePanelId (zero-boilerplate when only the ID is needed)
import { usePanelId } from 'react-dockable-desktop';
const panelId = usePanelId();
```

Use `usePanelId()` when you only need the ID. Use `useFormContainer()` when you also need dirty state, close guards, or lifecycle hooks.

## Responding to lifecycle events

The container exposes lifecycle callbacks for every meaningful panel state change. Each returns an unsubscribe function — clean them up in a `useEffect` return.

### Close, minimize, restore, resize

```tsx
function MyPanel() {
  const container = useFormContainer();

  useEffect(() => {
    const unsubs = [
      container.onClose?.(() => {
        // Panel is about to be removed from the DOM
        pauseAnimation();
      }),
      container.onMinimize?.(() => {
        // Panel was sent to the taskbar
        pauseAudio();
      }),
      container.onRestore?.(() => {
        // Panel came back from the taskbar
        resumeAudio();
      }),
      container.onResize?.((width, height) => {
        // Container was resized (split resize, float resize)
        myChart.resize(width, height);
      }),
    ];
    return () => unsubs.filter(Boolean).forEach(u => u!());
  }, [container]);
}
```

::: tip Zero-unmount DOM preservation
Panel components are **never unmounted** when hidden, minimized, or covered by another tab. React lifecycle events (`useEffect` cleanup) do not reliably signal visibility changes. Use the `onMinimize` / `onRestore` callbacks above instead.
:::

### Active panel (focus)

`onActivate` fires when this panel becomes the globally active panel (the one highlighted in the taskbar and tab strip). `onDeactivate` fires when focus moves to another panel, **and also** when the panel is destroyed while active — so it always fires before `onClose` in that case.

```tsx
useEffect(() => {
  const unsubs = [
    container.onActivate?.(() => {
      // e.g. reload live data, resume polling
      startDataStream();
    }),
    container.onDeactivate?.(() => {
      // e.g. pause background work when not visible
      stopDataStream();
    }),
  ];
  return () => unsubs.filter(Boolean).forEach(u => u!());
}, [container]);
```

::: info What "active" means
The active panel is determined by `focusPanel()` / user tab clicks, not by visibility. A minimized panel cannot be active. Calling `openPanel()` alone does **not** make the panel globally active — call `focusPanel(id)` if you need that.
:::

### Container type changes (docked ↔ floating)

`onContainerTypeChange` fires whenever the panel moves between the docked grid and a detached floating window. It does **not** fire during minimize/restore — use `onMinimize` / `onRestore` for those.

The handler receives the new `ContainerType` value: `'dockable-panel'` or `'floating-window'`.

```tsx
useEffect(() => {
  const unsub = container.onContainerTypeChange?.((type) => {
    if (type === 'floating-window') {
      // Panel is now free-floating — map may need a resize
      mapInstance.resize();
    } else {
      // Panel docked back into the grid
      mapInstance.resize();
    }
  });
  return unsub;
}, [container]);
```

::: tip Reading the type at mount
`container.containerType` reflects the state **at mount time** and does not update. Combine it with `onContainerTypeChange` to track the current type throughout the panel's lifetime:

```ts
const [currentType, setCurrentType] = useState(container.containerType);

useEffect(() => {
  return container.onContainerTypeChange?.(setCurrentType);
}, [container]);
```
:::

### Querying current dimensions

`getDimensions()` is a synchronous getter that returns the panel's current rendered size, or `null` if the panel has not yet been laid out. It reads from the same source as `onResize` — no extra observer setup needed.

```ts
const dims = container.getDimensions?.();
if (dims) {
  console.log(`${dims.width} × ${dims.height}`);
}
```

Typical use: read the initial size inside `onActivate` instead of waiting for a resize event.

### Minimizing imperatively

`requestMinimize()` sends the panel to the taskbar without requiring access to `useWindowManagerActions`. It is a no-op if the container type does not support minimize (e.g. modals and side drawers).

```ts
<button onClick={() => container.requestMinimize?.()}>
  Minimize
</button>
```

## `ConfirmationForm` component

`ConfirmationForm` is a reusable yes/no dialog you can open from any panel. For the full API reference and usage examples, see [Modals & Side Panels — ConfirmationForm](./modals-and-drawers#confirmationform).

::: info Dirty-state dialog
When a panel is marked dirty, `react-dockable-desktop` opens a `ConfirmationForm` modal automatically. You do not need to wire this up manually — just call `container.setDirty(true)`.
:::

## `FormContainerContract` reference

```ts
type ContainerType =
  | 'dockable-panel'   // panel is docked in the workspace grid
  | 'floating-window'  // panel is in a detached floating window
  | 'left-panel'       // rendered inside the left side drawer
  | 'right-panel'      // rendered inside the right side drawer
  | 'modal'            // rendered inside a modal overlay
  | 'standalone';      // rendered outside the Window Manager (default / no context)

interface FormContainerContract {
  // ── Identity ──────────────────────────────────────────────────────────────
  instanceId:    string;
  containerType?: ContainerType;         // type at mount — use onContainerTypeChange for live updates

  // ── Imperative actions ────────────────────────────────────────────────────
  requestClose:    (options?: { force?: boolean }) => void;
  requestMinimize?: () => void;          // minimize to taskbar; no-op for modals/drawers
  setDirty:        (dirty: boolean, options?: DirtyStateOptions) => void;
  setTitle:        (title: string | MessageDescriptor) => void;
  setIcon?:        (icon: React.ReactNode) => void;

  // ── Synchronous queries ───────────────────────────────────────────────────
  getDimensions?: () => { width: number; height: number } | null;  // null before first layout

  // ── Subscriptions (each returns an unsubscribe function) ─────────────────
  onCloseRequested:      (handler: () => boolean | Promise<boolean>) => () => void;
  onClose?:              (handler: () => void) => () => void;
  onMinimize?:           (handler: () => void) => () => void;
  onRestore?:            (handler: () => void) => () => void;
  onResize?:             (handler: (w: number, h: number) => void) => () => void;
  onActivate?:           (handler: () => void) => () => void;
  onDeactivate?:         (handler: () => void) => () => void;
  onContainerTypeChange?: (handler: (type: ContainerType) => void) => () => void;
}
```

## See also

- [Modals & Side Panels →](./modals-and-drawers) — open a `ConfirmationForm` as a modal from outside a panel
- [Event Bus & Communication →](./event-bus) — communicate between panels without prop drilling
- [Advanced Topics →](./advanced) — zero-unmount DOM preservation details
