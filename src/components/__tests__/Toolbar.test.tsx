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
 * - TB22: Group button renders with default icon when no sub-item active
 * - TB23: Clicking group button renders flyout in document.body
 * - TB24: Clicking sub-item activates it, closes flyout, calls onActivate
 * - TB25: Active sub-item's label replaces default label on parent button
 * - TB26: Parent button gets .active class when any sub-item is active
 * - TB27: Clicking group button again closes flyout (toggle)
 * - TB28: Sub-item separator renders with role="separator" inside flyout
 * - TB29: Disabled group button does not open flyout
 * - TB34: Controlled toggle (active=true) shows .active without context
 * - TB35: Clicking a controlled toggle calls onToggle and does NOT write to context
 * - TB36: Controlled toggle (active=false) ignores context even if context has it active
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

  it('TB18b: visible=true leaves width to CSS (no inline collapse override)', () => {
    const items: ToolbarItem[] = [];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} position="left" visible={true} />));
    });
    const strip = container.querySelector('.toolbar-strip') as HTMLElement;
    // CSS owns open width; inline style must not force any width
    expect(strip.style.width).toBe('');
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

  it('TB19b: visible=true leaves height to CSS (no inline collapse override)', () => {
    const items: ToolbarItem[] = [];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} position="top" visible={true} />));
    });
    const strip = container.querySelector('.toolbar-strip') as HTMLElement;
    // CSS owns open height; inline style must not force any height
    expect(strip.style.height).toBe('');
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

// ─── TB22-TB29: Group button / flyout ────────────────────────────────────────

describe('TB22-TB29: Group button / flyout', () => {
  const onActivate = vi.fn();

  const groupItems: ToolbarItem[] = [
    {
      type: 'group',
      id: 'draw-tool',
      label: 'Drawing Tools',
      defaultIcon: <svg data-testid="default-icon" />,
      items: [
        {
          id: 'tool-pen',
          label: 'Pen',
          shortcut: 'P',
          icon: <svg data-testid="pen-icon" />,
          onActivate,
        },
        { type: 'separator' },
        {
          id: 'tool-eraser',
          label: 'Eraser',
          icon: <svg data-testid="eraser-icon" />,
        },
      ],
    },
  ];

  beforeEach(() => {
    onActivate.mockReset();
  });

  const mountGroup = () => {
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={groupItems} />));
    });
  };

  it('TB22: group button renders with default label when no sub-item active', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Drawing Tools');
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.classList.contains('active')).toBe(false);
  });

  it('TB23: clicking group button renders flyout in document.body', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const flyout = document.body.querySelector('.toolbar-group-flyout');
    expect(flyout).not.toBeNull();
    expect(flyout!.getAttribute('role')).toBe('menu');
  });

  it('TB24: clicking sub-item activates it, closes flyout, calls onActivate', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const flyoutItems = document.body.querySelectorAll('.toolbar-group-flyout-item');
    // First item is Pen
    act(() => { flyoutItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.querySelector('.toolbar-group-flyout')).toBeNull();
    expect(onActivate).toHaveBeenCalledWith('tool-pen');
  });

  it('TB25: active sub-item label replaces default label on parent button', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const flyoutItems = document.body.querySelectorAll('.toolbar-group-flyout-item');
    act(() => { flyoutItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.getAttribute('aria-label')).toBe('Pen');
  });

  it('TB26: parent button gets .active class when any sub-item is active', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const flyoutItems = document.body.querySelectorAll('.toolbar-group-flyout-item');
    act(() => { flyoutItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('TB27: clicking group button again when open closes the flyout', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.querySelector('.toolbar-group-flyout')).not.toBeNull();
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.querySelector('.toolbar-group-flyout')).toBeNull();
  });

  it('TB28: separator entry renders with role="separator" inside flyout', () => {
    mountGroup();
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const sep = document.body.querySelector('.toolbar-group-flyout-sep');
    expect(sep).not.toBeNull();
    expect(sep!.getAttribute('role')).toBe('separator');
  });

  it('TB29: disabled group button has disabled attribute and does not open flyout', () => {
    const disabledItems: ToolbarItem[] = [
      {
        type: 'group',
        id: 'disabled-group',
        label: 'Disabled Group',
        defaultIcon: <Icon />,
        items: [{ id: 'sub1', label: 'Sub 1', icon: <Icon /> }],
        disabled: true,
      },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={disabledItems} />));
    });
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.querySelector('.toolbar-group-flyout')).toBeNull();
  });
});

// ─── TB30–TB33: Controlled mode ───────────────────────────────────────────────

