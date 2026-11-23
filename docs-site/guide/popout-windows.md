# Pop-out Windows

From 7.12.0 a panel can move into **its own browser window**, for a second monitor, and come back.
It is still the same panel: its content never remounts, so its state, scroll offsets and a canvas's
WebGL context go with it. A managed widget that left its panel
([Widgets Out of the Panel](./widgets-out-of-the-panel)) can go into a window too.

Typical uses: a map on the second screen while the forms stay on the first; a chart or a results
table pulled out to sit beside another application; a video wall of camera feeds.

## Turning it on

Two switches, both off by default:

```ts
import { createWorkspace } from 'react-dockable-desktop';

const workspace = createWorkspace({
  popOut: true,                                         // the workspace allows windows
  panels: {
    map:   { component: MapPanel,   defaultOptions: { canPopOut: true } },   // this type may go
    notes: { component: NotesPanel },                                         // this one may not
  },
});
```

- **`createWorkspace({ popOut: true })`** is set once, at creation. With `popOut: false` nothing of
  it runs: no menu item, no listeners, no style copying, and `popOutPanel()` returns
  `{ ok: false, reason: 'disabled' }` (with a one-time warning in development).
- **`defaultOptions.canPopOut: true`** opts a panel type in. It gates the menu item and
  `popOutPanel()`, for new calls only: see [Things to know](#things-to-know).
- In development, a type in `panels` that sets `canPopOut` on a workspace without `popOut` gets a
  console warning. So does a managed widget with `canPopOut`.

The user then gets **"Open in new window"** in the tab's menu and in the floating window's ⋮ menu of
those panels. The window opens over the panel, at its size (at least 320 × 240). A panel with no box on
screen (a tab that isn't selected, a minimised panel) can pop out too; its window opens at 640 × 480,
100 px from the main window's corner. The position isn't clamped, so a monitor left of or above the
main one works.

## From code: `popOutPanel()` and `returnPanel()`

```tsx
function PopOutButton({ id }: { id: string }) {
  const workspace = useWorkspace();
  return (
    <button onClick={() => {
      const result = workspace.popOutPanel(id);
      if (!result.ok && result.reason === 'blocked') showHint('Allow pop-ups for this site.');
    }}>
      Open in new window
    </button>
  );
}

workspace.returnPanel(id);   // → { ok: boolean }: back where it was; false when it wasn't in a window
```

`popOutPanel(id)` is **synchronous**, and must come **from a user's activation** (a click or a key
press): browsers only open a window then. The browser tells: a call made inside the click, or in an
event-bus handler of an event published in it, works; one made long after it (a slow promise, a
timer) or not triggered by the user gives `'no-gesture'`. In a browser that can't tell, the call is
tried, and the pop-up blocker may answer `'blocked'`. When your code decides later (an assistant that
suggests moving the map), show a button and pop out from its click. A click in any of the app's
windows counts, a pop-out's included: a button in a popped-out panel can pop out another panel, and
the window the user clicked opens the new one (7.12.1).

It returns a `PopOutResult`: `{ ok: true }`, or `{ ok: false, reason }`. The checks run in this order:

| `reason` | When |
|---|---|
| `disabled` | The workspace was created without `popOut: true` |
| `not-open` | No open panel has this id |
| `not-allowed` | The panel's type has no `canPopOut` (for a widget's panel, the widget's rules decide, below) |
| `no-gesture` | The call didn't come from a user's activation, so nothing was opened |
| `no-window` | No `<DockableDesktopProvider>` is mounted to show it |
| `blocked` | The browser's pop-up blocker refused the window |
| `no-window` | The window closed, or couldn't be used, before the panel moved in |
| `not-allowed` | A widget that couldn't leave its panel after all (its window closes again) |

A panel that is already out stops after the first `not-allowed` check: its window comes forward and the call returns
`{ ok: true }`. On a refusal the panel stays where it was, and **nothing is shown to the user**: your
code decides what to say. Only the built-in "Open in new window" item shows a toast, on `blocked`.

## The page the window opens: `popoutUrl`

Without it, the window opens blank, which works. For a window with your own favicon, give the
provider a page of your app, on the same origin:

```tsx
<DockableDesktopProvider workspace={workspace} popoutUrl="/popout.html">
```

The page needs nothing but a body. The library waits for it to load, adds its own base styles
(no margin, full height) and moves the panel in. Put it in your static folder (`public/` in Vite):

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My App</title>
  </head>
  <body></body>
</html>
```

The window's title follows the panel's, with or without it: your page's `<title>` shows only until
the panel's replaces it. A page that can't be read (another origin, or a
redirect off this one), or that doesn't load within 10 seconds, sends the panel back and closes the
window. That happens after `popOutPanel()` has returned `{ ok: true }` and `panel:popping-out` was
sent, so listen for `panel:returned` if you need to know.

With a base path (Vite's `base`), include it: `popoutUrl={`${import.meta.env.BASE_URL}popout.html`}`.

**When you need it:** some third-party embeds refuse to play in a blank window. A YouTube player,
for one, shows error 153: it checks the page that embeds it, and a blank window has no address of
its own. Set `popoutUrl` and they work.

## Coming back

A panel comes back when:

- the user closes the window, or clicks its **"Return to desktop"** button (the icon button at the
  end of the window's header bar, styled as a floating window's title-bar buttons; its label is the
  tooltip);
- your code calls `returnPanel(id)`;
- your code moves it: `minimizePanel`, `dockPanel`, `dockPanelToGroup` and `dockPanelToWorkspaceEdge`
  bring it back to its place first, then apply. `movePanelOrder(id, leafId, index)` is different: it
  takes the panel straight into that group, not through its old place;
- the main page unloads, or the provider unmounts (a route change).

`closePanel(id)` closes its window with it, and `loadLayout()` closes every window and shows the
loaded layout.

### Where it comes back to

A panel that was floating floats at its rect again. One that was docked goes, in this order:

1. into the group of its tab-mates, among their tabs, when one of them is still docked;
2. into its own group, when that group was kept and waits empty;
3. beside the panels it was next to, on the same side and at the same size; if those are gone too,
   beside the nearest part of its old layout that is still docked;
4. into the grid, when no panel is docked there;
5. otherwise floating (or into the first group, for a type that can't float).

Several panels out at once come back, in any order, to the layout they left.

**The promise:** the place is exact when the rest of the layout is unchanged, and the closest place
when it changed.

### Saving the layout

`saveLayout()` writes a panel that is out **at the place it would come back to**: docked in its
place, or floating at its rect. So a saved layout is the one from before it left.

Nothing reopens in a window after a reload: a window may only open from a user's click, and the
pop-up blocker would refuse it. The panel is in the page, and "Open in new window" takes it out
again in one click. (`PanelInfo.poppedOut` is runtime only.)

## Styles in the window

A pop-out looks like the page, with nothing to set up for plain CSS:

- every `<link rel="stylesheet">` and `<style>` of the page's `<head>` is copied, in order, and so are
  `document.adoptedStyleSheets` (as text). `<link>` and `<style>` tags added, removed or edited later
  follow. Adopted sheets are read again only when the page's `<head>` or `<html>`'s attributes change
  (they are not polled), so a sheet adopted or edited with no such change reaches the window at the
  next one;
- `<html>`'s and `<body>`'s attributes and classes (`dir`, `lang`, `.dark`, `data-bs-theme`, the
  skin, the colour scheme), their inline CSS variables (`--rdd-brand-*` included) and
  `color-scheme` are mirrored, and follow a change;
- the frame carries `.rdd-workspace` with the workspace's colour scheme and skin, so rules scoped to
  the workspace apply inside it;
- the window stays hidden until the copied stylesheets have loaded (3 seconds at most), so nothing
  shows unstyled.

### CSS-in-JS needs `popoutWrapper`

::: warning Looks right in development, unstyled in production
In production, Emotion (and so MUI), styled-components and similar libraries add their rules with
`insertRule`. Their `<style>` tags stay **empty**, so the head copy has nothing to copy. In
development they write text into the tags, and the window looks fine. Test a production build.

This covers more than the panel's content: what you hand the library is styled the same way. A
panel's or a widget's `icon` (shown in the window's header), the `icon` of a menu item, a toast's
content. An MUI `SvgIcon` without its rules measures 0 × 0, and can't be clicked.
:::

The fix is to give the library a style target per document. `<DockableDesktopProvider popoutWrapper>`
takes a component that is rendered around every panel's content, given `{ window, document,
children }` of the window the panel is in. It is in the tree for the panel's whole life while the
workspace has `popOut` (and never without it), so nothing remounts. Its `window` and `document`
switch to the pop-out's **before** the panel moves in, and back on return.

In a pop-out it is also rendered around the window's frame (the header with the icon and the
title), around a context menu shown there, and around the toasts shown there, with that window's
`{ window, document }`. In the main window those stay as they are. So the wrapper is rendered more
than once per window: keep **one cache per document**, as the `WeakMap` below does, not one per
wrapper. (A `<RddContextMenu>` of your own, placed above the provider, is outside the wrapper.)

**Emotion and MUI:** one cache per document.

```tsx
import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import type { PopoutWrapperProps } from 'react-dockable-desktop';

const caches = new WeakMap<Document, EmotionCache>();
function cacheFor(doc: Document): EmotionCache {
  let cache = caches.get(doc);
  if (!cache) {
    cache = createCache({ key: 'pop', container: doc.head });
    caches.set(doc, cache);
  }
  return cache;
}

// Defined outside any render: a stable component.
function EmotionPopoutWrapper({ document, children }: PopoutWrapperProps) {
  return <CacheProvider value={cacheFor(document)}>{children}</CacheProvider>;
}

<DockableDesktopProvider workspace={workspace} popoutUrl="/popout.html" popoutWrapper={EmotionPopoutWrapper}>
```

MUI's `ThemeProvider` above the provider still reaches the panel: it is the same React tree. Use a
key of your own (`'pop'`) so it doesn't clash with the page's cache.

**styled-components:** point `StyleSheetManager` at the document's head.

```tsx
import { StyleSheetManager } from 'styled-components';
import type { PopoutWrapperProps } from 'react-dockable-desktop';

function StyledPopoutWrapper({ document, children }: PopoutWrapperProps) {
  return <StyleSheetManager target={document.head}>{children}</StyleSheetManager>;
}
```

Pass a component defined outside a render, not an inline function: a new function each render would
be a new component, and React would remount every panel.

## Code in a pop-out window

A panel's content runs in the main page's JavaScript, but is shown in another window. Most code
works unchanged. What doesn't is code that reaches for the global `window` or `document`. Use
**`usePanelWindow()`**: `{ window, document }` of the window the panel is in now. It changes when the
panel pops out and when it returns, so effects that depend on it re-run.

```tsx
import { useEffect } from 'react';
import { usePanel, usePanelWindow } from 'react-dockable-desktop';

function Chart() {
  const { window: win } = usePanelWindow();
  const { isPoppedOut } = usePanel();

  useEffect(() => {
    const redraw = () => draw(win.devicePixelRatio);
    const dark = win.matchMedia('(prefers-color-scheme: dark)');
    win.addEventListener('resize', redraw);
    dark.addEventListener('change', redraw);
    let frame = win.requestAnimationFrame(function tick() { animate(); frame = win.requestAnimationFrame(tick); });
    return () => {
      win.removeEventListener('resize', redraw);
      dark.removeEventListener('change', redraw);
      win.cancelAnimationFrame(frame);
    };
  }, [win]);

  return <canvas title={isPoppedOut ? 'In its own window' : undefined} />;
}
```

- **Its own `requestAnimationFrame`.** A browser may slow down or pause the frames of a window that is
  hidden. The main page's frames stop when the main window is minimised, while the pop-out is on
  screen. Use the panel's window's.
- **Libraries that listen on the global `document`** don't hear the pointer or the keyboard in a
  pop-out either. Leaflet 1.9, for one, follows a map drag with listeners on `document`: in a pop-out
  its map zooms (wheel and buttons) but doesn't pan by dragging. LuciadRIA's keyboard navigation
  listens on the main `document` too, so its keys do nothing in a pop-out. Check your map, chart or
  grid library in a pop-out before you turn on `canPopOut` for its panel.
- **`devicePixelRatio` and `matchMedia`** are per window: the second monitor may have another scale.
- **Listeners** for keys, pointer moves and resizes go on the panel's window or document. A drag that
  listens on the global `document` never hears the pointer in the pop-out.
- **No `instanceof` for DOM nodes.** Each window has its own `HTMLElement`, so
  `node instanceof HTMLElement` is `false` for a node of the pop-out. Check `node.nodeType === 1`,
  or use the node's own window: `node instanceof node.ownerDocument.defaultView!.HTMLElement`.
- **Nodes created while out belong to the child window.** React creates them in the pop-out's
  document, and they come back with the panel.
- **Portals of your UI library** (menus, tooltips, dialogs) go to the global `document.body` by
  default, so they would open in the main window. Give them a container in the panel's document:
  with MUI, `container={usePanelWindow().document.body}` (or `slotProps.popper.container`).
  The library's own context menus and the toolbar flyout already open in the window they were
  opened from.

`usePanel().isPoppedOut` says whether the panel is in its own window. `isFloating` is also true then:
the panel is a floating panel whose window the workspace doesn't draw.

### What reloads

Moving an element into another document can't use `moveBefore()`, so:

- **An `<iframe>` reloads** on pop-out and on return, even with `preserveEmbeds`.
- **A `<video>` may reload**, depending on the browser.
- **A `<canvas>` keeps its drawing and its WebGL context.**

For media, keep the source out of the moved element and paint it: a `<video>` element that stays in
the main document (not shown) and a `<canvas>` in the panel that draws its frames, with the panel's
window's `requestAnimationFrame`. The canvas moves; the video never does.

```tsx
function CameraFeed({ src }: { src: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { window: win } = usePanelWindow();
  // The main document's <video>, never attached, so it never moves.
  const video = useMemo(
    () => Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true }),
    [src],
  );

  useEffect(() => {
    video.play().catch(() => {});
    return () => video.pause();
  }, [video]);

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    let frame = win.requestAnimationFrame(function paint() {
      ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
      frame = win.requestAnimationFrame(paint);
    });
    return () => win.cancelAnimationFrame(frame);
  }, [video, win]);

  return <canvas ref={canvas} width={640} height={360} style={{ width: '100%' }} />;
}
```

## Widgets in their own window

A managed widget opts in with `canPopOut`, and goes with `useFloatingWidgets().popOut(id)`:

```tsx
const cameras: ManagedWidget = {
  title: 'Cameras',
  content: <CamerasTable />,
  canDock: true, canFloat: true,
  canPopOut: true,                                  // may go into its own window
  titleMenu: w => [
    ...(w.location === 'panel'
      ? [{ label: 'Dock below', action: () => w.move({ to: 'docked', position: 'bottom', size: 0.3 }) }]
      : [{ label: 'Back into the map', action: () => w.move({ to: 'panel' }) }]),
    ...(w.canPopOut && !w.isPoppedOut
      ? [{ label: 'Open in new window', action: () => w.popOut() }]
      : []),
  ],
};
```

- **There is no built-in menu item for a widget.** Offer it in your `titleMenu`, as above:
  `WidgetMenuContext` has `canPopOut` (its `canPopOut`, on a workspace with `popOut`), `isPoppedOut`
  and `popOut()`. A menu item's action runs inside the click, so it counts as the user's gesture.
- **`popOut(id)`** returns a `PopOutResult`, with the same reasons as `popOutPanel`. From inside its
  panel the widget leaves the panel and goes into the window as one move (one `onWillMove` /
  `onMoved` pair); from docked, tabbed, floating or minimised, its panel moves. The window opens over
  the widget, at its size. A refusal changes nothing.
- **`'not-allowed'`** without `canPopOut`, outside a workspace panel, in an overlay inside a
  widget's own panel, or when its owner panel's type has `keepAlive: false` (the owner unmounts
  while hidden, and would take the widget with it). **`'disabled'`** outside a
  `<DockableDesktopProvider>`, as on a workspace without `popOut`.
- **While out, `location` stays `'floating'`**, and `useWidget().isPoppedOut` is true. There is no
  `'window'` location.
- **Back:** closing the window, or its **"Back into the panel"** button, puts the widget back into its
  panel where it was. `move()` to any place brings it back and moves it, as one move.
- **In the window,** the frame's title icon opens your `titleMenu`.
- **From its owner's window:** a widget can pop out while its panel is in a window of its own (7.12.1).
  Its window opens over it, on that window's screen; closing it puts the widget back into its panel there.
- **`placement()`** while out gives a placement that reopens it floating at its rect from before the
  window.
- **The owner closing** closes the window and the widget. The widget's panel id doesn't change.
- `workspace.popOutPanel(id)` and `returnPanel(id)` on the widget's panel id (`useWidget().panelId`)
  do the same, with the widget's rules. `usePanelWindow()` and the `popoutWrapper` follow the widget
  into its window.

## Focus and activation

- **`workspace.focusPanelWindow(id)`** brings forward the window that holds a panel and makes it the
  active panel: its pop-out, or the main window for a panel in the page. From a widget in its own
  window, `focusPanelWindow(useWidget()!.ownerPanelId!)` brings its owner forward. `ok` is false for an
  id that isn't open.
- **`focusPanel(id)`** on a panel in its own window brings that window forward too.
- **Best effort.** Browsers decide which window is in front. Firefox ignores `focus()` from a page by
  default (`dom.disable_window_flip`), and others may too when the user is busy elsewhere.
- **A click or focus inside a pop-out** makes its panel the active one, so the page's sidebar and
  toolbar show its contributions. The frame carries `data-rdd-focused` as a floating window does.
- **Escape is per window.** It closes the topmost menu or flyout of the window it was pressed in.
- **The taskbar** lists the panels in their own window, with a small marker ("in its own window");
  a click brings the window forward.

## Events

```ts
workspace.subscribe('panel:popping-out', ({ id }) => saveView(id));            // still in the page
workspace.subscribe('panel:popped-out',  ({ id, window }) => maps.get(id)?.resize());   // laid out in the window
workspace.subscribe('panel:returning',   ({ id }) => saveView(id));            // still in the window
workspace.subscribe('panel:returned',    ({ id }) => maps.get(id)?.resize());   // laid out in the page
```

- **`panel:popping-out`** is sent in the user's click, just before the panel leaves the page. The
  panel is still in its place, at its size.
- **`panel:popped-out`** follows once the panel is in the window and laid out (a frame has passed),
  so a `resize()` or a measure there sees the window's size. Its `window` is the one
  `usePanelWindow()` now gives the panel.
- **`panel:returning`** is sent just before the panel leaves the window, whatever brings it back. It
  is still in the window, at its size.
- **`panel:returned`** follows once the panel is back in its place in the page and laid out. A panel
  that comes back as a tab that isn't selected, or minimised, is 0 × 0 then: nothing shows it.

Use the first of each pair to save what a move might lose, such as a map's view, and the second to
restore it or resize.

Every `panel:popping-out` is followed by `panel:popped-out`, or by `panel:returned` when the panel
comes back before it got there: its page can't be read or doesn't load in time, or the window
closes, `returnPanel()`, the return button or the provider unmounting brings it back first. Then
there is no `panel:returning`. The exceptions: a panel closed meanwhile gets `panel:closed` only,
and one popped out or brought back again within that wait gets the events of the newer move only.
If the window's frame doesn't show (its styles still loading), the event is sent anyway after about
4 seconds.

None of them is sent for a refused pop-out. A panel closed while out sends `panel:closed`, not
`panel:returning` or `panel:returned`. All four are sent for a widget's panel too. Docking and
floating send none: the panel stays in the same document, and the move is a resize. Popping out
also publishes `layout:changed`, and so does coming back into the grid.

## Testing pop-outs with Playwright

The window is a new page for Playwright. Wait for it while you click:

```ts
const [popup] = await Promise.all([
  page.waitForEvent('popup'),
  page.getByRole('menuitem', { name: 'Open in new window' }).click(),
]);
await popup.waitForSelector('.rdd-popout-frame');
await popup.getByRole('button', { name: 'Return to desktop' }).click();
```

- Query the window's elements on `popup`, not on `page`.
- To check that an element is the same one after the move, mark it with a `data-` attribute. A
  JavaScript property set on it isn't visible from the other page's `evaluate`.
- `panel:popped-out` and `panel:returned` arrive a frame after the move. Wait for them (with
  `waitForFunction` or `expect.poll`), not for the click.
- Playwright's `evaluate` and its waits count as a user activation in that page for about 5
  seconds. A test of a click inside a pop-out can then pass even if only the main page was
  activated. To be sure the click in the pop-out is what counts, leave the main page untouched for
  about 5 seconds before that click.

### Which window a toast goes to

Playwright reports `document.hasFocus()` as true in every page, so while a pop-out is open a toast
shows in it, even one raised from the main page. Turning Chrome's focus emulation off
(`Emulation.setFocusEmulationEnabled`) doesn't fix that: headless, nothing changes; headed, the
result depends on the order of clicks and window raises.

Instead, make the page that should not have focus say so, before you raise the toast:

```ts
// The user is in the main page: the pop-out doesn't have focus.
await popup.evaluate(() => { document.hasFocus = () => false; });
await page.getByRole('button', { name: 'Save' }).click();   // raises a toast
await expect(page.locator('.rdd-toast')).toBeVisible();
await expect(popup.locator('.rdd-toast')).toHaveCount(0);
```

Without the stub, a toast raised while the pop-out is open shows in the pop-out.

### Which window is in front

The operating system decides which window is in front, and Playwright can't see it. Test that your
code asks for it: spy on `workspace.focusPanelWindow`, or count calls to the pop-out's
`window.focus`. Check real focus by hand, with two windows on screen.

## Things to know

- **Toasts** show in the window the user is in: a toast raised while a pop-out has focus (from a
  click in it, say) shows in that window, otherwise in the main one. It stays in the window it was
  shown in, and goes when that window closes. With a `ToastAdapter` (another notification library),
  that library decides where its toasts go.
- **`maximizePanel` and `floatPanel` are ignored** while a panel is in its own window.
- **`canPopOut` changing** (a type's option, or a widget's on a re-open) doesn't close a window that
  is open: it only gates the menu item and new calls. Call `returnPanel(id)` (or, for a widget,
  `move()`) to bring it back.
- **Workspace chrome stays in the main window:** tab drags, the grid's splitters, the taskbar. A
  panel in a window can't be dragged back onto the grid; "Return to desktop" brings it back.
- **No device detection.** The library doesn't decide which screens suit windows. On a phone or a
  tablet a "window" is usually a new tab. Decide in your app, with `popOut` at creation (or
  `canPopOut` per type):

  ```ts
  // Windows only with a mouse and a wide screen.
  const roomForWindows =
    window.matchMedia('(pointer: fine)').matches && window.matchMedia('(min-width: 1024px)').matches;

  export const workspace = createWorkspace({ popOut: roomForWindows, panels });
  ```

- **Messages:** `popOutWindow` ("Open in new window"), `returnToDesktop` ("Return to desktop", the
  header button's tooltip and accessible name), `backIntoPanel` ("Back into the panel", the same for a
  widget), `popOutBlocked` (the blocked toast) and `inOwnWindow` ("in its own window"). The taskbar
  joins `inOwnWindow` to the panel's title as its tooltip and accessible name, "Map: in its own
  window", so translate it as the end of that phrase. An app that types its table as `Record<MessageKey, string>` must add them; see
  [Migration](./migration#v7-11-x-→-v7-12-0).
- **CSS:** the frame is `.rdd-popout-frame` (with `data-rdd-popout="<panel id>"`), its parts
  `__header`, `__icon`, `__title`, `__return` and `__body`; a widget's title icon that opens its
  `titleMenu` is also `.rdd-popout-frame__icon--menu`. The title icon is a 14 × 14 box, as a
  floating window's: an `svg` or `img` in it is drawn at 14 × 14, as in a tab, and any other icon
  bigger than the box is scaled down to fit it. The return button is also
  `.rdd-custom-tab-btn`, so it takes the skin's title-bar button look; style it with
  `.rdd-popout-frame__return`. In the taskbar, a panel in its own window is
  `.rdd-taskbar-item--popout` (with `data-rdd-taskbar-popout="<panel id>"`), and its marker
  `.rdd-taskbar-item-popout-marker`.
- **A panel's window or a widget's:** the frame carries `data-rdd-popout-kind="panel"` or
  `"widget"`. Use it to style the two apart, or to find a widget's window in a test, rather than the
  panel id: a widget's panel id format is not part of the API.

  ```css
  .rdd-popout-frame[data-rdd-popout-kind="widget"] .rdd-popout-frame__return { color: var(--my-accent); }
  ```

- **These classes and attributes are styling hooks.** As [Stability](./stability) says of every
  `.rdd-*` class and `data-rdd-*` attribute, they may change in a minor release, with a CHANGELOG
  note.

## API summary

| | |
|---|---|
| `createWorkspace({ popOut })` | Allows windows. Default `false` |
| `defaultOptions.canPopOut` | A panel type may go into a window. Default `false` |
| `workspace.popOutPanel(id)` | → `PopOutResult`, inside a user's click |
| `workspace.returnPanel(id)` | → `{ ok: boolean }` |
| `workspace.focusPanelWindow(id)` | → `{ ok: boolean }`, best effort |
| `<DockableDesktopProvider popoutUrl>` | The app's same-origin page for the window |
| `<DockableDesktopProvider popoutWrapper>` | `ComponentType<PopoutWrapperProps>`: `{ window, document, children }` |
| `usePanelWindow()` | `PanelWindow`: `{ window, document }` of the panel's window |
| `usePanel().isPoppedOut` | In its own window now |
| `useFloatingWidgets().popOut(id)` | → `PopOutResult`, for a managed widget |
| `ManagedWidget.canPopOut` | A widget may go into a window. Default `false` |
| `useWidget().isPoppedOut` | The widget is in its own window |
| `WidgetMenuContext.canPopOut`, `.isPoppedOut`, `.popOut()` | For your `titleMenu` item |
| `panel:popping-out`, `panel:returning` | Events, just before the move: `{ id }` |
| `panel:popped-out`, `panel:returned` | Events, once laid out in the new place: `{ id, window }`, `{ id }` |
| `PanelInfo.poppedOut` | `true` while out; runtime only |
| `PopOutResult`, `PanelWindow`, `PopoutWrapperProps` | The types above |
| `.rdd-popout-frame`, `data-rdd-popout`, `data-rdd-popout-kind` | The window's frame, its panel id, `"panel"` or `"widget"`; its parts `__header`, `__icon` (`__icon--menu`), `__title`, `__return`, `__body` |
| `.rdd-taskbar-item--popout`, `data-rdd-taskbar-popout`, `.rdd-taskbar-item-popout-marker` | A panel in its own window, in the taskbar; its marker. Styling hooks: see [Things to know](#things-to-know) |
| Messages `popOutWindow`, `returnToDesktop`, `backIntoPanel`, `popOutBlocked`, `inOwnWindow` | See [Things to know](#things-to-know) |

See also: [Widgets Out of the Panel](./widgets-out-of-the-panel), [Workspace](./workspace-client),
[Custom Theming](./theming), [UI Frameworks](./ui-frameworks).
