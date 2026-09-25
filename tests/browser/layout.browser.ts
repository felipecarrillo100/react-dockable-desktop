import { describe, it, expect } from 'vitest';
import { openHarness, rectOf, drag } from './lib';

describe('split and sidebar layout', () => {
  it('a split resizer can be grabbed a few pixels either side of its 1px line', async () => {
    const { page, close } = await openHarness();
    const bar = await rectOf(page, '.rdd-split > .rdd-resizer-bar');
    const hitAt = (dx: number) => page.evaluate(([x, y]) =>
      !!document.elementFromPoint(x, y)?.closest('.rdd-resizer-bar'), [bar.x + dx, bar.y + bar.height / 2]);
    expect(await hitAt(-3)).toBe(true);
    expect(await hitAt(3)).toBe(true);
    await close();
  });

  it('dragging a split resizer resizes the panes', async () => {
    const { page, close } = await openHarness();
    const bar = await rectOf(page, '.rdd-split > .rdd-resizer-bar');
    const y = bar.y + bar.height / 2;
    await drag(page, bar.x, y, bar.x - 150, y);
    const after = await rectOf(page, '.rdd-split > .rdd-resizer-bar');
    expect(Math.round(after.x - bar.x)).toBeLessThan(-100);
    await close();
  });
});
