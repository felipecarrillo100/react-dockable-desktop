/**
 * @file popOutWindows.ts
 * @description A workspace's pop-out windows (7.12.0): a panel shown in its own browser window.
 * Internal: the public face is `workspace.popOutPanel` / `workspace.returnPanel`.
 *
 * The workspace client owns the windows, because `window.open` must run synchronously inside the
 * user's click, outside React. The store marks the panel (`PanelInfo.poppedOut`, a floating panel
 * whose frame the workspace doesn't draw); the provider subscribes here and renders, per window,
 * the library's frame and a slot into the child's `<body>`, which the panel's preserved element
 * moves into. Nothing remounts.
 *
 * Every way back ends in one function, {@link PopOutWindows.returnPanel}'s core: the frame's
 * button, the app's call, the child's `pagehide` (the element is moved back to the main document
 * inside the handler, before the child's document goes), a `closed` poll as a backstop, and the
 * main page's own `pagehide`. A panel that stops being a popped-out floating panel some other way
 * (closed, docked or minimized by the app, dropped by `loadLayout`) closes its window too: the
 * windows follow the store, never the other way round.
 */
import type { PopOutResult, WorkspaceCore } from '../types';
import type { PanelRegistry } from '../components/PanelRegistry';
import { optionsFor } from './panelOptions';
import { registerDocument } from '../utils/documentRegistry';

/** The initial document's URL, which a window shows until the app's page replaces it. */
const BLANK = 'about:blank';
/** How often a window is checked for having closed without a `pagehide` (a backstop). */
const CLOSED_POLL_MS = 500;
/**
 * How long the app's page (`popoutUrl`) may take to load. Past it, or when the page can't be read
 * (another origin, or a redirect off this one), the panel comes back and the window closes.
 */
export const POPOUT_LOAD_TIMEOUT_MS = 10_000;

/** Distinguishes the windows of one page: two workspaces can have the same panel id. */
let windowCount = 0;
const pageKey = Math.random().toString(36).slice(2, 8);

/** @internal What the provider lends the windows: the panel's element, where it is and how to take it back. */
export interface PopOutHost {
  /** Moves the panel's element back into the main document, now. */
  park(id: string): void;
  /** The panel's box on the main page, or null when it isn't shown. */
  rectOf(id: string): { left: number; top: number; width: number; height: number } | null;
}

/** @internal One open window, as the provider renders it. `doc` is null until its page has loaded. */
export interface PopOutEntry {
  /** This window's own name: unique per window opened, so a re-opened panel renders afresh. */
  readonly key: string;
  readonly id: string;
  readonly win: Window;
  readonly doc: Document | null;
}

/** @internal A workspace's pop-out windows: what `WorkspaceClient` and the provider use. */
export interface PopOutWindows {
  /** See `WorkspaceClient.popOutPanel`. */
  popOut(id: string): PopOutResult;
  /** See `WorkspaceClient.returnPanel`. */
  returnPanel(id: string): { ok: boolean };
  /** Whether the user may pop this panel out now (the menu item's rule). */
  canPopOut(id: string): boolean;
  /** Whether the workspace was created with `popOut: true`. */
  readonly enabled: boolean;
  /** The app's page for a pop-out (`<DockableDesktopProvider popoutUrl>`); a blank window without one. */
  setUrl(url: string | undefined): void;
  /** The provider lends its panel host; returns the function that takes it back. */
  bindHost(host: PopOutHost): () => void;
  /** For `useSyncExternalStore`: the open windows, a new array whenever they change. */
  subscribe(cb: () => void): () => void;
  getSnapshot(): readonly PopOutEntry[];
}

interface Entry {
  /** `panel:popped-out` was sent (the page is ready and the panel out), so `panel:returned` follows. */
  announced?: boolean;
  key: string;
  id: string;
  win: Window;
  doc: Document | null;
  /** Removes the window's listeners and timers, and unregisters its document. */
  stop: () => void;
}

const refuse = (reason: Extract<PopOutResult, { ok: false }>['reason']): PopOutResult => ({ ok: false, reason });

/** Whether the window's document can be read (same origin), without throwing. */
function readable(win: Window): boolean {
  try { return !!win.document; } catch { return false; }
}

/**
 * The window's document once its page has loaded, else null; throws when it can't be read. With
 * no page of the app's (`blank`), the window's own initial document, as soon as it has a body:
 * opened with an empty URL, nothing replaces it. Otherwise the app's page, once the initial blank
 * document has been replaced and has loaded.
 */
function loadedDocument(win: Window, blank: boolean): Document | null {
  const doc = win.document;
  if (!doc?.body) return null;
  if (blank) return doc;
  return doc.URL !== BLANK && doc.readyState === 'complete' ? doc : null;
}

