/**
 * @file panelOptions.ts
 * @description One place that answers "what options does this open panel have": its type's
 * registration, or, for a panel showing a widget moved out of its owner panel, the widget's own.
 */
import type { PanelRegistry, PanelRegistryEntry } from '../components/PanelRegistry';
import type { PanelInfo } from '../types';

/** A panel type's options, as registered (`defaultOptions`). */
export type PanelTypeOptions = NonNullable<PanelRegistryEntry['defaultOptions']>;

/**
 * The component key of a panel that shows a managed widget moved out of its owner panel (7.11.0).
 * Reserved: such a panel has no registration, and its content is the widget's, mounted by its owner.
 */
export const HOSTED_COMPONENT = 'rdd:widget';

/** What a hosted panel can do whatever its widget says: close, minimise, be dragged; stay mounted. */
const HOSTED_BASE: PanelTypeOptions = { canDrag: true, canClose: true, canMinimize: true, keepAlive: true };

/**
 * The options that apply to an open panel. For an ordinary panel, its type's registration; for a
 * hosted panel, the base above plus the widget's `canFloat` / `canDock` (both `false` unless the
 * widget allows them). `component` is the fallback for an id that is no longer in `state.panels`
 * (a minimized entry keeps its own copy).
 */
export function optionsFor(
  registry: PanelRegistry,
  panel: PanelInfo | undefined,
  component?: string,
): PanelTypeOptions | undefined {
  if (panel?.owner) {
    return {
      ...HOSTED_BASE,
      canFloat: panel.owner.options?.canFloat ?? false,
      canDock: panel.owner.options?.canDock ?? false,
    };
  }
  const key = panel?.component ?? component;
  return key === undefined ? undefined : registry.get(key)?.defaultOptions;
}
