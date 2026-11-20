/**
 * Document-aware internals (7.12.0 S1, groundwork for pop-out windows). A panel's element can live
 * in a same-origin child window while its code runs in the main window's realm, so the library
 * takes the document and window from the element it acts on. The second window here is an
 * `<iframe>`: jsdom gives it its own document, window and constructors, as a real pop-out has.
 *
 * DA1:  isNode / isElement / isHTMLElement accept a node of another window; instanceof does not
 * DA2:  docOf / winOf: the node's own document and window; the main ones as the fallback
 * DA3:  rafOf / cancelRafOf use the node's window's frames; the global ones for a main node
 * DA4:  resizeObserverFor builds the observer from the node's window's constructor
 * DA5:  registerDocument is counted, and listeners follow registrations
 * DA6:  a context menu opened from another document renders into its body and fits its window
 * DA7:  Escape in a registered document closes the menu; in an unregistered one it does not
 * DA8:  a pointerdown elsewhere in the menu's document closes it; one inside the menu does not
 * DA9:  the context menu records its opener from its own document and hands focus back there
 * DA10: menu arrow keys follow focus in the menu's own document
 * DA11: panel focus is tracked and restored in the root's own document, on its window's frame
 * DA12: a managed widget's drag sets and clears the body class on its own document
 * DA13: the toolbar flyout portals into the button's document and closes on a click there
 * DA14: rtl helpers read the element's own document and window
 * DA15: moveIntoWhenConnected waits on the slot's window's frames
 * DA16: click-to-activate works in a registered document
 * DA17: the panel search dropdown portals into the input's document and fits its window
 * DA18: a panel toolbar measures itself with its own window's ResizeObserver
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { cancelRafOf, docOf, isElement, isHTMLElement, isNode, rafOf, resizeObserverFor, winOf } from '../../utils/domContext';
import { registerDocument } from '../../utils/documentRegistry';
import { ContextMenu, type ContextMenuHandle } from '../ContextMenu';
import { moveMenuFocus } from '../../utils/menuKeyboard';
import { trackPanelDom, restorePanelDom } from '../domPreservation';
import { PanelOverlayRoot, PanelFloatingWindow, PanelToolbar, ToolbarSearchInput } from '../PanelOverlay';
import { ToolbarProvider } from '../ToolbarContext';
import { Toolbar } from '../Toolbar';
import type { ToolbarItem } from '../Toolbar';
import { isComputedRtl, isElementRtl } from '../../utils/rtl';
import { moveIntoWhenConnected, setPreserveEmbeds } from '../domMove';
import { WindowManagerProvider } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import WindowManager from '../WindowManager';
import { WorkspaceClient } from '../../WorkspaceClient';

type AnyWindow = Window & typeof globalThis;

const frames: HTMLIFrameElement[] = [];
const roots: Root[] = [];
const cleanups: (() => void)[] = [];

/** A second window: an iframe with its own document, window and DOM constructors. */
function otherWindow(): { win: AnyWindow; doc: Document } {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  return { win: frame.contentWindow as AnyWindow, doc: frame.contentDocument! };
}

function mount(el: React.ReactElement, container: Element): Root {
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(el); });
  return root;
}

afterEach(() => {
  roots.splice(0).forEach(r => act(() => r.unmount()));
  cleanups.splice(0).forEach(f => f());
  frames.splice(0).forEach(f => f.remove());
  vi.restoreAllMocks();
});

const items = [{ label: 'One', action: () => {} }, { label: 'Two', action: () => {} }];

/** jsdom lays nothing out: a 100x50 box wherever an element's inline left/top put it. */
function boxesFromStyle(win: AnyWindow, at: { left: number; top: number } = { left: 0, top: 0 }) {
  return vi.spyOn(win.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = this.style.left ? parseFloat(this.style.left) : at.left;
    const top = this.style.top ? parseFloat(this.style.top) : at.top;
    return { left, top, right: left + 100, bottom: top + 50, width: 100, height: 50, x: left, y: top, toJSON() {} } as DOMRect;
  });
}

const sized = (win: AnyWindow, w: number, h: number) => {
  Object.defineProperty(win, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: h, configurable: true });
};

/** A context menu in the main React tree, and the handle that opens it. */
function mountMenu(): React.RefObject<ContextMenuHandle | null> {
  const ref = createRef<ContextMenuHandle>();
  const host = document.createElement('div');
  document.body.appendChild(host);
  cleanups.push(() => host.remove());
  mount(<ContextMenu ref={ref} />, host);
  return ref;
}