/** The user is in a click or key press, as far as the browser can tell (no API: assume so). */
function hasGesture(): boolean {
  if (typeof navigator === 'undefined') return true;
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation?.isActive !== false;
}

export function createPopOutWindows(core: WorkspaceCore, registry: PanelRegistry, enabled: boolean): PopOutWindows {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: readonly PopOutEntry[] = [];
  let url: string | undefined;
  /** The provider's panel host, while one is mounted (one provider per workspace). */
  let currentHost: PopOutHost | null = null;
  const host = (): PopOutHost | null => currentHost;
  let warnedDisabled = false;

  const emit = () => {
    snapshot = Array.from(entries.values(), ({ key, id, win, doc }) => ({ key, id, win, doc }));
    listeners.forEach(l => l());
  };

  const panelOf = (id: string) => core.getSnapshot().panels[id];

  const canPopOut = (id: string): boolean => {
    if (!enabled) return false;
    const panel = panelOf(id);
    return !!panel && !panel.owner && optionsFor(registry, panel)?.canPopOut === true;
  };

  // The main page going away closes every child window, each panel back where it was (P1).
  const onMainPageHide = () => { for (const id of [...entries.keys()]) back(id, true); };
  const watchMainPage = (on: boolean) => {
    if (typeof window === 'undefined') return;
    if (on) window.addEventListener('pagehide', onMainPageHide);
    else window.removeEventListener('pagehide', onMainPageHide);
  };

  /**
   * The one way back: the element returns to the main document first, then the window closes and
   * the store clears the flag (`restorePlace`: a docked panel goes back into its group). Returns
   * false when the panel has no window.
   */
  const back = (id: string, restorePlace: boolean): boolean => {
    const entry = entries.get(id);
    if (!entry) return false;
    entries.delete(id);
    try { host()?.park(id); } catch { /* the slot will park it when it unmounts */ }
    entry.stop();
    try { if (!entry.win.closed) entry.win.close(); } catch { /* already gone */ }
    if (entries.size === 0) watchMainPage(false);
    core.actions.clearPoppedOut(id, restorePlace);
    emit();
    if (entry.announced && core.getSnapshot().panels[id]) core.actions.publish('panel:returned', { id });
    return true;
  };

  /** Sends `panel:popped-out` once the panel is out and its window's page is ready. */
  const announce = (entry: Entry) => {
    if (entry.announced || !entry.doc || entries.get(entry.id) !== entry || !core.getSnapshot().panels[entry.id]?.poppedOut) return;
    entry.announced = true;
    core.actions.publish('panel:popped-out', { id: entry.id, window: entry.win });
  };

  /**
   * A page that fails after `popOutPanel` returned `ok` (it can't be read, or doesn't load in
   * time): the panel comes back and the window closes.
   */
  const fail = (id: string, why: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[react-dockable-desktop] The pop-out window of "${id}" ${why}; the panel is back on the page. popoutUrl must be a page of this origin.`);
    }
    back(id, true);
  };

  /** Waits for the window's page (its `load`), then listens for it going away; polls for a silent close. */
  const watch = (entry: Entry, blank: boolean) => {
    const { id, win } = entry;
    const undo: (() => void)[] = [];
    entry.stop = () => undo.splice(0).forEach(f => f());
    /** Whether this entry is still the open window of its panel (a timer may outlive it). */
    const live = () => entries.get(id) === entry;
    /** While the app's page is awaited: checks whether it is ready (set below). */
    let checkReady: (() => void) | null = null;
    // First, so a page that fails at once (below) stops it too. Each tick also checks whether the
    // app's page is ready, so a missed `load` event doesn't leave the panel waiting.
    const closed = setInterval(() => {
      if (!live()) return;
      if (win.closed) back(id, true);
      else checkReady?.();
    }, CLOSED_POLL_MS);
    undo.push(() => clearInterval(closed));
    const attach = (doc: Document) => {
      entry.doc = doc;
      const onHide = () => { back(id, true); };
      win.addEventListener('pagehide', onHide);
      undo.push(() => { try { win.removeEventListener('pagehide', onHide); } catch { /* gone */ } });
      // Menus, Escape and click-to-activate listen there too (S1).
      undo.push(registerDocument(doc));
    };
    /** Attaches if the page is ready; true once attached or given up. */
    const tryAttach = (): boolean => {
      let doc: Document | null;
      try { doc = loadedDocument(win, blank); } catch { fail(id, 'shows a page this one cannot reach'); return true; }
      if (!doc) return false;
      attach(doc);
      return true;
    };
    if (!tryAttach()) {
      const onLoad = () => {
        if (!live() || entry.doc) return;
        if (tryAttach() && live()) { stopWaiting(); emit(); announce(entry); }
      };
      const timer = setTimeout(() => { if (live() && !entry.doc) fail(id, `did not load within ${POPOUT_LOAD_TIMEOUT_MS / 1000} s`); }, POPOUT_LOAD_TIMEOUT_MS);
      checkReady = onLoad;
      const stopWaiting = () => {
        checkReady = null;
        clearTimeout(timer);
        try { win.removeEventListener('load', onLoad); } catch { /* gone */ }
      };
      // The window object outlives its initial blank document on a same-origin page load.
      win.addEventListener('load', onLoad);
      undo.push(stopWaiting);
    }
  };

  /** The window's place and size: over the panel where it is now, in screen coordinates. */
  const featuresFor = (id: string): string => {
    const r = host()?.rectOf(id) ?? null;
    const w = window;
    const width = Math.max(320, Math.round(r?.width || 640));
    const height = Math.max(240, Math.round(r?.height || 480));
    const chromeTop = Math.max(0, (w.outerHeight || 0) - (w.innerHeight || 0));
    // Not clamped: a second monitor left of or above the primary one has negative coordinates.
    const left = Math.round((w.screenX || 0) + (r?.left ?? 100));
    const top = Math.round((w.screenY || 0) + chromeTop + (r?.top ?? 100));
    return `popup=yes,left=${left},top=${top},width=${width},height=${height}`;
  };

  const popOut = (id: string): PopOutResult => {
    if (!enabled) {
      if (process.env.NODE_ENV === 'development' && !warnedDisabled) {
        warnedDisabled = true;
        console.warn(
          `[react-dockable-desktop] popOutPanel("${id}") was refused: this workspace was created ` +
          `without popOut. Pass createWorkspace({ popOut: true }) to let panels open in their own window.`
        );
      }
      return refuse('disabled');
    }
    const panel = panelOf(id);
    if (!panel) return refuse('not-open');
    // A widget's panel (7.11.0) goes through the widget's own move, in a later release.
    if (panel.owner || optionsFor(registry, panel)?.canPopOut !== true) return refuse('not-allowed');
    const open = entries.get(id);
    if (open && panel.poppedOut) {
      try { open.win.focus(); } catch { /* best effort */ }
      return { ok: true };
    }
    if (!hasGesture()) return refuse('no-gesture');
    // No provider mounted (yet, or any more): nothing would show the panel there.
    if (!currentHost) return refuse('no-window');

    // No page of the app's: an empty URL, so the window keeps its initial document (an
    // `about:blank` URL may replace it with a new one after this returns, in Firefox).
    const target = url ?? '';
    const name = `rdd-popout-${id}-${pageKey}-${++windowCount}`;
    let win: Window | null;
    try {
      // A name of its own per window: another workspace's panel, or a window left by a reload of
      // this page, may have the same id.
      win = window.open(target, name, featuresFor(id));
    } catch {
      win = null;
    }
    if (!win) return refuse('blocked');
    if (win.closed || !readable(win)) {
      try { win.close(); } catch { /* gone */ }
      return refuse('no-window');
    }

    const entry: Entry = { key: name, id, win, doc: null, stop: () => {} };
    entries.set(id, entry);
    if (entries.size === 1) watchMainPage(true);
    watch(entry, target === '');
    if (!entries.has(id)) return refuse('no-window');   // its page failed at once
    if (!core.actions.setPoppedOut(id)) {
      back(id, false);
      return refuse('not-open');
    }
    emit();
    announce(entry);
    return { ok: true };
  };

  // The windows follow the store: a panel that is no longer a popped-out floating panel (closed,
  // docked or minimized from code, or replaced by loadLayout) loses its window.
  core.subscribeToState(() => {
    if (entries.size === 0) return;
    const { panels } = core.getSnapshot();
    for (const id of [...entries.keys()]) {
      const p = panels[id];
      if (!p || !p.poppedOut || p.state !== 'floating') back(id, false);
    }
  });

  return {
    enabled,
    popOut,
    returnPanel: (id) => ({ ok: back(id, true) }),
    canPopOut,
    setUrl: (next) => { url = next || undefined; },
    bindHost(next) {
      currentHost = next;
      return () => {
        if (currentHost !== next) return;
        // The provider unmounting (a route change) brings every panel back while it can still take
        // the element: no window is left showing nothing.
        for (const id of [...entries.keys()]) back(id, true);
        currentHost = null;
      };
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    getSnapshot: () => snapshot,
  };
}
