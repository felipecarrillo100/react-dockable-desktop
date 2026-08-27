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
 * - SB15: useSidebar() outside Sidebar throws
 * - SB16: useSidebarTab() outside Sidebar throws
 * - SB17: position='left' places strip before drawer in DOM order
 * - SB18: onActiveTabChange is called when tab selection changes
 * - SB19: defaultWidth initializes drawer width in pixels
 * - SB21: setWidth/getWidth imperative methods
 * - SB22: setWidth clamps to minWidth and maxWidth bounds
 * - SB23: stripVisible=false collapses only the strip, drawer unaffected
 * - SB24: showStrip/hideStrip imperative methods call onStripVisibilityChange
 * - SB25: resize handle renders only when drawer is open
 * - SB26: children wrapper uses flex-basis:0 (content can't inflate it and shift the drawer)
 * - SB27: drawer auto-closes when the active tab stops existing in `tabs`
 * - SB28: headerAction renders a standalone, non-toggling button above the tabs
 * - SB29: showCloseButton adds an extra close control to the drawer header
 * - SB30: footerAction mirrors headerAction, pinned to the bottom, and can mix tabs and action buttons
 * - SB31: hidden tab renders no rail button; other tabs unaffected
 * - SB32: hidden tab still opens via imperative openTab()
 * - SB33: hidden tab still opens via controlled activeTabId
 * - SB34: hidden entry inside headerAction/footerAction renders no button but still opens
 * - SB35: every tab hidden -> zero rail buttons, all still individually openable
 * - SB36: auto-close-if-removed guard still fires when the removed active tab was hidden
 * - SB37: Sidebar-level hideDefaultHeader suppresses the drawer header for every tab, not per-tab
 * - SB38: the default header still renders when hideDefaultHeader is omitted (contrast w/ SB37)
 * - SB39: renderHeader renders in place of the default header; its onClose parameter still works
 * - SB40: hideDefaultHeader with no renderHeader renders nothing; useSidebarTab().onClose still works
 * - SB41: renderHeader alone, without hideDefaultHeader, is sufficient to suppress the default header
 * - SB42: dev-only console.warn when showCloseButton has no effect (default header suppressed)
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
    const buttons = container.querySelectorAll('button.rdd-sidebar-tab-btn');
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
    const buttons = container.querySelectorAll('button.rdd-sidebar-tab-btn');
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

    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
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
    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
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
    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
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
    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
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
    const buttons = Array.from(container.querySelectorAll('button.rdd-sidebar-tab-btn'));
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
    const btn = container.querySelectorAll('button.rdd-sidebar-tab-btn')[0];
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
    const buttons = Array.from(container.querySelectorAll('button.rdd-sidebar-tab-btn'));
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
    expect(container.querySelector('button.rdd-sidebar-tab-btn')!.getAttribute('aria-pressed')).toBe('true');
    act(() => { ref.current!.closeDrawer(); });
    expect(container.querySelector('button.rdd-sidebar-tab-btn')!.getAttribute('aria-pressed')).toBe('false');
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

describe('SB15: useSidebar() outside Sidebar throws', () => {
  it('throws when rendered outside a Sidebar tree', () => {
    const Probe: React.FC = () => {
      useSidebar();
      return null;
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        root = createRoot(container);
        root.render(<Probe />);
      });
    }).toThrow('useSidebar must be used within Sidebar');
    errorSpy.mockRestore();
  });
});

// ─── SB16: useSidebarTab() outside Sidebar ───────────────────────────────────

