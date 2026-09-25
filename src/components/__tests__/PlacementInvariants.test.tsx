import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DockableDesktopProvider } from '../DockableDesktopProvider';
import { useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import { usePanelContribution, useActivePanelContribution } from '../PanelContributionContext';
import { WorkspaceClient } from '../../WorkspaceClient';
import WindowManager from '../WindowManager';

// Placement actions (float / dock / move / close-group / maximize / re-open) and the
// invariants they must keep: the globally active panel is always one the user can see,
// every layout change publishes `layout:changed`, and no panel is ever left open in no group.

const Contributing: React.FC<{ panelId: string }> = ({ panelId }) => {
  const contribution = React.useMemo(
    () => ({ toolbarItems: [{ type: 'action' as const, id: `btn-${panelId}`, label: panelId, icon: null, onClick: () => {} }] }),
    [panelId],
  );
  usePanelContribution(contribution);
  return <div />;
};

// Two keepOnEmpty groups side by side: L and R.
const TWO_GROUPS = JSON.stringify({
  gridRoot: {
    type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5],
    children: [
      { type: 'leaf', id: 'L', panels: [], activePanelId: null, keepOnEmpty: true },
      { type: 'leaf', id: 'R', panels: [], activePanelId: null, keepOnEmpty: true },
    ],
  },
  floating: [], minimized: [], panels: {},
});

let S: any;
let A: any;
let contributed: any;
const Probe: React.FC = () => {
  S = useWindowManagerState();
  A = useWindowManagerActions();
  contributed = useActivePanelContribution();
  return null;
};

let container: HTMLDivElement;
let root: Root | null = null;
let client: WorkspaceClient;

const mount = (initialState: string | null = null) => {
  client = new WorkspaceClient({
    panels: {
      m: { component: Contributing },
      nodrag: { component: Contributing, defaultOptions: { canDrag: false } },
    },
    initialState,
  });
  act(() => {
    root = createRoot(container);
    root.render(
      <DockableDesktopProvider workspace={client}>
        <Probe />
        <WindowManager />
      </DockableDesktopProvider>,
    );
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.getElementById('preserved-dom-container')?.remove();
});

const leaves = (n: any, out: any[] = []): any[] => {
  if (n.type === 'leaf') out.push(n); else n.children.forEach((c: any) => leaves(c, out));
  return out;
};
const leafOf = (id: string) => leaves(S.gridRoot).filter(l => l.panels.includes(id)).map(l => l.id);
const isVisible = (id: string | null) =>
  !!id && (S.floating.some((w: any) => w.id === id) || leaves(S.gridRoot).some(l => l.activePanelId === id));
const tabClass = (id: string) => container.querySelector(`[data-tab-id="${id}"]`)?.className ?? '';
const record = () => {
  const events: string[] = [];
  for (const name of ['panel:opened', 'panel:closed', 'panel:minimized', 'panel:restored', 'layout:changed']) {
    A.subscribe(name, () => events.push(name));
  }
  return events;
};
const contributedIds = () => (contributed?.toolbarItems ?? []).map((i: any) => i.id);

/** The moved panel is the active one, is on screen, and drives the contributions. */
const expectMovedPanelActive = (id: string) => {
  expect(S.activePanelId).toBe(id);
  expect(isVisible(id)).toBe(true);
  expect(contributedIds()).toEqual([`btn-${id}`]);
};

describe('WI-02: the moved panel becomes the active panel', () => {
  it('dockPanel', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('b', 'm'));
    act(() => A.floatPanel('a'));
    act(() => A.focusPanel('b'));
    act(() => A.dockPanel('a'));
    expectMovedPanelActive('a');
    expect(tabClass('a')).toContain('rdd-workspace-tab-active-focused');
  });

  it('movePanelOrder (a drag-reorder of an unselected tab)', () => {
    mount();
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('b', 'm'));
    act(() => A.openPanel('c', 'm'));
    act(() => A.focusPanel('a'));
    act(() => A.movePanelOrder('c', leaves(S.gridRoot)[0].id, 0));
    expectMovedPanelActive('c');
    expect(tabClass('c')).toContain('rdd-workspace-tab-active-focused');
  });

  it('dockPanelToGroup, centre drop onto the group whose selected tab is active', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
    act(() => A.focusPanel('a'));
    act(() => A.dockPanelToGroup('x', 'L', 'center'));
    expectMovedPanelActive('x');
  });

  it('dockPanelToGroup, split drop', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.focusPanel('a'));
    act(() => A.dockPanelToGroup('x', 'R', 'bottom'));
    expectMovedPanelActive('x');
  });

  it('floatPanel', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('b', 'm'));
    act(() => A.focusPanel('a'));
    act(() => A.floatPanel('b'));
    expectMovedPanelActive('b');
  });

  it('dockPanelToWorkspaceEdge', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('b', 'm'));
    act(() => A.focusPanel('a'));
    act(() => A.dockPanelToWorkspaceEdge('b', 'right'));
    expectMovedPanelActive('b');
  });

  it('a no-op placement leaves the active panel alone', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
    act(() => A.focusPanel('a'));
    act(() => A.dockPanelToGroup('x', 'NO-SUCH-GROUP', 'center'));
    expect(S.activePanelId).toBe('a');
  });
});