const openFrom = (ref: React.RefObject<ContextMenuHandle | null>, target: Element, x = 10, y = 10) =>
  act(() => { ref.current!.show({ event: { target, clientX: x, clientY: y } as unknown as MouseEvent, items }); });

describe('DA1: node checks across windows', () => {
  it('accepts a node of another window, where instanceof does not', () => {
    const { doc } = otherWindow();
    const div = doc.createElement('div');
    expect(div instanceof HTMLElement).toBe(false);
    expect(div instanceof Element).toBe(false);
    expect(isNode(div)).toBe(true);
    expect(isElement(div)).toBe(true);
    expect(isHTMLElement(div)).toBe(true);
  });

  it('rejects what is not an element, or not an HTML one', () => {
    const { doc, win } = otherWindow();
    expect(isElement(doc.createTextNode('x'))).toBe(false);
    expect(isNode(doc.createTextNode('x'))).toBe(true);
    expect(isNode(win)).toBe(false);
    expect(isNode(null)).toBe(false);
    expect(isElement({ nodeType: 1 })).toBe(false);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(isElement(svg)).toBe(true);
    expect(isHTMLElement(svg)).toBe(false);
  });
});

describe('DA2: docOf / winOf', () => {
  it("gives the node's own document and window", () => {
    const { doc, win } = otherWindow();
    const div = doc.createElement('div');
    expect(docOf(div)).toBe(doc);
    expect(docOf(doc)).toBe(doc);
    expect(winOf(div)).toBe(win);
    expect(winOf(div)).not.toBe(window);
  });

  it('falls back to the main document and window', () => {
    expect(docOf(null)).toBe(document);
    expect(winOf(undefined)).toBe(window);
    // A document with no window of its own (createHTMLDocument) is shown in none: the main one.
    const loose = document.implementation.createHTMLDocument('x');
    expect(docOf(loose.body)).toBe(loose);
    expect(winOf(loose.body)).toBe(window);
  });
});

describe('DA3: rafOf / cancelRafOf', () => {
  it("uses the node's window's frames", () => {
    const { doc, win } = otherWindow();
    const own = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(7);
    const ownCancel = vi.spyOn(win, 'cancelAnimationFrame').mockImplementation(() => {});
    const main = vi.spyOn(window, 'requestAnimationFrame');
    const el = doc.createElement('div');
    const cb = () => {};
    expect(rafOf(el)!(cb)).toBe(7);
    expect(own).toHaveBeenCalledWith(cb);
    expect(main).not.toHaveBeenCalled();
    cancelRafOf(el)(7);
    expect(ownCancel).toHaveBeenCalledWith(7);
  });

  it('uses the global ones for a node of the main window', () => {
    const main = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(3);
    expect(rafOf(document.body)!(() => {})).toBe(3);
    expect(main).toHaveBeenCalledTimes(1);
  });
});

describe('DA4: resizeObserverFor', () => {
  it("builds the observer from the node's window's constructor", () => {
    const { doc, win } = otherWindow();
    const built: ResizeObserverCallback[] = [];
    class OwnObserver { constructor(cb: ResizeObserverCallback) { built.push(cb); } observe() {} unobserve() {} disconnect() {} }
    (win as unknown as { ResizeObserver: unknown }).ResizeObserver = OwnObserver;
    const cb: ResizeObserverCallback = () => {};
    const ro = resizeObserverFor(doc.createElement('div'), cb);
    expect(ro).toBeInstanceOf(OwnObserver);
    expect(built).toEqual([cb]);
    // A main-window node keeps the global one.
    expect(resizeObserverFor(document.body, cb)).not.toBeInstanceOf(OwnObserver);
  });

  it("falls back to the main window's when the node's window has none", () => {
    const { doc } = otherWindow();
    expect(resizeObserverFor(doc.createElement('div'), () => {})).toBeInstanceOf(ResizeObserver);
  });
});

