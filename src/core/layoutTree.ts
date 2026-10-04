/**
 * @file layoutTree.ts
 * @description Pure functions over the layout tree: which panel is visibly active, repairing a
 * loaded tree, and the tree edits the workspace actions are built from.
 */
import type { SplitOrientation, SplitDirection, LayoutLeafNode, LayoutNode, FloatingWindow, PanelInfo, SerializedLayout } from '../types';

export const EMPTY_LEAF: LayoutLeafNode = {
  type: 'leaf',
  id: 'group-default',
  panels: [],
  activePanelId: null,
};

/** The subset of a layout needed to reason about which panel is visibly active. */
export type ActiveTargetScope = Pick<SerializedLayout, 'gridRoot' | 'floating' | 'panels'>;

/**
 * Whether `id` names a panel the user can actually see, and which may therefore be the globally
 * active one: the selected tab of some leaf, or a floating window. A minimized panel never
 * qualifies — it stays mounted (see the persistence port in `WindowManager.tsx`), so leaving it
 * active would keep routing `useActiveContribution()` to a panel that isn't on screen.
 *
 * Used both to validate a persisted `activePanelId` on load and to guard the one written by
 * `saveLayout`, so the two directions can't disagree about what "active" is allowed to mean.
 */
export function isVisibleActiveTarget(id: string, scope: ActiveTargetScope): boolean {
  const info = scope.panels[id];
  if (!info || info.state === 'minimized') return false;
  if (scope.floating.some(w => w.id === id)) return true;
  const isLeafSelection = (node: LayoutNode): boolean =>
    node.type === 'leaf'
      ? node.activePanelId === id
      : node.children.some(isLeafSelection);
  return scope.gridRoot ? isLeafSelection(scope.gridRoot) : false;
}

/**
 * Derives the globally active panel for a restored layout.
 *
 * Replaces the original `Object.keys(panels)[0]` seed, which picked the first key of a flat,
 * insertion-ordered record that knows nothing about tab order or docked/floating/minimized — so
 * unless the user happened to have the first-opened panel selected when they saved, the workspace
 * came back with one panel visible and a *different*, invisible one marked active. Every
 * `LayoutLeafNode` already persists its own `activePanelId`, so the answer was on disk all along.
 *
 * Order:
 *   1. The first leaf in document order whose own selected tab is a valid target.
 *   2. Otherwise the frontmost (highest `z`) floating window — matching `focusPanel`'s own
 *      "highest z is on top" rule, and keeping float-only layouts from restoring with nothing
 *      active at all.
 *   3. Otherwise `null`.
 *
 * Depth-first, not breadth-first: for a grid whose first child is itself a split, a level-by-level
 * walk reaches the *second* child's leaf before the first child's leaves and picks the wrong tab.
 * Mirrors `findFirstLeafId`'s traversal shape for exactly that reason.
 */
export function deriveActivePanelId(scope: ActiveTargetScope): string | null {
  const isCandidate = (id: string | null): boolean =>
    id !== null && !!scope.panels[id] && scope.panels[id].state !== 'minimized';

  const fromLeaves = (node: LayoutNode): string | null => {
    if (node.type === 'leaf') {
      return isCandidate(node.activePanelId) ? node.activePanelId : null;
    }
    for (const child of node.children) {
      const found = fromLeaves(child);
      if (found) return found;
    }
    return null;
  };

  const selected = scope.gridRoot ? fromLeaves(scope.gridRoot) : null;
  if (selected) return selected;

  let frontmost: FloatingWindow | null = null;
  for (const w of scope.floating) {
    if (!isCandidate(w.id)) continue;
    if (!frontmost || w.z > frontmost.z) frontmost = w;
  }
  return frontmost?.id ?? null;
}

/**
 * The globally active panel after a placement action (float / dock / move / close-group).
 *
 * Those actions change which tab a leaf shows without going through `focusPanel`, and each one
 * used to leave `activePanelId` wherever it was — often on a tab the move had just hidden, so the
 * visible tab rendered unfocused and `useActiveContribution()` kept serving the hidden
 * panel's controls. The moved panel is what the user just acted on, so it wins when it is
 * visible; otherwise the previous active panel is kept if it still is; otherwise it is derived.
 */
