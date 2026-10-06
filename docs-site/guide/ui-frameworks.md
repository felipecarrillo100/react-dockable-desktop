# Using it with MUI, Bootstrap or Tailwind

react-dockable-desktop doesn't depend on any UI framework, and works beside any of them. Its
stylesheet styles only its own elements: every class it renders starts with `rdd-` and every CSS
variable with `--rdd-`, so nothing collides with a framework's own `.active`, `.btn` or utility
classes. It never styles `<html>`, `<body>` or your own markup.

This page covers the four places where a framework and the desktop meet: colours, dark mode,
stacking, and overriding styles.

## Colours and fonts

Point the brand variables at your framework's theme variables, and the desktop follows your theme,
including at runtime. There's a table for Bootstrap, MUI, Angular Material, Tailwind and shadcn/ui
in [Custom Theming → Use your UI framework's theme](/guide/theming#use-your-ui-framework-s-theme).

## Dark mode

The desktop reads one attribute on `<html>`: `data-color-scheme="light"` means light, and anything
else (or no attribute) means dark. It never sets it, and doesn't read the system preference. So
when your framework switches mode, set the attribute too.

**Bootstrap 5.3** keeps its mode in `data-bs-theme` on `<html>`. Set both together:

```ts
function setColorMode(mode: 'light' | 'dark') {
  document.documentElement.setAttribute('data-bs-theme', mode);
  document.documentElement.setAttribute('data-color-scheme', mode);
}
```

**MUI** (with `colorSchemes` in your theme) exposes the mode through `useColorScheme()`. Mirror it
once, near the root of your app:

```tsx
import { useColorScheme } from '@mui/material/styles';

function SyncDesktopColorScheme() {
  const { mode, systemMode } = useColorScheme();
  const resolved = mode === 'system' ? systemMode : mode;
  useEffect(() => {
    if (resolved) document.documentElement.setAttribute('data-color-scheme', resolved);
  }, [resolved]);
  return null;
}
```

**Tailwind CSS** dark mode follows the system preference by default. Follow it for the desktop too:

```ts
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const apply = () => document.documentElement.setAttribute('data-color-scheme', dark.matches ? 'dark' : 'light');
apply();
dark.addEventListener('change', apply);
```

If you toggle a `.dark` class instead (a `@custom-variant dark` setup), set the attribute wherever
you toggle the class.

## Stacking (z-index)

Floating windows start at `zIndexBase` (default `1000`) and go up by one each time a window comes
to the front. The library's overlays sit far above that:

| Layer | z-index (default base 1000) |
|-------|------------------------------|
| Floating windows | 1001 and up |
| Taskbar | 7500 |
| Side panels (drawers) | 9000 |
| Context menus | 9500 |
| Modals | 10000 |
| Toasts | 10100 |

All of them move together with `zIndexBase`: see
[`WorkspaceConfig.zIndexBase`](/guide/workspace-client#workspaceconfig).

The frameworks' own layers, for comparison: MUI's dialogs, menus and popovers are at `1300`,
snackbars `1400`, tooltips `1500`. Bootstrap's modals are at `1055`, popovers `1070`, tooltips
`1080` and toasts `1090`. Tailwind has no stacking layers of its own.

What that means in practice:

- **A framework dialog or popup opened from a panel appears above the floating windows.** That's
  usually what you want, and needs nothing.
- **A framework popup opened from inside one of the library's modals or side panels appears behind
  it.** That happens when the popup renders into `<body>` (MUI's `Menu`, `Select`, `Autocomplete`,
  `Popover` and `Tooltip` do by default, as do Bootstrap's tooltips and popovers). There are two
  fixes:
  - **Raise the framework's layer above the library's modals**, for example in MUI with
    `createTheme({ zIndex: { modal: 11000, snackbar: 11100, tooltip: 11200 } })`, or in Bootstrap 5.3
    with `--bs-popover-zindex` and `--bs-tooltip-zindex`.
  - **Render that popup inside the modal**: MUI's `disablePortal` (or `slotProps.popper.disablePortal`),
    or Bootstrap's `container` option pointing at an element inside it.

## Resets

Tailwind's Preflight and Bootstrap's Reboot reset elements such as buttons and headings. The
library sets what its own elements need, rather than relying on the browser's defaults; since 7.6.2
its icon buttons, for example, no longer depend on the page's button padding. If a reset still shows
through on one of the library's elements, that's a bug: please report it.

## Overriding the library's styles

In order of preference:

1. **CSS variables.** Most colours, sizes, radii, fonts and shadows are `--rdd-*` variables: see the
   [CSS variable reference](/guide/theming#css-variable-reference). Setting a variable needs no
   specificity at all.
2. **State attributes and per-type classes** (7.8.0): `data-rdd-selected`, `data-rdd-focused`,
   `data-rdd-dirty`, `data-rdd-maximized`, and `className` / `tabClassName` per panel type. See
   [Styling by state and by panel type](/guide/theming#styling-by-state-and-by-panel-type).
3. **Your own rules on the library's classes.** Load `react-dockable-desktop/styles.css` before your
   own CSS, so that a rule of yours wins when it is as specific as the library's. Some library
   declarations use `!important`. About a third of them read a variable, so set the variable; for
   the rest, your rule needs `!important` too.

A version of the stylesheet in a CSS cascade layer (`@layer`), which would let any of your rules
win without specificity, is planned for a later release.
