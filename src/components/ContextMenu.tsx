import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
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
  return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
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

interface SubMenuPanelProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  theme: string;
  fmt?: MessageFormatter;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const SubMenuPanel = forwardRef<HTMLDivElement, SubMenuPanelProps>(
  ({ items, x, y, theme, fmt, onClose, onMouseEnter, onMouseLeave }, ref) => {
    useLayoutEffect(() => {
      const el = (ref as React.RefObject<HTMLDivElement>)?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const PAD = 8;
      if (r.right > window.innerWidth - PAD) {
        el.style.left = `${Math.max(PAD, window.innerWidth - r.width - PAD)}px`;
        el.style.right = 'auto';
      }
      if (r.bottom > window.innerHeight - PAD) {
        el.style.top = `${Math.max(PAD, window.innerHeight - r.height - PAD)}px`;
      }
      if (r.left < PAD) { el.style.left = `${PAD}px`; el.style.right = 'auto'; }
      if (r.top < PAD) el.style.top = `${PAD}px`;
    });

    return createPortal(
      <div
        ref={ref}
        className={`rdd-context-menu rdd-context-menu--${theme} rdd-context-menu--submenu`}
        style={{ position: 'fixed', left: x, top: y, zIndex: 9501 }}
        role="menu"
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
              role="menuitem"
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
}

const CLOSED: MenuState = { visible: false, x: 0, y: 0, items: [] };

export const ContextMenu: React.ForwardRefExoticComponent<ContextMenuProps & React.RefAttributes<ContextMenuHandle>> = forwardRef<ContextMenuHandle, ContextMenuProps>(
  ({ theme = 'dark', formatMessageProvider, onShow, onHide, onOpenChange, className, style }, ref) => {
    const [menuState, setMenuState] = useState<MenuState>(CLOSED);
    const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const submenuPanelRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
    const timers = useRef<{
      open: ReturnType<typeof setTimeout> | null;
      close: ReturnType<typeof setTimeout> | null;
    }>({ open: null, close: null });

    const close = React.useCallback(() => {
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
      show({ event, x, y, items }) {
        const coords = event ? getCoords(event) : { x: x ?? 0, y: y ?? 0 };
        itemRefs.current.clear();
        setMenuState({ visible: true, x: coords.x, y: coords.y, items });
        setSubmenuIndex(null);
        onShow?.();
        onOpenChange?.(true);
      },
    }), [onShow, onOpenChange]);

    // Click-outside dismiss
    // Two listeners for full coverage:
    //   pointerdown (capture) — fires before any canvas gesture handler; catches touch/stylus
    //   click (bubble, window) — synthetic click survives stopPropagation on mousedown/pointerdown;
    //     this is the reliable fallback for WebGL canvases (LuciadRIA, MapLibre, Three.js, etc.)
    useEffect(() => {
      if (!menuState.visible) return;
      const dismiss = (e: Event) => {
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

    // Escape dismiss
    useEffect(() => {
      if (!menuState.visible) return;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [menuState.visible, close]);

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

    // Compute sub-menu anchor position
    let submenuX = 0;
    let submenuY = 0;
    if (submenuIndex !== null) {
      const itemEl = itemRefs.current.get(submenuIndex);
      if (itemEl) {
        const ir = itemEl.getBoundingClientRect();
        const rtl = document.documentElement.dir === 'rtl';
        submenuX = rtl ? window.innerWidth - ir.left + 2 : ir.right + 2;
        submenuY = ir.top;
      }
    }

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
          style={{ position: 'fixed', left: menuState.x, top: menuState.y, zIndex: 9500, ...style }}
          role="menu"
          aria-orientation="vertical"
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
                  onMouseEnter={() => handleItemMouseEnter(i, item)}
                  onMouseLeave={() => handleItemMouseLeave(item)}
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
                type="button"
                className={`rdd-context-menu__item${isDisabled ? ' rdd-context-menu__item--disabled' : ''}`}
                title={simple.title ? resolveLabel(simple.title, fmt) : undefined}
                disabled={isDisabled}
                data-cy-action={simple.cyAction}
                onClick={() => { if (!isDisabled) { simple.action?.(); close(); } }}
                onMouseEnter={() => handleItemMouseEnter(i, item)}
                onMouseLeave={() => handleItemMouseLeave(item)}
                role="menuitem"
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
              x={submenuX}
              y={submenuY}
              theme={theme}
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
  if (!ctx) throw new Error('useShowContextMenu must be used within a ContextMenuProvider');
  return ctx.show;
}

// Exported for the WindowManager.tsx bridge only — not re-exported from src/index.ts
export { ContextMenuContext };
