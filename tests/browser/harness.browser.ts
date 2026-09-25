import { describe, it, expect } from 'vitest';
import { openHarness, wmState } from './lib';

describe('browser harness', () => {
  it('loads the initial layout without page errors', async () => {
    const { page, errors, close } = await openHarness();
    const floating = await wmState<Array<{ id: string }>>(page, 'floating');
    expect(floating.map(w => w.id)).toEqual(['p4']);
    expect(await page.locator('.rdd-workspace').count()).toBe(1);
    expect(errors).toEqual([]);
    await close();
  });
});
