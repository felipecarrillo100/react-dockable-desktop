/**
 * @file serialize.ts
 * @description Reading a saved layout: parsing, migrating, and repairing it on load.
 */
import type { LayoutNode, FloatAnchor, PanelInfo, WorkspaceState, SerializedLayout } from '../types';
import { EMPTY_LEAF, isVisibleActiveTarget, deriveActivePanelId, repairLayoutTree, removePanelFromTree } from './layoutTree';
import { HOSTED_COMPONENT } from './panelOptions';
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
export function finiteGeometry<T extends Record<string, unknown>>(fw: T, repairs: string[]): T {
  let out = fw;
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    const v = fw[k];
    if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) continue;
    out = { ...out, [k]: DEFAULT_FLOAT_RECT[k] } as T;
    repairs.push(`floating window "${fw.id}" had ${k} = ${String(v)}`);
  }
  return out;
}

/** A saved window as read from storage, before repair: possibly a pre-anchor layout (`stickyRight`/`stickyBottom`). */
type RawWindow = Record<string, unknown>;

export function parseLayoutPayload(input: unknown): ParsedLayoutPayload | null {
  const parsed = input as Partial<Record<'gridRoot' | 'floating' | 'minimized' | 'panels' | 'activePanelId', unknown>> | null;
  if (!parsed || !parsed.gridRoot || !Array.isArray(parsed.floating) || !Array.isArray(parsed.minimized) || !parsed.panels) {
    return null;
  }
  // const version = typeof parsed.version === 'number' ? parsed.version : 0; // reserved for future migrations
  const geometryRepairs: string[] = [];
  // Past the shape check the payload is trusted, as before; each window only gets its geometry
  // repaired and a pre-anchor layout converted.
  const floating = (parsed.floating as RawWindow[]).map(fw => finiteGeometry(fw, geometryRepairs)).map(fw => {
    if ('stickyRight' in fw || 'stickyBottom' in fw) {
      const anchor: FloatAnchor | null = fw.stickyRight && fw.stickyBottom ? 'bottom-right'
        : fw.stickyRight ? 'top-right'
        : fw.stickyBottom ? 'bottom-left'
        : null;
      const { stickyRight: _sr, stickyBottom: _sb, ...rest } = fw;
      return { ...rest, anchor };
    }
    return fw;
  }) as unknown as SerializedLayout['floating'];
  const panels = parsed.panels as Record<string, PanelInfo>;
  // Repair before anything reads the tree: activePanelId resolution below asks which panels
  // are visible, and a duplicated or orphaned panel would make that answer meaningless.
  const repaired = repairLayoutTree(parsed.gridRoot as LayoutNode, panels);
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
  const scope: ActiveTargetScope = { gridRoot, floating, panels };

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

  return { gridRoot, floating, minimized: parsed.minimized as SerializedLayout['minimized'], panels, activePanelId };
}

/**
 * A parsed layout without hosted panels (7.11.0). A hosted panel shows a widget its owner panel
 * mounts; `saveLayout()` never writes one, so one in a layout came from a hand-made JSON and has no
 * content to show. It is dropped with every reference to it, and `owner` is stripped elsewhere.
 */
export function withoutHostedPanels(payload: ParsedLayoutPayload): ParsedLayoutPayload {
  const hosted = Object.values(payload.panels).filter(p => p.component === HOSTED_COMPONENT).map(p => p.id);
  if (hosted.length === 0) return payload;
  const panels = { ...payload.panels };
  let gridRoot: LayoutNode = payload.gridRoot;
  for (const id of hosted) {
    delete panels[id];
    gridRoot = removePanelFromTree(gridRoot, id) || EMPTY_LEAF;
  }
  const gone = new Set(hosted);
  const floating = payload.floating.filter(w => !gone.has(w.id));
  const minimized = payload.minimized.filter(m => !gone.has(m.id));
  const activePanelId = payload.activePanelId !== null && gone.has(payload.activePanelId)
    ? deriveActivePanelId({ gridRoot, floating, panels } as ActiveTargetScope)
    : payload.activePanelId;
  return { gridRoot, floating, minimized, panels, activePanelId };
}

export function parseInitialState(json: string | null): Pick<WorkspaceState, 'gridRoot' | 'floating' | 'minimized' | 'panels' | 'activePanelId'> {
  if (json) {
    try {
      const payload = parseLayoutPayload(JSON.parse(json));
      if (payload) return withoutHostedPanels(payload);
    } catch {
      // fall through to empty canvas
    }
  }
  return { gridRoot: EMPTY_LEAF, floating: [], minimized: [], panels: {}, activePanelId: null };
}
