/**
 * @file PopOutWindows.tsx
 * @description The pop-out windows' content (7.12.0): per open window, a portal into the child's
 * `<body>` with the library's frame (icon, title, "Return to desktop") and the panel's slot. The
 * slot is the one a tab or a floating window uses, so the panel's preserved element moves into
 * the child window and back without remounting. The windows themselves belong to the workspace
 * client (`core/popOutWindows.ts`); this only renders them.
 */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManagerState, useFormatMessage, formatLabel, usePredefinedMessages, useRegistry } from '../WindowManagerContext';
import { optionsFor } from '../../core/panelOptions';
import type { PopOutEntry, PopOutWindows as PopOutStore } from '../../core/popOutWindows';
import { usePanelHost } from './panelHost';
import { PreservedDOMWrapper } from './panelMount';
import { DefaultGridIcon } from './icons';

const NONE: readonly PopOutEntry[] = [];
const noWindows = (): readonly PopOutEntry[] => NONE;

// The window's essential layout, inline: the library's stylesheet is not in the child window yet
// (S3 copies it), and without it a panel that fills its slot (height: 100%) would be 0 px tall.
// The classes stay, for that stylesheet to style the frame once it is there.
const FRAME_STYLE: React.CSSProperties = { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' };
const HEADER_STYLE: React.CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', gap: 6 };
const TITLE_STYLE: React.CSSProperties = { flex: 'auto', minWidth: 0 };
const BODY_STYLE: React.CSSProperties = { flex: 'auto', minHeight: 0, position: 'relative' };
/** The slot and the panel's own elements inside it fill the frame's body (their sizes are in the stylesheet). */
const FILL = ':scope > .rdd-panel-dom-host, :scope > .rdd-panel-dom-host > .rdd-panel-dom, :scope > .rdd-panel-dom-host > .rdd-panel-dom > .rdd-panel-content';

function setTitle(doc: Document, title: string): void { doc.title = title; }

/** The child page fills its window: no margin, full height. */
function fillWindow(doc: Document): void {
  for (const el of [doc.documentElement, doc.body]) {
    el.style.margin = '0';
    el.style.height = '100%';
  }
}

/** Sizes the slot and the panel's elements to the frame's body while they are in it; undone on return. */
function fillSlot(body: HTMLElement): () => void {
  const els = Array.from(body.querySelectorAll<HTMLElement>(FILL));
  for (const el of els) { el.style.width = '100%'; el.style.height = '100%'; }
  return () => { for (const el of els) { el.style.removeProperty('width'); el.style.removeProperty('height'); } };
}

function setLanguage(doc: Document, lang: string, dir: string): void {
  const html = doc.documentElement;
  if (lang) html.lang = lang;
  html.dir = dir;
}

/** One window's frame and slot, portaled into its document. */
const PopOutWindow: React.FC<{ id: string; doc: Document; onReturn: () => void }> = ({ id, doc, onReturn }) => {
  const panel = useWindowManagerState(s => s.panels[id]);
  const dir = useWindowManagerState(s => s.dir);
  const registry = useRegistry();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const title = panel ? formatLabel(panel.title, formatMessage) : '';
  const shown = !!panel?.poppedOut && panel.state === 'floating';
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // The window's title follows the panel's; its language and direction are the page's.
  useEffect(() => { setTitle(doc, title); }, [doc, title]);
  useEffect(() => { setLanguage(doc, document.documentElement.lang, dir); }, [doc, dir]);
  useEffect(() => { fillWindow(doc); }, [doc]);
  // After the slot's own effect has moved the panel's element in (children's effects run first).
  useEffect(() => (shown && bodyRef.current ? fillSlot(bodyRef.current) : undefined), [shown]);

  if (!shown) return null;
  const options = optionsFor(registry, panel);
  const returnLabel = formatLabel(messages.returnToDesktop, formatMessage);
  return createPortal(
    <div className="rdd-popout-frame" data-rdd-popout={id} dir={dir} style={FRAME_STYLE}>
      <div className="rdd-popout-frame__header" style={HEADER_STYLE}>
        <span className="rdd-popout-frame__icon">{panel.icon ?? (options?.icon || DefaultGridIcon)}</span>
        <span className="rdd-popout-frame__title" style={TITLE_STYLE}>{title}{panel.dirty ? ' *' : ''}</span>
        <button type="button" className="rdd-popout-frame__return" title={returnLabel} onClick={onReturn}>
          {returnLabel}
        </button>
      </div>
      <div className="rdd-popout-frame__body" style={BODY_STYLE} ref={bodyRef}>
        <PreservedDOMWrapper panelId={id} />
      </div>
    </div>,
    doc.body,
  );
};

/** Every open pop-out window of this provider's workspace. */
export const PopOutWindows: React.FC<{ windows: PopOutStore }> = ({ windows }) => {
  const panelHost = usePanelHost();
  const entries = useSyncExternalStore(windows.subscribe, windows.getSnapshot, noWindows);

  // The windows take the element back into this document, and size themselves over it.
  useEffect(() => windows.bindHost({
    park(id) {
      const el = panelHost.getElement(id);
      if (el) panelHost.park(el);
    },
    rectOf(id) {
      const r = panelHost.getElement(id)?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    },
  }), [windows, panelHost]);

  return (
    <>
      {entries.map(e => (e.doc
        ? <PopOutWindow key={e.key} id={e.id} doc={e.doc} onReturn={() => windows.returnPanel(e.id)} />
        : null))}
    </>
  );
};
