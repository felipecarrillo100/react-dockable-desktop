/**
 * @file panelOverlayGeometry.ts
 * @description Pure geometry of the Panel Overlay: the corner drop zones and a floating widget's
 * size, dock and snap distances.
 */
import type { FloatAnchor } from '../types';

// ─── Helper ───────────────────────────────────────────────────────────────────

export const DROP_ZONE_SIZE = 80;

export function getHoveredZone(container: HTMLElement, clientX: number, clientY: number): FloatAnchor | null {
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < DROP_ZONE_SIZE && y < DROP_ZONE_SIZE) return 'top-left';
  if (x > rect.width - DROP_ZONE_SIZE && y < DROP_ZONE_SIZE) return 'top-right';
  if (x < DROP_ZONE_SIZE && y > rect.height - DROP_ZONE_SIZE) return 'bottom-left';
  if (x > rect.width - DROP_ZONE_SIZE && y > rect.height - DROP_ZONE_SIZE) return 'bottom-right';
  return null;
}

export const MIN_W = 120;
export const MIN_H = 60;
export const DOCK_INSET = 8;
export const DOCK_GAP = 8;
/**
 * Resize-to-stretch snapping. Asymmetric on purpose: arming within `SNAP_IN` of the full extent
 * but only disarming once the drag pulls back past the wider `SNAP_OUT`. Without that hysteresis,
 * releasing a stretched axis by dragging a few pixels inward would immediately re-arm and snap
 * straight back on release, which makes the gesture feel broken.
 */
export const SNAP_IN = 16;
export const SNAP_OUT = 40;