describe('WI-03: maximizePanel on a minimized panel', () => {
  it('restores and maximizes a panel minimized from a floating window', () => {
    mount();
    act(() => A.openPanel('f', 'm', { initialTarget: 'floating' }));
    act(() => A.minimizePanel('f'));
    const events = record();
    act(() => A.maximizePanel('f'));
    expect(S.panels.f.state).toBe('floating');
    expect(S.floating.find((w: any) => w.id === 'f')?.maximized).toBe(true);
    expect(S.activePanelId).toBe('f');
    expect(events).toEqual(['panel:restored', 'layout:changed']);
  });

  it('floats and maximizes a draggable panel minimized from a group', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('d', 'm'));
    act(() => A.minimizePanel('d'));
    act(() => A.maximizePanel('d'));
    expect(S.panels.d.state).toBe('floating');
    expect(S.floating.find((w: any) => w.id === 'd')?.maximized).toBe(true);
    expect(leafOf('d')).toEqual([]);
    expect(S.activePanelId).toBe('d');
  });

  it('a non-draggable panel minimized from a group is restored to its group, not floated', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('n', 'nodrag'));
    act(() => A.minimizePanel('n'));
    act(() => A.maximizePanel('n'));
    expect(S.panels.n.state).toBe('docked');
    expect(S.floating.some((w: any) => w.id === 'n')).toBe(false);
  });

  it('the taskbar menu offers Maximize only when the panel can be maximized', async () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('d', 'm'));
    act(() => A.openPanel('n', 'nodrag'));
    act(() => A.minimizePanel('d'));
    act(() => A.minimizePanel('n'));

    const menuLabels = (index: number) => {
      const items = container.querySelectorAll('.rdd-taskbar-glassmorphic-item');
      act(() => {
        items[index].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      });
      const labels = Array.from(document.body.querySelectorAll('.rdd-context-menu [role^="menuitem"]'))
        .map(el => el.textContent?.trim());
      act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      return labels;
    };

    expect(menuLabels(0)).toContain('Maximize Panel');
    expect(menuLabels(1)).not.toContain('Maximize Panel');
    expect(menuLabels(1)).toContain('Restore Panel');
  });

  it('control: maximizePanel on a floating panel still toggles', () => {
    mount();
    act(() => A.openPanel('f', 'm', { initialTarget: 'floating' }));
    act(() => A.maximizePanel('f'));
    expect(S.floating[0].maximized).toBe(true);
    act(() => A.maximizePanel('f'));
    expect(S.floating[0].maximized).toBe(false);
  });
});

describe('WI-04: openPanel on a minimized panel behaves like restorePanel', () => {
  const inGroupR = () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('y', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
  };

  it('returns a docked panel to the group it was minimized from', () => {
    inGroupR();
    act(() => A.minimizePanel('x'));
    act(() => A.openPanel('x', 'm'));
    expect(leafOf('x')).toEqual(['R']);
    expect(S.activePanelId).toBe('x');
  });

  it('re-floats a floating panel at its previous position', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('f', 'm', { initialTarget: 'floating' }));
    act(() => A.updateFloatingPosition('f', { x: 11, y: 22, width: 333, height: 244 }));
    act(() => A.minimizePanel('f'));
    act(() => A.openPanel('f', 'm'));
    expect(S.panels.f.state).toBe('floating');
    expect(S.floating.find((w: any) => w.id === 'f')?.x).toBe(11);
  });

  it('publishes panel:restored and layout:changed, once each', () => {
    inGroupR();
    act(() => A.minimizePanel('x'));
    const events = record();
    act(() => A.openPanel('x', 'm'));
    expect(events).toEqual(['panel:restored', 'layout:changed']);
  });

  it('an explicit initialTarget still wins over where the panel was', () => {
    inGroupR();
    act(() => A.minimizePanel('x'));
    act(() => A.openPanel('x', 'm', { initialTarget: 'floating' }));
    expect(S.panels.x.state).toBe('floating');
    expect(S.floating.filter((w: any) => w.id === 'x')).toHaveLength(1);
    expect(leafOf('x')).toEqual([]);
  });

  it('focus: false restores without changing the active panel', () => {
    inGroupR();
    act(() => A.minimizePanel('x'));
    act(() => A.focusPanel('y'));
    act(() => A.openPanel('x', 'm', { focus: false }));
    expect(leafOf('x')).toEqual(['R']);
    expect(S.activePanelId).toBe('y');
  });

  it('control: restorePanel returns the panel to its group', () => {
    inGroupR();
    act(() => A.minimizePanel('x'));
    const events = record();
    act(() => A.restorePanel('x'));
    expect(leafOf('x')).toEqual(['R']);
    expect(events).toEqual(['panel:restored', 'layout:changed']);
  });
});

