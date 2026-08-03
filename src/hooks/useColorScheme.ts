import { useEffect, useState } from 'react';

/**
 * Reactively reads the workspace's current `data-color-scheme` attribute
 * (set on `document.documentElement` by `<WindowManager />`), returning
 * `'dark'` or `'light'` and re-rendering whenever it changes.
 *
 * Useful for panel content that needs to react to the same scheme the
 * workspace itself is using — e.g. swapping a map's tile layer or an
 * embedded editor's theme to match.
 */
export function useColorScheme(): 'dark' | 'light' {
  const [scheme, setScheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.getAttribute('data-color-scheme') === 'light' ? 'light' : 'dark'
  );

  useEffect(() => {
    const updateScheme = () => {
      setScheme(document.documentElement.getAttribute('data-color-scheme') === 'light' ? 'light' : 'dark');
    };
    updateScheme();
    const observer = new MutationObserver(updateScheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
    return () => observer.disconnect();
  }, []);

  return scheme;
}
