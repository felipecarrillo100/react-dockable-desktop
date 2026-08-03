# Custom Theming

`react-dockable-desktop` ships with 7 built-in skins and a clean CSS custom-property architecture that lets you add your own without modifying any library code.

## How it works

The `skin` prop on `<WindowManager />` sets a `data-workspace-skin` attribute on the workspace root element. The library stylesheet uses attribute selectors to map skin names to CSS custom properties:

```css
[data-workspace-skin="nord"] {
  --bg-workspace: #2e3440;
  --accent-color: #88c0d0;
  /* ... */
}
```

All child components inherit those variables. Because `skin` is typed as `string` (not a restricted union), any name you define in CSS becomes valid — `<WindowManager skin="my-brand" />` works immediately.

## Built-in skins

```tsx
<WindowManager skin="vscode" />   {/* default */}
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
| `--tab-btn-active-bg` | `#1e2024` | Fill color of the active tab button. |
| `--tab-btn-active-width` | `100%` | Button width. Chip skins (macos, slate) set `36px` for a contained floating shape. |
| `--tab-btn-active-radius` | `0px` | Border-radius. Chip skins set `10px` or `8px` for rounded corners on all sides. |
| `--tab-btn-active-shadow` | `none` | `box-shadow` on the button. Obsidian/Tokyo add an inset ambient glow. |
| `--tab-btn-active-glow` | `none` | `filter` on the button. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--tab-accent-bar-width` | `3px` | Width of the edge accent bar. Set to `0px` to suppress it entirely. |

**Toolbar strip**

| Token | Default | Controls |
|-------|---------|---------|
| `--toolbar-btn-radio-active-bg` | `rgba(56,189,248,0.14)` | Fill color of the active radio/group button. |
| `--toolbar-btn-active-shadow` | `none` | `box-shadow` on active toolbar buttons. |
| `--toolbar-btn-active-glow` | `none` | `filter` on active toolbar buttons. |
| `--toolbar-accent-bar-width` | `3px` | Width of the toolbar edge accent bar. |

Both strips share `--tab-icon-active` for the accent color — set it once and both update.

### Customising the active state in your own skin

Only override the tokens you want to change; all others inherit their `:root` defaults.

**Minimal: narrower accent bar**

```css
[data-workspace-skin="my-skin"] {
  --tab-accent-bar-width: 1px;
  --toolbar-accent-bar-width: 1px;
}
```

**Floating pill (like `slate`)**

```css
[data-workspace-skin="my-skin"] {
  --tab-btn-active-bg:           rgba(255, 100, 80, 0.18);
  --tab-btn-active-width:        36px;
  --tab-btn-active-radius:       8px;
  --tab-accent-bar-width:        0px;
  --toolbar-btn-radio-active-bg: rgba(255, 100, 80, 0.18);
  --toolbar-accent-bar-width:    0px;
}
[data-workspace-skin="my-skin"] .sidebar-tab-btn.active {
  border-top: 1px solid transparent !important;
  border-bottom: 1px solid transparent !important;
  margin: 0 !important;
}
[data-workspace-skin="my-skin"] .toolbar-strip .toolbar-btn-radio.active,
[data-workspace-skin="my-skin"] .toolbar-strip .toolbar-btn-group.active {
  border-radius: 8px !important;
}
```

**Icon glow (dark skin)**

```css
[data-workspace-skin="my-skin"] {
  --tab-btn-active-glow:     drop-shadow(0 0 5px rgba(255, 100, 80, 0.6));
  --toolbar-btn-active-glow: drop-shadow(0 0 5px rgba(255, 100, 80, 0.6));
}
```

::: tip Keep Sidebar and Toolbar in sync
Both components share `--tab-icon-active` for the accent color — set it once and both update. Match `--tab-accent-bar-width` to `--toolbar-accent-bar-width` (and the fill/glow tokens) so Sidebar and Toolbar always read as a consistent pair.
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

Create a file (e.g. `my-skin.css`) and define a block using `[data-workspace-skin]`:

```css
/* my-skin.css */
[data-workspace-skin="my-brand"] {
  --bg-workspace:  #0d1117;
  --bg-panel:      #161b22;
  --bg-tab-bar:    #0d1117;
  --accent-color:  #f78166;
  --accent-glow:   rgba(247, 129, 102, 0.15);
  --border-panel:  #30363d;
  --text-tab-inactive: #8b949e;
  --text-tab-active:   #f0f6fc;
  --window-bg:     rgba(22, 27, 34, 1.0);
  --window-border: #30363d;
  --window-shadow: 0 16px 40px rgba(1, 4, 9, 0.8);
}
```

You only need to override the variables you want to change. Any variable you omit inherits from the library defaults (`:root`).

**Step 3 — Pass the name to `WindowManager`**

```tsx
<WindowManager skin="my-brand" />
```

That's it. No TypeScript changes, no library recompilation, no config registration.

## Dark and light variants

The library automatically sets `data-color-scheme="dark"` or `"light"` on the workspace root based on system preference (or your explicit `dir`/scheme prop). You can target it with a compound selector:

```css
/* Dark mode — usually your primary skin definition */
[data-workspace-skin="my-brand"] {
  --bg-workspace: #0d1117;
  --accent-color: #f78166;
  /* ... */
}