describe('WI-05: placement actions publish layout:changed once', () => {
  const setup = () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('b', 'm'));
    act(() => A.openPanel('c', 'm'));
  };
  const cases: Array<[string, () => void]> = [
    ['floatPanel', () => A.floatPanel('b')],
    ['dockPanel', () => A.dockPanel('b', 'R')],
    ['dockPanelToGroup', () => A.dockPanelToGroup('b', 'R', 'center')],
    ['dockPanelToWorkspaceEdge', () => A.dockPanelToWorkspaceEdge('b', 'left')],
    ['movePanelOrder', () => A.movePanelOrder('c', 'L', 0)],
    ['closeLeafGroup (empty group)', () => A.closeLeafGroup('R')],
  ];
  for (const [name, run] of cases) {
    it(name, () => {
      setup();
      const events = record();
      // Braces: `act` given a callback that returns a promise turns async and must be awaited.
      act(() => { run(); });
      expect(events).toEqual(['layout:changed']);
    });
  }
});

describe('WI-06: closeLeafGroup never orphans a panel', () => {
  const noOrphans = () => {
    for (const [id, p] of Object.entries<any>(S.panels)) {
      if (p.state === 'docked') expect(leafOf(id), `panel ${id} is docked but in no group`).toHaveLength(1);
    }
  };

  it('control: an empty group is removed', () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => { void A.closeLeafGroup('R'); });
    expect(leaves(S.gridRoot).map(l => l.id)).toEqual(['L']);
    expect(leafOf('a')).toEqual(['L']);
  });

  it('a non-empty group closes each of its panels, then goes away', async () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.openPanel('z', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
    act(() => A.dockPanelToGroup('z', 'R', 'center'));
    await act(async () => { await A.closeLeafGroup('R'); });
    expect(S.panels.x).toBeUndefined();
    expect(S.panels.z).toBeUndefined();
    expect(leaves(S.gridRoot).map(l => l.id)).toEqual(['L']);
    expect(isVisible(S.activePanelId)).toBe(true);
    noOrphans();
  });

  it('a close guard that refuses keeps that panel and its group', async () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.openPanel('z', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
    act(() => A.dockPanelToGroup('z', 'R', 'center'));
    act(() => A.registerCloseGuard('x', () => false));
    await act(async () => { await A.closeLeafGroup('R'); });
    expect(S.panels.x).toBeDefined();
    expect(S.panels.z).toBeUndefined();
    expect(leafOf('x')).toEqual(['R']);
    noOrphans();
  });

  it('a dirty panel is confirmed through onConfirm', async () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
    act(() => A.setPanelDirty('x', true));
    await act(async () => { await A.closeLeafGroup('R', { onConfirm: async () => false }); });
    expect(leafOf('x')).toEqual(['R']);
    await act(async () => { await A.closeLeafGroup('R', { onConfirm: async () => true }); });
    expect(S.panels.x).toBeUndefined();
    noOrphans();
  });

  it('WorkspaceClient.closeLeafGroup returns a promise that settles after the group closes', async () => {
    mount(TWO_GROUPS);
    act(() => A.openPanel('a', 'm'));
    act(() => A.openPanel('x', 'm'));
    act(() => A.dockPanelToGroup('x', 'R', 'center'));
    await act(async () => { await client.closeLeafGroup('R'); });
    expect(S.panels.x).toBeUndefined();
    noOrphans();
  });
});
