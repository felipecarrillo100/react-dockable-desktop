import { describe, it, expect } from 'vitest';
import { flipZoneHorizontal } from '../anchorGeometry';
import type { FloatAnchor } from '../WindowManagerContext';

describe('flipZoneHorizontal', () => {
  it('flips top-left to top-right', () => {
    expect(flipZoneHorizontal('top-left')).toBe('top-right');
  });

  it('flips top-right to top-left', () => {
    expect(flipZoneHorizontal('top-right')).toBe('top-left');
  });

  it('flips bottom-left to bottom-right', () => {
    expect(flipZoneHorizontal('bottom-left')).toBe('bottom-right');
  });

  it('flips bottom-right to bottom-left', () => {
    expect(flipZoneHorizontal('bottom-right')).toBe('bottom-left');
  });

  it('is its own inverse for every corner', () => {
    const corners: FloatAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const corner of corners) {
      expect(flipZoneHorizontal(flipZoneHorizontal(corner))).toBe(corner);
    }
  });
});
