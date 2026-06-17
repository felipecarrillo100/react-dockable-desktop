# RTL Support

`react-dockable-desktop` ships with full Right-to-Left layout support for languages such as Arabic, Hebrew, and Persian. Every UI element — tab bars, split directions, floating window controls, sidebars, context menus, toolbar flyouts, and in-panel floating windows — mirrors automatically when RTL is active.

## Architecture: the app owns direction

The library does **not** auto-detect direction from the DOM. Direction is the consuming app's responsibility. This keeps the library predictable and avoids the footgun where a distant `dir` attribute change unexpectedly re-renders the workspace.

You must wire two things:

| What | Why |
|------|-----|
| `dir` prop on `DockableDesktopProvider` | Tells the workspace layout engine to flip splits, tabs, and window controls |
| `document.documentElement.dir` | Needed for portals (ContextMenu, toolbar flyout, Toast) that render into `document.body` — they inherit `direction: rtl` from `html[dir="rtl"]` via CSS |

## Complete wiring example

```tsx
import { useState, useEffect } from 'react';
import { DockableDesktopProvider } from 'react-dockable-desktop';

function App() {
  const [isRtl, setIsRtl] = useState(false);

  // Keep html[dir] in sync so portals rendered in document.body
  // pick up direction:rtl via CSS inheritance.
  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    return () => { document.documentElement.dir = 'ltr'; };
  }, [isRtl]);

  return (
    <DockableDesktopProvider
      dir={isRtl ? 'rtl' : 'ltr'}
      formatMessage={...}
    >
      <YourWorkspace onToggleRtl={() => setIsRtl(v => !v)} />
    </DockableDesktopProvider>
  );
}
```

::: tip State placement
`isRtl` state must live **outside** `DockableDesktopProvider` — or in a wrapper component that renders the provider — so you can pass `dir` as a prop. If state is inside the provider's children, the provider renders with the old `dir` value on the first render after toggling.
:::

## What flips automatically

When `dir="rtl"` is active, the library reverses the following without any extra work from you:

- **Tab bars** — tabs flow right to left; the active-tab accent indicator moves to the correct edge
- **Split handles** — left/right drag semantics invert
- **Floating window title bar** — close/minimize/maximize buttons move to the left; the panel icon moves to the right of the title text
- **In-panel floating windows** (`PanelFloatingWindow`) — same title-bar mirroring as above
- **Sidebars** — separator border, active-tab accent border, and drawer shadow all flip to the correct edge
- **Context menus** — sub-menu arrows and item text align to the right; sub-menus open to the left
- **Toolbar flyouts** — flyout panels open on the correct side of the toolbar strip; item text right-aligns
- **Taskbar** — minimised-window items flow right to left

## Locale vs direction

Direction is completely independent of locale. You can use an Arabic locale for translated strings while keeping LTR layout, or switch to RTL without changing the locale. Manage them as two separate pieces of state:

```tsx
const [locale, setLocale] = useState('en');
const [isRtl, setIsRtl] = useState(false);
```

## macOS skin

When `skin="macos"` is active, the traffic-light buttons (close · minimize · maximize) always stay on the **left** in both LTR and RTL — matching real macOS behaviour. The title text and icon shift to the right-aligned area of the title bar regardless of direction.

## Runtime switching with `setDirection()`

`workspace.setDirection('rtl')` updates the workspace's internal direction state, but **does not** update `document.documentElement.dir`. If you use this imperative API, you are responsible for keeping both in sync:

```ts
workspace.setDirection('rtl');
document.documentElement.dir = 'rtl';
```

In practice, driving direction from React state (as shown in the wiring example above) is simpler and less error-prone than the imperative API.

## `isElementRtl` utility

The library exports a helper for consumers that need to inspect direction in JavaScript:

```ts
import { isElementRtl } from 'react-dockable-desktop';

const rtl = isElementRtl(someElement); // walks up to the nearest [dir] ancestor
```

This is useful when you need to calculate pixel positions (e.g. custom tooltip placement) that depend on the current text direction.
