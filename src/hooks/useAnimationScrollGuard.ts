import { useEffect, useState } from 'react';

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
 *
 * The baseline MUST be captured in a `useState` initializer, not inside this
 * hook's own `useEffect`: React always flushes every layout effect in the
 * subtree (e.g. MUI's `InputBase` autofocus, which fires from `useLayoutEffect`)
 * before any passive effect runs, tree-wide, regardless of nesting. Capturing in
 * a plain effect here would run after that autofocus-triggered scroll already
 * happened, recording the post-jump position as "correct" and never catching the
 * one jump that matters. A render-time initializer is the only capture point
 * guaranteed to precede every effect in the subtree.
 */
export function useAnimationScrollGuard(durationMs: number): void {
  const [{ x, y }] = useState(() => ({ x: window.scrollX, y: window.scrollY }));

  useEffect(() => {
    const handleScroll = () => window.scrollTo(x, y);
    window.addEventListener('scroll', handleScroll);

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('scroll', handleScroll);
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [durationMs, x, y]);
}
