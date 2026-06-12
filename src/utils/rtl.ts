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
