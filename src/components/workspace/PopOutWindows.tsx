/**
 * @file PopOutWindows.tsx
 * @description The pop-out windows' content (7.12.0): per open window, a portal into the child's
 * `<body>` with the library's frame (icon, title, "Return to desktop") and the panel's slot. The
 * slot is the one a tab or a floating window uses, so the panel's preserved element moves into
 * the child window and back without remounting. The windows themselves belong to the workspace
 * client (`core/popOutWindows.ts`); this only renders them.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManagerState, useWindowManagerActionsInternal, useFormatMessage, formatLabel, usePredefinedMessages, useRegistry } from '../WindowManagerContext';
import { initialFocusFor } from './helpers';
import { optionsFor } from '../../core/panelOptions';
import type { PopOutEntry, PopOutWindows as PopOutStore } from '../../core/popOutWindows';
import { usePanelHost } from './panelHost';
import { PreservedDOMWrapper } from './panelMount';
import { DefaultGridIcon } from './icons';
import { startPopOutStyles } from '../../core/popOutStyles';

const NONE: readonly PopOutEntry[] = [];
const noWindows = (): readonly PopOutEntry[] => NONE;

// The window's minimum layout, inline: the frame fills the window and the panel fills the frame's
// body, so its content stays usable if the copied stylesheet never arrives. The rest of the
// frame's look is in the stylesheet (26a-popout.css), which the window gets from the page (S3).
const FRAME_STYLE: React.CSSProperties = { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' };
/** ...hidden until the copied stylesheets have loaded, rather than flash unstyled. */
const HIDDEN_FRAME_STYLE: React.CSSProperties = { ...FRAME_STYLE, visibility: 'hidden' };
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

/** The workspace's direction on the window's `<html>` when the page's sets none (the page's own is mirrored). */
function setDirection(doc: Document, dir: string): void {
  if (!document.documentElement.hasAttribute('dir')) doc.documentElement.dir = dir;
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
  const frameRef = useRef<HTMLDivElement | null>(null);
  const panelHost = usePanelHost();
  const actions = useWindowManagerActionsInternal();
  const [styled, setStyled] = useState(false);

  // The window's title follows the panel's; its language and direction are the page's.
  useEffect(() => { setTitle(doc, title); }, [doc, title]);
  useEffect(() => { setDirection(doc, dir); }, [doc, dir]);
  // The page's styles, <html>/<body> and the workspace's scope, kept in step while it is out (S3).
  useEffect(() => {
    const frame = frameRef.current;
    if (!shown || !frame) return;
    return startPopOutStyles({ child: doc, frame, scope: panelHost.getWorkspaceElement(), onReady: () => setStyled(true) });
  }, [shown, doc, panelHost]);
  useEffect(() => { fillWindow(doc); }, [doc]);
  // After the slot's own effect has moved the panel's element in (children's effects run first).
  useEffect(() => (shown && bodyRef.current ? fillSlot(bodyRef.current) : undefined), [shown]);

  if (!shown) return null;
  const options = optionsFor(registry, panel);
  // A managed widget's panel (S5): back into its panel, and its title icon opens its own titleMenu.
  const hosted = !!panel.owner;
  const returnLabel = formatLabel(hosted ? messages.backIntoPanel : messages.returnToDesktop, formatMessage);
  const icon = panel.icon ?? (options?.icon || DefaultGridIcon);
  const openWidgetMenu = (e: React.MouseEvent) => {
    const items = actions.getPanelContextMenuItems(id);
    if (items.length > 0) actions.showContextMenu({ event: e, items, initialFocus: initialFocusFor(e) });
  };
  return createPortal(
    // `rdd-workspace` too: what is scoped to the workspace (its colours, scrollbars) applies here.
    <div ref={frameRef} className="rdd-workspace rdd-popout-frame" data-rdd-popout={id} dir={dir} style={styled ? FRAME_STYLE : HIDDEN_FRAME_STYLE}>
      <div className="rdd-popout-frame__header">
        {hosted && actions.getPanelContextMenuItems(id).length > 0
          ? <button type="button" className="rdd-popout-frame__icon rdd-popout-frame__icon--menu" aria-haspopup="menu" aria-label={title} onClick={openWidgetMenu}>{icon}</button>
          : <span className="rdd-popout-frame__icon">{icon}</span>}
        <span className="rdd-popout-frame__title">{title}{panel.dirty ? ' *' : ''}</span>
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
