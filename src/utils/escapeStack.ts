import { useEffect, useLayoutEffect, useRef } from 'react';
import { listenOnDocuments } from './documentRegistry';

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
 *
 * The listener is on every document that holds panel content: the main one, and any registered
 * with `registerDocument` (a pop-out window's), so Escape pressed there reaches the stack too.
 * Each window has its own stack (7.12.0): an overlay belongs to the document it is shown in, and
 * Escape in a document closes the topmost overlay of that document only. A menu in a pop-out stays
 * open through an Escape in the page, and the page's modal through an Escape in the pop-out.
 */
export type EscapeLayer = 'drawer' | 'modal' | 'popup';

const LAYER_RANK: Record<EscapeLayer, number> = { drawer: 1, modal: 2, popup: 3 };

interface EscapeEntry {
  layer: EscapeLayer;
  /** The document it is shown in. */
  doc: Document | null;
  order: number;
  onEscape: () => void;
}

const entries: EscapeEntry[] = [];
const mainDocument = (): Document | null => (typeof document === 'undefined' ? null : document);
let nextOrder = 0;
let stopListening: (() => void) | null = null;

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented || entries.length === 0) return;
  // The document the key was pressed in: the listener's own (it is on each document).
  const doc = (e.currentTarget as Document | null) ?? mainDocument();
  const here = entries.filter(entry => (entry.doc ?? mainDocument()) === doc);
  if (here.length === 0) return;
  let top = here[0];
  for (const entry of here) {
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
export function pushEscape(layer: EscapeLayer, onEscape: () => void, doc: Document | null = null): () => void {
  const entry: EscapeEntry = { layer, doc, order: nextOrder++, onEscape };
  entries.push(entry);
  if (entries.length === 1) stopListening = listenOnDocuments('keydown', handleKeyDown);
  return () => {
    const index = entries.indexOf(entry);
    if (index === -1) return;
    entries.splice(index, 1);
    if (entries.length === 0) { stopListening?.(); stopListening = null; }
  };
}

/**
 * Registers an overlay for Escape while `active` is true.
 *
 * The overlay's place in the stack is fixed when it becomes active; `onEscape` is read through a
 * ref, so a new callback identity on re-render does not move it to the top.
 */
export function useEscapeLayer(active: boolean, layer: EscapeLayer, onEscape: () => void, doc: Document | null = null): void {
  const onEscapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    return pushEscape(layer, () => onEscapeRef.current(), doc);
  }, [active, layer, doc]);
}