export function resolveActivePanelId(
  next: ActiveTargetScope & { activePanelId: string | null },
  preferId: string | null,
): string | null {
  if (preferId && isVisibleActiveTarget(preferId, next)) return preferId;
  if (next.activePanelId && isVisibleActiveTarget(next.activePanelId, next)) return next.activePanelId;
  return deriveActivePanelId(next);
}

/**
 * Shared shape-check + migration for a parsed (but not yet validated) layout payload,
 * used by both `parseInitialState` (the `initialState`/`createWorkspace({ initialState })`
 * entry point) and `loadLayout` — previously these duplicated the check independently
 * and only one of them ran the stickyRight/stickyBottom migration, so a layout fed
 * through `initialState` silently skipped it. `version` is read but not yet branched on
 * — it's read here so a future migration has a version to gate on without needing
 * another ad hoc field-presence sniff like this one.
 *
 * Also resolves `activePanelId`, for the same reason the shape-check lives here: both entry
 * points need it and previously seeded it themselves, identically wrongly, in two places.
 */
/**
 * Heal a saved layout that names the same panel twice, or names none of them.
 *
 * Until 6.3.1, dropping a lone docked panel onto its own group put that panel in two leaves,
 * and `saveLayout()` wrote the result out — so the duplicate came back on every reload, for
 * good. Repairing on read means a layout stored by an affected version loads clean with
 * nothing asked of the application. It changes only what is *read*: `saveLayout()`'s output
 * format is untouched.
 *
 * The repairs, in order: a leaf panel id the layout's `panels` doesn't have is dropped (7.4.1);
 * a panel id that appears in more than one leaf is kept in the first one only; a leaf emptied
 * by either keeps existing only if it asked to (`keepOnEmpty`); a branch left with one child
 * collapses into it, with sizes re-normalised; a branch whose sizes don't match its children,
 * or aren't finite positive numbers, gets even sizes (7.4.1); and a panel the layout says is
 * docked but that no leaf lists is appended to the first leaf, since "open but in no group"
 * renders nothing and cannot be reached.
 */
export function repairLayoutTree(
  gridRoot: LayoutNode,
  panels: Record<string, PanelInfo>
): { gridRoot: LayoutNode; repairs: string[] } {
  const repairs: string[] = [];
  const seen = new Set<string>();

  const walk = (node: LayoutNode): LayoutNode | null => {
    if (node.type === 'leaf') {
      const kept = node.panels.filter(panelId => {
        if (!panels[panelId]) {
          repairs.push(`group "${node.id}" listed panel "${panelId}", which the layout doesn't have`);
          return false;
        }
        if (seen.has(panelId)) {
          repairs.push(`panel "${panelId}" was listed in more than one group`);
          return false;
        }
        seen.add(panelId);
        return true;
      });
      if (kept.length === node.panels.length) return node;
      if (kept.length === 0 && !node.keepOnEmpty) return null;
      const activePanelId = node.activePanelId && kept.includes(node.activePanelId)
        ? node.activePanelId
        : (kept[0] ?? null);
      return { ...node, panels: kept, activePanelId };
    }

    const children = node.children.map(walk).filter((c): c is LayoutNode => c !== null);
    // Identity, not count: a child can survive the walk and still have been repaired inside.
    // Comparing lengths alone returned the original branch and discarded those repairs.
    // Sizes that don't match the children, or aren't finite positive numbers, would give a child
    // `flex-basis: NaN%` (7.4.1): such a branch gets even sizes.
    const sizesOk = (sizes: unknown[], n: number) =>
      Array.isArray(sizes) && sizes.length === n && sizes.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const unchanged = children.length === node.children.length && children.every((c, i) => c === node.children[i]);
    if (unchanged && sizesOk(node.sizes, children.length)) return node;
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    if (unchanged) {
      repairs.push(`a split had sizes ${JSON.stringify(node.sizes)} for ${children.length} children`);
      return { ...node, sizes: children.map(() => 1 / children.length) };
    }
    const kept = Array.isArray(node.sizes) ? node.sizes.slice(0, children.length) : [];
    if (!sizesOk(kept, children.length)) return { ...node, children, sizes: children.map(() => 1 / children.length) };
    const sum = kept.reduce((a, b) => a + b, 0);
    return { ...node, children, sizes: kept.map(s => s / sum) };
  };

  let root = walk(gridRoot) || EMPTY_LEAF;

  const orphans = Object.values(panels).filter(p => p.state === 'docked' && !seen.has(p.id));
  if (orphans.length > 0) {
    const attach = (node: LayoutNode): LayoutNode => {
      if (node.type === 'leaf') {
        const ids = orphans.map(p => p.id);
        return { ...node, panels: [...node.panels, ...ids], activePanelId: node.activePanelId ?? ids[0] };
      }
      return { ...node, children: [attach(node.children[0]), ...node.children.slice(1)] };
    };
    for (const orphan of orphans) {
      repairs.push(`panel "${orphan.id}" is docked but was in no group`);
    }
    root = attach(root);
  }

  return { gridRoot: root, repairs };
}

