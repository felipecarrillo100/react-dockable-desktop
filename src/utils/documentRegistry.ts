/**
 * @file documentRegistry.ts
 * @description The documents that hold panel content (7.12.0 groundwork for pop-out windows).
 * Internal: not exported from the package.
 *
 * Document-wide listeners the library needs wherever panel content is — the Escape stack and
 * click-to-activate — are attached through {@link listenOnDocuments}: on the main document, as
 * before, and on every document registered with {@link registerDocument}. A pop-out registers its
 * child document when it opens and calls the returned function when it closes; listeners follow,
 * added to a document on its first registration and removed on its last.
 */

interface Subscription {
  type: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
}

/** Registered documents other than the main one, with their registration counts. */
const counts = new Map<Document, number>();
const subscriptions = new Set<Subscription>();

const mainDocument = (): Document | null => (typeof document === 'undefined' ? null : document);

/** The main document and every registered one. */
function documents(): Document[] {
  const main = mainDocument();
  const others = Array.from(counts.keys()).filter(d => d !== main);
  return main ? [main, ...others] : others;
}

const attach = (doc: Document, s: Subscription) => doc.addEventListener(s.type, s.listener, s.options);
const detach = (doc: Document, s: Subscription) => doc.removeEventListener(s.type, s.listener, s.options);

/**
 * Adds `doc` to the documents the library listens on. Counted: a document registered twice stays
 * until both registrations are undone. Registering the main document has no effect (it is always
 * listened on). Returns the function that undoes this registration; calling it again does nothing.
 */
export function registerDocument(doc: Document): () => void {
  const isMain = doc === mainDocument();
  if (!isMain) {
    const n = counts.get(doc) ?? 0;
    counts.set(doc, n + 1);
    if (n === 0) subscriptions.forEach(s => attach(doc, s));
  }
  let done = false;
  return () => {
    if (done || isMain) return;
    done = true;
    const n = counts.get(doc) ?? 0;
    if (n <= 1) {
      counts.delete(doc);
      subscriptions.forEach(s => detach(doc, s));
    } else {
      counts.set(doc, n - 1);
    }
  };
}

/**
 * Listens for `type` on the main document and every registered document, now and as documents
 * come and go. Returns the function that removes the listener from all of them.
 */
export function listenOnDocuments<K extends keyof DocumentEventMap>(
  type: K,
  listener: (e: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const s: Subscription = { type, listener: listener as EventListener, options };
  subscriptions.add(s);
  documents().forEach(d => attach(d, s));
  return () => {
    if (!subscriptions.delete(s)) return;
    documents().forEach(d => detach(d, s));
  };
}