/* Light mode override */
[data-workspace-skin="my-brand"][data-color-scheme="light"] {
  --bg-workspace: #ffffff;
  --bg-panel:     #f6f8fa;
  --bg-tab-bar:   #f6f8fa;
  --accent-color: #cf222e;
  --text-tab-inactive: #57606a;
  --text-tab-active:   #1f2328;
  --window-bg:    rgba(246, 248, 250, 1.0);
  --window-border: #d0d7de;
  --window-shadow: 0 8px 24px rgba(140, 149, 159, 0.12);
  --panel-text:   #1f2328;
  --panel-title-color: #cf222e;
  --close-btn-color: #57606a;
  --close-btn-active-color: #1f2328;
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
    <DockableDesktopProvider client={workspace}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <WindowManager skin={skin} />
        <SidePanelRenderer />
      </div>
      <ModalStackRenderer />

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
   Usage: <WindowManager skin="my-skin" />
   ============================================================ */

[data-workspace-skin="my-skin"] {

  /* --- Workspace backgrounds --- */
  --bg-primary:    #090b11;      /* page/html background behind the workspace */
  --bg-workspace:  #0f111a;      /* workspace canvas */
  --bg-panel:      #141722;      /* docked panel background */
  --bg-tab-bar:    #0d0f16;      /* tab bar strip */

  /* --- Text --- */
  --text-primary:   #f1f5f9;
  --text-secondary: #94a3b8;

  /* --- Borders --- */
  --border-color: rgba(255, 255, 255, 0.08);  /* generic border */
  --border-panel: rgba(255, 255, 255, 0.08);  /* panel border */

  /* --- Accent --- */
  --accent-color: #38bdf8;                    /* primary interactive color */
  --accent-glow:  rgba(56, 189, 248, 0.15);  /* focus rings, halos */

  /* --- Tabs --- */
  --bg-tab-inactive:  #0c0d12;
  --bg-tab-hover:     #171a22;
  --text-tab-inactive: #858b99;
  --text-tab-active:   #ffffff;
  --text-tab-hover:    #e2e8f0;

  /* Tab active-state indicators */
  --tab-indicator-focused:    var(--accent-color);
  --tab-indicator-unfocused:  rgba(255, 255, 255, 0.3);
  --tab-bg-active-focused:    var(--bg-panel);
  --tab-bg-active-unfocused:  rgba(20, 23, 34, 0.55);
  --tab-text-active-focused:  var(--text-tab-active);
  --tab-text-active-unfocused: rgba(255, 255, 255, 0.65);

  /* --- Close / control buttons --- */
  --close-btn-color:        #858b99;
  --close-btn-active-color: #e2e8f0;
  --close-btn-hover-bg:     rgba(255, 255, 255, 0.12);
  --close-btn-hover-color:  #ffffff;

  /* Custom (anchor/minimize/maximize) buttons */
  --custom-btn-bg:         rgba(255, 255, 255, 0.03);
  --custom-btn-border:     rgba(255, 255, 255, 0.05);
  --custom-btn-hover-bg:   rgba(255, 255, 255, 0.12);
  --custom-btn-hover-color: #ffffff;

  /* --- Floating windows --- */
  --window-bg:              rgba(20, 22, 28, 0.85);   /* supports var(--window-opacity) */
  --window-border:          rgba(255, 255, 255, 0.08);
  --window-border-focused:  rgba(255, 255, 255, 0.28);
  --window-header-bg:       rgba(0, 0, 0, 0.25);
  --window-text:            #f8f9fa;
  --window-shadow:          0 16px 40px rgba(0, 0, 0, 0.4);
  --window-shadow-focused:  0 24px 50px rgba(0, 0, 0, 0.55);

  /* --- Resizer --- */
  --resizer-bg: rgba(255, 255, 255, 0.08);

  /* --- Taskbar --- */
  --taskbar-bg:            rgba(0, 0, 0, 0.75);
  --taskbar-border:        rgba(255, 255, 255, 0.1);
  --taskbar-nav-color:     rgba(255, 255, 255, 0.5);
  --taskbar-item-bg:       rgba(15, 23, 42, 0.6);
  --taskbar-item-hover-bg: rgba(15, 23, 42, 0.8);
  --taskbar-item-border:   rgba(255, 255, 255, 0.08);
  --taskbar-item-text:     var(--accent-color);

  /* --- Scrollbars --- */
  --scrollbar-thumb:       rgba(255, 255, 255, 0.1);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.2);
  --scrollbar-track:       rgba(255, 255, 255, 0.01);

  /* --- Panel cards (mockup / inner panel chrome) --- */
  --panel-card-bg:     rgba(0, 0, 0, 0.2);
  --panel-card-border: rgba(255, 255, 255, 0.1);
  --panel-text:        var(--text-primary);
  --panel-title-color: var(--accent-color);

  /* --- Header button spacing --- */
  --header-button-gap: 4px;
}