// Recursive helpers to manipulate layout tree
export const removePanelFromTree = (node: LayoutNode, id: string): LayoutNode | null => {
  if (node.type === 'leaf') {
    const idx = node.panels.indexOf(id);
    if (idx === -1) return node;
    const panels = node.panels.filter(p => p !== id);
    const activePanelId = node.activePanelId === id
      ? (panels[idx] || panels[idx - 1] || panels[0] || null)
      : node.activePanelId;
    const updatedLeaf = { ...node, panels, activePanelId };
    // Auto-remove this leaf when it becomes empty, unless keepOnEmpty is set
    if (panels.length === 0 && !node.keepOnEmpty) return null;
    return updatedLeaf;
  } else {
    const children = node.children
      .map(c => removePanelFromTree(c, id))
      .filter((c): c is LayoutNode => c !== null);

    if (children.length === 0) return null;
    if (children.length === 1) return children[0];

    // Re-normalize sizes
    const sizes = node.sizes.slice(0, children.length);
    const sum = sizes.reduce((a, b) => a + b, 0);
    return {
      ...node,
      children,
      sizes: sizes.map(s => s / sum)
    };
  }
};

export const addPanelToLeaf = (node: LayoutNode, leafId: string, panelId: string): LayoutNode => {
  if (node.type === 'leaf') {
    if (node.id === leafId) {
      const panels = node.panels.includes(panelId) ? node.panels : [...node.panels, panelId];
      return { ...node, panels, activePanelId: panelId };
    }
    return node;
  } else {
    return {
      ...node,
      children: node.children.map(c => addPanelToLeaf(c, leafId, panelId))
    };
  }
};

/**
 * Is `panelId` the only panel in `leafId`?
 *
 * The question every dock reducer has to ask *before* it removes anything. Removing a
 * panel deletes an emptied leaf, so a drop onto the dragged panel's own leaf destroys the
 * very target it names — and the placement that follows has nowhere to go. Dropping a lone
 * panel onto itself is a no-op by definition: the result would be the layout it already
 * has.
 */
export const isLoneOccupant = (node: LayoutNode, leafId: string, panelId: string): boolean => {
  if (node.type === 'leaf') {
    return node.id === leafId && node.panels.length === 1 && node.panels[0] === panelId;
  }
  return node.children.some(c => isLoneOccupant(c, leafId, panelId));
};

/** Does `leafId` name a leaf that is actually in the tree? */
export const hasLeaf = (node: LayoutNode, leafId: string): boolean =>
  node.type === 'leaf' ? node.id === leafId : node.children.some(c => hasLeaf(c, leafId));

export const findFirstLeafId = (node: LayoutNode): string | null => {
  if (node.type === 'leaf') return node.id;
  for (const child of node.children) {
    const id = findFirstLeafId(child);
    if (id) return id;
  }
  return null;
};

// Helper to split a layout leaf node into a branch (for drag split targets)
export const splitLeafInTree = (
  node: LayoutNode,
  leafId: string,
  panelId: string,
  position: SplitDirection,
  splitRatio: number
): LayoutNode => {
  if (node.type === 'leaf') {
    if (node.id === leafId) {
      const newLeaf: LayoutLeafNode = {
        type: 'leaf',
        id: `group-split-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        panels: [panelId],
        activePanelId: panelId
      };
      const orientation: SplitOrientation = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical';
      const children = (position === 'left' || position === 'top') ? [newLeaf, node] : [node, newLeaf];
      const sizes = (position === 'left' || position === 'top')
        ? [splitRatio, 1 - splitRatio]
        : [1 - splitRatio, splitRatio];
      return {
        type: 'branch',
        orientation,
        sizes,
        children
      };
    }
    return node;
  } else {
    return {
      ...node,
      children: node.children.map(c => splitLeafInTree(c, leafId, panelId, position, splitRatio))
    };
  }
};
