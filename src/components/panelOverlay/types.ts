/**
 * @file types.ts
 * @description Public types of the Panel Overlay system: toolbar edges, widget stretch and
 * placement, and the config of an imperatively opened widget.
 */
import type React from 'react';
import type { FloatAnchor } from '../../types';
// Type-only, so this stays a one-way dependency: PanelProviderContext imports nothing from here.
import type { PanelTitle } from '../PanelProviderContext';
import type { ContextMenuItem } from '../ContextMenu';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Edge of a panel to which a `PanelToolbar` attaches. */
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Which of a docked widget's axes span the host panel instead of carrying a fixed size.
 *
 * A docked widget normally pins one end of each axis and carries an explicit size. A stretched
 * axis pins **both** ends and carries no size at all, so the widget tracks the panel as it
 * resizes — with no `ResizeObserver` and no JS, because CSS already does exactly this.
 *
 * - `'width'` — spans the panel's inline axis; height still fixed. A status or timeline strip.
 * - `'height'` — spans the block axis; width still fixed. A full-height side column.
 * - `'both'` — fills the panel, the inner-widget equivalent of maximizing a floating window.
 */
export type Stretch = 'width' | 'height' | 'both';

/**
 * Where a docked widget sits: which corner it is anchored to, plus which axes (if any) span the
 * panel. Reported as a unit because a single gesture can change both at once — dropping a
 * full-width bottom strip onto the left edge flips the anchor *and* the stretched axis together,
 * and reporting those separately would expose a state that is never actually valid.
 */
