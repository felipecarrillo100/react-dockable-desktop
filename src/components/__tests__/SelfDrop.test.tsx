/**
 * Dropping a panel onto its own group.
 *
 * The bug these cover, reported against 6.2.0/6.3.0: with **one** docked panel, dragging it
 * onto its own group's drop cross duplicated it. `removePanelFromTree` returns `null` when
 * the removal empties the last leaf, and `cleanRoot || prev.gridRoot` read that `null` as
 * "nothing was removed", so the split ran against the tree that still contained the panel —
 * leaving the same id in two leaves, one of them rendering nothing, since a panel's DOM can
 * only live in one slot. `saveLayout()` then wrote that out, so it came back on every reload.
 *
 * SD1: a lone panel dropped on its own group is a no-op — every direction, and the centre
 * SD2: ...and on the workspace edge, and on its own tab strip
 * SD3: a panel is never listed in two groups, and a docked panel is always in exactly one
 * SD4: two panels in a group still split normally — the guard must not block real drops
 * SD5: a layout saved with a duplicated panel is repaired on load
 * SD6: a layout whose docked panel is in no group is repaired on load
 * SD7: a target group that is not in the layout never costs the panel its place
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from '../WindowManagerContext';
import type { LayoutNode } from '../WindowManagerContext';
import { WorkspaceClient } from '../../WorkspaceClient';

const MockPanel: React.FC<{ panelId: string }> = () => <div />;

/** One docked panel, alone in a leaf whose id is not the reusable `group-default`. */
const LONE_PANEL = JSON.stringify({
  version: 2,
  gridRoot: { type: 'leaf', id: 'group-solo', panels: ['alpha'], activePanelId: 'alpha' },
  floating: [],
  minimized: [],
  panels: { alpha: { id: 'alpha', title: 'Alpha', component: 'panel', state: 'docked' } },
  activePanelId: 'alpha',
});

const TWO_PANELS = JSON.stringify({
  version: 2,
  gridRoot: { type: 'leaf', id: 'group-solo', panels: ['alpha', 'beta'], activePanelId: 'alpha' },
  floating: [],
  minimized: [],
  panels: {
    alpha: { id: 'alpha', title: 'Alpha', component: 'panel', state: 'docked' },
    beta:  { id: 'beta',  title: 'Beta',  component: 'panel', state: 'docked' },
  },
  activePanelId: 'alpha',
});

let lastState: any = null;
let lastActions: any = null;

const StateExtractor: React.FC = () => {
  lastState = useWindowManagerState();
  lastActions = useWindowManagerActions();
  return null;
};

/** Every leaf in the tree, flattened. */
const leaves = (node: LayoutNode): { id: string; panels: string[]; activePanelId: string | null }[] =>
  node.type === 'leaf'
    ? [{ id: node.id, panels: node.panels, activePanelId: node.activePanelId }]
    : node.children.flatMap(leaves);

/**
 * The invariant both symptoms of the bug violated: a docked panel is in exactly one group,
 * and no group lists a panel that another group also lists.
 */
const expectSoundLayout = (state: any) => {
  const all = leaves(state.gridRoot).flatMap(l => l.panels);
  expect(new Set(all).size).toBe(all.length);
  for (const panel of Object.values<any>(state.panels)) {
    if (panel.state !== 'docked') continue;
    expect(all.filter(id => id === panel.id)).toHaveLength(1);
  }
};

