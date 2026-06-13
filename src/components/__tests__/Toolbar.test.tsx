/**
 * Tests for Toolbar and ToolbarContext:
 * - TB1: useToolbar() outside provider returns no-op with console.warn
 * - TB2: getActiveInGroup() returns null initially
 * - TB3: setActiveInGroup() / getActiveInGroup() round-trip
 * - TB4: setActiveInGroup(group, null) deselects
 * - TB5: isModifierActive() returns false initially
 * - TB6: setModifierActive() sets modifier state
 * - TB7: toggleModifier() flips modifier state
 * - TB8: Multiple radio groups are independent
 * - TB9: Toolbar renders action buttons
 * - TB10: Action button click fires onClick
 * - TB11: Toolbar renders separators
 * - TB12: Radio button is inactive by default
 * - TB13: Clicking radio button activates it and calls onActivate
 * - TB14: Clicking second radio in same group deactivates first
 * - TB15: Toggle button is inactive by default
 * - TB16: Clicking toggle activates it and calls onToggle(true)
 * - TB17: Clicking toggle again deactivates it and calls onToggle(false)
 * - TB18: visible=false collapses a vertical strip to width 0px
 * - TB19: visible=false collapses a horizontal strip to height 0px
 * - TB20: Imperative handle show/hide/toggle calls onVisibilityChange
 * - TB21: Disabled buttons cannot be clicked
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useRef, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ToolbarProvider, useToolbar } from '../ToolbarContext';
import { Toolbar } from '../Toolbar';
import type { ToolbarHandle, ToolbarItem } from '../Toolbar';

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

const Icon: React.FC = () => <svg data-testid="icon" />;

// ─── TB1: useToolbar() outside provider ──────────────────────────────────────

describe('TB1: useToolbar() outside provider', () => {
  it('returns a no-op object and emits console.warn', () => {
    let capturedToolbar: ReturnType<typeof useToolbar> | null = null;
    const Probe: React.FC = () => {
      capturedToolbar = useToolbar();
      return null;
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => {
      root = createRoot(container);
      root.render(<Probe />);
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('useToolbar()'));
    expect(capturedToolbar!.getActiveInGroup('g')).toBeNull();
    expect(capturedToolbar!.isModifierActive('m')).toBe(false);
    // No-op calls should not throw
    expect(() => capturedToolbar!.setActiveInGroup('g', 'x')).not.toThrow();
    expect(() => capturedToolbar!.setModifierActive('m', true)).not.toThrow();
    expect(() => capturedToolbar!.toggleModifier('m')).not.toThrow();

    warnSpy.mockRestore();
  });
});

// ─── TB2-TB8: ToolbarContext state ───────────────────────────────────────────

describe('TB2-TB8: ToolbarContext state', () => {
  let toolbar: ReturnType<typeof useToolbar> | null = null;

  const Probe: React.FC = () => {
    toolbar = useToolbar();
    return null;
  };

  const mount = () => {
    act(() => {
      root = createRoot(container);
      root.render(
        <ToolbarProvider>
          <Probe />
        </ToolbarProvider>
      );
    });
  };

  it('TB2: getActiveInGroup() returns null initially', () => {
    mount();
    expect(toolbar!.getActiveInGroup('tools')).toBeNull();
  });

  it('TB3: setActiveInGroup() → getActiveInGroup() round-trip', () => {
    mount();
    act(() => { toolbar!.setActiveInGroup('tools', 'pencil'); });
    expect(toolbar!.getActiveInGroup('tools')).toBe('pencil');
  });

  it('TB4: setActiveInGroup(group, null) deselects', () => {
    mount();
    act(() => { toolbar!.setActiveInGroup('tools', 'pencil'); });
    act(() => { toolbar!.setActiveInGroup('tools', null); });
    expect(toolbar!.getActiveInGroup('tools')).toBeNull();
  });

  it('TB5: isModifierActive() returns false initially', () => {
    mount();
    expect(toolbar!.isModifierActive('snap')).toBe(false);
  });

  it('TB6: setModifierActive(id, true) enables modifier', () => {
    mount();
    act(() => { toolbar!.setModifierActive('snap', true); });
    expect(toolbar!.isModifierActive('snap')).toBe(true);
  });

  it('TB7: toggleModifier() flips state', () => {
    mount();
    act(() => { toolbar!.toggleModifier('snap'); });
    expect(toolbar!.isModifierActive('snap')).toBe(true);
    act(() => { toolbar!.toggleModifier('snap'); });
    expect(toolbar!.isModifierActive('snap')).toBe(false);
  });

  it('TB8: multiple radio groups are independent', () => {
    mount();
    act(() => {
      toolbar!.setActiveInGroup('tools', 'pencil');
      toolbar!.setActiveInGroup('shapes', 'circle');
    });
    expect(toolbar!.getActiveInGroup('tools')).toBe('pencil');
    expect(toolbar!.getActiveInGroup('shapes')).toBe('circle');
    act(() => { toolbar!.setActiveInGroup('tools', null); });
    expect(toolbar!.getActiveInGroup('tools')).toBeNull();
    expect(toolbar!.getActiveInGroup('shapes')).toBe('circle');
  });
});

// ─── TB9-TB21: Toolbar component ─────────────────────────────────────────────

const wrapInProvider = (ui: React.ReactNode) => (
  <ToolbarProvider>{ui}</ToolbarProvider>
);

describe('TB9: Toolbar renders action buttons', () => {
  it('renders a button for each action item', () => {
    const items: ToolbarItem[] = [
      { type: 'action', id: 'save', label: 'Save', icon: <Icon />, onClick: () => {} },
      { type: 'action', id: 'open', label: 'Open', icon: <Icon />, onClick: () => {} },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const buttons = container.querySelectorAll('button.toolbar-btn-action');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toBe('Save');
    expect(buttons[1].getAttribute('aria-label')).toBe('Open');
  });
});

describe('TB10: Action button click fires onClick', () => {
  it('onClick is called when action button is clicked', () => {
    const handler = vi.fn();
    const items: ToolbarItem[] = [
      { type: 'action', id: 'save', label: 'Save', icon: <Icon />, onClick: handler },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const button = container.querySelector('button.toolbar-btn-action')!;
    act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('TB11: Toolbar renders separators', () => {
  it('renders a separator div with role=separator', () => {
    const items: ToolbarItem[] = [
      { type: 'action', id: 'a', label: 'A', icon: <Icon />, onClick: () => {} },
      { type: 'separator' },
      { type: 'action', id: 'b', label: 'B', icon: <Icon />, onClick: () => {} },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const separator = container.querySelector('.toolbar-separator');
    expect(separator).not.toBeNull();
    expect(separator!.getAttribute('role')).toBe('separator');
  });
});

describe('TB12-TB14: Radio buttons', () => {
  it('TB12: radio button is inactive (no .active class) by default', () => {
    const items: ToolbarItem[] = [
      { type: 'radio', id: 'pencil', group: 'tools', label: 'Pencil', icon: <Icon /> },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-radio')!;
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('TB13: clicking radio button activates it and calls onActivate', () => {
    const onActivate = vi.fn();
    const items: ToolbarItem[] = [
      { type: 'radio', id: 'pencil', group: 'tools', label: 'Pencil', icon: <Icon />, onActivate },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-radio')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(onActivate).toHaveBeenCalledWith('pencil');
  });

  it('TB14: clicking second radio in same group deactivates first', () => {
    const items: ToolbarItem[] = [
      { type: 'radio', id: 'pencil', group: 'tools', label: 'Pencil', icon: <Icon /> },
      { type: 'radio', id: 'eraser', group: 'tools', label: 'Eraser', icon: <Icon /> },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const [pencilBtn, eraserBtn] = Array.from(container.querySelectorAll('button.toolbar-btn-radio'));
    act(() => { pencilBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(pencilBtn.classList.contains('active')).toBe(true);
    act(() => { eraserBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(pencilBtn.classList.contains('active')).toBe(false);
    expect(eraserBtn.classList.contains('active')).toBe(true);
  });
});

describe('TB15-TB17: Toggle buttons', () => {
  it('TB15: toggle button is inactive by default', () => {
    const items: ToolbarItem[] = [
      { type: 'toggle', id: 'snap', label: 'Snap', icon: <Icon /> },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-toggle')!;
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('TB16: clicking toggle activates it and calls onToggle(true)', () => {
    const onToggle = vi.fn();
    const items: ToolbarItem[] = [
      { type: 'toggle', id: 'snap', label: 'Snap', icon: <Icon />, onToggle },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-toggle')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.classList.contains('active')).toBe(true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('TB17: clicking toggle again deactivates it and calls onToggle(false)', () => {
    const onToggle = vi.fn();
    const items: ToolbarItem[] = [
      { type: 'toggle', id: 'snap', label: 'Snap', icon: <Icon />, onToggle },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-toggle')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.classList.contains('active')).toBe(false);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });
});

describe('TB18-TB19: Toolbar visibility', () => {
  it('TB18: visible=false collapses a vertical (left) strip to width 0px', () => {
    const items: ToolbarItem[] = [
      { type: 'action', id: 'a', label: 'A', icon: <Icon />, onClick: () => {} },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} position="left" visible={false} />));
    });
    const strip = container.querySelector('.toolbar-strip') as HTMLElement;
    expect(strip.style.width).toBe('0px');
  });

  it('TB18b: visible=true (default) sets vertical strip width to 48px', () => {
    const items: ToolbarItem[] = [];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} position="left" visible={true} />));
    });
    const strip = container.querySelector('.toolbar-strip') as HTMLElement;
    expect(strip.style.width).toBe('48px');
  });

  it('TB19: visible=false collapses a horizontal (top) strip to height 0px', () => {
    const items: ToolbarItem[] = [];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} position="top" visible={false} />));
    });
    const strip = container.querySelector('.toolbar-strip') as HTMLElement;
    expect(strip.style.height).toBe('0px');
  });

  it('TB19b: visible=true sets horizontal strip height to 48px', () => {
    const items: ToolbarItem[] = [];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} position="top" visible={true} />));
    });
    const strip = container.querySelector('.toolbar-strip') as HTMLElement;
    expect(strip.style.height).toBe('48px');
  });
});

describe('TB20: Imperative handle', () => {
  it('show() calls onVisibilityChange(true)', () => {
    const onChange = vi.fn();
    const ref = createRef<ToolbarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(
        wrapInProvider(
          <Toolbar items={[]} ref={ref} visible={false} onVisibilityChange={onChange} />
        )
      );
    });
    act(() => { ref.current!.show(); });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('hide() calls onVisibilityChange(false)', () => {
    const onChange = vi.fn();
    const ref = createRef<ToolbarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(
        wrapInProvider(
          <Toolbar items={[]} ref={ref} visible={true} onVisibilityChange={onChange} />
        )
      );
    });
    act(() => { ref.current!.hide(); });
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('toggle() calls onVisibilityChange(true) when visible=false', () => {
    const onChange = vi.fn();
    const ref = createRef<ToolbarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(
        wrapInProvider(
          <Toolbar items={[]} ref={ref} visible={false} onVisibilityChange={onChange} />
        )
      );
    });
    act(() => { ref.current!.toggle(); });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggle() calls onVisibilityChange(false) when visible=true', () => {
    const onChange = vi.fn();
    const ref = createRef<ToolbarHandle>();
    act(() => {
      root = createRoot(container);
      root.render(
        wrapInProvider(
          <Toolbar items={[]} ref={ref} visible={true} onVisibilityChange={onChange} />
        )
      );
    });
    act(() => { ref.current!.toggle(); });
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('TB21: Disabled buttons', () => {
  it('disabled action button has disabled attribute and click does not fire', () => {
    const onClick = vi.fn();
    const items: ToolbarItem[] = [
      { type: 'action', id: 'a', label: 'A', icon: <Icon />, onClick, disabled: true },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-action') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled radio button cannot be activated', () => {
    const items: ToolbarItem[] = [
      { type: 'radio', id: 'pencil', group: 'tools', label: 'Pencil', icon: <Icon />, disabled: true },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-radio') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
