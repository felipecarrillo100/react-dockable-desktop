import { useSyncExternalStore } from 'react';

type ColorScheme = 'dark' | 'light';

const readScheme = (): ColorScheme =>
  document.documentElement.getAttribute('data-color-scheme') === 'light' ? 'light' : 'dark';

const subscribe = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
  return () => observer.disconnect();
};

// The server can't see the page's scheme. Dark is the library's default, so server-rendered
// HTML says dark and hydration corrects it on the client — `useSyncExternalStore` renders the
// server value during hydration and then the real one, without a mismatch.
const serverScheme = (): ColorScheme => 'dark';

/**
 * Reactively reads the page's `data-color-scheme` attribute on `<html>` — the one the host
 * application sets to switch the library's scheme (the library itself never writes it) —
 * returning `'dark'` or `'light'` and re-rendering whenever it changes.
 *
 * Useful for panel content that needs to react to the same scheme the
 * workspace itself is using — e.g. swapping a map's tile layer or an
 * embedded editor's theme to match.
 *
 * Returns `'dark'` when rendered on the server.
 */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, readScheme, serverScheme);
}
