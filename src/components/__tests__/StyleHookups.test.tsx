/**
 * Tests for the class-name / stacking hookups the stylesheet depends on.
 *
 * Each case here covers a rule in index.css that silently matched nothing,
 * because the class the component actually rendered didn't match the selector
 * (the `rdd-` prefix rename reached the stylesheet but not the JSX), or because
 * an inline z-index overrode the rule that reads `--rdd-z-base`.
 *
 * These assert on the *rendered contract* (class names present, no inline
 * z-index) rather than on computed styles: index.css is never loaded in jsdom,
 * so a computed-style assertion would pass no matter which class was emitted —
 * which is exactly how the original breakage went unnoticed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider } from '../WindowManagerContext';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager, { type TaskbarVisibility } from '../WindowManager';
import { PanelProvider } from '../PanelProviderContext';
import { ContextMenu, type ContextMenuHandle } from '../ContextMenu';
import ConfirmationForm from '../../forms/ConfirmationForm';

const MockPanel: React.FC<{ panelId: string }> = ({ panelId }) => (
  <div data-panel-id={panelId} />
);

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ─── Taskbar mode class ───────────────────────────────────────────────────────
// index.css keys autohide's overlay/peek-strip rules off
// `.rdd-taskbar-footer-container.rdd-taskbar-mode-autohide`, so an unprefixed
// `taskbar-mode-autohide` left the whole mode rendering as a plain always-on bar.

describe('taskbar mode class', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    root = null;
    document.body.removeChild(container);
  });

  /**
   * Renders the workspace and minimizes one panel — 'compact' and 'autohide'
   * both mount the bar only once `state.minimized` is non-empty, so a minimized
   * panel is what makes the bar observable in every mode, not just 'always'.
   */
  const renderWithMinimizedPanel = (taskbarVisibility: TaskbarVisibility) => {
    const client = new WorkspaceClient({ panels: { map: { component: MockPanel } } });
    root = createRoot(container);
    act(() => {
      root!.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager taskbarVisibility={taskbarVisibility} />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
    act(() => { client.openPanel('map-1', 'map'); });
    act(() => { client.minimizePanel('map-1'); });
    return container.querySelector('.rdd-taskbar-footer-container');
  };

  it.each(['always', 'compact', 'autohide'] as const)(
    'renders the rdd- prefixed mode class for %s',
    (mode) => {
      const bar = renderWithMinimizedPanel(mode);
      expect(bar).not.toBeNull();
      expect(bar!.classList.contains(`rdd-taskbar-mode-${mode}`)).toBe(true);
      // The unprefixed name is what the stylesheet does NOT match.
      expect(bar!.classList.contains(`taskbar-mode-${mode}`)).toBe(false);
    }
  );

  it('pairs the mode class with the container class autohide rules require', () => {
    const bar = renderWithMinimizedPanel('autohide');
    expect(bar).not.toBeNull();
    // .rdd-taskbar-footer-container.rdd-taskbar-mode-autohide — both halves present.
    expect(bar!.classList.contains('rdd-taskbar-footer-container')).toBe(true);
    expect(bar!.classList.contains('rdd-taskbar-mode-autohide')).toBe(true);
  });
});

// ─── ConfirmationForm alert class ─────────────────────────────────────────────
// index.css defines .rdd-confirmation-alert-danger/-info/-warning/-success; the
// unprefixed `confirmation-alert-${alertType}` matched none of them, so every
// alert banner rendered with base styling only — including the library's own
// unsaved-changes dialogs, which pass alertType: 'danger'.

describe('ConfirmationForm alert class', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    root = null;
    document.body.removeChild(container);
  });

  it.each(['info', 'warning', 'success', 'danger'] as const)(
    'renders the rdd- prefixed alert class for %s',
    (alertType) => {
      root = createRoot(container);
      act(() => {
        root!.render(
          <ConfirmationForm message="Discard?" alert="Two fields are empty." alertType={alertType} />
        );
      });
      const banner = container.querySelector('.rdd-confirmation-alert');
      expect(banner).not.toBeNull();
      expect(banner!.classList.contains(`rdd-confirmation-alert-${alertType}`)).toBe(true);
      expect(banner!.classList.contains(`confirmation-alert-${alertType}`)).toBe(false);
    }
  );

  it('renders no banner when `alert` is omitted', () => {
    root = createRoot(container);
    act(() => {
      root!.render(<ConfirmationForm message="Discard?" alertType="danger" />);
    });
    expect(container.querySelector('.rdd-confirmation-alert')).toBeNull();
  });
});

// ─── ContextMenu stacking ─────────────────────────────────────────────────────
// .rdd-context-menu and .rdd-context-menu--submenu carry
// `calc(var(--rdd-z-base, 1000) + 8500/8501)`, which an inline z-index silently
// overrode — so a WindowManagerProvider's zIndexBase never moved the menu.

