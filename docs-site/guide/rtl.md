# RTL Support

`react-dockable-desktop` ships with full Right-to-Left layout support for languages such as Arabic, Hebrew, and Persian. Every UI element — tab bars, split directions, floating window controls, sidebars, context menus, toolbar flyouts, and in-panel floating windows — mirrors automatically when RTL is active.

## Architecture: the app owns direction

The library does **not** auto-detect direction from the DOM. Direction is the consuming app's responsibility. This keeps the library predictable and avoids the footgun where a distant `dir` attribute change unexpectedly re-renders the workspace.

You must wire two things:

| What | Why |
|------|-----|
| `dir` prop on `DockableDesktopProvider` | Tells the workspace layout engine to flip splits, tabs, and window controls |
| `document.documentElement.dir` | Needed for **`<RddSidebar>`/`<RddSecondarySidebar>`** and toasts. `RddSidebar` wraps `RddDesktop` rather than living inside it, so it takes its direction from the page, like any element outside the workspace. Context menus and the toolbar flyout don't need it: they take the direction of where they were opened (since 7.1.1). |

The mirrored styles follow each element's **own** direction (CSS `:dir(rtl)`, since 7.1.1), the same answer the layout code gets. So the workspace's `dir` wins over the page's: an LTR workspace inside an RTL page stays LTR, and an RTL workspace (`dir="rtl"` on the provider, or `setDirection('rtl')`) inside an LTR page is mirrored — including the menus opened from it.

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

- **Tab bars** — tabs flow right to left; the active-tab accent indicator moves to the correct edge. A dragged tab lands on the side of the target tab the pointer is over, the tab-strip scroll buttons appear on the side with hidden tabs, and ←/→ move to the tab on that side of the screen
- **Split handles** — a divider follows the pointer: dragging it right moves it right, whatever the reading direction
- **Floating window title bar** — close/minimize/maximize buttons move to the left; the panel icon moves to the right of the title text
- **In-panel floating windows** (`RddFloatingWidget`) — same title-bar mirroring as above; corner anchors are logical, so `'top-left'` is always the start corner. Spanning an axis (`defaultStretch`) is defined per axis rather than per side, so it means the same thing in both directions, and the handles that release a spanning axis map to the correct physical edges automatically
- **Sidebars** — separator border, active-tab accent border, and drawer shadow all flip to the correct edge; a primary `RddSidebar` paired with an `RddSecondarySidebar` both flip correctly, swapping which visual edge each renders on. Dragging the drawer's resizer away from its tab strip always widens it
- **Context menus** — sub-menu arrows and item text align to the right; sub-menus open to the left (and flip to the other side when there is no room)
- **Toolbar flyouts** — flyout panels open on the correct side of the toolbar strip; item text right-aligns
- **Taskbar** — minimised-window items flow right to left

### Where you set `dir` doesn't matter

Each of these reads the direction the browser actually computes for the element involved (its `direction` style), so RTL works the same whether you set `dir="rtl"` on `<html>`, on `<body>`, on a wrapper element, or through the workspace's own `setDirection('rtl')`. Before 6.4.0 several of them read `document.documentElement.dir` only, and went the wrong way with any other setup.

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

## `isComputedRtl` and `isElementRtl` utilities

Two helpers for app code that needs the direction in JavaScript — for example to turn a pointer position into a logical side, or to place a custom tooltip:

```ts
import { isComputedRtl, isElementRtl } from 'react-dockable-desktop';

isComputedRtl(someElement); // what the browser lays out: any ancestor's dir, CSS `direction`, setDirection()
isElementRtl(someElement);  // the nearest [dir] attribute only (falls back to <html>/<body>)
```

Prefer `isComputedRtl`: it agrees with what is on screen, including direction set through CSS. (Both are exported since 6.4.0; `isElementRtl` was documented earlier but not actually exported.)
