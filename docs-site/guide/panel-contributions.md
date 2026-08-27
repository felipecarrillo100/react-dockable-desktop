# Panel Contributions

Panel Contributions let any panel publish toolbar items and sidebar sections that are shown **only while that panel is the active one** (`state.activePanelId`). Two instances of the same panel type — two maps, two documents — stay fully independent: nothing here is shared or keyed globally, so switching between them always reflects each instance's own state.

::: tip Distinct from Panel Overlay
[Panel Overlay →](./panel-overlay) renders toolbars and floating windows *inside* a single panel's own DOM boundary — invisible to the rest of the app. Panel Contributions is the opposite direction: a panel reaches *outward*, publishing content that the **workspace-level** `<Toolbar>`/`<Sidebar>` renders on its behalf, only while it's active.
:::

## When to use it

- A map panel that shows different tool buttons (Pan / Draw / Measure) depending on which controller is currently installed — with two open maps keeping independent selections.
- A document/editor panel contributing a live "Table of Contents" sidebar section, extracted from its own content.
- Any panel-specific action (formatting buttons, view toggles, search) that belongs in the app's shared chrome only while that panel has focus, instead of cluttering it permanently.

---

## `usePanelContribution(contribution)`

Call inside a panel component, on every render, to publish what it wants shown. Republishes automatically when `contribution` changes; cleared automatically on unmount. Throws if used outside a `PanelContributionProvider` tree — mounted automatically by `DockableDesktopProvider`, so this only matters if you're composing `WindowManagerProvider` directly without it.

```tsx
import { usePanelContribution } from 'react-dockable-desktop';

function MapPanel() {
  const [controller, setController] = useState<'pan' | 'draw' | 'measure'>('pan');

  usePanelContribution({
    toolbarItems: (['pan', 'draw', 'measure'] as const).map(id => ({
      type: 'toggle',
      id,
      label: id,
      icon: icons[id],
      active: controller === id,          // self-reported — not ToolbarContext's shared state
      onToggle: () => setController(id),
    })),
    sidebarSections: [
      { id: 'layers', label: 'Layers', content: <LayerList /> },
    ],
  });

  // ...
}
```

**Why `active` is on the item, not in `ToolbarContext`:** `ToolbarToggleItem`/`ToolbarRadioItem`'s uncontrolled state lives in the shared `ToolbarContext`, keyed by a plain string id — two panel instances contributing the same id would collide. Passing `active` explicitly (a controlled toggle, see [Toolbar →](./toolbar)) makes each instance's selection its own.

Memoize the object you pass (`useMemo`/`useCallback` for its arrays and callbacks) to avoid republishing on every unrelated re-render.

### `PanelContribution`

| Field | Type | Description |
|-------|------|-------------|
| `toolbarItems?` | `ToolbarItem[]` | Same type `<Toolbar items={...}>` already accepts — no adapter needed. |
| `sidebarSections?` | `PanelSidebarSection[]` | `{ id, label, icon?, content }` — see `useMergedSidebarTabs` below for how these become `SidebarTab`s. |

Both fields are independent — contribute only toolbar items, only sidebar sections, both, or neither.

---

## `useActivePanelContribution()`

Reads `state.activePanelId` and returns whatever that panel last published via `usePanelContribution()`, or `null` if no panel is active or it contributed nothing. This is the raw, manual-control primitive — for the common case, prefer the two hooks below.

```tsx
const active = useActivePanelContribution();
// active?.toolbarItems, active?.sidebarSections
```

---

## `useMergedToolbarItems(staticItems)` / `useMergedSidebarTabs(staticTabs)`

Convenience wrappers around `useActivePanelContribution()` for the app shell — call once, get back a ready-to-render array, no manual splicing:

