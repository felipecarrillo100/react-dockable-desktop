/**
 * The 7.4.1 store fixes, found in a review of 7.4.0. Each runs against the workspace store alone —
 * no provider mounted — since that is where the defect lived.
 *
 * - Restored windows keep their stacking order: the z counter starts at `zIndexBase` and was never
 *   raised to the restored windows' `z`, so after a reload a focused window dropped behind the
 *   others and a new float opened beneath them.
 * - The default message formatter replaces every `{key}`, not only the first.
 * - Layout repair drops leaf panel ids that aren't in `panels`, and gives a branch whose `sizes`
 *   don't match its children (or aren't finite) even sizes — otherwise `flex-basis: NaN%`.
 * - A throwing event subscriber no longer stops delivery to the others.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkspaceClient } from '../../WorkspaceClient';
import { defaultFormatMessage, type LayoutNode } from '../WindowManagerContext';

const Panel = () => null;
const ws = (initialState?: string) => new WorkspaceClient({ panels: { p: { component: Panel } }, initialState });
const snap = (w: WorkspaceClient) => w._core.getSnapshot();
const zOf = (w: WorkspaceClient, id: string) => snap(w).floating.find(f => f.id === id)!.z;

const panel = (id: string, state = 'docked') => ({ id, title: id.toUpperCase(), component: 'p', state });
const RESTORED = JSON.stringify({
  version: 2,
  gridRoot: { type: 'leaf', id: 'g', panels: ['a'], activePanelId: 'a' },
  floating: [
    { id: 'w1', x: 10, y: 10, width: 200, height: 150, z: 1003 },
    { id: 'w2', x: 20, y: 20, width: 200, height: 150, z: 1004 },
    { id: 'w3', x: 30, y: 30, width: 200, height: 150, z: 1005 },
  ],
  minimized: [],
  panels: { a: panel('a'), w1: panel('w1', 'floating'), w2: panel('w2', 'floating'), w3: panel('w3', 'floating') },
});

afterEach(() => { vi.restoreAllMocks(); });

describe('restored windows keep their stacking order', () => {
  for (const [how, make] of [
    ['initialState', () => ws(RESTORED)],
    ['loadLayout', () => { const w = ws(); w.loadLayout(RESTORED); return w; }],
  ] as const) {
    it(`a focused window comes to the front (${how})`, () => {
      const w = make();
      w.focusPanel('w1');
      expect(zOf(w, 'w1')).toBeGreaterThan(zOf(w, 'w3'));
    });

    it(`a newly floated panel opens above the restored ones (${how})`, () => {
      const w = make();
      w.openPanel('n', 'p', { initialTarget: 'floating' });
      expect(zOf(w, 'n')).toBeGreaterThan(zOf(w, 'w3'));
    });
  }
});

describe('the default message formatter', () => {
  it('replaces every occurrence of a placeholder', () => {
    expect(defaultFormatMessage({ id: 'x', defaultMessage: '{n} of {n}, {m}', values: { n: 2, m: 'ok' } })).toBe('2 of 2, ok');
  });
});

describe('layout repair', () => {
  const load = (gridRoot: unknown, panels: Record<string, unknown>) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = ws();
    expect(w.loadLayout(JSON.stringify({ version: 2, gridRoot, floating: [], minimized: [], panels }))).toBe(true);
    return snap(w).gridRoot;
  };

  it('drops a leaf panel id that is not in panels, and re-derives the active one', () => {
    const root = load({ type: 'leaf', id: 'g', panels: ['ghost', 'a'], activePanelId: 'ghost' }, { a: panel('a') });
    expect(root).toMatchObject({ type: 'leaf', panels: ['a'], activePanelId: 'a' });
  });

  it('gives a branch whose sizes do not match its children even sizes', () => {
    const leaf = (id: string, p: string) => ({ type: 'leaf', id, panels: [p], activePanelId: p });
    const root = load(
      { type: 'branch', orientation: 'horizontal', sizes: [1], children: [leaf('l1', 'a'), leaf('l2', 'b'), leaf('l3', 'c')] },
      { a: panel('a'), b: panel('b'), c: panel('c') },
    ) as Extract<LayoutNode, { type: 'branch' }>;
    expect(root.sizes).toHaveLength(3);
    for (const s of root.sizes) expect(s).toBeCloseTo(1 / 3);
  });

  it('gives a branch with a non-finite size even sizes', () => {
    const leaf = (id: string, p: string) => ({ type: 'leaf', id, panels: [p], activePanelId: p });
    const root = load(
      { type: 'branch', orientation: 'horizontal', sizes: [0.5, null], children: [leaf('l1', 'a'), leaf('l2', 'b')] },
      { a: panel('a'), b: panel('b') },
    ) as Extract<LayoutNode, { type: 'branch' }>;
    expect(root.sizes).toEqual([0.5, 0.5]);
  });
});

describe('the event bus', () => {
  it('delivers to every subscriber even when one throws, and reports the error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = ws();
    const got: unknown[] = [];
    w._core.actions.subscribe('probe', () => { throw new Error('bad listener'); });
    w._core.actions.subscribe('probe', d => got.push(d));
    expect(() => w._core.actions.publish('probe', 42)).not.toThrow();
    expect(got).toEqual([42]);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/probe/);
  });
});
