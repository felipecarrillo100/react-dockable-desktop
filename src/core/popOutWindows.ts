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
import { isShownInGrid } from './layoutTree';
import { isParked } from '../components/domMove';
import { POPOUT_STYLES_TIMEOUT_MS } from './popOutStyles';

/** The initial document's URL, which a window shows until the app's page replaces it. */
const BLANK = 'about:blank';
/** How often a window is checked for having closed without a `pagehide` (a backstop). */
const CLOSED_POLL_MS = 500;
/**
 * How long the app's page (`popoutUrl`) may take to load. Past it, or when the page can't be read
 * (another origin, or a redirect off this one), the panel comes back and the window closes.
 */
export const POPOUT_LOAD_TIMEOUT_MS = 10_000;
/**
 * How long `panel:popped-out` / `panel:returned` wait for the panel to be in its new place (7.12.0):
 * past it they are sent anyway. Longer than a pop-out's styles may take, which hide its frame.
 */
export const POPOUT_PLACED_TIMEOUT_MS: number = POPOUT_STYLES_TIMEOUT_MS + 1000;

/** Distinguishes the windows of one page: two workspaces can have the same panel id. */
let windowCount = 0;
const pageKey = Math.random().toString(36).slice(2, 8);

/** @internal What the provider lends the windows: the panel's element, where it is and how to take it back. */
export interface PopOutHost {
  /** Moves the panel's element back into the main document, now. */
  park(id: string): void;
  /** The panel's box on the main page, or null when it isn't shown. */
  rectOf(id: string): { left: number; top: number; width: number; height: number } | null;
  /** The panel's element, or null when it has none (7.12.0): where it is decides when the events are sent. */
  element(id: string): Element | null;
}

/** @internal One open window, as the provider renders it. `doc` is null until its page has loaded. */
export interface PopOutEntry {
  /** This window's own name: unique per window opened, so a re-opened panel renders afresh. */
  readonly key: string;
  readonly id: string;
  readonly win: Window;
  readonly doc: Document | null;
}

/**
 * @internal What a managed widget's overlay lends for its hosted panel (7.12.0, S5): the panel is
 * popped out through the widget (it may have to leave its panel first), and comes back into the
 * panel when its window closes (D17).
 */
export interface HostedPopOut {
  /** `popOutPanel(hostedId)`: the widget's own `popOut()`. */
  popOut(): PopOutResult;
  /** Its window is closing to bring it back (not a move from code): before the element moves. */
  returning(): void;
  /** ...and it is out of the window: the widget goes back into its panel. */
  returned(): void;
}

/** @internal How a hosted panel is popped out: the widget has checked its own rules. */
export interface HostedPopOutOptions {
  /** Called once the window is open, before the panel moves in: takes the widget out of its panel if needed. */
  prepare: () => boolean;
  /** Where the widget is on the main page (client pixels), for the window's place and size. */
  rect?: { left: number; top: number; width: number; height: number } | null;
}

/** @internal A workspace's pop-out windows: what `WorkspaceClient` and the provider use. */
export interface PopOutWindows {
  /** See `WorkspaceClient.popOutPanel`. With `hosted`, a managed widget's own pop-out (S5). */
  popOut(id: string, hosted?: HostedPopOutOptions): PopOutResult;
  /** Brings a panel's window forward, best effort (7.12.0, S6); false when it has none. */
  focusWindow(id: string): boolean;
  /** Lends a hosted panel's widget rules; returns the function that takes them back. */
  registerHosted(panelId: string, hosted: HostedPopOut): () => void;
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
  /** `panel:popping-out` was sent, so `panel:returned` follows when it comes back (or the window fails). */
  leaving?: boolean;
  /** `panel:popped-out` was sent (the panel is laid out in the window), so `panel:returning` comes first on the way back. */
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

  /** Hosted panels' widgets, by panel id (S5). */
  const hostedRouters = new Map<string, HostedPopOut>();

  /** Per panel, bumped by each pop-out and each return: an event waiting for an older one is dropped. */
  const epochs = new Map<string, number>();
  const bump = (id: string) => { epochs.set(id, (epochs.get(id) ?? 0) + 1); };

  /** Whether the panel's state shows it on the page (floating, or the selected tab of its group). */
  const shownOnPage = (id: string): boolean => {
    const { panels, gridRoot } = core.getSnapshot();
    const p = panels[id];
    if (!p || p.poppedOut) return false;
    return p.state === 'floating' || (p.state === 'docked' && isShownInGrid(gridRoot, id));
  };

  /**
   * Whether the panel's element is in its new place in `doc`: in the window's frame, shown (its
   * styles are ready), for a pop-out; in a slot of the page, not parked, for a return (a panel that
   * comes back hidden, a tab not selected or minimized, is in its place parked). No element (no
   * provider any more, or a widget's panel gone with its widget back in its panel): nothing to wait for.
   */
  const placed = (id: string, doc: Document, out: boolean): boolean => {
    const el = host()?.element(id);
    if (!el) return true;
    if (!el.isConnected || el.ownerDocument !== doc) return false;
    if (out) {
      const frame = el.closest('.rdd-popout-frame') as HTMLElement | null;
      return !!frame && frame.style.visibility !== 'hidden';
    }
    return !shownOnPage(id) || !isParked(el);
  };

