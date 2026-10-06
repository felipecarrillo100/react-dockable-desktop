// Type-level fixture for ReleaseC.test.tsx — compiled, never run. Each @ts-expect-error must
// fire: an unused one is itself an error (TS2578), so a typing that goes permissive fails here.
import React from 'react';
import { createWorkspace, definePanels, useWorkspace, DockableDesktopProvider, type Workspace } from '../../../index';

const MapPanel: React.FC<{ panelId: string; center?: [number, number] }> = () => null;
const ChartPanel: React.FC<{ panelId: string; series: number }> = () => null;
interface AppEvents { 'layer:select': { layerId: string } }

const panels = definePanels({
  map:   { component: MapPanel, defaultOptions: { title: 'Map' } },
  chart: { component: ChartPanel },
});

export const ws = createWorkspace({ panels });
ws.openPanel('m1', 'map');
ws.openPanel('m2', 'map', { props: { center: [0, 0] }, initialTarget: 'floating' });
ws.openPanel('c1', 'chart', { props: { series: 3 } });
// @ts-expect-error not a registered panel
ws.openPanel('m3', 'mpa');
// @ts-expect-error props checked against ChartPanel's
ws.openPanel('c2', 'chart', { props: { series: 'three' } });
// @ts-expect-error an unknown prop
ws.openPanel('c3', 'chart', { props: { series: 1, colour: 'red' } });
// @ts-expect-error panelId is the library's to pass
ws.openPanel('c4', 'chart', { props: { panelId: 'x', series: 1 } });

// It is still a Workspace: it goes to the provider, and the rest of the API is unchanged.
export const asWorkspace: Workspace = ws;
export const app = <DockableDesktopProvider workspace={ws}>{null}</DockableDesktopProvider>;
ws.closePanel('m1');

// Typed events too, by passing both type arguments.
export const ws2 = createWorkspace<typeof panels, AppEvents>({ panels });
ws2.publish('layer:select', { layerId: 'roads' });
// @ts-expect-error the events are typed
ws2.publish('layer:select', { wrong: true });
// @ts-expect-error and so are the panels
ws2.openPanel('x', 'mpa');

// Plain maps are unchanged: any name, any props.
export const plain = createWorkspace({ panels: { map: { component: MapPanel } } });
plain.openPanel('m1', 'anything', { props: { whatever: 1 } });
export const evented = createWorkspace<AppEvents>({ panels: { map: { component: MapPanel } } });
evented.openPanel('m1', 'anything');
export const empty = createWorkspace();
empty.openPanel('m1', 'anything');

// useWorkspace() stays untyped.
export function Inside() { useWorkspace().openPanel('x', 'anything'); return null; }