describe('TB30–TB33: Controlled mode', () => {
  const controlledBase = {
    type: 'group' as const,
    id: 'draw-tool',
    label: 'Drawing Tools',
    defaultIcon: <svg data-testid="default-icon" />,
    items: [
      { id: 'tool-pen',    label: 'Pen',    icon: <svg data-testid="pen-icon" /> },
      { id: 'tool-eraser', label: 'Eraser', icon: <svg data-testid="eraser-icon" /> },
    ],
  };

  it('TB30: activeItemId="tool-pen" shows Pen label and .active class without context', () => {
    const items: ToolbarItem[] = [{ ...controlledBase, activeItemId: 'tool-pen' }];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Pen');
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('TB31: clicking sub-item fires onActiveItemChange and does NOT write to context', () => {
    const onActiveItemChange = vi.fn();
    let capturedToolbar: ReturnType<typeof useToolbar> | null = null;
    const Probe: React.FC = () => { capturedToolbar = useToolbar(); return null; };

    const items: ToolbarItem[] = [{ ...controlledBase, activeItemId: null, onActiveItemChange }];
    act(() => {
      root = createRoot(container);
      root.render(
        <ToolbarProvider>
          <Probe />
          <Toolbar items={items} />
        </ToolbarProvider>
      );
    });
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const flyoutItems = document.body.querySelectorAll('.toolbar-group-flyout-item');
    act(() => { flyoutItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onActiveItemChange).toHaveBeenCalledWith('tool-pen');
    // context must remain untouched
    expect(capturedToolbar!.getActiveInGroup('draw-tool')).toBeNull();
  });

  it('TB32: controlled group does not self-update after click (frozen until prop changes)', () => {
    const onActiveItemChange = vi.fn();
    const items: ToolbarItem[] = [{ ...controlledBase, activeItemId: null, onActiveItemChange }];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const flyoutItems = document.body.querySelectorAll('.toolbar-group-flyout-item');
    act(() => { flyoutItems[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // prop is still null — button must still show default label and no .active class
    expect(btn.getAttribute('aria-label')).toBe('Drawing Tools');
    expect(btn.classList.contains('active')).toBe(false);
    expect(onActiveItemChange).toHaveBeenCalledWith('tool-pen');
  });

  it('TB33: activeItemId=null ignores context — shows defaultIcon and no .active', () => {
    let capturedToolbar: ReturnType<typeof useToolbar> | null = null;
    const Probe: React.FC = () => { capturedToolbar = useToolbar(); return null; };

    const items: ToolbarItem[] = [{ ...controlledBase, activeItemId: null }];
    act(() => {
      root = createRoot(container);
      root.render(
        <ToolbarProvider>
          <Probe />
          <Toolbar items={items} />
        </ToolbarProvider>
      );
    });

    // Manually write to context (simulates uncontrolled code writing a value)
    act(() => { capturedToolbar!.setActiveInGroup('draw-tool', 'tool-pen'); });

    const btn = container.querySelector('button.toolbar-btn-group') as HTMLButtonElement;
    // controlled prop is null → default label, no .active class despite context having a value
    expect(btn.getAttribute('aria-label')).toBe('Drawing Tools');
    expect(btn.classList.contains('active')).toBe(false);
  });
});

// ─── TB34-TB36: Controlled toggle mode ────────────────────────────────────────

describe('TB34-TB36: Controlled toggle mode', () => {
  it('TB34: active=true shows .active class and aria-pressed=true without context', () => {
    const items: ToolbarItem[] = [
      { type: 'toggle', id: 'snap', label: 'Snap', icon: <Icon />, active: true },
    ];
    act(() => {
      root = createRoot(container);
      root.render(wrapInProvider(<Toolbar items={items} />));
    });
    const btn = container.querySelector('button.toolbar-btn-toggle')!;
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('TB35: clicking a controlled toggle calls onToggle and does NOT write to context', () => {
    const onToggle = vi.fn();
    let capturedToolbar: ReturnType<typeof useToolbar> | null = null;
    const Probe: React.FC = () => { capturedToolbar = useToolbar(); return null; };

    const items: ToolbarItem[] = [
      { type: 'toggle', id: 'snap', label: 'Snap', icon: <Icon />, active: false, onToggle },
    ];
    act(() => {
      root = createRoot(container);
      root.render(
        <ToolbarProvider>
          <Probe />
          <Toolbar items={items} />
        </ToolbarProvider>
      );
    });
    const btn = container.querySelector('button.toolbar-btn-toggle')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onToggle).toHaveBeenCalledWith(true);
    // context must remain untouched — the prop, not context, is the source of truth
    expect(capturedToolbar!.isModifierActive('snap')).toBe(false);
  });

  it('TB36: active=false ignores context even if context has this id active', () => {
    let capturedToolbar: ReturnType<typeof useToolbar> | null = null;
    const Probe: React.FC = () => { capturedToolbar = useToolbar(); return null; };

    const items: ToolbarItem[] = [
      { type: 'toggle', id: 'snap', label: 'Snap', icon: <Icon />, active: false },
    ];
    act(() => {
      root = createRoot(container);
      root.render(
        <ToolbarProvider>
          <Probe />
          <Toolbar items={items} />
        </ToolbarProvider>
      );
    });

    // Manually write to context (simulates unrelated uncontrolled code writing a value)
    act(() => { capturedToolbar!.setModifierActive('snap', true); });

    const btn = container.querySelector('button.toolbar-btn-toggle')!;
    // controlled prop is false → inactive despite context having it active
    expect(btn.classList.contains('active')).toBe(false);
  });
});
