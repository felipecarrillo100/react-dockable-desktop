import { useLayoutEffect, useState, type RefObject } from 'react';

/** On-screen rect of a container, in the coordinate system `position: fixed` uses. */
export interface ContainerRect {
  top: number;
  left: number;
  /** Distance from the viewport's right edge — what CSS `right` expects for `position: fixed`. */
  right: number;
  height: number;
}

/**
 * Tracks the live on-screen rect of `anchorRef.current`'s parent element.
 *
 * Used to keep a `position: fixed` overlay (side panel) visually confined to
 * whatever container the consuming app actually placed the workspace into,
 * instead of defaulting to the full browser viewport. `position: fixed` is
 * required so the overlay never contributes scrollable overflow to any
 * ancestor (see the side-panel autofocus scroll-jump fix), but that means it
 * no longer inherits containment from a `position: relative` ancestor the way
 * `position: absolute` did — this hook restores that containment by measuring
 * it directly. For a full-viewport app the measured rect equals the viewport,
 * so this is a no-op change from the app's perspective.
 */
export function useContainerRect(anchorRef: RefObject<HTMLElement | null>): ContainerRect | null {
  const [rect, setRect] = useState<ContainerRect | null>(null);

  useLayoutEffect(() => {
    const container = anchorRef.current?.parentElement;
    if (!container) return;

    const measure = () => {
      const r = container.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, right: window.innerWidth - r.right, height: r.height });
    };
    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [anchorRef]);

  return rect;
}