describe('SB16: useSidebarTab() outside Sidebar throws', () => {
  it('throws when rendered outside a Sidebar tab renderContent tree', () => {
    const Probe: React.FC = () => {
      useSidebarTab();
      return null;
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        root = createRoot(container);
        root.render(<Probe />);
      });
    }).toThrow('useSidebarTab must be used within a Sidebar tab renderContent tree');
    errorSpy.mockRestore();
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
    // SidebarContext.Provider renders no DOM node — container.children[0] is the root flex div.
    // Strip is inside a transition wrapper div; drawer is a direct child of the root flex div.
    const rootFlexDiv = container.children[0];
    const allChildren = Array.from(rootFlexDiv.children);
    const stripIdx = allChildren.findIndex(el => el.querySelector('.rdd-sidebar-tabs-strip'));
    const drawerIdx = allChildren.findIndex(el => el.classList.contains('rdd-sidebar-content-drawer'));
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
    const rootFlexDiv = container.children[0];
    const allChildren = Array.from(rootFlexDiv.children);
    const stripIdx = allChildren.findIndex(el => el.querySelector('.rdd-sidebar-tabs-strip'));
    const drawerIdx = allChildren.findIndex(el => el.classList.contains('rdd-sidebar-content-drawer'));
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
    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
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
    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

// ─── SB19: defaultWidth initializes drawer flex-basis ────────────────────────

describe('SB19: defaultWidth initializes drawer width in pixels', () => {
  it('drawer flex-basis reflects defaultWidth prop', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} defaultWidth={300} activeTabId="a" />);
    });
    const drawer = container.querySelector('.rdd-sidebar-content-drawer') as HTMLElement;
    expect(drawer.style.flexBasis).toBe('300px');
  });

  it('defaults to 280px when defaultWidth is omitted', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} activeTabId="a" />);
    });
    const drawer = container.querySelector('.rdd-sidebar-content-drawer') as HTMLElement;
    expect(drawer.style.flexBasis).toBe('280px');
  });
});

// ─── SB21: setWidth / getWidth imperative methods ────────────────────────────

describe('SB21: setWidth/getWidth imperative methods', () => {
  it('setWidth updates drawer flex-basis', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} defaultWidth={220} activeTabId="a" />);
    });
    act(() => { ref.current!.setWidth(400); });
    const drawer = container.querySelector('.rdd-sidebar-content-drawer') as HTMLElement;
    expect(drawer.style.flexBasis).toBe('400px');
  });

  it('getWidth returns the current pixel width', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} defaultWidth={260} />);
    });
    expect(ref.current!.getWidth()).toBe(260);
  });

  it('getWidth reflects width after setWidth', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} defaultWidth={220} />);
    });
    act(() => { ref.current!.setWidth(380); });
    expect(ref.current!.getWidth()).toBe(380);
  });

  it('setWidth fires onWidthChange callback', () => {
    const onWidthChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} onWidthChange={onWidthChange} />);
    });
    act(() => { ref.current!.setWidth(340); });
    expect(onWidthChange).toHaveBeenCalledWith(340);
  });
});

// ─── SB22: setWidth clamps to min/max bounds ─────────────────────────────────

describe('SB22: setWidth clamps to minWidth and maxWidth bounds', () => {
  it('setWidth below minWidth is clamped to minWidth', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} minWidth={150} maxWidth={600} activeTabId="a" />);
    });
    act(() => { ref.current!.setWidth(50); });
    expect(ref.current!.getWidth()).toBe(150);
    const drawer = container.querySelector('.rdd-sidebar-content-drawer') as HTMLElement;
    expect(drawer.style.flexBasis).toBe('150px');
  });

  it('setWidth above maxWidth is clamped to maxWidth', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} minWidth={150} maxWidth={600} activeTabId="a" />);
    });
    act(() => { ref.current!.setWidth(800); });
    expect(ref.current!.getWidth()).toBe(600);
    const drawer = container.querySelector('.rdd-sidebar-content-drawer') as HTMLElement;
    expect(drawer.style.flexBasis).toBe('600px');
  });
});

// ─── SB23: stripVisible prop ─────────────────────────────────────────────────

describe('SB23: stripVisible=false collapses only the strip', () => {
  it('strip wrapper collapses to 0px when stripVisible=false', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} stripVisible={false} />);
    });
    const rootFlexDiv = container.children[0];
    const stripWrapper = Array.from(rootFlexDiv.children).find(el => el.querySelector('.rdd-sidebar-tabs-strip')) as HTMLElement | undefined;
    expect(stripWrapper).toBeDefined();
    expect(stripWrapper!.style.width).toBe('0px');
  });

  it('strip wrapper is visible (56px) when stripVisible is omitted', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const rootFlexDiv = container.children[0];
    const stripWrapper = Array.from(rootFlexDiv.children).find(el => el.querySelector('.rdd-sidebar-tabs-strip')) as HTMLElement | undefined;
    expect(stripWrapper).toBeDefined();
    expect(stripWrapper!.style.width).toBe('56px');
  });

  it('stripVisible=false does not hide the drawer when a tab is open', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} activeTabId="a" stripVisible={false} />);
    });
    const content = container.querySelector('[data-content="a"]');
    expect(content).not.toBeNull();
  });
});

// ─── SB24: showStrip / hideStrip imperative methods ──────────────────────────

