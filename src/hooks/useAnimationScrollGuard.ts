import { useEffect } from 'react';

/**
 * Snaps the document back to its scroll position for `durationMs` after mount.
 *
 * Some enter-animated overlays (side panels, modals) mount their content in the
 * same commit as the animation that slides/scales them into view, so a child that
 * autofocuses on mount (native `autofocus`, MUI's `autoFocus`, or the library's
 * own internal `.focus()` calls) is still a real, focusable, laid-out DOM node
 * while visually off-screen — triggering the browser's native focus-scroll-into-view,
 * which has no scrollable containing block to stop at and walks up to the document.
 * That's the page jump. This hook doesn't know or care what caused the scroll; it
 * just undoes any scroll that happens during the animation window.
 */
export function useAnimationScrollGuard(durationMs: number): void {
  useEffect(() => {
    const x = window.scrollX;
    const y = window.scrollY;

    const handleScroll = () => window.scrollTo(x, y);
    window.addEventListener('scroll', handleScroll);

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('scroll', handleScroll);
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [durationMs]);
}
