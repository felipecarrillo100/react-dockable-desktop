# Custom Theming

`react-dockable-desktop` ships with 7 built-in skins and a clean CSS custom-property architecture that lets you add your own without modifying any library code.

## How it works

The `skin` prop on `<RddDesktop />` sets a `data-rdd-skin` attribute on the workspace root element (and on `<html>`, so the sidebar and toolbar outside it pick it up too). The library stylesheet uses attribute selectors to map skin names to CSS custom properties:

```css
[data-rdd-skin="nord"] {
  --rdd-bg-workspace: #2e3440;
  --rdd-accent-color: #88c0d0;
  /* ... */
}
```

All child components inherit those variables. Because `skin` is typed as `string` (not a restricted union), any name you define in CSS becomes valid — `<RddDesktop skin="my-brand" />` works immediately.

## Built-in skins

```tsx
<RddDesktop skin="vscode" />   {/* default */}
```

| Skin | Character | Active state |
|------|-----------|--------------|
| `vscode` | VS Code dark — neutral dark blue-gray, cyan accent. The default. | Transparent fill, 2 px accent bar — identical to VS Code's own activity bar |
| `macos` | Glass Chip — accent-tinted fill, rounded corners. | 36 px floating chip, 10 px radius, white inner ring — macOS icon strip convention |
| `chrome` | Google Chrome — angled tab geometry, Google blue accent. | Sidebar: colour-matched half-pill bridge to drawer. Toolbar: 2 px accent bar |
| `slate` | Fluent Slate — deep navy/slate palette, sky-blue accent. | Floating 36 px accent-tinted pill, 8 px radius — Fluent Design language |
| `nord` | Arctic Frost — muted blue-gray from the Nord color palette. | Short horizontal line below the icon (no fill, no bar) |
| `obsidian` | Vercel Midnight — pure black/white, high-contrast minimal. | Near-black fill, inset glow shadow, icon drop-shadow filter |
| `tokyo` | Tokyo Night — purple accent on dark blue-gray, inspired by the popular editor theme. | Accent-tinted fill, neon glow, vivid icon drop-shadow filter |