describe('SB24: showStrip/hideStrip call onStripVisibilityChange', () => {
  it('showStrip() calls onStripVisibilityChange(true)', () => {
    const onStripVisibilityChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} onStripVisibilityChange={onStripVisibilityChange} />);
    });
    act(() => { ref.current!.showStrip(); });
    expect(onStripVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('hideStrip() calls onStripVisibilityChange(false)', () => {
    const onStripVisibilityChange = vi.fn();
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar ref={ref} tabs={tabs} onStripVisibilityChange={onStripVisibilityChange} />);
    });
    act(() => { ref.current!.hideStrip(); });
    expect(onStripVisibilityChange).toHaveBeenCalledWith(false);
  });
});

// ─── SB25: resize handle present only when drawer is open ────────────────────

describe('SB25: resize handle renders only when drawer is open', () => {
  it('no .rdd-resizer-bar when no tab is active', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    expect(container.querySelector('.rdd-resizer-bar')).toBeNull();
  });

  it('.rdd-resizer-bar is present when a tab is active', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} activeTabId="a" />);
    });
    expect(container.querySelector('.rdd-resizer-bar')).not.toBeNull();
  });
});

// ─── SB26: children wrapper flex-basis:0 ──────────────────────────────────────

describe('SB26: children wrapper uses flex-basis:0 (content can\'t inflate it and shift the drawer)', () => {
  it('wrapper around {children} has flex-basis 0 and minWidth 0', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar tabs={tabs} activeTabId="a">
          <div>workspace content</div>
        </Sidebar>
      );
    });
    // flex-basis:auto (the default for a plain "flex-grow" pattern) lets a flex item's
    // hypothetical size be computed from its content's max-content width — minWidth:0 alone
    // only affects the shrink floor, not that starting size. Using flex-basis:0 makes the
    // wrapper's size purely a function of flex-grow's share of space, so it can never inflate
    // and steal width from a sibling (e.g. the drawer) based on what's rendered inside it.
    const rootFlexDiv = container.children[0];
    const wrapper = Array.from(rootFlexDiv.children).find(
      (el) => el.textContent === 'workspace content'
    ) as HTMLElement | undefined;
    expect(wrapper).toBeDefined();
    expect(wrapper!.style.flexBasis).toBe('0%');
    expect(wrapper!.style.minWidth).toBe('0px');
  });
});

// ─── SB27: auto-close when active tab vanishes from `tabs` ───────────────────