describe('ContextMenu stacking', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let menuRef: React.RefObject<ContextMenuHandle | null>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    menuRef = React.createRef<ContextMenuHandle>();
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    root = null;
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  const showMenu = (items: any[]) => {
    root = createRoot(container);
    act(() => { root!.render(<ContextMenu ref={menuRef} />); });
    act(() => { menuRef.current!.show({ x: 40, y: 60, items }); });
  };

  it('leaves the main menu z-index to the stylesheet', () => {
    showMenu([{ label: 'Float Window', action: () => {} }]);
    const menu = document.querySelector('.rdd-context-menu:not(.rdd-context-menu--submenu)') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.zIndex).toBe('');
    // Positioning stays inline — only stacking moved to CSS.
    expect(menu.style.position).toBe('fixed');
  });

  it('leaves the submenu z-index to the stylesheet', () => {
    vi.useFakeTimers();
    showMenu([{ label: 'More', items: [{ label: 'Nested', action: () => {} }] }]);

    const parentItem = document.querySelector('.rdd-context-menu__item--has-submenu') as HTMLElement;
    expect(parentItem).not.toBeNull();
    act(() => { parentItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(200); });

    const submenu = document.querySelector('.rdd-context-menu--submenu') as HTMLElement;
    expect(submenu).not.toBeNull();
    expect(submenu.style.zIndex).toBe('');
  });

  it('still honours a caller-supplied z-index via the style prop', () => {
    root = createRoot(container);
    act(() => { root!.render(<ContextMenu ref={menuRef} style={{ zIndex: 12345 }} />); });
    act(() => { menuRef.current!.show({ x: 0, y: 0, items: [{ label: 'X', action: () => {} }] }); });
    const menu = document.querySelector('.rdd-context-menu:not(.rdd-context-menu--submenu)') as HTMLElement;
    expect(menu.style.zIndex).toBe('12345');
  });
});

// ─── Maximized floating window ────────────────────────────────────────────────
// index.css drops the radius, border and shadow of a maximized window with
// `.rdd-floating-window.rdd-maximized`. The rule used to target `.maximized`,
// which nothing emits, so a maximized window kept its rounded frame.
// (StylesheetContract.test.ts checks the selector side; this checks the emitted side.)

describe('maximized floating window class', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    root = null;
    document.body.removeChild(container);
  });

  it('a maximized window carries rdd-maximized, and loses it when restored', () => {
    const client = new WorkspaceClient({ panels: { map: { component: MockPanel } } });
    root = createRoot(container);
    act(() => {
      root!.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
    act(() => { client.openPanel('map-1', 'map', { initialTarget: 'floating' }); });
    const win = () => container.querySelector('.rdd-floating-window') as HTMLElement;
    expect(win().classList.contains('rdd-maximized')).toBe(false);
    act(() => { client.maximizePanel('map-1'); });
    expect(win().classList.contains('rdd-maximized')).toBe(true);
    act(() => { client.maximizePanel('map-1'); });
    expect(win().classList.contains('rdd-maximized')).toBe(false);
  });
});

// ─── Structural layout lives in classes ───────────────────────────────────────
// The split grid's and the sidebar's layout used to be inline styles, which consumer CSS could
// neither see nor override. Only per-render values may stay inline.

describe('structural layout is in the stylesheet, not inline', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    root = null;
    document.body.removeChild(container);
  });

  const inlineProps = (el: Element | null) => {
    const style = (el as HTMLElement | null)?.style;
    return style ? Array.from({ length: style.length }, (_, i) => style[i]).sort() : [];
  };

  it('split container, children and resizer bars', () => {
    const client = new WorkspaceClient({ panels: { map: { component: MockPanel } } });
    root = createRoot(container);
    act(() => {
      root!.render(
        <WindowManagerProvider client={client}>
          <PanelProvider>
            <WindowManager />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
    act(() => { client.openPanel('a', 'map'); client.openPanel('b', 'map'); });
    act(() => { client.dockPanelToWorkspaceEdge('b', 'right'); });
    act(() => { client.dockPanelToWorkspaceEdge('a', 'bottom'); });

    const splits = Array.from(container.querySelectorAll('.rdd-split'));
    expect(splits.length).toBeGreaterThan(0);
    for (const s of splits) {
      expect(s.classList.contains('rdd-split--row') || s.classList.contains('rdd-split--column')).toBe(true);
      expect(inlineProps(s)).toEqual([]);
    }
    for (const c of container.querySelectorAll('.rdd-split-child')) {
      expect(inlineProps(c)).toEqual(['flex-basis', 'flex-grow']);
    }
    const bars = Array.from(container.querySelectorAll('.rdd-split > .rdd-resizer-bar'));
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.classList.contains('rdd-resizer-bar--vertical') || b.classList.contains('rdd-resizer-bar--horizontal')).toBe(true);
      expect(inlineProps(b)).toEqual([]);
    }
    expect(inlineProps(container.querySelector('.rdd-taskbar-footer-container'))).toEqual([]);
  });

  it('sidebar layout, content, strip wrapper, pane and resizer', async () => {
    const { Sidebar } = await import('../Sidebar');
    root = createRoot(container);
    act(() => {
      root!.render(
        <Sidebar tabs={[{ id: 's1', label: 'S', icon: <span />, renderContent: () => <div /> }]} activeTabId="s1">
          <div id="ws" />
        </Sidebar>
      );
    });
    expect(inlineProps(container.querySelector('.rdd-sidebar-layout'))).toEqual([]);
    expect(inlineProps(container.querySelector('.rdd-sidebar-content'))).toEqual([]);
    expect(inlineProps(container.querySelector('.rdd-sidebar-strip-wrap'))).toEqual(['width']);
    expect(inlineProps(container.querySelector('.rdd-sidebar-pane'))).toEqual(['display']);
    expect(inlineProps(container.querySelector('.rdd-sidebar-layout > .rdd-resizer-bar'))).toEqual([]);
    expect(inlineProps(container.querySelector('.rdd-sidebar-content-drawer'))).toEqual(['flex-basis', 'max-width', 'min-width', 'transition']);
  });
});
