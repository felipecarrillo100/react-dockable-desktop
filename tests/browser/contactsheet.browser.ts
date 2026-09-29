// TEMPORARY (7.3.0 review): screenshots for the brand-surface / radius contact sheet. Runs only
// with RDD_CONTACT_SHEET=1; delete before release.
import { describe, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCENES, openBase } from './scenes';

const OUT = join(__dirname, '..', '..', 'artifacts', 'branding-7.3.0');
const BRAND = { dark: '&bs=0b1f3a&bt=e8eef7', light: '&bs=f4f1ec&bt=2b2620' } as const;
const VARIANTS = [
  ['unbranded', () => ''],
  ['surface', (cs: string) => BRAND[cs as 'dark']],
  ['radius-0', () => '&rs=0'],
  ['radius-1.5', () => '&rs=1.5'],
] as const;

describe.runIf(process.env.RDD_CONTACT_SHEET === '1')('contact sheet', () => {
  mkdirSync(OUT, { recursive: true });
  for (const { skin, cs } of SCENES) {
    it(`${skin} / ${cs}`, async () => {
      for (const [name, extra] of VARIANTS) {
        const { page, close } = await openBase(skin, cs, `&plain=1${extra(cs)}`);
        await page.evaluate(() => {
          const wm = (window as unknown as { __wm: { toast: (m: string) => void } }).__wm;
          wm.toast('Saved');
        });
        await page.mouse.move(1, 1);
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUT, `${skin}-${cs}-${name}.jpg`), type: 'jpeg', quality: 72 });
        await close();
      }
    }, 120_000);
  }
});