  /**
   * Calls `cb` once the panel's element is in its new place in `doc` and one more frame of that
   * window has passed, so its layout (and a `resize()` there) sees the new size (7.12.0). Sent
   * anyway after {@link POPOUT_PLACED_TIMEOUT_MS}; dropped when the panel pops out or returns again
   * meanwhile. Size is not required: a panel back as a hidden tab is 0 x 0.
   */
  const whenPlaced = (id: string, doc: Document, out: boolean, cb: () => void) => {
    const mine = epochs.get(id);
    const view = doc.defaultView;
    const frame = view && typeof view.requestAnimationFrame === 'function'
      ? (f: () => void) => { view.requestAnimationFrame(f); }
      : (f: () => void) => { setTimeout(f, 16); };
    let done = false;
    const stop = () => { done = true; clearTimeout(limit); };
    const finish = () => { if (done) return; stop(); if (epochs.get(id) === mine) cb(); };
    const limit = setTimeout(finish, POPOUT_PLACED_TIMEOUT_MS);
    const tick = () => {
      if (done) return;
      if (epochs.get(id) !== mine) { stop(); return; }
      if (placed(id, doc, out)) frame(finish);
      else frame(tick);
    };
    try { frame(tick); } catch { /* the window is gone: the limit sends it */ }
  };

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
    // A widget's panel coming back (not moved from code): its widget is told first (S5).
    const widget = restorePlace ? hostedRouters.get(id) : undefined;
    entries.delete(id);
    bump(id);
    // Not for a panel closed while out: panel:closed says so.
    const stillOpen = !!core.getSnapshot().panels[id];
    // Before the element leaves the window: only once panel:popped-out was sent.
    if (entry.announced && stillOpen) core.actions.publish('panel:returning', { id });
    widget?.returning();
    try { host()?.park(id); } catch { /* the slot will park it when it unmounts */ }
    entry.stop();
    try { if (!entry.win.closed) entry.win.close(); } catch { /* already gone */ }
    if (entries.size === 0) watchMainPage(false);
    core.actions.clearPoppedOut(id, restorePlace);
    emit();
    // Once it is back in its place and laid out (the provider moves it on its next commit). After a
    // panel:popping-out, also for a window that failed before panel:popped-out.
    if (entry.leaving && stillOpen) whenPlaced(id, document, false, () => core.actions.publish('panel:returned', { id }));
    // ...and it goes back into its panel (D17).
    widget?.returned();
    return true;
  };

  /** Whether the panel is out and its window's page is ready, and `panel:popped-out` is still to be sent. */
  const ready = (entry: Entry) => !entry.announced && !!entry.doc && entries.get(entry.id) === entry && !!core.getSnapshot().panels[entry.id]?.poppedOut;

  /**
   * Shows the window's content (the provider renders the open windows, `emit`), then, once the
   * panel's element is laid out in the window, `panel:popped-out`.
   */
  const show = (entry: Entry) => {
    emit();
    if (!ready(entry)) return;
    whenPlaced(entry.id, entry.doc!, true, () => {
      if (!ready(entry)) return;
      entry.announced = true;
      core.actions.publish('panel:popped-out', { id: entry.id, window: entry.win });
    });
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
        if (tryAttach() && live()) { stopWaiting(); show(entry); }
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
  const featuresFor = (id: string, at?: { left: number; top: number; width: number; height: number } | null): string => {
    const r = at ?? host()?.rectOf(id) ?? null;
    const w = window;
    const width = Math.max(320, Math.round(r?.width || 640));
    const height = Math.max(240, Math.round(r?.height || 480));
    const chromeTop = Math.max(0, (w.outerHeight || 0) - (w.innerHeight || 0));
    // Not clamped: a second monitor left of or above the primary one has negative coordinates.
    const left = Math.round((w.screenX || 0) + (r?.left ?? 100));
    const top = Math.round((w.screenY || 0) + chromeTop + (r?.top ?? 100));
    return `popup=yes,left=${left},top=${top},width=${width},height=${height}`;
  };

  const popOut = (id: string, hosted?: HostedPopOutOptions): PopOutResult => {
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
    if (!hosted) {
      if (!panel) return refuse('not-open');
      // A widget's panel (7.11.0) pops out through the widget, whose rules apply (S5).
      if (panel.owner) return hostedRouters.get(id)?.popOut() ?? refuse('not-allowed');
      if (optionsFor(registry, panel)?.canPopOut !== true) return refuse('not-allowed');
    }
    const open = entries.get(id);
    if (open && panel?.poppedOut) {
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
      win = window.open(target, name, featuresFor(id, hosted?.rect));
    } catch {
      win = null;
    }
    if (!win) return refuse('blocked');
    if (win.closed || !readable(win)) {
      try { win.close(); } catch { /* gone */ }
      return refuse('no-window');
    }
    // A widget still in its panel leaves it now, into its hosted panel; nothing changed before.
    if (hosted && !hosted.prepare()) {
      try { win.close(); } catch { /* gone */ }
      return refuse('not-allowed');
    }

    const entry: Entry = { key: name, id, win, doc: null, stop: () => {} };
    entries.set(id, entry);
    bump(id);
    if (entries.size === 1) watchMainPage(true);
    watch(entry, target === '');
    if (!entries.has(id)) return refuse('no-window');   // its page failed at once
    // Still in the user's click, before the provider renders: the element is in the page, at its
    // size. From here, panel:popped-out or (the window failing) panel:returned follows.
    entry.leaving = true;
    core.actions.publish('panel:popping-out', { id });
    if (!core.actions.setPoppedOut(id)) {
      back(id, false);
      return refuse('not-open');
    }
    show(entry);
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
    focusWindow(id) {
      const entry = entries.get(id);
      if (!entry) return false;
      try { entry.win.focus(); } catch { /* best effort: a browser may refuse */ }
      return true;
    },
    registerHosted(panelId, hostedPopOut) {
      hostedRouters.set(panelId, hostedPopOut);
      return () => { if (hostedRouters.get(panelId) === hostedPopOut) hostedRouters.delete(panelId); };
    },
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