describe('SB27: drawer auto-closes when the active tab stops existing in tabs', () => {
  it('uncontrolled: closes when the active tab is removed but other tabs remain', () => {
    const ref = createRef<SidebarHandle>();
    const tabsAB = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabsAB} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(ref.current!.getActiveTab()).toBe('a');

    act(() => {
      root!.render(<Sidebar tabs={[makeTab('b')]} ref={ref} />);
    });
    expect(ref.current!.getActiveTab()).toBeNull();
  });

  it('uncontrolled: closes when tabs becomes fully empty', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(ref.current!.getActiveTab()).toBe('a');

    act(() => {
      root!.render(<Sidebar tabs={[]} ref={ref} />);
    });
    expect(ref.current!.getActiveTab()).toBeNull();
  });

  it('does NOT fall back to a different tab when the active one vanishes', () => {
    const ref = createRef<SidebarHandle>();
    const tabsAB = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabsAB} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });

    act(() => {
      root!.render(<Sidebar tabs={[makeTab('b')]} ref={ref} />);
    });
    // Must be null (closed), not 'b' — never silently switch to a tab the user didn't pick.
    expect(ref.current!.getActiveTab()).toBeNull();
    const btn = container.querySelector('button.rdd-sidebar-tab-btn')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('controlled: calls onActiveTabChange(null) when the controlled active tab vanishes', () => {
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} activeTabId="a" onActiveTabChange={onChange} />);
    });

    act(() => {
      root!.render(<Sidebar tabs={[makeTab('b')]} activeTabId="a" onActiveTabChange={onChange} />);
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

// ─── SB28: headerAction ───────────────────────────────────────────────────────

describe('SB28: headerAction renders a standalone, non-toggling button above the tabs', () => {
  it('renders no extra button when headerAction is omitted (backward compatible)', () => {
    const tabs = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const buttons = container.querySelectorAll('button.rdd-sidebar-tab-btn');
    expect(buttons.length).toBe(tabs.length);
  });

  it('renders a button with the given icon/label, calls onClick, and never opens the drawer', () => {
    const onClick = vi.fn();
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={tabs}
          ref={ref}
          headerAction={{ icon: <Icon />, label: 'Menu', onClick }}
        />
      );
    });

    const buttons = container.querySelectorAll('button.rdd-sidebar-tab-btn');
    expect(buttons.length).toBe(tabs.length + 1);

    const headerBtn = buttons[0] as HTMLElement;
    expect(headerBtn.getAttribute('aria-label')).toBe('Menu');
    expect(headerBtn.hasAttribute('aria-pressed')).toBe(false);

    act(() => { headerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current!.getActiveTab()).toBeNull();
  });

  it('disabled: true renders a disabled button that does not fire onClick', () => {
    const onClick = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[makeTab('a')]}
          headerAction={{ icon: <Icon />, label: 'Menu', onClick, disabled: true }}
        />
      );
    });

    const headerBtn = container.querySelectorAll('button.rdd-sidebar-tab-btn')[0] as HTMLButtonElement;
    expect(headerBtn.disabled).toBe(true);

    act(() => { headerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('render: renders the custom node wholesale, with no .rdd-sidebar-tab-btn generated for it', () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[makeTab('a')]}
          headerAction={{ render: () => <div data-testid="custom-hb">Custom</div> }}
        />
      );
    });

    expect(container.querySelector('[data-testid="custom-hb"]')).not.toBeNull();
    // Only the regular tab's own button should have this class — none for the custom slot.
    expect(container.querySelectorAll('button.rdd-sidebar-tab-btn').length).toBe(1);
  });

  it('adds the reduced-top-padding modifier class to the strip only when headerAction is present', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    let strip = container.querySelector('.rdd-sidebar-tabs-strip')!;
    expect(strip.classList.contains('rdd-sidebar-tabs-strip--has-header-action')).toBe(false);

    // Same check holds for the fully-custom render form, not just the default button —
    // the modifier is driven by headerAction's presence, not by which form it takes.
    act(() => {
      root!.render(<Sidebar tabs={tabs} headerAction={{ render: () => <div>Custom</div> }} />);
    });
    strip = container.querySelector('.rdd-sidebar-tabs-strip')!;
    expect(strip.classList.contains('rdd-sidebar-tabs-strip--has-header-action')).toBe(true);
  });

  it('wraps headerAction in .rdd-sidebar-header-area (both forms) and tabs in .rdd-sidebar-tabs-list', () => {
    const tabs = [makeTab('a'), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    // No headerAction: no header-area wrapper, but tabs still live in their own list wrapper.
    expect(container.querySelector('.rdd-sidebar-header-area')).toBeNull();
    let list = container.querySelector('.rdd-sidebar-tabs-list');
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll('button.rdd-sidebar-tab-btn').length).toBe(2);

    act(() => {
      root!.render(
        <Sidebar tabs={tabs} headerAction={{ icon: <Icon />, label: 'Menu', onClick: vi.fn() }} />
      );
    });
    const headerArea = container.querySelector('.rdd-sidebar-header-area');
    expect(headerArea).not.toBeNull();
    expect(headerArea!.querySelector('button.rdd-sidebar-tab-btn')).not.toBeNull();
    list = container.querySelector('.rdd-sidebar-tabs-list');
    expect(list!.querySelectorAll('button.rdd-sidebar-tab-btn').length).toBe(2);

    act(() => {
      root!.render(
        <Sidebar tabs={tabs} headerAction={{ render: () => <div data-testid="custom-hb2" /> }} />
      );
    });
    const headerArea2 = container.querySelector('.rdd-sidebar-header-area');
    expect(headerArea2).not.toBeNull();
    expect(headerArea2!.querySelector('[data-testid="custom-hb2"]')).not.toBeNull();
  });
});

// ─── SB29: showCloseButton ──────────────────────────────────────────────────

describe('SB29: showCloseButton adds an extra close control to the drawer header', () => {
  it('renders no close button when showCloseButton is omitted (backward compatible)', () => {
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(container.querySelector('.rdd-sidebar-drawer-close-button')).toBeNull();
  });

  it('renders a close button in the drawer header when showCloseButton is true', () => {
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} ref={ref} showCloseButton />);
    });
    act(() => { ref.current!.openTab('a'); });
    const closeBtn = container.querySelector('.rdd-sidebar-drawer-header .rdd-sidebar-drawer-close-button');
    expect(closeBtn).not.toBeNull();
  });

  it('clicking the close button collapses the drawer via the same path as clicking the active tab icon', () => {
    const ref = createRef<SidebarHandle>();
    const onChange = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar tabs={[makeTab('a')]} ref={ref} showCloseButton onActiveTabChange={onChange} />
      );
    });
    act(() => { ref.current!.openTab('a'); });
    expect(ref.current!.getActiveTab()).toBe('a');

    const closeBtn = container.querySelector('.rdd-sidebar-drawer-close-button') as HTMLElement;
    act(() => { closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(ref.current!.getActiveTab()).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not render a close button when the drawer is closed (no active tab)', () => {
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} showCloseButton />);
    });
    expect(container.querySelector('.rdd-sidebar-drawer-close-button')).toBeNull();
  });
});