/* Optional: light mode variant */
[data-workspace-skin="my-skin"][data-color-scheme="light"] {
  --bg-primary:    #f8f9fa;
  --bg-workspace:  #f1f5f9;
  --bg-panel:      #ffffff;
  --bg-tab-bar:    #e9ecef;
  --text-primary:  #212529;
  --text-secondary: #6c757d;
  --border-color:  rgba(0, 0, 0, 0.08);
  --border-panel:  rgba(0, 0, 0, 0.08);
  --accent-color:  #0066cc;
  --accent-glow:   rgba(0, 102, 204, 0.15);
  --bg-tab-inactive:   #e9ecef;
  --text-tab-inactive: #495057;
  --text-tab-active:   #212529;
  --window-bg:          rgba(243, 244, 246, 0.9);
  --window-border:      rgba(0, 0, 0, 0.08);
  --window-border-focused: rgba(0, 0, 0, 0.28);
  --window-header-bg:   rgba(0, 0, 0, 0.04);
  --window-text:        #212529;
  --window-shadow:      0 10px 30px rgba(0, 0, 0, 0.06);
  --window-shadow-focused: 0 16px 36px rgba(0, 0, 0, 0.12);
  --panel-text:         #212529;
  --panel-title-color:  #0066cc;
  --close-btn-color:    #495057;
  --close-btn-active-color: #212529;
}
```

The `Sidebar` component uses a separate variable set. Override these if your skin includes a `Sidebar`:

```css
[data-workspace-skin="my-skin"][data-color-scheme="dark"] {
  --sidebar-bg:                  #1e2024;
  --sidebar-tabs-bg:             #141619;
  --sidebar-border:              rgba(255, 255, 255, 0.08);
  --sidebar-card-bg:             rgba(255, 255, 255, 0.03);
  --sidebar-card-border:         rgba(255, 255, 255, 0.08);
  --sidebar-card-active-bg:      rgba(56, 189, 248, 0.06);
  --sidebar-card-active-border:  rgba(56, 189, 248, 0.3);
  --sidebar-text-title:          #f8f9fa;
  --sidebar-text-muted:          #8a90a0;
  --sidebar-badge-bg:            #2d3139;
  --sidebar-badge-text:          #b0b5c0;
  --sidebar-btn-front-border:    #38bdf8;
  --sidebar-btn-front-text:      #38bdf8;
  --sidebar-btn-front-bg:        transparent;
  --sidebar-btn-front-hover-bg:  rgba(56, 189, 248, 0.1);
  --tab-icon-active:             #38bdf8;
  --tab-icon-inactive:           #9ea4b0;
  --tab-btn-active-bg:           #1e2024;  /* active tab fill */

  /* Active tab shape and effects — see Per-skin active state design language */
  --tab-btn-active-width:        100%;     /* set 36px for a floating chip */
  --tab-btn-active-radius:       0px;      /* set 8px–10px for rounded chip */
  --tab-btn-active-shadow:       none;     /* inset glow: inset 0 0 12px rgba(...) */
  --tab-btn-active-glow:         none;     /* icon glow: drop-shadow(0 0 5px rgba(...)) */
  --tab-accent-bar-width:        3px;      /* set 0px to use a shape-only indicator */
}
```

::: tip Minimal overrides
You don't need to define all variables. A skin that only sets `--accent-color`, `--bg-workspace`, and `--bg-panel` is perfectly valid — everything else inherits from the library default.
:::

## CSS variable reference

### Workspace & panels

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--bg-primary` | `#090b11` | Page background behind the workspace. |
| `--bg-workspace` | `#0f111a` | Workspace canvas background. |
| `--bg-panel` | `#141722` | Background of docked panel areas. |
| `--bg-tab-bar` | `#0d0f16` | Tab strip background. |
| `--border-color` | `rgba(255,255,255,0.08)` | Generic border color. |
| `--border-panel` | `rgba(255,255,255,0.08)` | Border between panels in the grid. |