All built-in skins include both dark and light variants — see [Dark and light variants](#dark-and-light-variants) below.

## Per-skin active state design language

Every built-in skin applies a distinct visual pattern to active **Sidebar tabs** and active **Toolbar buttons**. Both components share the same CSS design tokens, so they always read as a matched pair — if a skin uses a floating chip in the Sidebar, it uses the same chip shape in the Toolbar.

| Skin | Pattern | Visual idea |
|------|---------|-------------|
| `vscode` | Accent Bar | Transparent fill, 2 px bar at the inner edge — the same language VS Code's own activity bar uses |
| `macos` | Glass Chip | 36 px contained chip, 10 px radius all corners, white inner ring — macOS icon strip selection |
| `chrome` | Tab Bridge | Sidebar: colour-matched half-pill connecting icon to drawer. Toolbar: 2 px accent bar |
| `slate` | Fluent Pill | 36 px floating accent-tinted pill, 8 px radius — Microsoft Fluent Design selection pattern |
| `nord` | Line Indicator | Transparent fill, no bar — a short horizontal line drawn below the icon via `::after` |
| `obsidian` | Deep Glow | Near-black fill, inset ambient glow shadow, icon drop-shadow — subtle without color |
| `tokyo` | Neon Pulse | Accent-tinted fill, vivid neon inner glow, icon drop-shadow — high-energy Tokyo Night feel |

### Design tokens

These CSS custom properties drive the active state shape and effects. They are declared in `:root` with neutral defaults and overridden per skin.

**Sidebar strip**

| Token | Default | Controls |
|-------|---------|---------|
| `--rdd-tab-btn-active-bg` | `#1e2024` | Fill color of the active tab button. |
| `--rdd-tab-btn-active-width` | `100%` | Button width. Chip skins (macos, slate) set `36px` for a contained floating shape. |
| `--rdd-tab-btn-active-radius` | `0px` | Border-radius. Chip skins set `10px` or `8px` for rounded corners on all sides. |
| `--rdd-tab-btn-active-shadow` | `none` | `box-shadow` on the button. Obsidian/Tokyo add an inset ambient glow. |
| `--rdd-tab-btn-active-glow` | `none` | `filter` on the button. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--rdd-tab-accent-bar-width` | `3px` | Width of the edge accent bar. Set to `0px` to suppress it entirely. |

**Toolbar strip**

| Token | Default | Controls |
|-------|---------|---------|
| `--rdd-toolbar-btn-radio-active-bg` | `rgba(56,189,248,0.14)` | Fill color of the active radio/group button. |
| `--rdd-toolbar-btn-active-shadow` | `none` | `box-shadow` on active toolbar buttons. |
| `--rdd-toolbar-btn-active-glow` | `none` | `filter` on active toolbar buttons. |
| `--rdd-toolbar-accent-bar-width` | `3px` | Width of the toolbar edge accent bar. |

Both strips share `--rdd-tab-icon-active` for the accent color — set it once and both update.

### Customising the active state in your own skin

Only override the tokens you want to change; all others inherit their `:root` defaults.

**Minimal: narrower accent bar**

```css
[data-rdd-skin="my-skin"] {
  --rdd-tab-accent-bar-width: 1px;
  --rdd-toolbar-accent-bar-width: 1px;
}
```

**Floating pill (like `slate`)**

```css
[data-rdd-skin="my-skin"] {
  --rdd-tab-btn-active-bg:           rgba(255, 100, 80, 0.18);
  --rdd-tab-btn-active-width:        36px;
  --rdd-tab-btn-active-radius:       8px;
  --rdd-tab-accent-bar-width:        0px;
  --rdd-toolbar-btn-radio-active-bg: rgba(255, 100, 80, 0.18);
  --rdd-toolbar-accent-bar-width:    0px;
}
[data-rdd-skin="my-skin"] .rdd-sidebar-tab-btn.rdd-active {
  border-top: 1px solid transparent !important;
  border-bottom: 1px solid transparent !important;
  margin: 0 !important;
}
[data-rdd-skin="my-skin"] .rdd-toolbar-strip .rdd-toolbar-btn-radio.rdd-active,
[data-rdd-skin="my-skin"] .rdd-toolbar-strip .rdd-toolbar-btn-group.rdd-active {
  border-radius: 8px !important;
}
```

**Icon glow (dark skin)**

```css
[data-rdd-skin="my-skin"] {
  --rdd-tab-btn-active-glow:     drop-shadow(0 0 5px rgba(255, 100, 80, 0.6));
  --rdd-toolbar-btn-active-glow: drop-shadow(0 0 5px rgba(255, 100, 80, 0.6));
}
```

::: tip Keep Sidebar and Toolbar in sync
Both components share `--rdd-tab-icon-active` for the accent color — set it once and both update. Match `--rdd-tab-accent-bar-width` to `--rdd-toolbar-accent-bar-width` (and the fill/glow tokens) so Sidebar and Toolbar always read as a consistent pair.
:::

## Creating a custom skin

**Step 1 — Import order in `main.tsx`**

Your skin CSS must be imported **after** the library stylesheet so your variables win:

```ts
// main.tsx
import 'react-dockable-desktop/styles.css';  // library first
import './my-skin.css';                        // your skin second
```

**Step 2 — Define the CSS block**

Create a file (e.g. `my-skin.css`) and define a block using `[data-rdd-skin]`:

```css
/* my-skin.css */
[data-rdd-skin="my-brand"] {
  --rdd-bg-workspace:  #0d1117;
  --rdd-bg-panel:      #161b22;
  --rdd-bg-tab-bar:    #0d1117;
  --rdd-accent-color:  #f78166;
  --rdd-accent-glow:   rgba(247, 129, 102, 0.15);
  --rdd-border-panel:  #30363d;
  --rdd-text-tab-inactive: #8b949e;
  --rdd-text-tab-active:   #f0f6fc;
  --rdd-window-bg:     rgba(22, 27, 34, 1.0);
  --rdd-window-border: #30363d;
  --rdd-window-shadow: 0 16px 40px rgba(1, 4, 9, 0.8);
}
```

You only need to override the variables you want to change. Any variable you omit inherits from the library defaults (`:root`).

**Step 3 — Pass the name to `RddDesktop`**

```tsx
<RddDesktop skin="my-brand" />
```

That's it. No TypeScript changes, no library recompilation, no config registration.

## Dark and light variants

The library automatically sets `data-color-scheme="dark"` or `"light"` on the workspace root based on system preference (or your explicit `dir`/scheme prop). You can target it with a compound selector:

```css
/* Dark mode — usually your primary skin definition */
[data-rdd-skin="my-brand"] {
  --rdd-bg-workspace: #0d1117;
  --rdd-accent-color: #f78166;
  /* ... */
}

/* Light mode override */
[data-rdd-skin="my-brand"][data-color-scheme="light"] {
  --rdd-bg-workspace: #ffffff;
  --rdd-bg-panel:     #f6f8fa;
  --rdd-bg-tab-bar:   #f6f8fa;
  --rdd-accent-color: #cf222e;
  --rdd-text-tab-inactive: #57606a;
  --rdd-text-tab-active:   #1f2328;
  --rdd-window-bg:    rgba(246, 248, 250, 1.0);
  --rdd-window-border: #d0d7de;
  --rdd-window-shadow: 0 8px 24px rgba(140, 149, 159, 0.12);
  --rdd-panel-text:   #1f2328;
  --rdd-panel-title-color: #cf222e;
  --rdd-close-btn-color: #57606a;
  --rdd-close-btn-active-color: #1f2328;
}
```

You are not required to provide a light variant. If omitted, the dark definition applies in both modes.

### Reading the current color scheme in your own code

If your panel content needs to react in JavaScript (not just CSS) to the same scheme the workspace is using — swapping a map's tile layer or an embedded editor's theme, for example — use `useColorScheme()`:

```tsx
import { useColorScheme } from 'react-dockable-desktop';

function MyMapPanel() {
  const colorScheme = useColorScheme(); // 'dark' | 'light', updates live

  useEffect(() => {
    tileLayer.setUrl(colorScheme === 'light' ? LIGHT_TILES : DARK_TILES);
  }, [colorScheme]);

  return <div ref={containerRef} />;
}
```

It reads and reactively tracks the same `data-color-scheme` attribute described above — the value always matches what `[data-color-scheme="..."]` CSS selectors are currently matching.

## Runtime skin switching

Because `skin` is a regular React prop, switching skins at runtime is just state:

```tsx
import { useState } from 'react';

const SKINS = ['vscode', 'nord', 'tokyo', 'macos', 'my-brand'];

function App() {
  const [skin, setSkin] = useState('vscode');

  return (
    <DockableDesktopProvider workspace={workspace}>
      <div className="rdd-fill-viewport" style={{ position: 'relative' }}>
        <RddDesktop skin={skin} />
        <RddSidePanels />
      </div>
      <RddModals />

      {/* Skin picker anywhere outside the workspace */}
      <select value={skin} onChange={e => setSkin(e.target.value)}>
        {SKINS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </DockableDesktopProvider>
  );
}
```

The browser applies the new CSS variable set instantly — no remounting.

## Starter template

Copy this into your CSS file and fill in the color values. All variable names are included; delete any you want to inherit from the default:

```css
/* ============================================================
   My custom skin starter template
   Usage: <RddDesktop skin="my-skin" />
   ============================================================ */

[data-rdd-skin="my-skin"] {

  /* --- Workspace backgrounds --- */
  --rdd-bg-primary:    #090b11;      /* workspace background */
  --rdd-bg-workspace:  #0f111a;      /* workspace canvas */
  --rdd-bg-panel:      #141722;      /* docked panel background */
  --rdd-bg-tab-bar:    #0d0f16;      /* tab bar strip */

  /* --- Text --- */
  --rdd-text-primary:   #f1f5f9;
  --rdd-text-secondary: #94a3b8;

  /* --- Borders --- */
  --rdd-border-color: rgba(255, 255, 255, 0.08);  /* generic border */
  --rdd-border-panel: rgba(255, 255, 255, 0.08);  /* panel border */

  /* --- Accent --- */
  --rdd-accent-color: #38bdf8;                    /* primary interactive color */
  --rdd-accent-glow:  rgba(56, 189, 248, 0.15);  /* focus rings, halos */

  /* --- Tabs --- */
  --rdd-bg-tab-inactive:  #0c0d12;
  --rdd-bg-tab-hover:     #171a22;
  --rdd-text-tab-inactive: #858b99;
  --rdd-text-tab-active:   #ffffff;
  --rdd-text-tab-hover:    #e2e8f0;

  /* Tab active-state indicators */
  --rdd-tab-indicator-focused:    var(--rdd-accent-color);
  --rdd-tab-indicator-unfocused:  rgba(255, 255, 255, 0.3);
  --rdd-tab-bg-active-focused:    var(--rdd-bg-panel);
  --rdd-tab-bg-active-unfocused:  rgba(20, 23, 34, 0.55);
  --rdd-tab-text-active-focused:  var(--rdd-text-tab-active);
  --rdd-tab-text-active-unfocused: rgba(255, 255, 255, 0.65);

  /* --- Close / control buttons --- */
  --rdd-close-btn-color:        #858b99;
  --rdd-close-btn-active-color: #e2e8f0;
  --rdd-close-btn-hover-bg:     rgba(255, 255, 255, 0.12);
  --rdd-close-btn-hover-color:  #ffffff;

  /* Custom (anchor/minimize/maximize) buttons */
  --rdd-custom-btn-bg:         rgba(255, 255, 255, 0.03);
  --rdd-custom-btn-border:     rgba(255, 255, 255, 0.05);
  --rdd-custom-btn-hover-bg:   rgba(255, 255, 255, 0.12);
  --rdd-custom-btn-hover-color: #ffffff;

  /* --- Floating windows --- */
  --rdd-window-bg:              rgba(20, 22, 28, 0.85);   /* supports var(--rdd-window-opacity) */
  --rdd-window-border:          rgba(255, 255, 255, 0.08);
  --rdd-window-border-focused:  rgba(255, 255, 255, 0.28);
  --rdd-window-header-bg:       rgba(0, 0, 0, 0.25);
  --rdd-window-text:            #f8f9fa;
  --rdd-window-shadow:          0 16px 40px rgba(0, 0, 0, 0.4);
  --rdd-window-shadow-focused:  0 24px 50px rgba(0, 0, 0, 0.55);

  /* --- Resizer --- */
  --rdd-resizer-bg: rgba(255, 255, 255, 0.08);

  /* --- Taskbar --- */
  --rdd-taskbar-bg:            rgba(0, 0, 0, 0.75);
  --rdd-taskbar-border:        rgba(255, 255, 255, 0.1);
  --rdd-taskbar-nav-color:     rgba(255, 255, 255, 0.5);
  --rdd-taskbar-item-bg:       rgba(15, 23, 42, 0.6);
  --rdd-taskbar-item-hover-bg: rgba(15, 23, 42, 0.8);
  --rdd-taskbar-item-border:   rgba(255, 255, 255, 0.08);
  --rdd-taskbar-item-text:     var(--rdd-accent-color);

  /* --- Scrollbars --- */
  --rdd-scrollbar-thumb:       rgba(255, 255, 255, 0.1);
  --rdd-scrollbar-thumb-hover: rgba(255, 255, 255, 0.2);
  --rdd-scrollbar-track:       rgba(255, 255, 255, 0.01);

  /* --- Panel cards (mockup / inner panel chrome) --- */
  --rdd-panel-card-bg:     rgba(0, 0, 0, 0.2);
  --rdd-panel-card-border: rgba(255, 255, 255, 0.1);
  --rdd-panel-text:        var(--rdd-text-primary);
  --rdd-panel-title-color: var(--rdd-accent-color);

  /* --- Header button spacing --- */
  --rdd-header-button-gap: 4px;
}

/* Optional: light mode variant */
[data-rdd-skin="my-skin"][data-color-scheme="light"] {
  --rdd-bg-primary:    #f8f9fa;
  --rdd-bg-workspace:  #f1f5f9;
  --rdd-bg-panel:      #ffffff;
  --rdd-bg-tab-bar:    #e9ecef;
  --rdd-text-primary:  #212529;
  --rdd-text-secondary: #6c757d;
  --rdd-border-color:  rgba(0, 0, 0, 0.08);
  --rdd-border-panel:  rgba(0, 0, 0, 0.08);
  --rdd-accent-color:  #0066cc;
  --rdd-accent-glow:   rgba(0, 102, 204, 0.15);
  --rdd-bg-tab-inactive:   #e9ecef;
  --rdd-text-tab-inactive: #495057;
  --rdd-text-tab-active:   #212529;
  --rdd-window-bg:          rgba(243, 244, 246, 0.9);
  --rdd-window-border:      rgba(0, 0, 0, 0.08);
  --rdd-window-border-focused: rgba(0, 0, 0, 0.28);
  --rdd-window-header-bg:   rgba(0, 0, 0, 0.04);
  --rdd-window-text:        #212529;
  --rdd-window-shadow:      0 10px 30px rgba(0, 0, 0, 0.06);
  --rdd-window-shadow-focused: 0 16px 36px rgba(0, 0, 0, 0.12);
  --rdd-panel-text:         #212529;
  --rdd-panel-title-color:  #0066cc;
  --rdd-close-btn-color:    #495057;
  --rdd-close-btn-active-color: #212529;
}
```

The `RddSidebar` component uses a separate variable set. Override these if your skin includes an `RddSidebar`:

```css
[data-rdd-skin="my-skin"][data-color-scheme="dark"] {
  --rdd-sidebar-bg:                  #1e2024;
  --rdd-sidebar-tabs-bg:             #141619;
  --rdd-sidebar-border:              rgba(255, 255, 255, 0.08);
  --rdd-sidebar-card-bg:             rgba(255, 255, 255, 0.03);
  --rdd-sidebar-card-border:         rgba(255, 255, 255, 0.08);
  --rdd-sidebar-card-active-bg:      rgba(56, 189, 248, 0.06);
  --rdd-sidebar-card-active-border:  rgba(56, 189, 248, 0.3);
  --rdd-sidebar-text-title:          #f8f9fa;
  --rdd-sidebar-text-muted:          #8a90a0;
  --rdd-sidebar-badge-bg:            #2d3139;
  --rdd-sidebar-badge-text:          #b0b5c0;
  --rdd-sidebar-btn-front-border:    #38bdf8;
  --rdd-sidebar-btn-front-text:      #38bdf8;
  --rdd-sidebar-btn-front-bg:        transparent;
  --rdd-sidebar-btn-front-hover-bg:  rgba(56, 189, 248, 0.1);
  --rdd-tab-icon-active:             #38bdf8;
  --rdd-tab-icon-inactive:           #9ea4b0;
  --rdd-tab-btn-active-bg:           #1e2024;  /* active tab fill */

  /* Active tab shape and effects — see Per-skin active state design language */
  --rdd-tab-btn-active-width:        100%;     /* set 36px for a floating chip */
  --rdd-tab-btn-active-radius:       0px;      /* set 8px–10px for rounded chip */
  --rdd-tab-btn-active-shadow:       none;     /* inset glow: inset 0 0 12px rgba(...) */
  --rdd-tab-btn-active-glow:         none;     /* icon glow: drop-shadow(0 0 5px rgba(...)) */
  --rdd-tab-accent-bar-width:        3px;      /* set 0px to use a shape-only indicator */
}
```

::: tip Minimal overrides
You don't need to define all variables. A skin that only sets `--rdd-accent-color`, `--rdd-bg-workspace`, and `--rdd-bg-panel` is perfectly valid — everything else inherits from the library default.
:::

## CSS variable reference

### Workspace & panels

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-bg-primary` | `#090b11` | Page background behind the workspace. |
| `--rdd-bg-workspace` | `#0f111a` | Workspace canvas background. |
| `--rdd-bg-panel` | `#141722` | Background of docked panel areas. |
| `--rdd-bg-tab-bar` | `#0d0f16` | Tab strip background. |
| `--rdd-border-color` | `rgba(255,255,255,0.08)` | Generic border color. |
| `--rdd-border-panel` | `rgba(255,255,255,0.08)` | Border between panels in the grid. |

### Text

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-text-primary` | `#f1f5f9` | Main body text. |
| `--rdd-text-secondary` | `#94a3b8` | Muted / secondary text. |

### Accent

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-accent-color` | `#38bdf8` | Primary interactive color — tab indicators, active borders. |
| `--rdd-accent-glow` | `rgba(56,189,248,0.15)` | Translucent version used for focus halos. |
| `--rdd-focus-ring` | `2px solid var(--rdd-accent-color)` | Outline drawn on a library control reached from the keyboard (`:focus-visible`). |

### Fonts

| Variable | Default | Description |
|----------|---------|-------------|
| `--rdd-font-family` | `'Outfit', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` | Every piece of chrome: tabs, title bars, toolbar, sidebar, menus, flyouts, toasts, drawers, modals. |
| `--rdd-font-family-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Placeholders, the drag ghost and the other monospaced labels. |

The library doesn't load Outfit or Inter — load one yourself, or change the stack; a stack set on any ancestor of the workspace applies. To use your page's own font everywhere, set `--rdd-font-family: inherit` on `:root`, or `--rdd-font-family: initial` on any ancestor of the workspace. (`inherit` works only on `:root`: a custom property set to `inherit` copies its parent's value, so below `:root` it just copies the Outfit stack down. `initial` leaves the property without a value, and the chrome then inherits the page's font.) Panel content inherits the workspace font; your own form controls inside a panel keep the browser's default font, as they would anywhere else.

### Tabs

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-bg-tab-inactive` | `#0c0d12` | Background of unfocused tabs. |
| `--rdd-bg-tab-hover` | `#171a22` | Tab background on hover. |
| `--rdd-text-tab-inactive` | `#858b99` | Label color of unfocused tabs. |
| `--rdd-text-tab-active` | `#ffffff` | Label color of the active tab. |
| `--rdd-text-tab-hover` | `#e2e8f0` | Label color of hovered tabs. |
| `--rdd-tab-indicator-focused` | `var(--rdd-accent-color)` | Color of the active-tab indicator bar when the leaf has focus. |
| `--rdd-tab-indicator-unfocused` | `rgba(255,255,255,0.3)` | Indicator bar color when the leaf is not focused. |
| `--rdd-tab-bg-active-focused` | `var(--rdd-bg-panel)` | Active tab background when the leaf has focus. |
| `--rdd-tab-bg-active-unfocused` | `rgba(20,23,34,0.55)` | Active tab background when the leaf is unfocused. |
| `--rdd-tab-text-active-focused` | `var(--rdd-text-tab-active)` | Active tab text color when focused. |
| `--rdd-tab-text-active-unfocused` | `rgba(255,255,255,0.65)` | Active tab text color when unfocused. |

### Control buttons

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-close-btn-color` | `#858b99` | Default color of close/minimize/maximize icons. |
| `--rdd-close-btn-active-color` | `#e2e8f0` | Icon color when the button is active. |
| `--rdd-close-btn-hover-bg` | `rgba(255,255,255,0.12)` | Button background on hover. |
| `--rdd-close-btn-hover-color` | `#ffffff` | Icon color on hover. |
| `--rdd-custom-btn-bg` | `rgba(255,255,255,0.03)` | Background of custom action buttons (anchor, float, etc.). |
| `--rdd-custom-btn-border` | `rgba(255,255,255,0.05)` | Border of custom action buttons. |
| `--rdd-custom-btn-hover-bg` | `rgba(255,255,255,0.12)` | Custom button background on hover. |
| `--rdd-custom-btn-hover-color` | `#ffffff` | Custom button icon color on hover. |
| `--rdd-header-button-gap` | `4px` | Spacing between titlebar action buttons. |

### Floating windows

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-window-bg` | `rgba(20,22,28,0.85)` | Floating window background. Supports `var(--rdd-window-opacity)` for glassmorphic effects. |
| `--rdd-window-border` | `rgba(255,255,255,0.08)` | Unfocused window border. |
| `--rdd-window-border-focused` | `rgba(255,255,255,0.28)` | Focused window border. |
| `--rdd-window-header-bg` | `rgba(0,0,0,0.25)` | Titlebar background. |
| `--rdd-window-text` | `#f8f9fa` | Titlebar text color. |
| `--rdd-window-shadow` | `0 16px 40px rgba(0,0,0,0.4)` | Unfocused window drop-shadow. |
| `--rdd-window-shadow-focused` | `0 24px 50px rgba(0,0,0,0.55)` | Focused window drop-shadow. |

### Resizer

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-resizer-bg` | `rgba(255,255,255,0.08)` | Split-pane drag handle color. |

### Taskbar

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-taskbar-bg` | `rgba(0,0,0,0.75)` | Taskbar strip background. |
| `--rdd-taskbar-border` | `rgba(255,255,255,0.1)` | Taskbar top border. |
| `--rdd-taskbar-nav-color` | `rgba(255,255,255,0.5)` | Navigation icon color in the taskbar. |
| `--rdd-taskbar-item-bg` | `rgba(15,23,42,0.6)` | Minimized-panel chip background. |
| `--rdd-taskbar-item-hover-bg` | `rgba(15,23,42,0.8)` | Chip background on hover. |
| `--rdd-taskbar-item-border` | `rgba(255,255,255,0.08)` | Chip border. |
| `--rdd-taskbar-item-text` | `var(--rdd-accent-color)` | Chip text / icon color. |

### Scrollbars

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-scrollbar-thumb` | `rgba(255,255,255,0.1)` | Scrollbar thumb color. |
| `--rdd-scrollbar-thumb-hover` | `rgba(255,255,255,0.2)` | Scrollbar thumb on hover. |
| `--rdd-scrollbar-track` | `rgba(255,255,255,0.01)` | Scrollbar track background. |

### Panel cards

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-panel-card-bg` | `rgba(0,0,0,0.2)` | Background of inner card elements inside panels. |
| `--rdd-panel-card-border` | `rgba(255,255,255,0.1)` | Border of inner card elements. |
| `--rdd-panel-text` | `var(--rdd-text-primary)` | Default text color inside panels. |
| `--rdd-panel-title-color` | `var(--rdd-accent-color)` | Title / heading accent inside panels. |

### `RddSidebar` component

These are set by `[data-color-scheme]` globally, not by `[data-rdd-skin]`. Override them in your skin using the compound selector (e.g. `[data-rdd-skin="my-skin"][data-color-scheme="dark"]`).

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--rdd-sidebar-bg` | `#1e2024` | Sidebar drawer background. |
| `--rdd-sidebar-tabs-bg` | `#141619` | Sidebar icon strip background. |
| `--rdd-sidebar-border` | `rgba(255,255,255,0.08)` | Drawer edge border. |
| `--rdd-sidebar-card-bg` | `rgba(255,255,255,0.03)` | Content card background in the drawer. |
| `--rdd-sidebar-card-border` | `rgba(255,255,255,0.08)` | Content card border. |
| `--rdd-sidebar-card-active-bg` | `rgba(56,189,248,0.06)` | Selected/active card background. |
| `--rdd-sidebar-card-active-border` | `rgba(56,189,248,0.3)` | Selected/active card border. |
| `--rdd-sidebar-text-title` | `#f8f9fa` | Primary text inside the drawer. |
| `--rdd-sidebar-text-muted` | `#8a90a0` | Secondary / muted text. |
| `--rdd-sidebar-badge-bg` | `#2d3139` | Badge pill background. |
| `--rdd-sidebar-badge-text` | `#b0b5c0` | Badge pill text. |
| `--rdd-sidebar-btn-front-border` | `#38bdf8` | Primary action button border. |
| `--rdd-sidebar-btn-front-text` | `#38bdf8` | Primary action button text. |
| `--rdd-sidebar-btn-front-bg` | `transparent` | Primary action button background. |
| `--rdd-sidebar-btn-front-hover-bg` | `rgba(56,189,248,0.1)` | Primary action button hover background. |
| `--rdd-tab-icon-active` | `#38bdf8` | Active tab icon color in the strip. |
| `--rdd-tab-icon-inactive` | `#9ea4b0` | Inactive tab icon color. |
| `--rdd-tab-btn-active-bg` | `#1e2024` | Active tab button background (merges with drawer). |
| `--rdd-tab-btn-active-width` | `100%` | Width of the active tab button. Chip skins (macos, slate) set `36px` for a contained floating shape. |
| `--rdd-tab-btn-active-radius` | `0px` | Border-radius of the active tab button. |
| `--rdd-tab-btn-active-shadow` | `none` | `box-shadow` on the active tab. Obsidian/Tokyo add an inset ambient glow. |
| `--rdd-tab-btn-active-glow` | `none` | `filter` on the active tab. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--rdd-tab-accent-bar-width` | `3px` | Width of the sidebar edge accent bar. Set to `0px` to suppress it. |

### Toolbar strip active state

| Variable | Default | Description |
|----------|---------|-------------|
| `--rdd-toolbar-btn-radio-active-bg` | `rgba(56,189,248,0.14)` | Background tint of the active radio/group toolbar button. |
| `--rdd-toolbar-btn-active-shadow` | `none` | `box-shadow` on active toolbar buttons. Obsidian/Tokyo override with an inset glow. |
| `--rdd-toolbar-btn-active-glow` | `none` | `filter` on active toolbar buttons. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--rdd-toolbar-accent-bar-width` | `3px` | Width of the toolbar edge accent bar. Set to `0px` for chip-shaped skins. |
| `--rdd-toolbar-separator-color` | `rgba(255,255,255,0.09)` | Separator line color between toolbar item groups. |

## Adding structural CSS

CSS variables control colors and shadows. If your skin needs **structural changes** (different tab shape, rounded windows, glassmorphic blur), add class selectors scoped to your skin:

```css
[data-rdd-skin="my-skin"] .rdd-floating-window {
  border-radius: 10px;
  backdrop-filter: blur(16px);
}

[data-rdd-skin="my-skin"] .rdd-workspace-tab {
  border-radius: 4px;
  margin: 3px 2px;
}
```

Study the built-in skins in the library source (`src/index.css`) for examples — the `macos` skin's structural overrides are particularly comprehensive.

## See also

- [Workspace →](./workspace-client#rdddesktop-props) — `skin` and `defaultPanelIcon` props on `RddDesktop`
- [Advanced Topics →](./advanced) — multiple providers / workspaces on one page
