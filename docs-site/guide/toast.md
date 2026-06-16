# Toast Notifications

`react-dockable-desktop` ships a built-in toast notification system. It is fully self-contained — no extra package, no extra CSS import, and no external dependencies. The imperative singleton API works from anywhere in your application, inside or outside React.

## Quick start

Place `<ToastContainer>` once at the root of your application, alongside `ModalStackRenderer`:

```tsx
import { ToastContainer } from 'react-dockable-desktop';

function App() {
  return (
    <DockableDesktopProvider client={workspace}>
      <div style={{ width: '100vw', height: '100vh' }}>
        <WindowManager />
      </div>
      <ModalStackRenderer />
      <ToastContainer />
    </DockableDesktopProvider>
  );
}
```

Then call the `toast` singleton from anywhere — inside a panel, an event handler, or module-level code:

```ts
import { toast } from 'react-dockable-desktop';

toast.success('File saved successfully.');
toast.error('Upload failed — check your connection.');
toast.warning('You are running low on disk space.');
toast.info('Background sync started.');
```

## Imperative API

The `toast` export is a callable function with named shorthand methods:

```ts
// Generic — type defaults to 'info'
const id = toast('Something happened.', { type: 'success' });

// Shorthands
const id = toast.info('Message');
const id = toast.success('Message');
const id = toast.warning('Message');
const id = toast.error('Message');
```

All methods return a `string` id that can be used to update or dismiss the toast later.

### `toast.dismiss(id?)`

```ts
toast.dismiss(id);     // dismiss a specific toast by id
toast.dismiss();       // dismiss all active toasts
```

### `toast.promise()`

Tracks a `Promise` through its lifecycle — shows a pending state immediately, then transitions to success or error when the promise settles:

```ts
toast.promise(
  saveFile(data),
  {
    pending: 'Saving…',
    success: result => `Saved ${result.filename}`,
    error:   err    => `Save failed: ${err.message}`,
  }
);
```

The pending toast stays open indefinitely until the promise settles. On resolve it transitions to success; on reject it transitions to error. Both use the container's `defaultDuration` after settling.

### Dedup by id

Calling `toast.*` with an explicit `id` that matches an active toast replaces it in-place instead of creating a second card:

```ts
toast.info('Saving…',  { id: 'save', duration: 0 });
// later:
toast.success('Saved!', { id: 'save' });  // updates the same card
```

## `ToastOptions`

All `toast.*` methods accept an optional `ToastOptions` object as the second argument:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `ToastType` | `'info'` | Visual type — overridden by the shorthand methods |
| `duration` | `number` | From container | Auto-dismiss delay in ms. `0` = sticky (never dismisses) |
| `id` | `string` | Auto-generated | Explicit id for dedup or targeted dismiss |
| `closable` | `boolean` | From container | Show the × close button |
| `icon` | `ReactNode` | Built-in SVG | Override the type icon |
| `content` | `ReactNode` | — | Replaces the string message with arbitrary JSX |
| `onClose` | `() => void` | — | Callback fired when the toast is dismissed |

