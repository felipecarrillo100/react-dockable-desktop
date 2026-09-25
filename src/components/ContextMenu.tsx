import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { useEscapeLayer } from '../utils/escapeStack';
import { isComputedRtl } from '../utils/rtl';
import { enabledItems, moveMenuFocus } from '../utils/menuKeyboard';
import type { ContextMenuLabel, MessageFormatter, MenuItemAction } from './contextMenuTypes';

// ─── Re-export shared primitives so callers don't need contextMenuTypes.ts ───
export type { ContextMenuLabel, MessageFormatter, MenuItemAction };

// ─── Item type shapes (identical surface to former replace-react-contexify) ───

export interface ContextMenuCheckbox {
  /** Whether the checkbox column renders at all (default: true). */
  active?: boolean;
  /** Whether the item is interactive (default: true). Prefer top-level `disabled` on the item instead. */
  enabled?: boolean;
  /** Current checked state. */
  value: boolean;
}

export interface ContextMenuSimpleItem {
  label: ContextMenuLabel;
  icon?: React.ReactNode;
  title?: ContextMenuLabel;
  checkbox?: ContextMenuCheckbox;
  action?: MenuItemAction;
  cyAction?: string;
  disabled?: boolean;
}

export interface ContextMenuSeparator {
  separator: true;
}

export interface ContextMenuSubMenu {
  label: ContextMenuLabel;
  title?: ContextMenuLabel;
  items?: ContextMenuItem[];
}

export type ContextMenuItem = ContextMenuSimpleItem | ContextMenuSeparator | ContextMenuSubMenu;

// ─── Imperative API ───────────────────────────────────────────────────────────

export interface ShowContextMenuOptions {
  event?: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent;
  x?: number;
  y?: number;
  items: ContextMenuItem[];
  /**
   * The menu's direction. By default it is the direction of the element the menu was opened from
   * (the event's target); a workspace's `showContextMenu` passes its own direction for a menu
   * opened without an event. The menu is portaled to `<body>`, so it can't inherit either.
   */
  dir?: 'ltr' | 'rtl';
}

