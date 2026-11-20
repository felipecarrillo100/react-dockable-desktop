import { winOf } from './domContext';

export function isElementRtl(el: HTMLElement | null): boolean {
  if (!el) {
    if (typeof document !== 'undefined') {
      return (
        document.documentElement.dir?.toLowerCase() === 'rtl' ||
        document.body.dir?.toLowerCase() === 'rtl'
      );
    }
    return false;
  }

  // Check closest element with dir attribute
  const closestDirEl = el.closest('[dir]');
  if (closestDirEl) {
    return closestDirEl.getAttribute('dir')?.toLowerCase() === 'rtl';
  }

  // Fallback to the rules of the element's own document (a pop-out window's, for content there)
  const doc = el.ownerDocument;
  return (
    doc.documentElement.dir?.toLowerCase() === 'rtl' ||
    doc.body?.dir?.toLowerCase() === 'rtl'
  );
}

/**
 * Whether `el` is laid out right-to-left, as the browser computes it — from a `dir` attribute on
 * any ancestor, the CSS `direction` property, or the workspace's own `setDirection`.
 *
 * Use this, not `document.documentElement.dir`, wherever a pointer delta (physical) is turned into
 * a size, side or index (logical): RTL is often set on `<body>` or a wrapper rather than `<html>`, and
 * the workspace can be RTL on an LTR page.
 */
export function isComputedRtl(el: Element | null | undefined): boolean {
  if (!el) return false;
  // The element's own window computes its style; a node of another window is not one of ours.
  const win = winOf(el);
  if (!win || typeof win.getComputedStyle !== 'function') return false;
  return win.getComputedStyle(el).direction === 'rtl';
}