// ─── SB30: footerAction ─────────────────────────────────────────────────────

describe('SB30: footerAction mirrors headerAction, pinned to the bottom, and can mix tabs and action buttons', () => {
  it('renders no footer-area when footerAction is omitted (backward compatible)', () => {
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} />);
    });
    expect(container.querySelector('.rdd-sidebar-footer-area')).toBeNull();
  });

  it('renders a single action button in .rdd-sidebar-footer-area, firing onClick without touching activeTabId', () => {
    const onClick = vi.fn();
    const ref = createRef<SidebarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[makeTab('a')]}
          ref={ref}
          footerAction={{ icon: <Icon />, label: 'Settings', onClick }}
        />
      );
    });
    const footerArea = container.querySelector('.rdd-sidebar-footer-area');
    expect(footerArea).not.toBeNull();
    const footerBtn = footerArea!.querySelector('button.rdd-sidebar-tab-btn') as HTMLElement;
    expect(footerBtn.getAttribute('aria-label')).toBe('Settings');

    act(() => { footerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current!.getActiveTab()).toBeNull();
  });

  it('adds the --has-footer-action modifier class to the strip only when footerAction is present', () => {
    const tabs = [makeTab('a')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    let strip = container.querySelector('.rdd-sidebar-tabs-strip')!;
    expect(strip.classList.contains('rdd-sidebar-tabs-strip--has-footer-action')).toBe(false);

    act(() => {
      root!.render(
        <Sidebar tabs={tabs} footerAction={{ icon: <Icon />, label: 'Settings', onClick: vi.fn() }} />
      );
    });
    strip = container.querySelector('.rdd-sidebar-tabs-strip')!;
    expect(strip.classList.contains('rdd-sidebar-tabs-strip--has-footer-action')).toBe(true);
  });

  it('accepts an array mixing an action button and a real SidebarTab, rendering both in the footer area', () => {
    const onClick = vi.fn();
    const settingsTab = makeTab('settings', { label: 'Settings' });
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[makeTab('a')]}
          footerAction={[{ icon: <Icon />, label: 'Info', onClick }, settingsTab]}
        />
      );
    });
    const footerArea = container.querySelector('.rdd-sidebar-footer-area')!;
    const footerButtons = footerArea.querySelectorAll('button.rdd-sidebar-tab-btn');
    expect(footerButtons.length).toBe(2);
  });

  it('a tab entry inside footerAction behaves exactly like a main-list tab: mounts, activates, and renders its drawer content on click', () => {
    const ref = createRef<SidebarHandle>();
    const settingsTab = makeTab('settings', { label: 'Settings' });
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} ref={ref} footerAction={settingsTab} />);
    });

    const footerBtn = container.querySelector(
      '.rdd-sidebar-footer-area button.rdd-sidebar-tab-btn'
    ) as HTMLElement;
    act(() => { footerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(ref.current!.getActiveTab()).toBe('settings');
    expect(container.querySelector('[data-content="settings"]')).not.toBeNull();
    expect(footerBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('removing a footer tab while active closes the drawer instead of leaving stale content (SB27 for rail tabs)', () => {
    const ref = createRef<SidebarHandle>();
    const settingsTab = makeTab('settings', { label: 'Settings' });
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} ref={ref} footerAction={settingsTab} />);
    });
    act(() => { ref.current!.openTab('settings'); });
    expect(container.querySelector('[data-content="settings"]')).not.toBeNull();

    act(() => {
      root!.render(<Sidebar tabs={[makeTab('a')]} ref={ref} />);
    });
    expect(ref.current!.getActiveTab()).toBeNull();
    expect(container.querySelector('[data-content="settings"]')).toBeNull();
  });

  it('existing single-object headerAction usage continues to work unchanged alongside footerAction', () => {
    const headerClick = vi.fn();
    const footerClick = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[makeTab('a')]}
          headerAction={{ icon: <Icon />, label: 'Menu', onClick: headerClick }}
          footerAction={{ icon: <Icon />, label: 'Settings', onClick: footerClick }}
        />
      );
    });
    const headerBtn = container.querySelector(
      '.rdd-sidebar-header-area button.rdd-sidebar-tab-btn'
    ) as HTMLElement;
    const footerBtn = container.querySelector(
      '.rdd-sidebar-footer-area button.rdd-sidebar-tab-btn'
    ) as HTMLElement;
    act(() => { headerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { footerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(headerClick).toHaveBeenCalledTimes(1);
    expect(footerClick).toHaveBeenCalledTimes(1);
  });
});

