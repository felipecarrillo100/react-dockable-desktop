/**
 * Tests for dragResize.ts's computeResizedRect — locking in that the shared function
 * exactly reproduces both call sites' original, independently-derived math:
 * - DR1-DR4: WindowManager.tsx's startResize style (minW/minH only, no maxW/maxH/minX/minY)
 * - DR5-DR8: PanelOverlay.tsx's handleResizePointerDown style (all four constraints)
 * - DR9: corner directions combine both axes independently
 */
import { describe, it, expect } from 'vitest';
import { computeResizedRect } from '../dragResize';

const START = { x: 100, y: 50, w: 300, h: 200 };

describe('DR1-DR4: WindowManager-style constraints (minW/minH only)', () => {
  const constraints = { minW: 200, minH: 150 };

  it('DR1: "e" grows unbounded and floors at minW when shrinking', () => {
    expect(computeResizedRect('e', 500, 0, START, constraints)).toEqual({ x: 100, y: 50, w: 800, h: 200 });
    expect(computeResizedRect('e', -1000, 0, START, constraints)).toEqual({ x: 100, y: 50, w: 200, h: 200 });
  });

  it('DR2: "w" has no position floor — x can go negative', () => {
    // Dragging far left (very negative dx) grows the window leftward with no bound.
    const result = computeResizedRect('w', -150, 0, START, constraints);
    expect(result.w).toBe(450); // start.w - dx = 300 - (-150)
    expect(result.x).toBe(-50); // start.x + dx = 100 + (-150), unbounded, allowed to go negative
  });

  it('DR3: "w" floors width at minW when shrinking past it', () => {
    const result = computeResizedRect('w', 1000, 0, START, constraints);
    expect(result.w).toBe(200); // floored at minW
    expect(result.x).toBe(200); // x = start.x + start.w - minW = 100 + 300 - 200
  });

  it('DR4: "s"/"n" mirror "e"/"w" on the y axis, unbounded', () => {
    expect(computeResizedRect('s', 0, 500, START, constraints)).toEqual({ x: 100, y: 50, w: 300, h: 700 });
    const north = computeResizedRect('n', 0, -80, START, constraints);
    expect(north.h).toBe(280); // start.h - dy = 200 - (-80)
    expect(north.y).toBe(-30); // start.y + dy = 50 + (-80), unbounded
  });
});

describe('DR5-DR8: PanelOverlay-style constraints (all four supplied)', () => {
  // Container is 500x400; window starts at (100,50) sized 300x200 — matches
  // PanelOverlay's own getContainerBounds()-derived maxW/maxH = cw - startX / ch - startY.
  const constraints = { minW: 50, minH: 40, maxW: 500 - 100, maxH: 400 - 50, minX: 0, minY: 0 };

  it('DR5: "e" clamps at the container edge', () => {
    const result = computeResizedRect('e', 1000, 0, START, constraints);
    expect(result.w).toBe(400); // maxW = 500 - 100
  });

  it('DR6: "e" still floors at minW when shrinking', () => {
    const result = computeResizedRect('e', -1000, 0, START, constraints);
    expect(result.w).toBe(50);
  });

  it('DR7: "w" clamps x at 0 (minX) instead of going negative', () => {
    const result = computeResizedRect('w', -150, 0, START, constraints);
    // Unclamped this would be w=450, x=-50 (see DR2) — here x must floor at 0.
    expect(result.x).toBe(0);
    expect(result.w).toBe(400); // width grows to exactly close the gap: start.x + start.w - 0
  });

  it('DR8: "n" clamps y at 0 (minY) the same way', () => {
    const result = computeResizedRect('n', 0, -80, START, constraints);
    expect(result.y).toBe(0);
    expect(result.h).toBe(250); // start.y + start.h - 0
  });
});

describe('DR9: corner directions combine both axes independently', () => {
  it('"se" resizes width and height together, each with its own axis math', () => {
    const result = computeResizedRect('se', 50, 30, START, { minW: 50, minH: 40 });
    expect(result).toEqual({ x: 100, y: 50, w: 350, h: 230 });
  });

  it('"nw" resizes position and size on both axes together', () => {
    const result = computeResizedRect('nw', -20, -10, START, { minW: 50, minH: 40, minX: 0, minY: 0 });
    expect(result.x).toBe(80); // start.x + dx
    expect(result.w).toBe(320); // start.w - dx
    expect(result.y).toBe(40); // start.y + dy
    expect(result.h).toBe(210); // start.h - dy
  });
});