```tsx
import { useMergedToolbarItems, useMergedSidebarTabs, Toolbar, Sidebar } from 'react-dockable-desktop';

function AppShell() {
  const toolbarItems = useMergedToolbarItems(myStaticToolbarItems);
  const sidebarTabs = useMergedSidebarTabs(myStaticSidebarTabs);

  return (
    <>
      <Toolbar items={toolbarItems} />
      <Sidebar tabs={sidebarTabs}>{/* ... */}</Sidebar>
    </>
  );
}
```

`useMergedToolbarItems` appends the active panel's contributed items behind a separator; returns `staticItems` unchanged when there's nothing to add. `useMergedSidebarTabs` appends contributed sections as **dynamic tabs** — present only while their panel is active, never stealing focus from whichever tab the user already has open — converting each section via `sidebarSectionToTab` under the hood. `SidebarTab.icon` is optional but recommended unless the tab is `hidden`, so pass a second `fallbackIcon` argument if your sections may omit one.

Both are optional — `useActivePanelContribution()` stays fully usable for manual control (a different merge position, no separator, etc.).

---

## `sidebarSectionToTab(section, fallbackIcon?)`

The pure converter `useMergedSidebarTabs` uses internally, exported for manual use:

```ts
function sidebarSectionToTab(section: PanelSidebarSection, fallbackIcon?: React.ReactNode): SidebarTab
```

`PanelSidebarSection.content` is already a rendered `ReactNode` (not a callback), so the conversion is a straightforward `renderContent: () => section.content` plus an icon fallback. `SidebarTab`'s `eagerMount`/`preserveState` have no contribution-side equivalent and are left unset — a contribution only exists while its owning panel is mounted and active.

---

## Worked example: two independent maps

```tsx
function MapPanel({ panelId }: { panelId: string }) {
  const [controller, setController] = useState<'pan' | 'draw' | 'measure'>('pan');

  usePanelContribution({
    toolbarItems: (['pan', 'draw', 'measure'] as const).map(id => ({
      type: 'toggle', id, label: id, icon: icons[id],
      active: controller === id, onToggle: () => setController(id),
    })),
  });

  return <MapView onControllerChange={setController} />;
}
```

Open two `MapPanel` instances. Select "Draw" on the first, switch to the second (still "Pan" by default), select "Measure" there, then switch back to the first — it's still on "Draw," exactly as left. Nothing extra was needed for this: docked/floating panels stay mounted while inactive, so each instance's own `controller` state was never at risk — the contribution mechanism just reflects whichever instance is currently active.

::: tip Panels must be focused, not just opened
`openPanel()` sets `state.activePanelId` by default, so a freshly-opened panel's contributions show up immediately. If you ever open with `{ focus: false }` (to preload something in the background), call `focusPanel(id)` when you actually want its contributions to appear.
:::

---

## TypeScript exports

All exported from `'react-dockable-desktop'`:

| Export | Kind | Description |
|--------|------|-------------|
| `PanelContributionProvider` | Component | Provider enabling both hooks below; mounted automatically by `DockableDesktopProvider` |
| `usePanelContribution` | Hook | Publish this panel's toolbar items/sidebar sections while active |
| `useActivePanelContribution` | Hook | Read the active panel's published contribution manually |
| `useMergedToolbarItems` | Hook | `staticItems` + active contribution's toolbar items, ready for `<Toolbar items={...}>` |
| `useMergedSidebarTabs` | Hook | `staticTabs` + active contribution's sections as dynamic tabs, ready for `<Sidebar tabs={...}>` |
| `sidebarSectionToTab` | Function | Pure `PanelSidebarSection` → `SidebarTab` converter |
| `PanelContribution` | Interface | `{ toolbarItems?, sidebarSections? }` |
| `PanelSidebarSection` | Interface | `{ id, label, icon?, content }` |

---

## See also

- [Toolbar →](./toolbar) — workspace-level tool strip; `ToolbarToggleItem`'s controlled `active` field
- [Panel Overlay →](./panel-overlay) — panel-scoped toolbars and floating windows (the other direction)
- [Panel Lifecycle & Forms →](./forms-and-panels) — `usePanelId()`, `useFormContainer()`