### Text

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--text-primary` | `#f1f5f9` | Main body text. |
| `--text-secondary` | `#94a3b8` | Muted / secondary text. |

### Accent

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--accent-color` | `#38bdf8` | Primary interactive color — tab indicators, active borders. |
| `--accent-glow` | `rgba(56,189,248,0.15)` | Translucent version used for focus halos. |

### Tabs

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--bg-tab-inactive` | `#0c0d12` | Background of unfocused tabs. |
| `--bg-tab-hover` | `#171a22` | Tab background on hover. |
| `--text-tab-inactive` | `#858b99` | Label color of unfocused tabs. |
| `--text-tab-active` | `#ffffff` | Label color of the active tab. |
| `--text-tab-hover` | `#e2e8f0` | Label color of hovered tabs. |
| `--tab-indicator-focused` | `var(--accent-color)` | Color of the active-tab indicator bar when the leaf has focus. |
| `--tab-indicator-unfocused` | `rgba(255,255,255,0.3)` | Indicator bar color when the leaf is not focused. |
| `--tab-bg-active-focused` | `var(--bg-panel)` | Active tab background when the leaf has focus. |
| `--tab-bg-active-unfocused` | `rgba(20,23,34,0.55)` | Active tab background when the leaf is unfocused. |
| `--tab-text-active-focused` | `var(--text-tab-active)` | Active tab text color when focused. |
| `--tab-text-active-unfocused` | `rgba(255,255,255,0.65)` | Active tab text color when unfocused. |

### Control buttons

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--close-btn-color` | `#858b99` | Default color of close/minimize/maximize icons. |
| `--close-btn-active-color` | `#e2e8f0` | Icon color when the button is active. |
| `--close-btn-hover-bg` | `rgba(255,255,255,0.12)` | Button background on hover. |
| `--close-btn-hover-color` | `#ffffff` | Icon color on hover. |
| `--custom-btn-bg` | `rgba(255,255,255,0.03)` | Background of custom action buttons (anchor, float, etc.). |
| `--custom-btn-border` | `rgba(255,255,255,0.05)` | Border of custom action buttons. |
| `--custom-btn-hover-bg` | `rgba(255,255,255,0.12)` | Custom button background on hover. |
| `--custom-btn-hover-color` | `#ffffff` | Custom button icon color on hover. |
| `--header-button-gap` | `4px` | Spacing between titlebar action buttons. |

### Floating windows

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--window-bg` | `rgba(20,22,28,0.85)` | Floating window background. Supports `var(--window-opacity)` for glassmorphic effects. |
| `--window-border` | `rgba(255,255,255,0.08)` | Unfocused window border. |
| `--window-border-focused` | `rgba(255,255,255,0.28)` | Focused window border. |
| `--window-header-bg` | `rgba(0,0,0,0.25)` | Titlebar background. |
| `--window-text` | `#f8f9fa` | Titlebar text color. |
| `--window-shadow` | `0 16px 40px rgba(0,0,0,0.4)` | Unfocused window drop-shadow. |
| `--window-shadow-focused` | `0 24px 50px rgba(0,0,0,0.55)` | Focused window drop-shadow. |

### Resizer

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--resizer-bg` | `rgba(255,255,255,0.08)` | Split-pane drag handle color. |

### Taskbar

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--taskbar-bg` | `rgba(0,0,0,0.75)` | Taskbar strip background. |
| `--taskbar-border` | `rgba(255,255,255,0.1)` | Taskbar top border. |
| `--taskbar-nav-color` | `rgba(255,255,255,0.5)` | Navigation icon color in the taskbar. |
| `--taskbar-item-bg` | `rgba(15,23,42,0.6)` | Minimized-panel chip background. |
| `--taskbar-item-hover-bg` | `rgba(15,23,42,0.8)` | Chip background on hover. |
| `--taskbar-item-border` | `rgba(255,255,255,0.08)` | Chip border. |
| `--taskbar-item-text` | `var(--accent-color)` | Chip text / icon color. |