export interface PanelFloatPlacement {
  anchor: FloatAnchor;
  stretch: Stretch | null;
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Configuration for a widget spawned imperatively via `useFloatingWidgets().open()`.
 */
export interface ManagedWidget {
  /**
   * Text shown in the window's header bar. Accepts a plain string or an i18n message descriptor.
   *
   * A descriptor is re-resolved on every render, so the header follows a language change without
   * the window being closed and reopened — which a plain string cannot do here, because this
   * config is stored by the overlay rather than re-read from your own render.
   */
  title: PanelTitle;
  /** Optional icon shown to the left of the title in the header. */
  icon?: React.ReactNode;
  /** Window body content. */
  content: React.ReactNode;
  /** Corner of the panel to dock to on first render. @default 'top-right' */
  anchor?: FloatAnchor;
  /** Initial width in pixels. */
  width?: number;
  /** Initial height in pixels. */
  height?: number;
  /**
   * Which axes span the panel instead of carrying a fixed size. `width`/`height` above still apply
   * to any axis that isn't spanning, and are what a spanning axis returns to when released.
   * @see Stretch
   */
  stretch?: Stretch;
  /**
   * The user may move it out of the panel into a docked panel or a tab (7.11.0): drags of its
   * workspace panel, and what the app offers in {@link ManagedWidget.titleMenu}. Restricts the user
   * only; `move()` always works. Changeable while open: call `open()` again. @default false
   */
  canDock?: boolean;
  /**
   * The user may move it out of the panel into a floating window (7.11.0). As
   * {@link ManagedWidget.canDock}: the user only, changeable with another `open()`. @default false
   */
  canFloat?: boolean;
  /**
   * The menu on the widget's title icon (7.11.0), in the app's own words: a "Dock below the map" or
   * "Back into the map" item calls `w.move()`. With it, the title icon becomes a button that opens
   * these items. Out of the panel, its tab's icon and its floating title-bar icon open them too: they
   * lead the tab's menu (before the built-in Minimize and Close) and the floating window's ⋮ menu
   * (before Close). The built-in Float is left out, because these replace it.
   * Called each time the menu opens, so items can depend on where the widget is.
   * @example
   * titleMenu: w => w.location === 'panel'
   *   ? [{ label: 'Dock below the map', action: () => w.move({ to: 'docked', position: 'bottom' }) }]
   *   : [{ label: 'Back into the map', action: () => w.move({ to: 'panel' }) }]
   */
  titleMenu?: (w: WidgetMenuContext) => ContextMenuItem[];
  /**
   * Open **at** a placement saved earlier with `useFloatingWidgets().placement(id)` (7.11.0): where
   * it was in the panel, and whether it was docked, tabbed or floating out of it. Used only on the
   * first open of an id, like `anchor`; a re-open of a live id leaves it where it is.
   *
   * A value this version can't read (another `v`, or broken fields) falls back to the config's own
   * `anchor` / `width` / `height` / `stretch`. A valid one is clamped into the panel as it is now; in
   * a panel that has no size yet (a background tab) a free position waits until it has one. If
   * moving out of the panel is refused (the owner isn't docked), the widget stays in the panel.
   */
  placement?: WidgetPlacement;
  /**
   * Keep embedded documents and media alive when the widget moves (7.11.0): an `<iframe>` in it
   * doesn't reload when it moves out of its panel, back, or between docked, tabbed and floating.
   * Uses `moveBefore()` where the browser has it (Chrome and Edge 133+, Firefox 144+); in the others
   * an iframe reloads as before. As `preserveEmbeds` on a panel type's `defaultOptions`. @default false
   */
  preserveEmbeds?: boolean;
}

/**
 * Where a managed widget is, as plain JSON (7.11.0): from `useFloatingWidgets().placement(id)`,
 * back to `open(id, { placement })`. Opaque: store it as it is (JSON-serialisable) and don't read
 * its fields; they may change between versions, and `v` says which. The same in the Vue and Angular
 * editions (vue-dockable-desktop, angular-dockable-desktop).
 */
export type WidgetPlacement = { readonly v: 1 } & Record<string, unknown>;

/** What {@link ManagedWidget.titleMenu} is given to build its items from (7.11.0). */
export interface WidgetMenuContext {
  /** The widget's id. */
  id: string;
  /** Where it is now. */
  location: WidgetLocation;
  /** Its config's `canDock`. */
  canDock: boolean;
  /** Its config's `canFloat`. */
  canFloat: boolean;
  /** `useFloatingWidgets().move()` for this widget. */
  move(to: WidgetTarget): MoveResult;
  /** Closes the widget, wherever it is. */
  close(): void;
}

/**
 * Where a managed widget is shown (7.11.0). `'panel'` is inside its owner panel, as a floating
 * widget; the others are a workspace panel of its own, beside its owner (`'docked'`), a tab in its
 * owner's group (`'tabbed'`), a floating window (`'floating'`), or minimised to the taskbar.
 */
export type WidgetLocation = 'panel' | 'docked' | 'tabbed' | 'floating' | 'minimized';

/**
 * Where to move a managed widget with `useFloatingWidgets().move()` (7.11.0). Its owner panel is
 * always the reference: `'docked'` splits the owner's group on that side (`size` is the new
 * panel's share, 0.1–0.9, as in `openPanel`'s `dockTo`), `'tabbed'` adds a tab to the owner's
 * group. `'floating'` opens a floating window at `rect` (workspace pixels), or, without one, where
 * the widget is on screen, at its size. `'panel'` brings it back to where it last was inside the panel.
 */
export type WidgetTarget =
  | { to: 'panel' }
  | { to: 'docked'; position: 'left' | 'right' | 'top' | 'bottom'; size?: number }
  | { to: 'tabbed' }
  | { to: 'floating'; rect?: { x: number; y: number; width: number; height: number } };

/**
 * What `move()` did (7.11.0). A refusal changes nothing:
 * - `not-open`: no widget with that id is open in this overlay;
 * - `owner-not-docked`: `'docked'` and `'tabbed'` need the owner panel in the grid (a floating or
 *   minimised owner can still move a widget to `'floating'`);
 * - `owner-not-kept-alive`: the owner's panel type has `keepAlive: false`, so it unmounts while
 *   hidden and would take the widget with it;
 * - `no-workspace`: the overlay isn't in a workspace panel (no `DockableDesktopProvider`, or a
 *   modal or drawer), so there is nowhere to move to.
 */
export type MoveResult =
  | { ok: true }
  | { ok: false; reason: 'not-open' | 'owner-not-docked' | 'owner-not-kept-alive' | 'no-workspace' };
