# Migration Guide

## v2.x → v3.0.0

v3.0.0 is **fully backward-compatible** — no existing API was removed or changed. All additions are opt-in.

### What's new

| Feature | What changed |
|---------|-------------|
| **StrictMode compatibility** | `focusPanel` is now idempotent; calling it twice no longer double-increments z-index. `WorkspaceClient` guards against StrictMode's double `_connect` cycle. |
| **CSS height warning** | `console.warn` fires in development when the workspace container height is near zero (missing `height: 100%` CSS). |
| **Missing-client error** | Upgraded from `console.warn` (dev-only) to `console.error` (always). Fires after 5 s in production, 1 s in development. |
| **State selectors** | `useWindowManagerState()` now accepts an optional selector. Components only re-render when the selected slice changes. |
| **Lifecycle callbacks** | `WorkspaceClient` exposes `onPanelOpen`, `onPanelClose`, `onPanelMinimize`, `onPanelRestore` convenience methods. |
| **`DockableDesktopProvider`** | New composite provider that wraps `WindowManagerProvider` + `PanelProvider` in the correct order. |
| **`usePanelId()` hook** | Any component rendered inside a panel can call `usePanelId()` to discover its own panel instance ID — no prop needed. |
| **Typed event bus** | `WorkspaceClient<TUserEvents>` is now generic. `publish` and `subscribe` are fully typed when you supply an event map. |

### Upgrade steps

1. Bump the package: `npm install react-dockable-desktop@3`
2. Optionally replace `<WindowManagerProvider> + <PanelProvider>` nesting with `<DockableDesktopProvider>`.
3. No further changes required.

### Breaking changes

None.

---

## v1.x → v2.0.0

## Overview

v2.0.0 introduces breaking API changes to clean up the public surface of `WindowActions` and `WorkspaceClient`. The changes are mechanical — find-and-replace in most cases.

## Breaking changes

### 1. `bringToFront` renamed to `focusPanel`

`bringToFront` was misleading for docked panels (it selects a tab, not a window z-index). The new unified method is `focusPanel`, which works correctly for both floating and docked panels.

```ts
// v1.x
actions.bringToFront('my-panel');
client.bringToFront('my-panel');

// v2.0.0
actions.focusPanel('my-panel');
client.focusPanel('my-panel');
```

### 2. `setActivePanel` removed from public API

`setActivePanel` was an internal tab-focus primitive that leaked into the public interface. It has been removed from `WindowActions`.

If you were using it to select a tab, use `focusPanel` instead:

```ts
// v1.x
actions.setActivePanel('my-panel');

// v2.0.0 — focusPanel covers this use case
actions.focusPanel('my-panel');
```

## New features in v2.0.0

- **`focusPanel(id)`** — unified activate method for floating and docked panels
- **`isOpen(id): boolean`** — query whether a panel is currently open
- **`getOpenPanelIds(): string[]`** — list all open panel IDs
- **Pending-call queue** — calls to `client.openPanel()` etc. before provider mounts are now queued and replayed automatically
- **"Forgot `client` prop" warning** — development warning when a `WorkspaceClient` has queued calls but no provider connects within 1 second
- **Unregistered panel warning** — `console.warn` when `openPanel` references an unregistered component key
- **CSS peer-dep detection** — development warning when `replace-react-contexify` stylesheet is not detected

## Not breaking

- All other `WindowActions` methods are unchanged
- Layout serialization format is unchanged — saved layouts from v1.x load correctly
- `PanelRegistry` global singleton still works for backward compatibility
- All other exports are unchanged
