import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * One Escape closes one overlay: the one on top.
 *
 * Every overlay used to add its own `keydown` listener to `document`. `stopPropagation()` does
 * not stop the other listeners on the same node, so a single key press closed a context menu
 * *and* the modal under it, or both side drawers at once. Overlays now register here instead,
 * and one shared listener hands each Escape to the topmost registration only.
 *
 * "Topmost" is by layer first — popups (context menu, toolbar flyout) above modals, modals above
 * drawers, matching how they are stacked on screen — then by registration order within a layer.
 *
 * The listener is on `document` in the bubble phase, so it runs after React's own handlers
 * (which are attached to the root container). A control that handles Escape itself — the panel
 * search box, or an app's own widget — claims it with `preventDefault()`, and the overlay stays.
 */
export type EscapeLayer = 'drawer' | 'modal' | 'popup';

const LAYER_RANK: Record<EscapeLayer, number> = { drawer: 1, modal: 2, popup: 3 };

interface EscapeEntry {
  layer: EscapeLayer;
  order: number;
  onEscape: () => void;
}

const entries: EscapeEntry[] = [];
let nextOrder = 0;

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented || entries.length === 0) return;
  let top = entries[0];
  for (const entry of entries) {
    const higher = LAYER_RANK[entry.layer] - LAYER_RANK[top.layer];
    if (higher > 0 || (higher === 0 && entry.order > top.order)) top = entry;
  }
  e.preventDefault();
  top.onEscape();
}

/**
 * Registers an overlay for Escape. Returns the function that unregisters it.
 * `onEscape` may do nothing (a modal that can't be closed) — the key is still consumed, so it
 * doesn't fall through to whatever is underneath.
 */
export function pushEscape(layer: EscapeLayer, onEscape: () => void): () => void {
  const entry: EscapeEntry = { layer, order: nextOrder++, onEscape };
  entries.push(entry);
  if (entries.length === 1) document.addEventListener('keydown', handleKeyDown);
  return () => {
    const index = entries.indexOf(entry);
    if (index === -1) return;
    entries.splice(index, 1);
    if (entries.length === 0) document.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Registers an overlay for Escape while `active` is true.
 *
 * The overlay's place in the stack is fixed when it becomes active; `onEscape` is read through a
 * ref, so a new callback identity on re-render does not move it to the top.
 */
export function useEscapeLayer(active: boolean, layer: EscapeLayer, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    return pushEscape(layer, () => onEscapeRef.current());
  }, [active, layer]);
}
