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

The container exposes four lifecycle hooks. Each returns an unsubscribe function — clean them up in a `useEffect` return.

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
Panel components are **never unmounted** when hidden, minimized, or covered by another tab. React lifecycle events (`useEffect` cleanup) do not reliably signal visibility changes. Use the `onMinimize` / `onRestore` hooks above instead.
:::

## `ConfirmationForm` component

`ConfirmationForm` is a standalone yes/no dialog component you can open in your own modals — for example, to ask the user to confirm a destructive action:

```tsx
import {
  ConfirmationForm,
  usePanelActions,
} from 'react-dockable-desktop';

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const { openModal, close } = usePanelActions();

  const handleClick = () => {
    const id = openModal(ConfirmationForm, {
      message: 'Delete this item permanently?',
      alert:   'This cannot be undone.',
      alertType: 'danger',
      useYesNoTitles: true,
      onOK:    () => { close(id); onConfirm(); },
      onCancel: () => close(id),
    });
  };

  return <button onClick={handleClick}>Delete</button>;
}
```

### ConfirmationForm props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string` | — | **Required.** Main dialog text. |
| `title` | `string` | `'Confirm'` | Dialog header. |
| `alert` | `string` | — | Optional alert banner above the message. |
| `alertType` | `'info' \| 'warning' \| 'success' \| 'danger'` | `'info'` | Alert banner colour. |
| `useYesNoTitles` | `boolean` | `false` | Show "Yes / No" buttons instead of "OK / Cancel". |
| `onOK` | `() => void` | — | Called when the user clicks OK / Yes. |
| `onCancel` | `() => void` | — | Called when the user clicks Cancel / No. |

::: info Dirty-state dialog
When a panel is marked dirty, `react-dockable-desktop` opens a `ConfirmationForm` modal automatically. You do not need to wire this up manually — just call `container.setDirty(true)`.
:::

## `FormContainerContract` reference

```ts
interface FormContainerContract {
  instanceId:       string;
  requestClose:     (options?: { force?: boolean }) => void;
  setDirty:         (dirty: boolean, options?: DirtyStateOptions) => void;
  setTitle:         (title: string | MessageDescriptor) => void;
  onCloseRequested: (handler: () => boolean | Promise<boolean>) => () => void;
  onClose?:         (handler: () => void) => () => void;
  onMinimize?:      (handler: () => void) => () => void;
  onRestore?:       (handler: () => void) => () => void;
  onResize?:        (handler: (w: number, h: number) => void) => () => void;
}
```

## See also

- [Modals & Side Panels →](./modals-and-drawers) — open a `ConfirmationForm` as a modal from outside a panel
- [Event Bus & Communication →](./event-bus) — communicate between panels without prop drilling
- [Advanced Topics →](./advanced) — zero-unmount DOM preservation details
