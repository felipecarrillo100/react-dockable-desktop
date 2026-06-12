# Migration Guide: v1.x → v2.0.0

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
