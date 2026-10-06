/** warnDeprecated: once per name, development only (STABILITY.md). */
import { it, expect, vi, afterEach } from 'vitest';
import { warnDeprecated } from '../deprecated';

const originalEnv = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = originalEnv; vi.restoreAllMocks(); });

it('warns once per deprecated name, naming the replacement and the removal', () => {
  process.env.NODE_ENV = 'development';
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  warnDeprecated('oldA()', 'newA()', '8.0.0');
  warnDeprecated('oldA()', 'newA()', '8.0.0');
  warnDeprecated('oldB()', 'newB()', '8.0.0');
  expect(warn).toHaveBeenCalledTimes(2);
  expect(warn.mock.calls[0][0]).toContain('oldA() is deprecated and will be removed in 8.0.0. Use newA() instead.');
});

it('is silent outside development', () => {
  process.env.NODE_ENV = 'production';
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  warnDeprecated('oldC()', 'newC()', '8.0.0');
  expect(warn).not.toHaveBeenCalled();
});