// ─── SB31: hidden tab renders no rail button ─────────────────────────────────

describe('SB31: hidden tab renders no rail button', () => {
  it('omits the button for a hidden tab while other tabs still render theirs', () => {
    const tabs = [makeTab('a'), makeTab('b', { hidden: true }), makeTab('c')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} />);
    });
    const buttons = container.querySelectorAll('button.rdd-sidebar-tab-btn');
    expect(buttons).toHaveLength(2);
    const titles = Array.from(buttons).map(b => b.getAttribute('title'));
    expect(titles).toEqual(['Tab a', 'Tab c']);
  });
});

// ─── SB32: hidden tab still opens via imperative openTab() ───────────────────

describe('SB32: hidden tab still opens via imperative openTab()', () => {
  it('mounts drawer content for a hidden tab when opened programmatically', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [makeTab('a'), makeTab('b', { hidden: true })];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} ref={ref} />);
    });
    act(() => { ref.current!.openTab('b'); });
    expect(ref.current!.getActiveTab()).toBe('b');
    expect(container.querySelector('[data-content="b"]')).not.toBeNull();
  });
});

// ─── SB33: hidden tab still opens via controlled activeTabId ─────────────────

describe('SB33: hidden tab still opens via controlled activeTabId', () => {
  it('mounts drawer content for a hidden tab set as the controlled active tab', () => {
    const tabs = [makeTab('a'), makeTab('b', { hidden: true })];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} activeTabId="b" onActiveTabChange={() => {}} />);
    });
    expect(container.querySelector('[data-content="b"]')).not.toBeNull();
  });
});

// ─── SB34: hidden entry inside headerAction/footerAction ─────────────────────

describe('SB34: hidden entry inside headerAction/footerAction renders no button but still opens', () => {
  it('headerAction: a hidden tab entry renders no button but still opens via openTab()', () => {
    const ref = createRef<SidebarHandle>();
    const hiddenTab = makeTab('settings', { hidden: true });
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} ref={ref} headerAction={hiddenTab} />);
    });
    const headerArea = container.querySelector('.rdd-sidebar-header-area');
    expect(headerArea).not.toBeNull();
    expect(headerArea!.querySelectorAll('button.rdd-sidebar-tab-btn')).toHaveLength(0);

    act(() => { ref.current!.openTab('settings'); });
    expect(ref.current!.getActiveTab()).toBe('settings');
    expect(container.querySelector('[data-content="settings"]')).not.toBeNull();
  });

  it('footerAction: a hidden tab entry renders no button but still opens via openTab()', () => {
    const ref = createRef<SidebarHandle>();
    const hiddenTab = makeTab('settings', { hidden: true });
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[makeTab('a')]} ref={ref} footerAction={hiddenTab} />);
    });
    const footerArea = container.querySelector('.rdd-sidebar-footer-area');
    expect(footerArea).not.toBeNull();
    expect(footerArea!.querySelectorAll('button.rdd-sidebar-tab-btn')).toHaveLength(0);

    act(() => { ref.current!.openTab('settings'); });
    expect(ref.current!.getActiveTab()).toBe('settings');
  });
});

// ─── SB35: every tab hidden -> zero rail buttons ─────────────────────────────

