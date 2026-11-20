/**
 * @file domContext.ts
 * @description The document and window a DOM node belongs to (7.12.0 groundwork for pop-out
 * windows). Internal: not exported from the package.
 *
 * A panel's element (and a managed widget's content element) can live in a same-origin child
 * window while the code that drives it stays in the main window's JavaScript realm. So anything the
 * library does to or around panel content takes its document and window from the element it acts
 * on, never from the globals:
 *
 * - `instanceof HTMLElement` is false for a node of another window (each window has its own
 *   constructors): use {@link isElement} / {@link isHTMLElement} / {@link isNode}, which check
 *   `nodeType`.
 * - `requestAnimationFrame` of the main window pauses when that window is hidden: use
 *   {@link rafOf} with the node.
 * - `innerWidth`, `activeElement`, `getComputedStyle`, `matchMedia` are per window/document: use
 *   {@link winOf} / {@link docOf}.
 * - A `ResizeObserver` from the main window watching a node in another document is not reliable:
 *   use {@link resizeObserverFor}.
 *
 * For a node of the main document every helper gives exactly what the global did before, so the
 * behaviour there is unchanged (and test stubs of the globals still apply).
 *
 * Main window only, by design (workspace chrome, which never moves into a child window; they keep
 * the global `document` / `window`):
 * - tab drags (`workspace/tabDrag.ts`) and floating-window drags (`workspace/floatingWindowDrag.ts`);
 * - drop-target hit testing (`workspace/useDragTargets.ts` `elementsFromPoint`);
 * - the grid splitters and sidebar resizers;
 * - the taskbar and its minimized-panel preview (`WindowManager.tsx`);
 * - workspace sizing (`useWorkspaceSize`, `hooks/useContainerRect.ts`) and the cascade/placement
 *   in `workspaceCore`;
 * - `window` blur cancelling a drag (`WindowManager.tsx`);
 * - toasts: `toast()` is global, so the container stays on the main `<body>` (its card's own
 *   ResizeObserver and frame are element-relative);
 * - `useColorScheme()` and `isElementRtl(null)`: the page's `<html>` is the authority for the scheme
 *   and direction (a pop-out mirrors it, S3).
 */

const HTML_NS = 'http://www.w3.org/1999/xhtml';

type MaybeNode = Node | null | undefined;

/** Whether `value` is a DOM node, of any window (unlike `instanceof Node`). */
export function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).nodeType === 'number'
    && typeof (value as Node).nodeName === 'string';
}

/** Whether `value` is an element, of any window (unlike `instanceof Element`). */
export function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === 1;
}

/** Whether `value` is an HTML element, of any window (unlike `instanceof HTMLElement`). */
export function isHTMLElement(value: unknown): value is HTMLElement {
  return isElement(value) && value.namespaceURI === HTML_NS;
}

/**
 * The document `node` belongs to (a document is its own); the main document for none. Client
 * only: on the server, with no node, there is no document to return.
 */
export function docOf(node: MaybeNode): Document {
  if (node) {
    if (node.nodeType === 9) return node as Document;
    if (node.ownerDocument) return node.ownerDocument;
  }
  return (typeof document === 'undefined' ? undefined : document) as Document;
}

/** The main window, or null on the server. */
const mainWindow = (): (Window & typeof globalThis) | null => (typeof window === 'undefined' ? null : window);

/**
 * The window `node`'s document is shown in; the main window when it has none (a document made
 * with `createHTMLDocument`, or no node). Null only on the server.
 */
export function winOf(node: MaybeNode): (Window & typeof globalThis) | null {
  const view = node ? docOf(node)?.defaultView : null;
  return (view as (Window & typeof globalThis) | null) ?? mainWindow();
}

/** Whether `node` is shown in a window other than the main one. */
const inOtherWindow = (node: MaybeNode): boolean => {
  const main = mainWindow();
  const win = winOf(node);
  return !!win && win !== main;
};

/**
 * `requestAnimationFrame` of `node`'s window, or null where there is none. For a node of the main
 * window it is the global one, as before.
 */
export function rafOf(node: MaybeNode): ((cb: FrameRequestCallback) => number) | null {
  if (inOtherWindow(node)) {
    const win = winOf(node)!;
    if (typeof win.requestAnimationFrame === 'function') return (cb) => win.requestAnimationFrame(cb);
  }
  return typeof requestAnimationFrame === 'undefined' ? null : (cb) => requestAnimationFrame(cb);
}

/** `cancelAnimationFrame` of `node`'s window (the pair of {@link rafOf}); a no-op where there is none. */
export function cancelRafOf(node: MaybeNode): (handle: number) => void {
  if (inOtherWindow(node)) {
    const win = winOf(node)!;
    if (typeof win.cancelAnimationFrame === 'function') return (h) => win.cancelAnimationFrame(h);
  }
  return typeof cancelAnimationFrame === 'undefined' ? () => {} : (h) => cancelAnimationFrame(h);
}

/**
 * A `ResizeObserver` built from `node`'s own window, so it observes nodes of that document
 * reliably. It does not observe anything yet. Falls back to the main window's constructor when
 * that window has none; null where neither exists (the server).
 */
export function resizeObserverFor(node: MaybeNode, callback: ResizeObserverCallback): ResizeObserver | null {
  if (inOtherWindow(node)) {
    const Ctor = (winOf(node) as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof Ctor === 'function') return new Ctor(callback);
  }
  return typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(callback);
}
