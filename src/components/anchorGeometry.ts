import type { FloatAnchor } from './WindowManagerContext';

/**
 * Mirrors a physical workspace corner to its horizontal opposite.
 *
 * Used only to translate a physically-hovered corner (raw pointer/screen
 * position, which CSS cannot reason about) into the logical `FloatAnchor`
 * value stored on a `FloatingWindow` under RTL. Render-time positioning
 * should use CSS logical properties (`insetInlineStart`/`insetInlineEnd`)
 * driven by the element's `dir` attribute instead of calling this.
 */
export function flipZoneHorizontal(zone: FloatAnchor): FloatAnchor {
  if (zone === 'top-left')    return 'top-right';
  if (zone === 'top-right')   return 'top-left';
  if (zone === 'bottom-left') return 'bottom-right';
  return 'bottom-left';
}