describe('SB35: every tab hidden -> zero rail buttons, all still individually openable', () => {
  it('renders no buttons in the tabs list when every tab is hidden, but each still opens via openTab()', () => {
    const ref = createRef<SidebarHandle>();
    const tabs = [
      makeTab('a', { hidden: true }),
      makeTab('b', { hidden: true }),
      makeTab('c', { hidden: true }),
    ];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabs} ref={ref} />);
    });
    expect(container.querySelectorAll('.rdd-sidebar-tabs-list button.rdd-sidebar-tab-btn')).toHaveLength(0);

    act(() => { ref.current!.openTab('b'); });
    expect(ref.current!.getActiveTab()).toBe('b');
    expect(container.querySelector('[data-content="b"]')).not.toBeNull();

    act(() => { ref.current!.openTab('c'); });
    expect(ref.current!.getActiveTab()).toBe('c');
  });

  it('composes with a visible headerAction hamburger: rail shows exactly one button while all tabs stay hidden', () => {
    const onClick = vi.fn();
    const tabs = [makeTab('a', { hidden: true }), makeTab('b', { hidden: true })];
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar tabs={tabs} headerAction={{ icon: <Icon />, label: 'Menu', onClick }} />
      );
    });
    expect(container.querySelectorAll('button.rdd-sidebar-tab-btn')).toHaveLength(1);
    expect(container.querySelector('.rdd-sidebar-header-area button.rdd-sidebar-tab-btn')).not.toBeNull();
  });
});

// ─── SB36: auto-close-if-removed guard with a hidden active tab ─────────────

describe('SB36: auto-close-if-removed guard still fires when the removed active tab was hidden', () => {
  it('closes when the active hidden tab is removed, mirroring SB27 for a visible tab', () => {
    const ref = createRef<SidebarHandle>();
    const tabsAB = [makeTab('a', { hidden: true }), makeTab('b')];
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={tabsAB} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(ref.current!.getActiveTab()).toBe('a');

    act(() => {
      root!.render(<Sidebar tabs={[makeTab('b')]} ref={ref} />);
    });
    expect(ref.current!.getActiveTab()).toBeNull();
  });
});

// ─── SB37: hideDefaultHeader (Sidebar-level) suppresses the header for ALL tabs ─

describe('SB37: hideDefaultHeader suppresses the drawer header for every tab, not per-tab', () => {
  it('renders no .rdd-sidebar-drawer-header for any tab, even with showCloseButton set', () => {
    const ref = createRef<SidebarHandle>();
    const tabA = makeTab('a');
    const tabB = makeTab('b');
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tabA, tabB]} ref={ref} hideDefaultHeader showCloseButton />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(container.querySelector('.rdd-sidebar-drawer-header')).toBeNull();
    act(() => { ref.current!.openTab('b'); });
    expect(container.querySelector('.rdd-sidebar-drawer-header')).toBeNull();
  });
});

// ─── SB38: default header still renders when hideDefaultHeader is omitted ──

describe('SB38: the default header still renders when hideDefaultHeader is omitted', () => {
  it('renders .rdd-sidebar-drawer-header and its title as before (contrast with SB37)', () => {
    const ref = createRef<SidebarHandle>();
    const tab = makeTab('a', { label: 'Plain Tab' });
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tab]} ref={ref} />);
    });
    act(() => { ref.current!.openTab('a'); });
    const header = container.querySelector('.rdd-sidebar-drawer-header');
    expect(header).not.toBeNull();
    expect(header!.querySelector('.rdd-sidebar-header-title')?.textContent).toBe('Plain Tab');
  });
});

// ─── SB39: renderHeader supplies a shared header, its onClose still works ──

describe('SB39: renderHeader renders in place of the default header and its onClose collapses the drawer', () => {
  it("renders renderHeader's output for the active tab, and its onClose parameter closes the drawer", () => {
    const ref = createRef<SidebarHandle>();
    const tabA = makeTab('a', { label: 'Tab A' });
    const tabB = makeTab('b', { label: 'Tab B' });
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[tabA, tabB]}
          ref={ref}
          hideDefaultHeader
          renderHeader={(tab, onClose) => (
            <div data-testid="custom-header">
              <span data-testid="custom-header-label">{tab.label}</span>
              <button data-testid="custom-close" onClick={onClose}>close</button>
            </div>
          )}
        />
      );
    });
    act(() => { ref.current!.openTab('b'); });
    expect(container.querySelector('.rdd-sidebar-drawer-header')).toBeNull();
    expect(container.querySelector('[data-testid="custom-header-label"]')?.textContent).toBe('Tab B');

    const customClose = container.querySelector('[data-testid="custom-close"]') as HTMLElement;
    expect(customClose).not.toBeNull();
    act(() => { customClose.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(ref.current!.getActiveTab()).toBeNull();
  });
});

// ─── SB40: no renderHeader renders nothing; useSidebarTab().onClose still works ─

