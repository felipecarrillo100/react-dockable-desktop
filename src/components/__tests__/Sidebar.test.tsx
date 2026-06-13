/**
 * Tests for Sidebar component, useSidebar(), and useSidebarTab():
 * - SB1:  Renders one button per tab in the strip
 * - SB2:  Tab buttons have aria-pressed=false initially
 * - SB3:  Clicking a tab opens the drawer (content is visible)
 * - SB4:  Clicking the active tab again closes the drawer
 * - SB5:  eagerMount tabs are rendered before any click
 * - SB6:  Non-eagerMount tabs are NOT rendered before click
 * - SB7:  preserveState tabs remain in DOM after drawer closes
 * - SB8:  Non-preserveState tabs are removed from DOM after drawer closes
 * - SB9:  visible=false collapses the tab strip to 0px
 * - SB10: Controlled activeTabId drives which drawer is open
 * - SB11: Imperative handle openTab() opens a specific tab
 * - SB12: Imperative handle closeDrawer() closes the drawer
 * - SB13: Imperative handle show/hide/toggle calls onVisibilityChange
 * - SB14: getActiveTab() returns the current tab or null
 * - SB15: useSidebar() outside Sidebar returns no-op + console.warn
 * - SB16: useSidebarTab() outside Sidebar returns no-op + console.warn
 * - SB17: position='left' places strip before drawer in DOM order
 * - SB18: onActiveTabChange is called when tab selection changes
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { Sidebar, useSidebar, useSidebarTab } from '../Sidebar';
import type { SidebarHandle, SidebarTab } from '../Sidebar';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); root = null; });
  document.body.removeChild(container);
});

const Icon: React.FC = () => <svg />;

const makeTab = (id: string, overrides: Partial<SidebarTab> = {}): SidebarTab => ({
  id,
  label: `Tab ${id}`,
  icon: <Icon />,
  renderContent: (tabId) => <div data-content={tabId}>{tabId} content</div>,
  ...overrides,
});

// ─── SB1: Renders buttons for each tab ───────────────────────────────────────

describe('SB1: Renders one button per tab in the strip', () => {
  it('renders correct number of tab buttons', () => {
    const tabs = [makeTab('a'), makeTab('b'), makeTab('c')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const buttons = container.querySelectorAll('button.sidebar-tab-btn');
    expect(buttons).toHaveLength(3);
  });
});

// ─── SB2: aria-pressed=false initially ───────────────────────────────────────

describe('SB2: Tab buttons have aria-pressed=false initially', () => {
  it('all tab buttons start unpressed', () => {
    const tabs = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const buttons = container.querySelectorAll('button.sidebar-tab-btn');
    buttons.forEach(btn => {
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });
});

// ─── SB3: Clicking tab opens drawer ──────────────────────────────────────────

describe('SB3: Clicking a tab opens the drawer', () => {
  it('content appears after clicking its tab', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    // Before click — content not mounted (non-eagerMount)
    expect(container.querySelector('[data-content="a"]')).toBeNull();

    const btn = container.querySelector('button.sidebar-tab-btn')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.querySelector('[data-content="a"]')).not.toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

// ─── SB4: Clicking active tab closes drawer ──────────────────────────────────

describe('SB4: Clicking active tab again closes the drawer', () => {
  it('second click deactivates the tab', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const btn = container.querySelector('button.sidebar-tab-btn')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});

// ─── SB5: eagerMount ─────────────────────────────────────────────────────────

describe('SB5: eagerMount tabs are rendered before any click', () => {
  it('content is in DOM before tab is clicked', () => {
    const tabs = [makeTab('a', { eagerMount: true })];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    expect(container.querySelector('[data-content="a"]')).not.toBeNull();
  });
});

// ─── SB6: Non-eagerMount not rendered before click ───────────────────────────

describe('SB6: Non-eagerMount tabs are not rendered before click', () => {
  it('content is absent before tab is clicked', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    expect(container.querySelector('[data-content="a"]')).toBeNull();
  });
});

// ─── SB7: preserveState stays in DOM after close ─────────────────────────────

describe('SB7: preserveState tabs remain in DOM after close', () => {
  it('content stays in DOM (hidden) after drawer closes', () => {
    const tabs = [makeTab('a', { preserveState: true })];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const btn = container.querySelector('button.sidebar-tab-btn')!;
    // Open
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-content="a"]')).not.toBeNull();
    // Close
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Still mounted (just hidden via display:none on parent)
    expect(container.querySelector('[data-content="a"]')).not.toBeNull();
  });
});

// ─── SB8: Non-preserveState unmounted after close ────────────────────────────

describe('SB8: Non-preserveState tabs are removed from DOM after close', () => {
  it('content is removed from DOM after drawer closes', () => {
    const tabs = [makeTab('a')]; // default: no eagerMount, no preserveState
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const btn = container.querySelector('button.sidebar-tab-btn')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-content="a"]')).not.toBeNull();
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-content="a"]')).toBeNull();
  });
});

// ─── SB9: visible=false collapses strip ──────────────────────────────────────

describe('SB9: visible=false collapses the tab strip', () => {
  it('strip wrapper has width 0px when visible=false', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} visible={false} />);
    });
    // The outer wrapper div that drives the collapse transition
    const stripWrapper = container.querySelector('[style*="width"]') as HTMLElement | null;
    // Find the one that is 0px (collapse wrapper)
    const allStyled = Array.from(container.querySelectorAll('[style]')) as HTMLElement[];
    const collapsed = allStyled.find(el => el.style.width === '0px');
    expect(collapsed).not.toBeUndefined();
  });

  it('strip wrapper has width 56px when visible=true (default)', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} visible={true} />);
    });
    const allStyled = Array.from(container.querySelectorAll('[style]')) as HTMLElement[];
    const expanded = allStyled.find(el => el.style.width === '56px');
    expect(expanded).not.toBeUndefined();
  });
});

// ─── SB10: Controlled activeTabId ────────────────────────────────────────────

describe('SB10: Controlled activeTabId drives which drawer is open', () => {
  it('renders the controlled tab as active', () => {
    const tabs = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} activeTabId="b" />);
    });
    const buttons = Array.from(container.querySelectorAll('button.sidebar-tab-btn'));
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    // Content for b should be visible
    expect(container.querySelector('[data-content="b"]')).not.toBeNull();
  });

  it('calls onActiveTabChange when a tab is clicked in controlled mode', () => {
    const onChange = vi.fn();
    const tabs = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} activeTabId={null} onActiveTabChange={onChange} />);
    });
    const btn = container.querySelectorAll('button.sidebar-tab-btn')[0];
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

// ─── SB11-SB14: Imperative handle ────────────────────────────────────────────

describe('SB11-SB14: Imperative handle', () => {
  it('SB11: openTab() activates the correct tab', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} ref={ref} />);
    });
    act(() => { ref.current!.openTab('b'); });
    const buttons = Array.from(container.querySelectorAll('button.sidebar-tab-btn'));
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('SB12: closeDrawer() closes the drawer', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(container.querySelector('button.sidebar-tab-btn')!.getAttribute('aria-pressed')).toBe('true');
    act(() => { ref.current!.closeDrawer(); });
    expect(container.querySelector('button.sidebar-tab-btn')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('SB14: getActiveTab() returns null initially, tab id when open', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} ref={ref} />);
    });
    expect(ref.current!.getActiveTab()).toBeNull();
    act(() => { ref.current!.openTab('a'); });
    expect(ref.current!.getActiveTab()).toBe('a');
  });

  it('SB13: show() calls onVisibilityChange(true)', () => {
    const onChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[]} ref={ref} visible={false} onVisibilityChange={onChange} />);
    });
    act(() => { ref.current!.show(); });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('SB13: hide() calls onVisibilityChange(false)', () => {
    const onChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[]} ref={ref} visible={true} onVisibilityChange={onChange} />);
    });
    act(() => { ref.current!.hide(); });
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('SB13: toggle() calls onVisibilityChange(true) when visible=false', () => {
    const onChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[]} ref={ref} visible={false} onVisibilityChange={onChange} />);
    });
    act(() => { ref.current!.toggle(); });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('SB13: toggle() calls onVisibilityChange(false) when visible=true', () => {
    const onChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[]} ref={ref} visible={true} onVisibilityChange={onChange} />);
    });
    act(() => { ref.current!.toggle(); });
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

// ─── SB15: useSidebar() outside Sidebar ──────────────────────────────────────

describe('SB15: useSidebar() outside Sidebar returns no-op + console.warn', () => {
  it('warns and returns no-op', () => {
    let ctx: ReturnType<typeof useSidebar> | null = null;
    const Probe: React.FC = () => {
      ctx = useSidebar();
      return null;
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => {
      root = createRoot(container);
      root.render(<Probe />);
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('useSidebar()'));
    expect(ctx!.getActiveTab()).toBeNull();
    expect(() => ctx!.openTab('x')).not.toThrow();
    expect(() => ctx!.closeDrawer()).not.toThrow();
    warnSpy.mockRestore();
  });
});

// ─── SB16: useSidebarTab() outside Sidebar ───────────────────────────────────

describe('SB16: useSidebarTab() outside Sidebar returns no-op + console.warn', () => {
  it('warns and returns no-op with empty tabId', () => {
    let ctx: ReturnType<typeof useSidebarTab> | null = null;
    const Probe: React.FC = () => {
      ctx = useSidebarTab();
      return null;
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => {
      root = createRoot(container);
      root.render(<Probe />);
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('useSidebarTab()'));
    expect(ctx!.tabId).toBe('');
    expect(() => ctx!.onOpen()).not.toThrow();
    expect(() => ctx!.onClose()).not.toThrow();
    expect(() => ctx!.openTab('x')).not.toThrow();
    warnSpy.mockRestore();
  });
});

// ─── SB17: position='left' DOM order ─────────────────────────────────────────

describe('SB17: position controls strip and drawer order', () => {
  it("position='left': strip comes before drawer in DOM", () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} position="left" activeTabId="a" />);
    });
    // SidebarContext.Provider renders no DOM node — strip and drawer are direct children of container
    const allChildren = Array.from(container.children);
    const stripIdx = allChildren.findIndex(el => el.querySelector('.sidebar-tabs-strip'));
    const drawerIdx = allChildren.findIndex(el => el.classList.contains('sidebar-content-drawer'));
    expect(stripIdx).toBeGreaterThanOrEqual(0);
    expect(drawerIdx).toBeGreaterThanOrEqual(0);
    expect(stripIdx).toBeLessThan(drawerIdx);
  });

  it("position='right' (default): drawer comes before strip in DOM", () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} position="right" activeTabId="a" />);
    });
    const allChildren = Array.from(container.children);
    const stripIdx = allChildren.findIndex(el => el.querySelector('.sidebar-tabs-strip'));
    const drawerIdx = allChildren.findIndex(el => el.classList.contains('sidebar-content-drawer'));
    expect(stripIdx).toBeGreaterThanOrEqual(0);
    expect(drawerIdx).toBeGreaterThanOrEqual(0);
    expect(drawerIdx).toBeLessThan(stripIdx);
  });
});

// ─── SB18: onActiveTabChange ──────────────────────────────────────────────────

describe('SB18: onActiveTabChange is called on tab selection changes', () => {
  it('fires with tab id when tab is opened', () => {
    const onChange = vi.fn();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} onActiveTabChange={onChange} />);
    });
    const btn = container.querySelector('button.sidebar-tab-btn')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('fires with null when active tab is clicked to close', () => {
    const onChange = vi.fn();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} onActiveTabChange={onChange} />);
    });
    const btn = container.querySelector('button.sidebar-tab-btn')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
