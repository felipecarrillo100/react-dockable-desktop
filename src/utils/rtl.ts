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

  // Fallback to document rules
  return (
    document.documentElement.dir?.toLowerCase() === 'rtl' ||
    document.body.dir?.toLowerCase() === 'rtl'
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
  if (!el || typeof getComputedStyle === 'undefined') return false;
  return getComputedStyle(el).direction === 'rtl';
}