describe('DA5: registerDocument', () => {
  it('is counted, and a listener follows registrations', async () => {
    const { listenOnDocuments } = await import('../../utils/documentRegistry');
    const { doc, win } = otherWindow();
    const add = vi.spyOn(doc, 'addEventListener');
    const remove = vi.spyOn(doc, 'removeEventListener');
    const seen: Event[] = [];
    const stop = listenOnDocuments('keydown', e => seen.push(e));
    const press = () => doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    press();
    expect(seen).toHaveLength(0);                   // not registered yet
    const first = registerDocument(doc);
    const second = registerDocument(doc);
    expect(add).toHaveBeenCalledTimes(1);           // attached once, on the first registration
    press();
    expect(seen).toHaveLength(1);
    first();
    first();                                        // undoing one registration twice does nothing
    expect(remove).not.toHaveBeenCalled();
    press();
    expect(seen).toHaveLength(2);
    second();
    expect(remove).toHaveBeenCalledTimes(1);
    press();
    expect(seen).toHaveLength(2);

    // A listener added while a document is registered reaches it; stopping removes it.
    const again = registerDocument(doc);
    const late: Event[] = [];
    const stopLate = listenOnDocuments('keydown', e => late.push(e));
    press();
    expect(late).toHaveLength(1);
    stopLate();
    press();
    expect(late).toHaveLength(1);
    again();
    stop();
  });

  it('registering the main document changes nothing', async () => {
    const { listenOnDocuments } = await import('../../utils/documentRegistry');
    const seen: Event[] = [];
    const stop = listenOnDocuments('keydown', e => seen.push(e));
    const undo = registerDocument(document);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    undo();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(seen).toHaveLength(2);                   // still listened on after the undo
    stop();
  });
});