export interface ContextMenuHandle {
  show(options: ShowContextMenuOptions): void;
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface ContextMenuProps {
  theme?: string;
  animation?: string;
  formatMessageProvider?: MessageFormatter;
  onShow?: () => void;
  onHide?: () => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

// ─── Adapter interface (strategy pattern) ────────────────────────────────────

export interface ContextMenuAdapter {
  Component: React.ForwardRefExoticComponent<
    ContextMenuProps & React.RefAttributes<ContextMenuHandle>
  >;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getCoords(
  event: ShowContextMenuOptions['event'],
): { x: number; y: number } {
  if (!event) return { x: 0, y: 0 };
  if ('touches' in event && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  const mouse = event as MouseEvent;
  // The ContextMenu key and Shift+F10 fire `contextmenu` with no pointer position (0, 0): open
  // the menu at the focused element instead of the top-left corner of the page.
  if (mouse.clientX === 0 && mouse.clientY === 0 && mouse.target instanceof Element) {
    const r = mouse.target.getBoundingClientRect();
    if (r.width || r.height) return { x: r.left, y: r.bottom };
  }
  return { x: mouse.clientX, y: mouse.clientY };
}

function resolveLabel(label: ContextMenuLabel, fmt?: MessageFormatter): string {
  if (typeof label === 'string') return label;
  if (fmt) return fmt(label);
  return label.defaultMessage ?? label.id;
}

function isSeparator(item: ContextMenuItem): item is ContextMenuSeparator {
  return 'separator' in item;
}

function isSubMenu(item: ContextMenuItem): item is ContextMenuSubMenu {
  return !isSeparator(item) && 'items' in item;
}

// ─── Sub-menu panel (one-level deep) ─────────────────────────────────────────

/** Where a submenu hangs from: the parent menu's physical edges, and the top of the item. */
interface SubMenuAnchor {
  menuLeft: number;
  menuRight: number;
  top: number;
  /** Reading direction at the item: the submenu prefers the reading-end side. */
  rtl: boolean;
}

interface SubMenuPanelProps {
  items: ContextMenuItem[];
  /** Measures where to hang from. Called after layout and in event handlers, never in render. */
  getAnchor: () => SubMenuAnchor | null;
  /** Opened from the keyboard: focus its first item. */
  autoFocus: boolean;
  /** The key that returns to the parent item (ArrowLeft, or ArrowRight under RTL). */
  onBack: () => void;
  theme: string;
  /** The parent menu's direction: the submenu is portaled too, so it can't inherit it. */
  dir: 'ltr' | 'rtl';
  fmt?: MessageFormatter;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const SubMenuPanel = forwardRef<HTMLDivElement, SubMenuPanelProps>(
  ({ items, getAnchor, autoFocus, onBack, theme, dir, fmt, onClose, onMouseEnter, onMouseLeave }, ref) => {
    // Placed after layout, once the panel's own width is known. It hangs off the parent menu's
    // reading-end edge (right in LTR, left in RTL) and flips to the other edge when that side
    // has no room — clamping it into the viewport instead is what laid it over the parent menu.
    useLayoutEffect(() => {
      const el = (ref as React.RefObject<HTMLDivElement>)?.current;
      const anchor = getAnchor();
      if (!el || !anchor) return;
      const PAD = 8;
      const GAP = 2;
      // Layout size, not getBoundingClientRect: the entry animation scales the panel, and a
      // scaled measurement placed a left-hanging submenu over its parent.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const toRight = anchor.menuRight + GAP;
      const toLeft = anchor.menuLeft - GAP - width;
      const fitsRight = toRight + width <= window.innerWidth - PAD;
      const fitsLeft = toLeft >= PAD;
      let left: number;
      if (anchor.rtl) left = fitsLeft || !fitsRight ? toLeft : toRight;
      else left = fitsRight || !fitsLeft ? toRight : toLeft;
      left = Math.max(PAD, Math.min(left, window.innerWidth - width - PAD));
      const top = Math.max(PAD, Math.min(anchor.top, window.innerHeight - height - PAD));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    });

    useLayoutEffect(() => {
      if (autoFocus) enabledItems((ref as React.RefObject<HTMLDivElement>)?.current)[0]?.focus();
    }, [autoFocus, ref]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const backKey = getAnchor()?.rtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === backKey) { e.preventDefault(); e.stopPropagation(); onBack(); return; }
      if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (moveMenuFocus(e.currentTarget, e.key)) { e.preventDefault(); e.stopPropagation(); }
    };

    return createPortal(
      <div
        ref={ref}
        className={`rdd-context-menu rdd-context-menu--${theme} rdd-context-menu--submenu`}
        dir={dir}
        // z-index from .rdd-context-menu--submenu (+8501) — see the main menu's note below.
        // Placed by the layout effect above before paint (its starting left/top are in the class).
        role="menu"
        onKeyDown={handleKeyDown}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {items.map((item, i) => {
          if (isSeparator(item)) {
            return <hr key={i} className="rdd-context-menu__separator" role="separator" />;
          }
          const simple = item as ContextMenuSimpleItem;
          const showChk = simple.checkbox && simple.checkbox.active !== false;
          const isChecked = showChk && simple.checkbox!.value;
          const isDisabled = simple.disabled === true || (showChk ? simple.checkbox!.enabled === false : false);
          return (
            <button
              key={i}
              type="button"
              className={`rdd-context-menu__item${isDisabled ? ' rdd-context-menu__item--disabled' : ''}`}
              title={simple.title ? resolveLabel(simple.title, fmt) : undefined}
              disabled={isDisabled}
              data-cy-action={simple.cyAction}
              onClick={() => { if (!isDisabled) { simple.action?.(); onClose(); } }}
              role={showChk ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={showChk ? isChecked : undefined}
            >
              {simple.icon
                ? <span className="rdd-context-menu__icon">{simple.icon}</span>
                : <span className="rdd-context-menu__icon" aria-hidden="true" />}
              <span className="rdd-context-menu__label">{resolveLabel(simple.label, fmt)}</span>
              {showChk && (
                <span className={`rdd-context-menu__checkbox${isChecked ? ' rdd-context-menu__checkbox--checked' : ''}`} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    {isChecked && (
                      <path d="M2.5 6 L4.5 8.5 L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  },
);

SubMenuPanel.displayName = 'ContextMenuSubMenuPanel';

// ─── Main component ───────────────────────────────────────────────────────────

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  dir: 'ltr' | 'rtl';
}

const CLOSED: MenuState = { visible: false, x: 0, y: 0, items: [], dir: 'ltr' };

/**
 * The menu is portaled to <body>, so it takes its direction from where it was opened: the event's
 * target, else the direction the caller passed (a workspace passes its own), else the page's.
 */
function menuDirection(event: ShowContextMenuOptions['event'], dir: ShowContextMenuOptions['dir']): 'ltr' | 'rtl' {
  const target = event?.target;
  if (target instanceof Element) return isComputedRtl(target) ? 'rtl' : 'ltr';
  if (dir) return dir;
  return isComputedRtl(document.documentElement) ? 'rtl' : 'ltr';
}

export const ContextMenu: React.ForwardRefExoticComponent<ContextMenuProps & React.RefAttributes<ContextMenuHandle>> = forwardRef<ContextMenuHandle, ContextMenuProps>(
  ({ theme = 'dark', formatMessageProvider, onShow, onHide, onOpenChange, className, style }, ref) => {
    const [menuState, setMenuState] = useState<MenuState>(CLOSED);
    const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);
    // A submenu opened from the keyboard takes focus; one opened by hovering does not.
    const [submenuFocus, setSubmenuFocus] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    // Where focus was when the menu opened, so closing can hand it back (WAI-ARIA menu pattern).
    const openerRef = useRef<HTMLElement | null>(null);
    const restoreFocusRef = useRef(false);
    const submenuPanelRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
    const timers = useRef<{
      open: ReturnType<typeof setTimeout> | null;
      close: ReturnType<typeof setTimeout> | null;
    }>({ open: null, close: null });

    const close = React.useCallback(() => {
      // Hand focus back to the opener only if it was inside the menu when it closed — an item's
      // action may itself have moved focus (opened a modal, say), and that must win.
      const active = document.activeElement;
      restoreFocusRef.current = !!active && (
        !!menuRef.current?.contains(active) || !!submenuPanelRef.current?.contains(active)
      );
      setMenuState(CLOSED);
      setSubmenuIndex(null);
      timers.current.open && clearTimeout(timers.current.open);
      timers.current.close && clearTimeout(timers.current.close);
      timers.current.open = null;
      timers.current.close = null;
      onHide?.();
      onOpenChange?.(false);
    }, [onHide, onOpenChange]);

    useImperativeHandle(ref, () => ({
      show({ event, x, y, items, dir }) {
        const coords = event ? getCoords(event) : { x: x ?? 0, y: y ?? 0 };
        openerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
        itemRefs.current.clear();
        setMenuState({ visible: true, x: coords.x, y: coords.y, items, dir: menuDirection(event, dir) });
        setSubmenuIndex(null);
        onShow?.();
        onOpenChange?.(true);
      },
    }), [onShow, onOpenChange]);

    // Open: focus the first enabled item. Close: return focus to the opener if the menu had it
    // and nothing else has taken it since.
    useLayoutEffect(() => {
      if (menuState.visible) {
        enabledItems(menuRef.current)[0]?.focus();
        return;
      }
      if (!restoreFocusRef.current) return;
      restoreFocusRef.current = false;
      const opener = openerRef.current;
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body)) opener.focus();
    }, [menuState.visible, menuState.items]);

    // Click-outside dismiss
    // Two listeners for full coverage:
    //   pointerdown (capture) — fires before any canvas gesture handler; catches touch/stylus
    //   click (bubble, window) — synthetic click survives stopPropagation on mousedown/pointerdown;
    //     this is the reliable fallback for WebGL canvases (LuciadRIA, MapLibre, Three.js, etc.)
    useEffect(() => {
      if (!menuState.visible) return;
      const dismiss = (e: Event) => {
        // A click dispatched on `window` itself has no Node target, and `contains()` throws
        // for one. It is outside the menu by definition.
        if (!(e.target instanceof Node)) { close(); return; }
        if (menuRef.current?.contains(e.target as Node)) return;
        if (submenuPanelRef.current?.contains(e.target as Node)) return;
        close();
      };
      document.addEventListener('pointerdown', dismiss, { capture: true });
      window.addEventListener('click', dismiss);
      return () => {
        document.removeEventListener('pointerdown', dismiss, { capture: true });
        window.removeEventListener('click', dismiss);
      };
    }, [menuState.visible, close]);

    // Escape dismiss — a popup, so above any modal or drawer on the shared Escape stack.
    useEscapeLayer(menuState.visible, 'popup', close);

    // Viewport clamping for main menu
    useLayoutEffect(() => {
      if (!menuState.visible || !menuRef.current) return;
      const el = menuRef.current;
      const r = el.getBoundingClientRect();
      const PAD = 8;
      if (r.right > window.innerWidth - PAD) {
        el.style.left = `${Math.max(PAD, window.innerWidth - r.width - PAD)}px`;
      }
      if (r.bottom > window.innerHeight - PAD) {
        el.style.top = `${Math.max(PAD, window.innerHeight - r.height - PAD)}px`;
      }
      if (r.left < PAD) el.style.left = `${PAD}px`;
      if (r.top < PAD) el.style.top = `${PAD}px`;
    }, [menuState.visible]);

    if (!menuState.visible) return null;

    const fmt = formatMessageProvider;

    // Where the open sub-menu hangs from. The old computation took a distance from the right
    // edge under RTL and then used it as `left`, so the sub-menu landed far from its menu.
    const getSubmenuAnchor = (): SubMenuAnchor | null => {
      const itemEl = submenuIndex === null ? null : itemRefs.current.get(submenuIndex);
      const menuEl = menuRef.current;
      if (!itemEl || !menuEl) return null;
      const mr = menuEl.getBoundingClientRect();
      return { menuLeft: mr.left, menuRight: mr.right, top: itemEl.getBoundingClientRect().top, rtl: isComputedRtl(itemEl) };
    };
    const backToParentItem = () => {
      const parent = submenuIndex === null ? null : itemRefs.current.get(submenuIndex);
      setSubmenuIndex(null);
      setSubmenuFocus(false);
      parent?.focus();
    };

    function cancelOpenTimer() {
      if (timers.current.open) {
        clearTimeout(timers.current.open);
        timers.current.open = null;
      }
    }
    function cancelCloseTimer() {
      if (timers.current.close) {
        clearTimeout(timers.current.close);
        timers.current.close = null;
      }
    }

    function handleItemMouseEnter(index: number, item: ContextMenuItem) {
      cancelCloseTimer();
      // Switching away from a different open sub-menu
      if (submenuIndex !== null && submenuIndex !== index) {
        cancelOpenTimer();
        setSubmenuIndex(null);
      }
      if (isSubMenu(item) && item.items?.length) {
        cancelOpenTimer();
        timers.current.open = setTimeout(() => {
          setSubmenuIndex(index);
        }, 150);
      } else if (!isSubMenu(item)) {
        // Non-sub-menu item: close any open sub-menu after grace period
        cancelOpenTimer();
        if (submenuIndex !== null) {
          timers.current.close = setTimeout(() => setSubmenuIndex(null), 200);
        }
      }
    }

    const openSubmenuFromKeyboard = (index: number) => {
      cancelOpenTimer();
      cancelCloseTimer();
      setSubmenuFocus(true);
      setSubmenuIndex(index);
    };

    function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
      if (e.key === 'Tab') { e.preventDefault(); close(); return; }
      const openKey = isComputedRtl(e.currentTarget) ? 'ArrowLeft' : 'ArrowRight';
      if (e.key === openKey) {
        const index = Number((document.activeElement as HTMLElement | null)?.dataset.menuIndex);
        const item = menuState.items[index];
        if (item && isSubMenu(item) && item.items?.length) { e.preventDefault(); openSubmenuFromKeyboard(index); }
        return;
      }
      if (moveMenuFocus(e.currentTarget, e.key)) {
        e.preventDefault();
        // Moving to another item closes an open submenu, as hovering another item does.
        if (submenuIndex !== null) setSubmenuIndex(null);
      }
    }

    function handleItemMouseLeave(item: ContextMenuItem) {
      cancelOpenTimer();
      if (isSubMenu(item) && item.items?.length) {
        timers.current.close = setTimeout(() => setSubmenuIndex(null), 200);
      }
    }

    return createPortal(
      <>
        <div
          ref={menuRef}
          className={`rdd-context-menu rdd-context-menu--${theme}${className ? ` ${className}` : ''}`}
          dir={menuState.dir}
          // No inline z-index: .rdd-context-menu's own `calc(var(--rdd-z-base, 1000) + 8500)`
          // owns it, so a WindowManagerProvider's zIndexBase actually shifts this menu (an
          // inline value here silently overrode it). Resolves to the same 9500 by default.
          style={{ left: menuState.x, top: menuState.y, ...style }}
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
        >
          {menuState.items.map((item, i) => {
            if (isSeparator(item)) {
              return <hr key={i} className="rdd-context-menu__separator" role="separator" />;
            }

            if (isSubMenu(item)) {
              return (
                <button
                  key={i}
                  ref={el => { itemRefs.current.set(i, el); }}
                  type="button"
                  className={`rdd-context-menu__item rdd-context-menu__item--has-submenu${submenuIndex === i ? ' rdd-context-menu__item--submenu-open' : ''}`}
                  title={item.title ? resolveLabel(item.title, fmt) : undefined}
                  data-menu-index={i}
                  onMouseEnter={() => handleItemMouseEnter(i, item)}
                  onMouseLeave={() => handleItemMouseLeave(item)}
                  // Click, tap, Enter or Space. A keyboard click (detail 0) moves focus in.
                  onClick={(e) => {
                    if (!item.items?.length) return;
                    cancelOpenTimer();
                    cancelCloseTimer();
                    setSubmenuFocus(e.detail === 0);
                    setSubmenuIndex(submenuIndex === i && e.detail !== 0 ? null : i);
                  }}
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={submenuIndex === i}
                >
                  <span className="rdd-context-menu__icon" aria-hidden="true" />
                  <span className="rdd-context-menu__label">{resolveLabel(item.label, fmt)}</span>
                  <span className="rdd-context-menu__chevron" aria-hidden="true">›</span>
                </button>
              );
            }

            const simple = item as ContextMenuSimpleItem;
            const showChk = simple.checkbox && simple.checkbox.active !== false;
            const isChecked = showChk && simple.checkbox!.value;
            const isDisabled = simple.disabled === true || (showChk ? simple.checkbox!.enabled === false : false);

            return (
              <button
                key={i}
                ref={el => { itemRefs.current.set(i, el); }}
                data-menu-index={i}
                type="button"
                className={`rdd-context-menu__item${isDisabled ? ' rdd-context-menu__item--disabled' : ''}`}
                title={simple.title ? resolveLabel(simple.title, fmt) : undefined}
                disabled={isDisabled}
                data-cy-action={simple.cyAction}
                onClick={() => { if (!isDisabled) { simple.action?.(); close(); } }}
                onMouseEnter={() => handleItemMouseEnter(i, item)}
                onMouseLeave={() => handleItemMouseLeave(item)}
                role={showChk ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={showChk ? isChecked : undefined}
              >
                {simple.icon
                  ? <span className="rdd-context-menu__icon">{simple.icon}</span>
                  : <span className="rdd-context-menu__icon" aria-hidden="true" />}
                <span className="rdd-context-menu__label">{resolveLabel(simple.label, fmt)}</span>
                {showChk && (
                  <span className={`rdd-context-menu__checkbox${isChecked ? ' rdd-context-menu__checkbox--checked' : ''}`} aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="2"
                        fill={isChecked ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      {isChecked && (
                        <path d="M2.5 6 L4.5 8.5 L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {submenuIndex !== null && (() => {
          const sub = menuState.items[submenuIndex] as ContextMenuSubMenu;
          return (
            <SubMenuPanel
              ref={submenuPanelRef}
              items={sub.items ?? []}
              getAnchor={getSubmenuAnchor}
              autoFocus={submenuFocus}
              onBack={backToParentItem}
              theme={theme}
              dir={menuState.dir}
              fmt={fmt}
              onClose={close}
              onMouseEnter={() => cancelCloseTimer()}
              onMouseLeave={() => {
                timers.current.close = setTimeout(() => setSubmenuIndex(null), 200);
              }}
            />
          );
        })()}
      </>,
      document.body,
    );
  },
);

ContextMenu.displayName = 'ContextMenu';

// ─── Default adapter ──────────────────────────────────────────────────────────

export const DefaultContextMenuAdapter: ContextMenuAdapter = {
  Component: ContextMenu,
};

// ─── ContextMenuContext ────────────────────────────────────────────────────────
// Decouples menu placement from WindowManager. Any component that renders
// <ContextMenuProvider> makes showContextMenu available to all descendants,
// regardless of where it sits relative to WindowManager in the tree.

interface ContextMenuContextValue {
  show: (options: ShowContextMenuOptions) => void;
  isOpen: boolean;
}

const ContextMenuContext: React.Context<ContextMenuContextValue | null> = React.createContext<ContextMenuContextValue | null>(null);

export const ContextMenuProvider: React.FC<{
  adapter?: ContextMenuAdapter;
  children: React.ReactNode;
} & ContextMenuProps> = ({ adapter = DefaultContextMenuAdapter, children, ...componentProps }) => {
  const menuRef = useRef<ContextMenuHandle>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const show = React.useCallback((opts: ShowContextMenuOptions) => {
    menuRef.current?.show(opts);
  }, []);
  return (
    <ContextMenuContext.Provider value={{ show, isOpen }}>
      {children}
      <adapter.Component
        ref={menuRef}
        {...componentProps}
        onShow={() => { setIsOpen(true); componentProps.onShow?.(); }}
        onHide={() => { setIsOpen(false); componentProps.onHide?.(); }}
      />
    </ContextMenuContext.Provider>
  );
};

export function useShowContextMenu(): (options: ShowContextMenuOptions) => void {
  const ctx = React.useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used within <DockableDesktopProvider> or <RddContextMenu>');
  return ctx.show;
}

// Exported for the WindowManager.tsx bridge only — not re-exported from src/index.ts
export { ContextMenuContext };
