// Type-level fixture for TypedEvents.test.ts — compiled, never run.
import { WorkspaceClient } from '../../../WorkspaceClient';

// Verbatim from docs-site/guide/event-bus.md: an event map declared as an `interface`.
// It has no index signature, so a `Record<string, unknown>` constraint rejected it (TS2344).
interface AppEvents {
  'layer:select':  { layerId: string };
  'layer:toggle':  { layerId: string; visible: boolean };
  'selection:set': { ids: string[] };
}
export const workspace = new WorkspaceClient<AppEvents>({ panels: {} });
workspace.publish('layer:select', { layerId: 'roads' });
workspace.subscribe('layer:toggle', ({ layerId, visible }) => { void layerId; void visible; });
// @ts-expect-error a wrong payload is still rejected — the typing is live, not just permissive
workspace.publish('layer:select', { wrong: true });
// @ts-expect-error an undeclared event name is still rejected
workspace.publish('layer:unknown', {});

// A `type` alias keeps working.
type AppEventsAlias = { 'layer:select': { layerId: string } };
export const workspace2 = new WorkspaceClient<AppEventsAlias>({ panels: {} });
workspace2.publish('layer:select', { layerId: 'roads' });

// No type argument keeps working.
export const workspace3 = new WorkspaceClient({ panels: {} });
workspace3.publish('anything', { any: 'payload' });
