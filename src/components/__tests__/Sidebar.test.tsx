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
