/**
 * @file serialize.ts
 * @description Reading a saved layout: parsing, migrating, and repairing it on load.
 */
import type { LayoutNode, FloatAnchor, PanelInfo, WorkspaceState, SerializedLayout } from '../types';
import { EMPTY_LEAF, isVisibleActiveTarget, deriveActivePanelId, repairLayoutTree } from './layoutTree';
import type { ActiveTargetScope } from './layoutTree';

export type ParsedLayoutPayload = Pick<SerializedLayout, 'gridRoot' | 'floating' | 'minimized' | 'panels'> & {
  /** Resolved by `parseLayoutPayload` — the persisted value when still valid, else derived. */
  activePanelId: string | null;
};

/** The geometry a newly floated panel gets, and what a saved window's unusable geometry is repaired to. */
export const DEFAULT_FLOAT_RECT = { x: 300, y: 150, width: 450, height: 350 } as const;

/**
 * A saved window's x/y/width/height, made finite (7.4.0). A NaN, Infinity or missing number would
 * otherwise reach the window's style — React logs "`NaN` is an invalid value for the `left` css
 * style property" at every start-up — so each is replaced by the default a new float gets, and the
 * repair is reported. A string (a CSS length) is kept as it is.
 */
export function finiteGeometry(fw: any, repairs: string[]): any {
  let out = fw;
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    const v = fw[k];
    if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) continue;
    out = { ...out, [k]: DEFAULT_FLOAT_RECT[k] };
    repairs.push(`floating window "${fw.id}" had ${k} = ${String(v)}`);
  }
  return out;
}

export function parseLayoutPayload(parsed: any): ParsedLayoutPayload | null {
  if (!parsed || !parsed.gridRoot || !Array.isArray(parsed.floating) || !Array.isArray(parsed.minimized) || !parsed.panels) {
    return null;
  }
  // const version = typeof parsed.version === 'number' ? parsed.version : 0; // reserved for future migrations
  const geometryRepairs: string[] = [];
  const floating = (parsed.floating as any[]).map((fw: any) => finiteGeometry(fw, geometryRepairs)).map((fw: any) => {
    if ('stickyRight' in fw || 'stickyBottom' in fw) {
      const anchor: FloatAnchor | null = fw.stickyRight && fw.stickyBottom ? 'bottom-right'
        : fw.stickyRight ? 'top-right'
        : fw.stickyBottom ? 'bottom-left'
        : null;
      const { stickyRight: _sr, stickyBottom: _sb, ...rest } = fw;
      return { ...rest, anchor };
    }
    return fw;
  });
  // Repair before anything reads the tree: activePanelId resolution below asks which panels
  // are visible, and a duplicated or orphaned panel would make that answer meaningless.
  const repaired = repairLayoutTree(parsed.gridRoot as LayoutNode, parsed.panels as Record<string, PanelInfo>);
  if (repaired.repairs.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn(
      `[react-dockable-desktop] Repaired the saved layout on load: ${repaired.repairs.join('; ')}. ` +
      `(Layouts saved by versions before 6.3.1 can list a panel twice — dropping a lone docked ` +
      `panel onto its own group duplicated it.) The repair is applied every time it is read, so ` +
      `saving again from this session stores the corrected layout.`
    );
  }
  if (geometryRepairs.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn(
      `[react-dockable-desktop] Repaired the saved layout on load: ${geometryRepairs.join('; ')}. ` +
      `Each is replaced by the default a new floating window gets (${JSON.stringify(DEFAULT_FLOAT_RECT)}); ` +
      `saving again from this session stores the corrected layout.`
    );
  }
  const gridRoot = repaired.gridRoot;
  const scope: ActiveTargetScope = { gridRoot, floating, panels: parsed.panels };

  // A persisted value wins when it still names a visible panel; anything stale (the panel was
  // closed, minimized, or pruned from this snapshot) falls back to deriving from the grid, which
  // is also the path every pre-`activePanelId` layout takes.
  const persisted = typeof parsed.activePanelId === 'string' ? parsed.activePanelId : null;
  let activePanelId: string | null = null;
  if (persisted !== null) {
    if (isVisibleActiveTarget(persisted, scope)) {
      activePanelId = persisted;
    } else if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[react-dockable-desktop] Ignoring the saved layout's activePanelId ("${persisted}") — ` +
        `it doesn't name a currently visible panel (it may have been closed, minimized, or ` +
        `excluded from the snapshot as non-serializable). Falling back to the selected tab of ` +
        `the first leaf in the grid.`
      );
    }
  }
  if (activePanelId === null) activePanelId = deriveActivePanelId(scope);

  return { gridRoot, floating, minimized: parsed.minimized, panels: parsed.panels, activePanelId };
}

export function parseInitialState(json: string | null): Pick<WorkspaceState, 'gridRoot' | 'floating' | 'minimized' | 'panels' | 'activePanelId'> {
  if (json) {
    try {
      const payload = parseLayoutPayload(JSON.parse(json));
      if (payload) return payload;
    } catch {
      // fall through to empty canvas
    }
  }
  return { gridRoot: EMPTY_LEAF, floating: [], minimized: [], panels: {}, activePanelId: null };
}