describe('DA6: a context menu opened from another document', () => {
  it('renders into that body and fits that window', () => {
    const { doc, win } = otherWindow();
    const anchor = doc.createElement('button');
    doc.body.appendChild(anchor);
    sized(win, 300, 200);
    boxesFromStyle(win, { left: 20, top: 20 });
    const ref = mountMenu();
    openFrom(ref, anchor, 280, 10);
    const menu = doc.body.querySelector<HTMLElement>('.rdd-context-menu');
    expect(menu).not.toBeNull();
    expect(document.body.querySelector('.rdd-context-menu')).toBeNull();
    // Clamped to the other window's 300px (the main one is 1024 wide): 300 - 100 - 8.
    expect(menu!.style.left).toBe('192px');
  });

  it('opened from the keyboard, sits at its target and takes its direction', () => {
    const { doc, win } = otherWindow();
    boxesFromStyle(win, { left: 40, top: 10 });     // the target: 40..140 x 10..60
    vi.spyOn(win, 'getComputedStyle').mockReturnValue({ direction: 'rtl' } as CSSStyleDeclaration);
    const anchor = doc.createElement('button');
    doc.body.appendChild(anchor);
    const ref = mountMenu();
    openFrom(ref, anchor, 0, 0);                    // ContextMenu key: no pointer position
    const menu = doc.body.querySelector<HTMLElement>('.rdd-context-menu')!;
    expect(menu.style.left).toBe('40px');
    expect(menu.style.top).toBe('60px');
    expect(menu.getAttribute('dir')).toBe('rtl');
  });

  it('opens its submenu there, from the item focused there', () => {
    const { doc, win } = otherWindow();
    const ref = mountMenu();
    act(() => {
      ref.current!.show({
        event: { target: doc.body, clientX: 10, clientY: 10 } as unknown as MouseEvent,
        items: [{ label: 'More', items: [{ label: 'Inner', action: () => {} }] }],
      });
    });
    const parent = doc.body.querySelector<HTMLElement>('.rdd-context-menu__item--has-submenu')!;
    parent.focus();
    act(() => { parent.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    const sub = doc.body.querySelector('.rdd-context-menu--submenu');
    expect(sub).not.toBeNull();
    expect(document.body.querySelector('.rdd-context-menu--submenu')).toBeNull();
    expect(doc.activeElement?.textContent).toContain('Inner');
  });

  it('stays on the main body when opened from the main document', () => {
    const ref = mountMenu();
    openFrom(ref, document.body);
    expect(document.body.querySelector('.rdd-context-menu')).not.toBeNull();
  });
});

describe('DA7: Escape in another document', () => {
  it('closes the menu when that document is registered', () => {
    const { doc, win } = otherWindow();
    const ref = mountMenu();
    const escape = () => act(() => {
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    openFrom(ref, doc.body);
    escape();
    expect(doc.body.querySelector('.rdd-context-menu')).not.toBeNull();  // not registered: unheard

    const undo = registerDocument(doc);
    cleanups.push(undo);
    escape();
    expect(doc.body.querySelector('.rdd-context-menu')).toBeNull();
  });
});

describe('DA8: outside clicks in the menu document', () => {
  it('a pointerdown elsewhere there closes it; one inside does not', () => {
    const { doc, win } = otherWindow();
    const ref = mountMenu();
    const elsewhere = doc.createElement('div');
    doc.body.appendChild(elsewhere);
    openFrom(ref, elsewhere);
    const menu = doc.body.querySelector('.rdd-context-menu')!;
    act(() => { menu.querySelector('button')!.dispatchEvent(new win.Event('pointerdown', { bubbles: true })); });
    expect(doc.body.querySelector('.rdd-context-menu')).not.toBeNull();
    act(() => { elsewhere.dispatchEvent(new win.Event('pointerdown', { bubbles: true })); });
    expect(doc.body.querySelector('.rdd-context-menu')).toBeNull();
  });
});

describe('DA9: the opener in another document', () => {
  it('gets focus back when the menu closes from inside', () => {
    const { doc, win } = otherWindow();
    const opener = doc.createElement('button');
    doc.body.appendChild(opener);
    opener.focus();
    expect(doc.activeElement).toBe(opener);
    // The main document has focus elsewhere: it must not count.
    const mainInput = document.createElement('input');
    document.body.appendChild(mainInput);
    cleanups.push(() => mainInput.remove());
    mainInput.focus();

    const ref = mountMenu();
    openFrom(ref, opener);
    const menu = doc.body.querySelector<HTMLElement>('.rdd-context-menu')!;
    expect(doc.activeElement).toBe(menu);
    act(() => { menu.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
    expect(doc.body.querySelector('.rdd-context-menu')).toBeNull();
    expect(doc.activeElement).toBe(opener);
  });
});

describe('DA10: menu arrow keys in another document', () => {
  it("move from the item focused in the menu's own document", () => {
    const { doc } = otherWindow();
    const menu = doc.createElement('div');
    for (const n of ['a', 'b', 'c']) {
      const item = doc.createElement('button');
      item.setAttribute('role', 'menuitem');
      item.textContent = n;
      menu.appendChild(item);
    }
    doc.body.appendChild(menu);
    const [, b, c] = Array.from(menu.children) as HTMLElement[];
    b.focus();
    expect(moveMenuFocus(menu, 'ArrowDown')).toBe(true);
    expect(doc.activeElement).toBe(c);
  });
});

describe('DA11: panel focus restore in another document', () => {
  it("tracks focus there, and restores it when the root's own document lost it", () => {
    const { doc, win } = otherWindow();
    // jsdom lays nothing out: report the nodes as on screen.
    vi.spyOn(win.Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    const frame = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1);
    const mainFrame = vi.spyOn(window, 'requestAnimationFrame');
    const root = doc.createElement('div');
    const field = doc.createElement('input');
    root.appendChild(field);
    doc.body.appendChild(root);
    trackPanelDom(root);
    field.focus();
    field.blur();
    expect(doc.activeElement).toBe(doc.body);
    // Focus in the main document is elsewhere; that is not the panel's document.
    const mainInput = document.createElement('input');
    document.body.appendChild(mainInput);
    cleanups.push(() => mainInput.remove());
    mainInput.focus();

    restorePanelDom(root, { refocus: true });
    expect(doc.activeElement).toBe(field);
    expect(frame).toHaveBeenCalledTimes(1);
    expect(mainFrame).not.toHaveBeenCalled();
  });
});

describe('DA11b: panel scroll offsets in another document', () => {
  it('are recorded from scroll events there and put back', () => {
    const { doc, win } = otherWindow();
    vi.spyOn(win.Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1);
    const root = doc.createElement('div');
    const list = doc.createElement('div');
    let top = 0;
    Object.defineProperty(list, 'scrollTop', { get: () => top, set: (v: number) => { top = v; }, configurable: true });
    root.appendChild(list);
    doc.body.appendChild(root);
    trackPanelDom(root);
    top = 120;
    list.dispatchEvent(new win.Event('scroll'));
    top = 0;                                         // the move reset it
    restorePanelDom(root, { refocus: false });
    expect(top).toBe(120);
  });
});

describe("DA12: a managed widget's drag in another document", () => {
  it('sets and clears the body class there, not on the main body', () => {
    const { doc, win } = otherWindow();
    // The pointer-capture stubs of vitest.setup.ts are for the main window's prototypes only.
    Object.assign(win.Element.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    mount(
      <PanelOverlayRoot>
        <PanelFloatingWindow id="da12" title="W" open defaultAnchor="top-left" onClose={() => {}}><span /></PanelFloatingWindow>
      </PanelOverlayRoot>,
      container,
    );
    const pointer = (type: string, x: number) =>
      new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: 10, button: 0, pointerType: 'mouse' });
    const header = doc.querySelector('.rdd-panel-float__header')!;
    const frame = doc.querySelector('.rdd-panel-float')!;
    act(() => { header.dispatchEvent(pointer('pointerdown', 10)); });
    act(() => { frame.dispatchEvent(pointer('pointermove', 60)); });
    expect(doc.body.classList.contains('rdd-dragging-active')).toBe(true);
    expect(document.body.classList.contains('rdd-dragging-active')).toBe(false);
    act(() => { frame.dispatchEvent(pointer('pointerup', 60)); });
    expect(doc.body.classList.contains('rdd-dragging-active')).toBe(false);
  });

  it('a resize sets the resizing class there too', () => {
    const { doc, win } = otherWindow();
    Object.assign(win.Element.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    mount(
      <PanelOverlayRoot>
        <PanelFloatingWindow id="da12b" title="W" open defaultAnchor="top-left" onClose={() => {}}><span /></PanelFloatingWindow>
      </PanelOverlayRoot>,
      container,
    );
    const handle = doc.querySelector('.rdd-resize-handle')!;
    act(() => { handle.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, button: 0 })); });
    expect(doc.body.classList.contains('rdd-resizing-active')).toBe(true);
    expect(document.body.classList.contains('rdd-resizing-active')).toBe(false);
    act(() => { handle.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); });
  });
});

describe('DA13: the toolbar flyout in another document', () => {
  const groupItems: ToolbarItem[] = [{
    type: 'group', id: 'g', label: 'Group', defaultIcon: <svg />,
    items: [{ id: 'a', label: 'A', icon: <svg /> }, { id: 'b', label: 'B', icon: <svg /> }],
  }];

  it("portals into the button's body and closes on a click there", () => {
    const { doc, win } = otherWindow();
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    mount(<ToolbarProvider><Toolbar items={groupItems} /></ToolbarProvider>, container);
    const btn = container.querySelector<HTMLButtonElement>('button.rdd-toolbar-btn-group')!;
    act(() => { btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    expect(doc.body.querySelector('.rdd-toolbar-group-flyout')).not.toBeNull();
    expect(document.body.querySelector('.rdd-toolbar-group-flyout')).toBeNull();
    act(() => { doc.body.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true })); });
    expect(doc.body.querySelector('.rdd-toolbar-group-flyout')).toBeNull();
  });

  const openIn = (position: 'right' | 'top', setup?: (win: AnyWindow) => void) => {
    const { doc, win } = otherWindow();
    setup?.(win);
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    mount(<ToolbarProvider><Toolbar items={groupItems} position={position} /></ToolbarProvider>, container);
    const btn = container.querySelector<HTMLButtonElement>('button.rdd-toolbar-btn-group')!;
    act(() => { btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    return { doc, win, btn, flyout: doc.body.querySelector<HTMLElement>('.rdd-toolbar-group-flyout')! };
  };

  it("hands focus back to the button when closed from inside, in the button's document", () => {
    const { doc, win, btn, flyout } = openIn('top');
    expect(flyout.contains(doc.activeElement)).toBe(true);
    const mainInput = document.createElement('input');
    document.body.appendChild(mainInput);
    cleanups.push(() => mainInput.remove());
    mainInput.focus();
    act(() => { flyout.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
    expect(doc.activeElement).toBe(btn);
  });

  it("is placed with the button's window size", () => {
    // Beside a right-hand strip: `right` is measured from that window's width (300 - 20 + 8).
    const { flyout } = openIn('right', win => { sized(win, 300, 200); boxesFromStyle(win, { left: 20, top: 20 }); });
    expect(flyout.style.right).toBe('288px');
  });

  it("is clamped into the button's window", () => {
    // Below a top strip at x 250: its right edge (350) passes that window's 300, so 300 - 100 - 8.
    const { flyout } = openIn('top', win => { sized(win, 300, 200); boxesFromStyle(win, { left: 250, top: 20 }); });
    expect(flyout.style.left).toBe('192px');
  });
});

describe('DA14: rtl helpers', () => {
  it("isElementRtl falls back to the element's own document", () => {
    const other = document.implementation.createHTMLDocument('x');
    other.documentElement.dir = 'rtl';
    const loose = other.createElement('div');       // in no tree: no ancestor with dir
    expect(isElementRtl(loose)).toBe(true);
    expect(isElementRtl(document.createElement('div'))).toBe(false);
  });

  it("isComputedRtl asks the element's own window", () => {
    const { doc, win } = otherWindow();
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const own = vi.spyOn(win, 'getComputedStyle').mockReturnValue({ direction: 'rtl' } as CSSStyleDeclaration);
    expect(isComputedRtl(el)).toBe(true);
    expect(own).toHaveBeenCalledWith(el);
  });
});

describe('DA15: moveIntoWhenConnected', () => {
  it("waits on the slot's window's frames", () => {
    const { doc, win } = otherWindow();
    const own = vi.spyOn(win, 'requestAnimationFrame').mockReturnValue(1);
    const main = vi.spyOn(window, 'requestAnimationFrame');
    const slot = doc.createElement('div');           // not connected yet
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    setPreserveEmbeds(el, true);
    const cancel = moveIntoWhenConnected(slot, el);
    expect(own).toHaveBeenCalledTimes(1);
    expect(main).not.toHaveBeenCalled();
    cancel();
  });
});

describe('DA16: click-to-activate in a registered document', () => {
  it('a pointerdown in a panel shown there makes it the active one', () => {
    const Panel: React.FC = () => <div />;
    const client = new WorkspaceClient({ panels: { p: { component: Panel } } });
    act(() => { client.openPanel('a', 'p'); client.openPanel('b', 'p'); });
    const host = document.createElement('div');
    document.body.appendChild(host);
    cleanups.push(() => host.remove());
    mount(<WindowManagerProvider client={client}><PanelProvider><WindowManager /></PanelProvider></WindowManagerProvider>, host);
    act(() => { client.focusPanel('b'); });
    expect(client._core.getSnapshot().activePanelId).toBe('b');

    const { doc, win } = otherWindow();
    const pane = doc.createElement('div');
    pane.className = 'rdd-workspace-panel';
    pane.setAttribute('data-active-panel-id', 'a');
    const inner = doc.createElement('span');
    pane.appendChild(inner);
    doc.body.appendChild(pane);
    const press = () => act(() => { inner.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, button: 0 })); });

    press();
    expect(client._core.getSnapshot().activePanelId).toBe('b');   // not registered: unheard
    const undo = registerDocument(doc);
    cleanups.push(undo);
    press();
    expect(client._core.getSnapshot().activePanelId).toBe('a');
  });
});

describe('DA17: the panel search dropdown in another document', () => {
  it("portals into the input's body and fits that window", async () => {
    vi.useFakeTimers();
    cleanups.push(() => vi.useRealTimers());
    const { doc, win } = otherWindow();
    sized(win, 300, 200);
    boxesFromStyle(win, { left: 200, top: 20 });    // 200..300: a 240-wide dropdown overflows
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    const results = [{ id: 'r', label: 'Result' }];
    mount(<ToolbarSearchInput onSearch={async () => results} onSelect={() => {}} />, container);
    act(() => { container.querySelector('button')!.click(); });
    const input = container.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, 'map');
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const dropdown = doc.body.querySelector<HTMLElement>('.rdd-panel-toolbar-search__dropdown');
    expect(dropdown).not.toBeNull();
    expect(document.body.querySelector('.rdd-panel-toolbar-search__dropdown')).toBeNull();
    expect(dropdown!.style.left).toBe('52px');      // 300 - 240 - 8
  });
});

describe("DA18: a panel toolbar's ResizeObserver", () => {
  it("comes from the toolbar's own window", () => {
    const { doc, win } = otherWindow();
    const observed: Element[] = [];
    class OwnObserver { constructor(_cb: ResizeObserverCallback) {} observe(el: Element) { observed.push(el); } unobserve() {} disconnect() {} }
    (win as unknown as { ResizeObserver: unknown }).ResizeObserver = OwnObserver;
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    mount(<PanelOverlayRoot><PanelToolbar position="top"><span /></PanelToolbar></PanelOverlayRoot>, container);
    expect(observed.some(el => el.classList.contains('rdd-panel-toolbar'))).toBe(true);
  });
});