### Scrollbars

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--scrollbar-thumb` | `rgba(255,255,255,0.1)` | Scrollbar thumb color. |
| `--scrollbar-thumb-hover` | `rgba(255,255,255,0.2)` | Scrollbar thumb on hover. |
| `--scrollbar-track` | `rgba(255,255,255,0.01)` | Scrollbar track background. |

### Panel cards

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--panel-card-bg` | `rgba(0,0,0,0.2)` | Background of inner card elements inside panels. |
| `--panel-card-border` | `rgba(255,255,255,0.1)` | Border of inner card elements. |
| `--panel-text` | `var(--text-primary)` | Default text color inside panels. |
| `--panel-title-color` | `var(--accent-color)` | Title / heading accent inside panels. |

### Sidebar component

These are set by `[data-color-scheme]` globally, not by `[data-workspace-skin]`. Override them in your skin using the compound selector (e.g. `[data-workspace-skin="my-skin"][data-color-scheme="dark"]`).

| Variable | Dark default | Description |
|----------|-------------|-------------|
| `--sidebar-bg` | `#1e2024` | Sidebar drawer background. |
| `--sidebar-tabs-bg` | `#141619` | Sidebar icon strip background. |
| `--sidebar-border` | `rgba(255,255,255,0.08)` | Drawer edge border. |
| `--sidebar-card-bg` | `rgba(255,255,255,0.03)` | Content card background in the drawer. |
| `--sidebar-card-border` | `rgba(255,255,255,0.08)` | Content card border. |
| `--sidebar-card-active-bg` | `rgba(56,189,248,0.06)` | Selected/active card background. |
| `--sidebar-card-active-border` | `rgba(56,189,248,0.3)` | Selected/active card border. |
| `--sidebar-text-title` | `#f8f9fa` | Primary text inside the drawer. |
| `--sidebar-text-muted` | `#8a90a0` | Secondary / muted text. |
| `--sidebar-badge-bg` | `#2d3139` | Badge pill background. |
| `--sidebar-badge-text` | `#b0b5c0` | Badge pill text. |
| `--sidebar-btn-front-border` | `#38bdf8` | Primary action button border. |
| `--sidebar-btn-front-text` | `#38bdf8` | Primary action button text. |
| `--sidebar-btn-front-bg` | `transparent` | Primary action button background. |
| `--sidebar-btn-front-hover-bg` | `rgba(56,189,248,0.1)` | Primary action button hover background. |
| `--tab-icon-active` | `#38bdf8` | Active tab icon color in the strip. |
| `--tab-icon-inactive` | `#9ea4b0` | Inactive tab icon color. |
| `--tab-btn-active-bg` | `#1e2024` | Active tab button background (merges with drawer). |
| `--tab-btn-active-width` | `100%` | Width of the active tab button. Chip skins (macos, slate) set `36px` for a contained floating shape. |
| `--tab-btn-active-radius` | `0px` | Border-radius of the active tab button. |
| `--tab-btn-active-shadow` | `none` | `box-shadow` on the active tab. Obsidian/Tokyo add an inset ambient glow. |
| `--tab-btn-active-glow` | `none` | `filter` on the active tab. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--tab-accent-bar-width` | `3px` | Width of the sidebar edge accent bar. Set to `0px` to suppress it. |

### Toolbar strip active state

| Variable | Default | Description |
|----------|---------|-------------|
| `--toolbar-btn-radio-active-bg` | `rgba(56,189,248,0.14)` | Background tint of the active radio/group toolbar button. |
| `--toolbar-btn-active-shadow` | `none` | `box-shadow` on active toolbar buttons. Obsidian/Tokyo override with an inset glow. |
| `--toolbar-btn-active-glow` | `none` | `filter` on active toolbar buttons. Obsidian/Tokyo add `drop-shadow()` for icon glow. |
| `--toolbar-accent-bar-width` | `3px` | Width of the toolbar edge accent bar. Set to `0px` for chip-shaped skins. |
| `--toolbar-separator-color` | `rgba(255,255,255,0.09)` | Separator line color between toolbar item groups. |

## Adding structural CSS

CSS variables control colors and shadows. If your skin needs **structural changes** (different tab shape, rounded windows, glassmorphic blur), add class selectors scoped to your skin:

```css
[data-workspace-skin="my-skin"] .floating-window {
  border-radius: 10px;
  backdrop-filter: blur(16px);
}

[data-workspace-skin="my-skin"] .workspace-tab {
  border-radius: 4px;
  margin: 3px 2px;
}
```

Study the built-in skins in the library source (`src/index.css`) for examples — the `macos` skin's structural overrides are particularly comprehensive.

## See also

- [WorkspaceClient →](./workspace-client#windowmanager-props) — `skin` and `defaultPanelIcon` props on `WindowManager`
- [Advanced Topics →](./advanced) — multiple providers / workspaces on one page
