/**
 * Regression guard for the side-panel autofocus scroll-jump bug (see CHANGELOG 5.3.4):
 * .rdd-side-panel must stay position: fixed, not position: absolute.
 *
 * position: absolute makes the panel's containing block whatever position:
 * relative/absolute ancestor the consuming app happens to have (per the
 * documented "mount as a sibling of WindowManager" pattern) — verified live in
 * a real browser to make the panel contribute real scrollable overflow to that
 * ancestor while off-screen mid-slide-in, which the browser then auto-scrolls
 * on focus and continuously re-clamps in lockstep with the animation, visibly
 * dragging the ancestor's entire content left/right and back. position: fixed
 * (matching .rdd-modal-overlay) removes it from any ancestor's overflow
 * calculation entirely. This can't be caught by a DOM/jsdom test — jsdom has
 * no real layout engine — so it's asserted directly against the CSS source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '../../index.css'), 'utf8');

describe('SP1: .rdd-side-panel stays position: fixed', () => {
  it('does not regress to position: absolute', () => {
    const match = css.match(/\.rdd-side-panel\s*\{[^}]*\}/);
    expect(match).not.toBeNull();
    expect(match![0]).toMatch(/position:\s*fixed/);
    expect(match![0]).not.toMatch(/position:\s*absolute/);
  });
});
