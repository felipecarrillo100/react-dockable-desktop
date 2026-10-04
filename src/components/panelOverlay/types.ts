/**
 * @file types.ts
 * @description Public types of the Panel Overlay system: toolbar edges, widget stretch and
 * placement, and the config of an imperatively opened widget.
 */
import type React from 'react';
import type { FloatAnchor } from '../../types';
// Type-only, so this stays a one-way dependency: PanelProviderContext imports nothing from here.
import type { PanelTitle } from '../PanelProviderContext';

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
}