describe('SB40: hideDefaultHeader with no renderHeader renders nothing for the header; useSidebarTab().onClose still works', () => {
  it('renders no default header, no renderHeader output, and a nested onClose still collapses the drawer', () => {
    const ref = createRef<SidebarHandle>();

    const NestedCloseButton: React.FC = () => {
      const { onClose } = useSidebarTab();
      return <button data-testid="nested-close" onClick={onClose}>nested close</button>;
    };

    const tab = makeTab('a', {
      renderContent: () => <NestedCloseButton />,
    });
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tab]} ref={ref} hideDefaultHeader />);
    });
    act(() => { ref.current!.openTab('a'); });
    expect(container.querySelector('.rdd-sidebar-drawer-header')).toBeNull();
    expect(ref.current!.getActiveTab()).toBe('a');

    const nestedClose = container.querySelector('[data-testid="nested-close"]') as HTMLElement;
    expect(nestedClose).not.toBeNull();
    act(() => { nestedClose.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(ref.current!.getActiveTab()).toBeNull();
  });
});

// ─── SB41: renderHeader alone (no hideDefaultHeader) also suppresses the header ─

describe('SB41: renderHeader alone, without hideDefaultHeader, is sufficient to suppress the default header', () => {
  it('renders renderHeader\'s output and no default header, with hideDefaultHeader omitted entirely', () => {
    const ref = createRef<SidebarHandle>();
    const tab = makeTab('a', { label: 'Tab A' });
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[tab]}
          ref={ref}
          renderHeader={(tab, onClose) => (
            <div data-testid="custom-header">
              <span data-testid="custom-header-label">{tab.label}</span>
              <button data-testid="custom-close" onClick={onClose}>close</button>
            </div>
          )}
        />
      );
    });
    act(() => { ref.current!.openTab('a'); });
    expect(container.querySelector('.rdd-sidebar-drawer-header')).toBeNull();
    expect(container.querySelector('[data-testid="custom-header-label"]')?.textContent).toBe('Tab A');
  });

  it('renders no .rdd-sidebar-drawer-close-button even with showCloseButton set, since the default header is fully skipped', () => {
    const ref = createRef<SidebarHandle>();
    const tab = makeTab('a');
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar
          tabs={[tab]}
          ref={ref}
          showCloseButton
          renderHeader={() => <div data-testid="custom-header" />}
        />
      );
    });
    act(() => { ref.current!.openTab('a'); });
    expect(container.querySelector('.rdd-sidebar-drawer-close-button')).toBeNull();
    expect(container.querySelector('[data-testid="custom-header"]')).not.toBeNull();
  });
});

// ─── SB42: dev-only warning when showCloseButton is inert ───────────────────

describe('SB42: dev-only console.warn when showCloseButton has no effect', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    // @ts-ignore
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    // @ts-ignore
    process.env.NODE_ENV = originalEnv;
  });

  it('warns when showCloseButton and hideDefaultHeader are both set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tab = makeTab('a');
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tab]} showCloseButton hideDefaultHeader />);
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('showCloseButton'));
    warnSpy.mockRestore();
  });

  it('warns when showCloseButton and renderHeader are both set, with hideDefaultHeader omitted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tab = makeTab('a');
    act(() => {
      root = createRoot(container);
      root.render(
        <Sidebar tabs={[tab]} showCloseButton renderHeader={() => <div />} />
      );
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('showCloseButton'));
    warnSpy.mockRestore();
  });

  it('does not warn when only showCloseButton is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tab = makeTab('a');
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tab]} showCloseButton />);
    });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('showCloseButton'));
    warnSpy.mockRestore();
  });

  it('does not warn when only hideDefaultHeader is set (no showCloseButton)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tab = makeTab('a');
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tab]} hideDefaultHeader />);
    });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('showCloseButton'));
    warnSpy.mockRestore();
  });

  it('warns only once even across multiple re-renders', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tab = makeTab('a');
    act(() => {
      root = createRoot(container);
      root.render(<Sidebar tabs={[tab]} showCloseButton hideDefaultHeader />);
    });
    act(() => {
      root!.render(<Sidebar tabs={[tab]} showCloseButton hideDefaultHeader />);
    });
    act(() => {
      root!.render(<Sidebar tabs={[tab]} showCloseButton hideDefaultHeader defaultWidth={300} />);
    });
    const matching = warnSpy.mock.calls.filter(call =>
      typeof call[0] === 'string' && call[0].includes('showCloseButton')
    );
    expect(matching.length).toBe(1);
    warnSpy.mockRestore();
  });
});
