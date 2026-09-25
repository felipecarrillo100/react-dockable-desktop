/**
 * Scroll offsets and focus for panel DOM that is moved rather than remounted.
 *
 * A panel's element is never unmounted: it moves between slots — a tab group, a floating window,
 * the taskbar preview, the hidden parking container. React state survives that; browser state
 * does not. A detached or `display: none` subtree loses every scroll offset, and the focused
 * element inside it loses focus. So every tab switch, minimize/restore, float and dock used to
 * put a long list back at the top and drop the caret out of the field being typed in.
 *
 * Offsets and the focused element are recorded *continuously* while the panel is on screen: by
 * the time React runs an effect cleanup the element has already been detached, and reads 0.
 */

interface PanelDomRecord {
  /** Last on-screen scroll offset of each scrolled element inside the panel. */
  scrolls: Map<Element, { top: number; left: number }>;
  /** The element inside the panel that last had focus. */
  focused: HTMLElement | null;
}

const records = new Map<string, PanelDomRecord>();
const tracked = new WeakSet<HTMLElement>();

/** A detached or display:none element has no client rects; its scroll offsets read 0. */
const isOnScreen = (el: Element): boolean => el.isConnected && el.getClientRects().length > 0;

/** Starts recording scroll offsets and focus inside a panel's cached element. Idempotent. */
export function trackPanelDom(panelId: string, root: HTMLElement): void {
  if (tracked.has(root)) return;
  tracked.add(root);
  const record: PanelDomRecord = { scrolls: new Map(), focused: null };
  records.set(panelId, record);

  root.addEventListener('scroll', (e) => {
    const target = e.target;
    // Defensive: an element being hidden or detached resets its offset to 0, and some browsers
    // report that as a scroll event. Chrome doesn't, so no test exercises this guard.
    if (!(target instanceof Element) || !isOnScreen(target)) return;
    record.scrolls.set(target, { top: target.scrollTop, left: target.scrollLeft });
  }, { capture: true, passive: true });

  root.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLElement) record.focused = e.target;
  });
}

/**
 * Re-applies a panel's recorded state after its element was attached to a new slot.
 *
 * Scroll offsets are always restored. Focus is restored only when `refocus` is true — the panel
 * is the active one — and focus was actually lost (it is on <body>), so a panel restored in the
 * background, or one the user has already moved away from, never takes focus.
 *
 * Runs now and once more on the next frame: content that lays out lazily (virtualised lists,
 * images) may not be tall enough to accept the offset on the first pass.
 */
export function restorePanelDom(panelId: string, { refocus }: { refocus: boolean }): void {
  const record = records.get(panelId);
  if (!record) return;
  const apply = () => {
    record.scrolls.forEach(({ top, left }, el) => {
      if (!el.isConnected) { record.scrolls.delete(el); return; }
      if (el.scrollTop !== top) el.scrollTop = top;
      if (el.scrollLeft !== left) el.scrollLeft = left;
    });
    const focused = record.focused;
    const focusWasLost = document.activeElement === null || document.activeElement === document.body;
    if (refocus && focusWasLost && focused?.isConnected && isOnScreen(focused)) {
      // The element keeps its own selection range, so focusing it puts the caret back too.
      focused.focus({ preventScroll: true });
    }
  };
  apply();
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(apply);
}

/** Drops a closed panel's records. */
export function forgetPanelDom(panelId: string): void {
  records.delete(panelId);
}
