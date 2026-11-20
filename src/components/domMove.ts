/**
 * @file domMove.ts
 * @description Moving a panel's or a widget's element between slots, keeping embedded state where
 * asked to (7.11.0, `preserveEmbeds`).
 *
 * An element moved with `appendChild` is removed and re-inserted: an `<iframe>` in it reloads.
 * `moveBefore()` (Chrome and Edge 133+, Firefox 144+) moves it without that, but only between two
 * places in the same document that are both connected. So an element that preserves its embeds is
 * moved with it when it can be, and parked in the document's hidden store, never detached, between
 * slots. Everything else moves exactly as before.
 */

import { rafOf } from '../utils/domContext';

const preserving = new WeakSet<Element>();

/** Marks an element (a panel's, or a widget's content) as keeping its embeds alive, or not. */
export function setPreserveEmbeds(el: Element, on: boolean): void {
  if (on) preserving.add(el); else preserving.delete(el);
}

/** Whether an element keeps its embeds alive when it moves. */
export function preservesEmbeds(el: Element): boolean {
  return preserving.has(el);
}

/**
 * Moves `el` into `slot` once the slot is in the document. A slot inside a panel's element can
 * render before the workspace has attached that element; `moveBefore()` needs both ends
 * connected, so an element that keeps its embeds waits (where it is, still connected) rather than
 * fall back to a move that reloads them. Any other element moves at once, as before. Returns a
 * cancel function for the slot's cleanup.
 */
export function moveIntoWhenConnected(slot: Element, el: Element): () => void {
  if (!preserving.has(el) || slot.isConnected) { moveInto(slot, el); return () => {}; }
  let cancelled = false;
  let frames = 0;
  // The slot's own window's frames: a pop-out's keep running while the main window is hidden.
  const raf = rafOf(slot);
  const frame = raf === null
    ? (cb: () => void) => { setTimeout(cb, 16); }
    : (cb: () => void) => { raf(cb); };
  const attempt = (): void => {
    if (cancelled) return;
    // A slot that never connects (it was left detached) still gets its element, after a while.
    if (slot.isConnected || ++frames > 60) { moveInto(slot, el); return; }
    frame(attempt);
  };
  frame(attempt);
  return () => { cancelled = true; };
}

type WithMoveBefore = Element & { moveBefore?: (node: Node, child: Node | null) => void };

/** Appends `el` to `parent`: with `moveBefore()` when the element asks for it and it applies. */
export function moveInto(parent: Element, el: Element): void {
  const p = parent as WithMoveBefore;
  if (preserving.has(el) && typeof p.moveBefore === 'function'
    && parent.isConnected && el.isConnected && parent.ownerDocument === el.ownerDocument) {
    try {
      p.moveBefore(el, null);
      return;
    } catch {
      // A move the browser refuses (a state it doesn't allow) falls back to a plain move.
    }
  }
  parent.appendChild(el);
}

/**
 * Where an element waits while no slot shows it: one hidden node per document, shared on purpose.
 * Every workspace's and overlay's elements are distinct, so parking them side by side is harmless.
 */
const HIDDEN_ID = 'preserved-dom-container';

/** Parks an element in the hidden store of `doc` (created on first use). */
export function park(el: Element, doc: Document): void {
  let store = doc.getElementById(HIDDEN_ID);
  if (!store) {
    store = doc.createElement('div');
    store.id = HIDDEN_ID;
    store.style.display = 'none';
    doc.body.appendChild(store);
  }
  moveInto(store, el);
}

/**
 * Takes an element out of `slot` when a slot unmounts, unless it already moved elsewhere. One that
 * keeps its embeds is parked instead of detached, so its next move can still keep them.
 */
export function leaveSlot(slot: Element, el: Element): void {
  if (el.parentNode !== slot) return;
  if (preserving.has(el)) park(el, el.ownerDocument);
  else slot.removeChild(el);
}
