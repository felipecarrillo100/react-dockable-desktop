# Widgets Out of the Panel

A floating widget opened with [`useFloatingWidgets()`](./panel-overlay#usefloatingwidgets-—-imperative-pattern)
lives inside its panel. From 7.11.0 it can also **leave** the panel: dock beside it, become a tab
in its group, or float as a window of its own. It is still the same widget, owned by the same
panel: its content never remounts, keeps its state, and keeps reading its owner's context.

Typical uses: a results table that started as a small widget over a map, docked below it to see
more rows; a chart pulled out of a dashboard panel to sit next to another one; a legend floated
out of the way.

::: tip Pre-release
7.11.0 is first published as `7.11.0-next.0` on npm's `next` tag:
`npm install react-dockable-desktop@next`.
:::

## In one example

```tsx
import { useFloatingWidgets, type ManagedWidget } from 'react-dockable-desktop';

function ResultsButton() {
  const widgets = useFloatingWidgets();   // inside an RddPanelOverlay

  const results: ManagedWidget = {
    title: 'Results',
    content: <ResultsTable />,
    anchor: 'bottom-left', width: 360, height: 220,
    canDock: true,                         // the user may dock it or make it a tab
    canFloat: true,                        // the user may float it
    titleMenu: w => w.location === 'panel'
      ? [
          { label: 'Dock below', action: () => w.move({ to: 'docked', position: 'bottom', size: 0.35 }) },
          { label: 'Open as a tab', action: () => w.move({ to: 'tabbed' }) },
        ]
      : [{ label: 'Back into the panel', action: () => w.move({ to: 'panel' }) }],
  };

  return <button onClick={() => widgets.open('results', results)}>Results</button>;
}
```

The widget opens in the panel as usual. Its title icon is now a button with your menu. Out of the
panel it is a workspace panel of its own, and the same items lead its tab's and title bar's menus.

## Moving it: `move()` and `location()`

```ts
widgets.move('results', { to: 'docked', position: 'bottom', size: 0.35 }); // beside its owner panel
widgets.move('results', { to: 'tabbed' });                                 // a tab in the owner's group
widgets.move('results', { to: 'floating', rect: { x: 80, y: 60, width: 420, height: 300 } });
widgets.move('results', { to: 'floating' });                               // where it is on screen now
widgets.move('results', { to: 'panel' });                                  // back where it last was in the panel

widgets.location('results'); // 'panel' | 'docked' | 'tabbed' | 'floating' | 'minimized' | null
```

| Target | Where |
|---|---|
| `{ to: 'docked', position, size? }` | A new group split off the **owner's** group on that side. `size` is its share, 0.1–0.9 |
| `{ to: 'tabbed' }` | A tab in the owner's group |
| `{ to: 'floating', rect? }` | A floating window at `rect` (workspace pixels), or where the widget is on screen, at its size |
| `{ to: 'panel' }` | Back into the panel, exactly where it was before it left |

The owner panel is always the reference. `move()` never throws; it returns a `MoveResult`, and a
refusal changes nothing:

| `reason` | When |
|---|---|
| `not-open` | No widget with that id is open in this overlay |
| `owner-not-docked` | `docked` and `tabbed` need the owner in the grid; a floating or minimised owner can still float the widget |
| `owner-not-kept-alive` | The owner's panel type has `keepAlive: false`, so it unmounts while hidden and would take the widget with it |
| `no-workspace` | The overlay isn't in a workspace panel (a modal, a drawer, or no `DockableDesktopProvider`) |

`canDock` and `canFloat` (both `false` by default) restrict **the user** only: their drags and
drops of the widget's panel, together with your workspace's `canDrop`. Your own `move()` calls
always work. Call `open()` again with new values to change them while the widget is open.

## What stays the same

- **Nothing remounts.** The content is rendered once, in the owner panel's tree, into an element
  of its own; leaving the panel moves that element. Its state, scroll positions, a canvas and its
  WebGL context all survive.
- **`usePanel()` is still the owner.** Content bound to its panel (a table bound to its map) keeps
  working wherever the widget is.
- **Its title and icon** become the panel's, and follow a re-open with new ones.

## Who closes what

| Event | Result |
|---|---|
| The user closes the widget's panel (the × on its tab or title bar, the menu's Close) | The widget **closes** |
| `closePanel(id)` on that panel, `close(id)`, `closeAll()` | The widget closes |
| The owner panel closes | Its widgets close, wherever they are |
| The owner's tab is hidden, or the owner is minimised | Widgets out of the panel stay out and on screen |
| `loadLayout()` | The widget goes back into its panel (a layout never holds a widget's panel) |

Going back into the panel is always explicit: your own item calling `move({ to: 'panel' })`.

## The widget's own side: `useWidget()`

Inside a widget's content, `useWidget()` tells it about the widget; it returns `null` elsewhere.

```tsx
import { useWidget } from 'react-dockable-desktop';

function ResultsTable() {
  const widget = useWidget();
  const grid = useRef<GridApi>(null);

  useEffect(() => {
    if (!widget) return;
    const offWill = widget.onWillMove(() => saveScrollAnchor(grid.current));   // before the element moves
    const offMoved = widget.onMoved(() => grid.current?.resize());             // after, at its new size
    return () => { offWill(); offMoved(); };
  }, [widget?.onWillMove, widget?.onMoved]);

  return <Grid ref={grid} compact={widget?.location === 'panel'} />;
}
```

| Field | |
|---|---|
| `id`, `ownerPanelId` | The widget's id, and its owner panel's (`null` when the overlay isn't in a workspace panel) |
| `location` | Where it is now. Reading it re-renders the component when it changes |
| `onWillMove(cb)` | Just before the element moves to another container: in or out of the panel, between docked, tabbed and floating, minimised or restored, by your code, the user, or a layout load |
| `onMoved(cb)` | Once it is in its new container and has its new size (when it has none, as when minimised, on the next frames) |

Neither callback runs for a close, a refused move or a move to where it already is. Both return
their unsubscribe function.

## Saving and restoring: `placement()`

```ts
const saved = widgets.placement('results');      // plain JSON: store it with your panel's state
// after a reload:
widgets.open('results', { ...results, placement: saved });
```

A `WidgetPlacement` is opaque, versioned JSON, the same in the Vue and Angular libraries. It
records where the widget is in the panel (corner, stretch, docked or free, size), or out of it
(docked, tabbed or floating) together with where it goes back to.

- A free position is kept as an offset from the panel corner it was nearest, so "16px in from the
  bottom right" stays true on a bigger or smaller panel, and mirrors in RTL.
- `placement` applies on the first open of an id only, as `anchor` does.
- A value this version can't read falls back to the config's `anchor`, size and `stretch`. A valid
  one is clamped into the panel as it is now.
- In a panel that has no size yet (a background tab), a free position waits until it is shown.
- A placement out of the panel moves the widget out after it opens; if that is refused (the owner
  isn't docked), it stays in the panel.

The workspace's own `saveLayout()` never includes a widget's panel: restore the widgets from your
panel, with their placements, once the layout is loaded.

## Iframes and media: `preserveEmbeds`

An element that is moved in the page is normally removed and re-inserted, and an `<iframe>` in it
reloads. Set `preserveEmbeds: true` on the widget (or on a panel type's `defaultOptions`) and the
library moves it with `moveBefore()`, which keeps the embedded document alive:

```ts
widgets.open('preview', { title: 'Preview', content: <iframe src={url} />, preserveEmbeds: true });
```

`moveBefore()` is in Chrome and Edge 133+ and Firefox 144+. In Safari the iframe reloads, as it does
without the option. A widget with it also moves its owner panel's element this way.

## Things to know

- **Its panel's id** is `'<ownerId>/<widgetId>'`. It appears in `getOpenPanelIds()`, the taskbar
  and the panel events (`panel:opened`, `panel:closed`), because the user handles it like a panel.
  Its component key is the reserved `'rdd:widget'`, and `PanelInfo.owner` says whose it is.
- **Moving it from one place out of the panel to another** replaces its panel: listeners see
  `panel:closed` then `panel:opened` for that id. The content is untouched.
- **The built-in Float item** isn't offered in such a panel's menu; your `titleMenu` items replace it.
- **CSS:** a managed widget's content now sits in `div.rdd-panel-float__content` inside
  `.rdd-panel-float__body`, so a selector on the body's direct child (`.rdd-panel-float__body > …`)
  no longer matches it. Out of the panel, its panel's body is `.rdd-hosted-widget`.

## API summary

| | |
|---|---|
| `useFloatingWidgets().move(id, to)` | `WidgetTarget` → `MoveResult` |
| `useFloatingWidgets().location(id)` | `WidgetLocation \| null` |
| `useFloatingWidgets().placement(id)` | `WidgetPlacement \| null` |
| `ManagedWidget.canDock`, `.canFloat` | The user's rules out of the panel. Default `false` |
| `ManagedWidget.titleMenu(w)` | `(w: WidgetMenuContext) => ContextMenuItem[]`; `w` is `{ id, location, canDock, canFloat, move, close }` |
| `ManagedWidget.placement` | Open at a saved `WidgetPlacement` |
| `ManagedWidget.preserveEmbeds` | Keep iframes alive across moves |
| `useWidget()` | `WidgetHandle \| null` |

See also: [Panel Overlay](./panel-overlay), [Workspace](./workspace-client) (`focusPanel(id, { restore })`,
`updatePanelProps`), [Layout System](./layout).
