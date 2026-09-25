import { describe, it, expect } from 'vitest';
import { openHarness, actions } from './lib';

// 7.0.0 looped on this: a panel effect that lists the usePanel() handle and writes the panel's own
// title and dirty flag re-ran on every write, until React gave up with "Maximum update depth
// exceeded" and the panel's body was replaced by the error.

describe('a panel that writes its own title from an effect', () => {
  it('renames its tab once, with no React error', async () => {
    const { page, errors, close } = await openHarness();
    const consoleErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await actions(page, 'openPanel', 'd1', 'titled', { title: 'Doc' });
    await page.waitForSelector('#rename-d1');
    await page.click('#rename-d1');
    await page.waitForTimeout(300);
    const tab = await page.textContent('[data-tab-id="d1"]');
    expect(tab).toContain('Renamed doc');
    expect(await page.$('#rename-d1'), 'the panel body is still mounted').not.toBeNull();
    expect(errors).toEqual([]);
    expect(consoleErrors.filter(e => e.includes('Maximum update depth'))).toEqual([]);
    await close();
  });
});