describe('Dropping a panel onto its own group', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mount = (initialState: string) => {
    const client = new WorkspaceClient({ panels: { panel: { component: MockPanel } }, initialState });
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider client={client}>
          <StateExtractor />
        </WindowManagerProvider>
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastState = null;
    lastActions = null;
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); root = null; });
    if (container) document.body.removeChild(container);
  });

  // ─── SD1 ────────────────────────────────────────────────────────────────────

  describe('SD1: a lone panel dropped on its own group', () => {
    for (const position of ['left', 'right', 'top', 'bottom', 'center'] as const) {
      it(`is a no-op for "${position}"`, () => {
        mount(LONE_PANEL);
        const before = lastState.gridRoot;
        act(() => { lastActions.dockPanelToGroup('alpha', 'group-solo', position); });
        expect(leaves(lastState.gridRoot)).toEqual([
          { id: 'group-solo', panels: ['alpha'], activePanelId: 'alpha' },
        ]);
        expect(lastState.gridRoot).toBe(before);   // not even a new object
        expectSoundLayout(lastState);
      });
    }
  });

  // ─── SD2 ────────────────────────────────────────────────────────────────────

  describe('SD2: the other targets that reach the same reducers', () => {
    it('the workspace edge is a no-op for the only docked panel', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.dockPanelToWorkspaceEdge('alpha', 'right'); });
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-solo', panels: ['alpha'], activePanelId: 'alpha' },
      ]);
      expectSoundLayout(lastState);
    });

    it('its own tab strip is a no-op', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.movePanelOrder('alpha', 'group-solo', 0); });
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-solo', panels: ['alpha'], activePanelId: 'alpha' },
      ]);
      expectSoundLayout(lastState);
    });

    it('docking the only panel keeps it in exactly one group', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.dockPanel('alpha'); });
      expectSoundLayout(lastState);
      expect(leaves(lastState.gridRoot).flatMap(l => l.panels)).toEqual(['alpha']);
    });
  });

  // ─── SD3 ────────────────────────────────────────────────────────────────────

  describe('SD3: the panel stays reachable', () => {
    it('is still the active panel after a self-drop', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.dockPanelToGroup('alpha', 'group-solo', 'right'); });
      expect(lastState.activePanelId).toBe('alpha');
      expect(lastState.panels.alpha.state).toBe('docked');
    });
  });

  // ─── SD4 ────────────────────────────────────────────────────────────────────

  describe('SD4: real drops still work', () => {
    it('two panels in a group: dropping one on the group splits it', () => {
      mount(TWO_PANELS);
      act(() => { lastActions.dockPanelToGroup('alpha', 'group-solo', 'right'); });
      const result = leaves(lastState.gridRoot);
      expect(result).toHaveLength(2);
      expect(result.map(l => l.panels)).toEqual([['beta'], ['alpha']]);
      expectSoundLayout(lastState);
    });

    it('two panels: the workspace edge still docks', () => {
      mount(TWO_PANELS);
      act(() => { lastActions.dockPanelToWorkspaceEdge('alpha', 'bottom'); });
      const result = leaves(lastState.gridRoot);
      expect(result).toHaveLength(2);
      expect(result.flatMap(l => l.panels).sort()).toEqual(['alpha', 'beta']);
      expectSoundLayout(lastState);
    });

    it('two panels: reordering within the strip still moves the tab', () => {
      mount(TWO_PANELS);
      act(() => { lastActions.movePanelOrder('alpha', 'group-solo', 1); });
      expect(leaves(lastState.gridRoot)[0].panels).toEqual(['beta', 'alpha']);
      expectSoundLayout(lastState);
    });
  });

  // ─── SD7 ────────────────────────────────────────────────────────────────────

  /**
   * Emptying a group removes it, so an id an application held across a layout change can name
   * a group that is gone. Placing into it must not strip the panel from the layout: "open but
   * in no group" renders nothing and cannot be reached from the workspace at all.
   */
  describe('SD7: a target group that no longer exists', () => {
    it('dockPanelToGroup leaves the panel where it is', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.dockPanelToGroup('alpha', 'group-ghost', 'right'); });
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-solo', panels: ['alpha'], activePanelId: 'alpha' },
      ]);
      expectSoundLayout(lastState);
    });

    it('movePanelOrder leaves the panel where it is', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.movePanelOrder('alpha', 'group-ghost', 0); });
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-solo', panels: ['alpha'], activePanelId: 'alpha' },
      ]);
      expectSoundLayout(lastState);
    });

    it('dockPanel docks it into a real group instead of nowhere', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.dockPanel('alpha', 'group-ghost'); });
      expect(leaves(lastState.gridRoot).flatMap(l => l.panels)).toEqual(['alpha']);
      expect(lastState.panels.alpha.state).toBe('docked');
      expectSoundLayout(lastState);
    });

    it('a real drop into another group still lands there', () => {
      mount(TWO_PANELS);
      act(() => { lastActions.dockPanelToGroup('alpha', 'group-solo', 'right'); });
      const other = leaves(lastState.gridRoot).find(l => l.panels.includes('alpha'))!;
      act(() => { lastActions.dockPanelToGroup('beta', other.id, 'center'); });
      expect(leaves(lastState.gridRoot).find(l => l.id === other.id)!.panels.sort()).toEqual(['alpha', 'beta']);
      expectSoundLayout(lastState);
    });
  });

  // ─── SD5 / SD6 ──────────────────────────────────────────────────────────────

  describe('SD5: a layout saved with a duplicated panel is repaired on load', () => {
    const POISONED = JSON.stringify({
      version: 2,
      gridRoot: {
        type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5],
        children: [
          { type: 'leaf', id: 'group-default', panels: ['alpha'], activePanelId: 'alpha' },
          { type: 'leaf', id: 'group-split-1', panels: ['alpha'], activePanelId: 'alpha' },
        ],
      },
      floating: [],
      minimized: [],
      panels: { alpha: { id: 'alpha', title: 'Alpha', component: 'panel', state: 'docked' } },
      activePanelId: 'alpha',
    });

    it('keeps the first group and collapses the branch', () => {
      mount(POISONED);
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-default', panels: ['alpha'], activePanelId: 'alpha' },
      ]);
      expectSoundLayout(lastState);
    });

    it('repairs a duplicate inside a group that itself survives', () => {
      // Both groups survive this repair, so a walk that compares only the *number* of
      // children returns the original branch and throws the repair away.
      mount(JSON.stringify({
        version: 2,
        gridRoot: {
          type: 'branch', orientation: 'horizontal', sizes: [0.5, 0.5],
          children: [
            { type: 'leaf', id: 'group-first', panels: ['alpha'], activePanelId: 'alpha' },
            { type: 'leaf', id: 'group-second', panels: ['alpha', 'beta'], activePanelId: 'alpha' },
          ],
        },
        floating: [],
        minimized: [],
        panels: {
          alpha: { id: 'alpha', title: 'Alpha', component: 'panel', state: 'docked' },
          beta:  { id: 'beta',  title: 'Beta',  component: 'panel', state: 'docked' },
        },
        activePanelId: 'alpha',
      }));
      const second = leaves(lastState.gridRoot).find(l => l.id === 'group-second')!;
      expect(second.panels).toEqual(['beta']);
      expect(second.activePanelId).toBe('beta');
      expectSoundLayout(lastState);
    });

    it('repairs it through loadLayout too, not only initialState', () => {
      mount(LONE_PANEL);
      act(() => { lastActions.loadLayout(POISONED); });
      expect(leaves(lastState.gridRoot).flatMap(l => l.panels)).toEqual(['alpha']);
      expectSoundLayout(lastState);
    });
  });

  describe('SD6: a docked panel in no group is repaired on load', () => {
    const ORPHANED = JSON.stringify({
      version: 2,
      gridRoot: { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
      floating: [],
      minimized: [],
      panels: { alpha: { id: 'alpha', title: 'Alpha', component: 'panel', state: 'docked' } },
      activePanelId: null,
    });

    it('is put back into the first group, and is active again', () => {
      mount(ORPHANED);
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-default', panels: ['alpha'], activePanelId: 'alpha' },
      ]);
      expect(lastState.activePanelId).toBe('alpha');
      expectSoundLayout(lastState);
    });

    it('leaves floating and minimized panels alone — they belong in no group', () => {
      mount(JSON.stringify({
        version: 2,
        gridRoot: { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
        floating: [{ id: 'alpha', x: 10, y: 10, width: 200, height: 150, z: 100, anchor: null }],
        minimized: [{ id: 'beta', title: 'Beta', component: 'panel' }],
        panels: {
          alpha: { id: 'alpha', title: 'Alpha', component: 'panel', state: 'floating' },
          beta:  { id: 'beta',  title: 'Beta',  component: 'panel', state: 'minimized' },
        },
        activePanelId: 'alpha',
      }));
      expect(leaves(lastState.gridRoot)).toEqual([
        { id: 'group-default', panels: [], activePanelId: null },
      ]);
      expect(lastState.floating.map((w: any) => w.id)).toEqual(['alpha']);
      expect(lastState.minimized.map((m: any) => m.id)).toEqual(['beta']);
    });
  });
});
