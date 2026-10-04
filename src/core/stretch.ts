/**
 * @file stretch.ts
 * @description Pure helpers for a docked widget's stretched axes and corner stacking.
 */
import type { FloatAnchor } from '../types';
import type { Stretch } from '../components/panelOverlay/types';

export const stretchesInline = (s: Stretch | null): boolean => s === 'width' || s === 'both';
export const stretchesBlock = (s: Stretch | null): boolean => s === 'height' || s === 'both';

/** Adds one axis to a stretch value, keeping whatever was already stretched. */
export const addAxis = (s: Stretch | null, axis: 'inline' | 'block'): Stretch => {
  if (axis === 'inline') return stretchesBlock(s) ? 'both' : 'width';
  return stretchesInline(s) ? 'both' : 'height';
};

/** Drops one axis from a stretch value, keeping the other. */
export const releaseAxis = (s: Stretch | null, axis: 'inline' | 'block'): Stretch | null => {
  if (axis === 'inline') return s === 'both' ? 'height' : stretchesInline(s) ? null : s;
  return s === 'both' ? 'width' : stretchesBlock(s) ? null : s;
};

/**
 * Which stack buckets a placement occupies.
 *
 * The four corner buckets are really a proxy for *"do these overlap on the inline axis?"* — two
 * widgets in the same corner overlap and so stack; widgets in opposite corners sit side by side and
 * don't. A full-width strip overlaps everything on its edge, so it belongs to **both** buckets of
 * that edge and pushes the widgets in each. (Computing real inline overlap was rejected: widths
 * change continuously during a resize drag, so widgets would reshuffle mid-gesture.)
 *
 * A block-stretched widget spans the very axis stacking uses to separate siblings, so it can't
 * participate at all and occupies no bucket — z-order decides any overlap.
 */
export const bucketsFor = (anchor: FloatAnchor, stretch: Stretch | null): FloatAnchor[] => {
  if (stretchesBlock(stretch)) return [];
  if (stretchesInline(stretch)) {
    return anchor.startsWith('top-')
      ? ['top-left', 'top-right']
      : ['bottom-left', 'bottom-right'];
  }
  return [anchor];
};

/** Replaces one half of a corner anchor, leaving the other axis alone. */
export const withInlineHalf = (a: FloatAnchor, half: 'left' | 'right'): FloatAnchor =>
  `${a.startsWith('top-') ? 'top' : 'bottom'}-${half}` as FloatAnchor;
export const withBlockHalf = (a: FloatAnchor, half: 'top' | 'bottom'): FloatAnchor =>
  `${half}-${a.endsWith('-right') ? 'right' : 'left'}` as FloatAnchor;

export const ANCHORS: readonly FloatAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