## `<ToastContainer>` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `ToastPosition` | `'top-right'` | Where toasts appear. One of `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` |
| `width` | `number` | `320` | Width of each toast card in pixels |
| `maxVisible` | `number` | `3` | Maximum toasts shown simultaneously. Extras queue and appear when one exits |
| `defaultDuration` | `number` | `5000` | Auto-dismiss delay in ms. `0` = all toasts sticky by default |
| `defaultClosable` | `boolean` | `true` | Show the × close button on all toasts unless overridden per-toast |
| `pauseOnHover` | `boolean` | `true` | Pause the auto-dismiss timer while the cursor is over the toast |
| `animation` | `'slide' \| 'fade' \| 'none'` | `'slide'` | Entry/exit animation style |
| `newestOnTop` | `boolean` | `false` | When `true`, newest toast appears at the top of the stack |
| `progressBar` | `boolean` | `false` | Show a countdown progress bar at the bottom of each toast |
| `adapter` | `ToastAdapter` | — | Swap the renderer entirely — see [Custom adapter](#custom-adapter) |

## Positioning

Toasts render via `createPortal` directly into `document.body`. Use the CSS custom property `--dw-toast-offset-top` (or `--dw-toast-offset-bottom`) on `:root` to push the container clear of a fixed navbar or status bar:

```css
/* In your global CSS or via JS */
:root {
  --dw-toast-offset-top: 64px;    /* navbar height */
}
```

Or in React using `useEffect`:

```ts
useEffect(() => {
  document.documentElement.style.setProperty('--dw-toast-offset-top', '64px');
}, []);
```

::: warning Portal inheritance
The offset must be set on `document.documentElement` (`:root`), not on a parent `<div>`. CSS custom properties do not propagate through portal boundaries.
:::

## Theming

Toasts inherit the active skin automatically via CSS custom properties:

| Token | Default (dark) | Default (light) | Purpose |
|-------|---------------|-----------------|---------|
| `--toast-bg` | `#2a2d32` | `#ffffff` | Card background — slightly lighter than `--sidebar-bg` so the card lifts off panels behind it |
| `--toast-border` | `rgba(255,255,255,0.14)` | `rgba(0,0,0,0.14)` | Card border — stronger than `--sidebar-border` for dark-on-dark legibility |
| `--toast-info-color` | `#67e8f9` | `#0369a1` | Info accent (left border + icon) |
| `--toast-success-color` | `#4ade80` | `#15803d` | Success accent |
| `--toast-warning-color` | `#fbbf24` | `#b45309` | Warning accent |
| `--toast-error-color` | `#f87171` | `#b91c1c` | Error accent |
| `--dw-toast-offset-top` | `0px` | — | Gap from the top viewport edge |
| `--dw-toast-offset-bottom` | `0px` | — | Gap from the bottom viewport edge |

All tokens switch automatically with `[data-color-scheme="light"]` — no per-skin overrides needed.

Override any token on `:root` to adjust the appearance globally, or under a `[data-workspace-skin="myskin"]` selector for per-skin control.

## Progress bar

Enable the countdown progress bar opt-in on the container:

```tsx
<ToastContainer progressBar />
```

The bar shrinks from full width to zero over the toast's duration. It pauses with the timer when the cursor hovers (if `pauseOnHover` is enabled). Hidden on sticky toasts (`duration: 0`).

## Queue behaviour

When more than `maxVisible` toasts are active, extras are held in an internal queue. Each time a toast exits, the next queued toast is promoted automatically. Queued toasts are displayed in the order they were called.

```ts
// With maxVisible=2, the third toast waits until one of the first two exits:
toast.info('First');
toast.info('Second');
toast.info('Third');   // queued until First or Second exits
```

## Custom adapter

If your project already has its own notification system (e.g. Ant Design's `notification`, MUI's `Snackbar`, or Sonner), you can redirect all `toast.*` calls to it via a `ToastAdapter`:

```ts
import type { ToastAdapter, ToastPosition, ResolvedToastOptions } from 'react-dockable-desktop';
import { notification } from 'antd'; // example

const antdAdapter: ToastAdapter = {
  show(id, message, options) {
    notification[options.type ?? 'info']({ key: id, message, duration: options.duration / 1000 });
  },
  update(id, message, patch) {
    notification[patch.type ?? 'info']({ key: id, message, duration: (patch.duration ?? 5000) / 1000 });
  },
  dismiss(id) {
    id ? notification.destroy(id) : notification.destroy();
  },
  Container: null, // Ant Design mounts its own container
};

// In your app root:
<ToastContainer adapter={antdAdapter} />
```

When `adapter` is provided:
- All `toast.*` calls are forwarded to `adapter.show()` / `adapter.update()` / `adapter.dismiss()`
- The built-in queue, timer, and card rendering are bypassed
- If `adapter.Container` is `null`, nothing is rendered by `<ToastContainer>` (the adapter owns its own DOM)
- If `adapter.Container` is a component, it is portal-rendered by `<ToastContainer>` with a `position` prop

## TypeScript types

```ts
import type {
  ToastType,            // 'info' | 'success' | 'warning' | 'error'
  ToastPosition,        // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  ToastOptions,         // per-toast options passed to toast.*()
  ResolvedToastOptions, // fully-resolved options as seen by ToastAdapter
  ToastContainerProps,  // <ToastContainer> prop types
  ToastAdapter,         // custom renderer interface
  ToastPromiseMessages, // { pending, success, error } for toast.promise()
} from 'react-dockable-desktop';
```
