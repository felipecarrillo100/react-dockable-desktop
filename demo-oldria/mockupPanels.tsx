import React, { useEffect, useRef, useState } from 'react';
import { type ContextMenuItem, PanelRegistry, useFormContainer, useWindowManagerActions, usePanelSize } from '../src/index';
import PanelManagerForm from './PanelManagerForm';
import { DirtyFormDemoPanel, DirtyEditorDemoPanel, ShowcaseControlCenter, CodeSnippetButton } from '../demo/mockupPanels';
import { getReference } from '@luciad/ria/reference/ReferenceProvider.js';
import { WebGLMap } from '@luciad/ria/view/WebGLMap.js';
import { throttle } from "../demo-luciadria/utils/throttle.ts";

import { WMSTileSetModel } from '@luciad/ria/model/tileset/WMSTileSetModel.js';
import { WMSTileSetLayer } from '@luciad/ria/view/tileset/WMSTileSetLayer.js';
import { WFSFeatureStore } from '@luciad/ria/model/store/WFSFeatureStore.js';
import { FeatureModel } from '@luciad/ria/model/feature/FeatureModel.js';
import { FeatureLayer } from '@luciad/ria/view/feature/FeatureLayer.js';
import { FeaturePainter } from "@luciad/ria/view/feature/FeaturePainter.js";
import type { PaintState } from "@luciad/ria/view/feature/FeaturePainter.js";
import type { GeoCanvas } from "@luciad/ria/view/style/GeoCanvas.js";
import { Feature } from "@luciad/ria/model/feature/Feature.js";
import { Shape } from "@luciad/ria/shape/Shape.js";
import { Layer } from "@luciad/ria/view/Layer.js";
import type { LabelCanvas } from "@luciad/ria/view/style/LabelCanvas.js";
import { Map } from "@luciad/ria/view/Map.js";
import type { ShapeStyle } from "@luciad/ria/view/style/ShapeStyle.js";
import { DrapeTarget } from "@luciad/ria/view/style/DrapeTarget.js";
import type { ContextMenu } from "@luciad/ria/view/ContextMenu.js";

// ==========================================
// 1. LuciadRIA Layers & Styles Painter
// ==========================================

const normalStyle: ShapeStyle = {
  drapeTarget: DrapeTarget.TERRAIN,
  stroke: {
    width: 2,
    color: "rgb(1,64,89)"
  },
  fill: {
    color: "rgba(1,64,89, 0.5)"
  }
};

const selectedStyle: ShapeStyle = {
  drapeTarget: DrapeTarget.TERRAIN,
  stroke: {
    width: 2,
    color: "rgb(103,1,55)"
  },
  fill: {
    color: "rgba(103,1,55, 0.5)"
  }
};

export class StatesPainter extends FeaturePainter {
  paintBody(geoCanvas: GeoCanvas, feature: Feature, shape: Shape, layer: Layer, map: Map, paintState: PaintState) {
    const style = paintState.selected
      ? JSON.parse(JSON.stringify(selectedStyle))
      : JSON.parse(JSON.stringify(normalStyle));

    if (paintState.hovered && style.stroke) {
      style.stroke.width = 4;
    }

    geoCanvas.drawShape(shape, style);
  }

  paintLabel(labelCanvas: LabelCanvas, feature: Feature, shape: Shape, layer: Layer, map: Map, paintState: PaintState) {
    const name = feature.properties.STATE_NAME;
    const label = `<div class="painter_state_label"><span>${name}</span></div>`;
    labelCanvas.drawLabelInPath(label, shape, {});
  }
}

function addMapLayers(map: WebGLMap, onWfsLayer?: (layer: FeatureLayer) => void) {
  // 1. Add WMS Layer (Imagery)
  const wmsUrl = "https://sampleservices.luciad.com/wms";
  const layerImageryName = [{ layer: "4ceea49c-3e7c-4e2d-973d-c608fb2fb07e" }];

  WMSTileSetModel.createFromURL(wmsUrl, layerImageryName, {}).then((model) => {
    const layer = new WMSTileSetLayer(model, { label: "Imagery" });
    map.layerTree.addChild(layer);
  }).catch((e) => {
    console.error("Failed to load WMS layer:", e);
  });

  // 2. Add WFS Layer (USA States)
  const wfsUrl = "https://sampleservices.luciad.com/wfs";
  WFSFeatureStore.createFromURL(wfsUrl, "ns4:t_states__c__1213").then((store) => {
    const model = new FeatureModel(store);
    const layer = new FeatureLayer(model, {
      label: "USA",
      selectable: true,
      hoverable: true,
      painter: new StatesPainter()
    });
    map.layerTree.addChild(layer);
    if (layer.bounds) {
      map.mapNavigator.fit({ bounds: layer.bounds });
    }
    onWfsLayer?.(layer);
  }).catch((e) => {
    console.error("Failed to load WFS layer:", e);
  });
}

// ==========================================
// 2. Panel Mockup Components
// ==========================================

export const CodeEditor: React.FC = () => (
  <div className="w-100 h-100 p-3 bg-transparent font-monospace text-start" style={{ color: '#abb2bf', overflow: 'auto' }}>
    <div className="text-secondary small mb-2">// Custom Workspace Editor</div>
    <div><span className="text-warning">import</span> React <span className="text-warning">from</span> <span className="text-success">'react'</span>;</div>
    <div><span className="text-warning">import</span> &#123; WindowManager &#125; <span className="text-warning">from</span> <span className="text-success">'dockable-windows'</span>;</div>
    <br />
    <div><span className="text-primary">const</span> <span className="text-info">AppLayout</span> = () =&gt; &#123;</div>
    <div className="ps-3"><span className="text-warning">return</span> (</div>
    <div className="ps-4 text-white-50">&lt;<span className="text-danger">WindowManager</span> /&gt;</div>
    <div className="ps-3">);</div>
    <div>&#125;;</div>
  </div>
);

export const TerminalConsole: React.FC = () => (
  <div className="w-100 h-100 p-3 font-monospace text-start" style={{ backgroundColor: 'var(--rdd-panel-card-bg)', color: 'var(--rdd-panel-text)', overflow: 'auto' }}>
    <div style={{ color: 'var(--rdd-panel-title-color)' }}>[system] Custom Window Manager registered.</div>
    <div style={{ color: 'var(--rdd-panel-title-color)' }}>[system] Drag split lines or float tabs by right clicking.</div>
    <div>[info] Floating windows cascade algorithms ready.</div>
    <div className="mt-2" style={{ fontWeight: 'bold' }}>$ npm run dev</div>
    <div style={{ opacity: 0.7 }}>  VITE v8.0.12  ready in 200 ms</div>
  </div>
);

export const PreviewOutput: React.FC = () => {
  const [count, setCount] = useState(0);
  return (
    <div className="w-100 h-100 p-3 bg-transparent text-start d-flex flex-column justify-content-between" style={{ color: 'var(--rdd-panel-text)', overflow: 'auto' }}>
      <div>
        <div className="d-flex align-items-center justify-content-between border-bottom pb-2 mb-3" style={{ borderColor: 'var(--rdd-panel-card-border)' }}>
          <h6 className="mb-0 font-monospace" style={{ fontSize: '0.8rem', color: 'var(--rdd-panel-title-color)' }}>live-preview-window</h6>
        </div>
        <div className="p-3 rounded mb-3" style={{ backgroundColor: 'var(--rdd-panel-card-bg)', border: '1px solid var(--rdd-panel-card-border)' }}>
          <h6 className="mb-2" style={{ fontSize: '0.9rem', color: 'var(--rdd-panel-text)' }}>UI Sandbox Widget</h6>
          <div className="d-flex align-items-center gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary font-monospace px-3"
              style={{ fontSize: '0.75rem' }}
              onClick={() => setCount(prev => prev + 1)}
            >
              Clicks: {count}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const HelpCenter: React.FC = () => (
  <div className="w-100 h-100 p-4 bg-transparent text-start" style={{ color: 'var(--rdd-panel-text)', opacity: 0.85, overflow: 'auto' }}>
    <h5 className="border-bottom pb-2 mb-3" style={{ color: 'var(--rdd-panel-text)', borderColor: 'var(--rdd-panel-card-border)' }}>Workspace Guide</h5>
    <ul className="small d-flex flex-column gap-2 ps-3">
      <li><strong>Float Tabs:</strong> Click the "▢" in a tab header or right-click to float a docked tab.</li>
      <li><strong>Minimize:</strong> Minimize panels to see them slide into the macOS taskbar at the bottom.</li>
      <li><strong>Save & Restore:</strong> Save your customized layout to JSON and restore it instantly.</li>
    </ul>
  </div>
);

export const LayerTree: React.FC = () => (
  <div className="w-100 h-100 p-3 bg-transparent text-start" style={{ color: 'var(--rdd-panel-text)', overflow: 'auto' }}>
    <h6 className="border-bottom pb-2" style={{ color: 'var(--rdd-panel-title-color)', borderColor: 'var(--rdd-panel-card-border)' }}>Layer Catalog Explorer</h6>
    <div className="d-flex flex-column gap-2 mt-3">
      {['World Imagery (XYZ)', 'Terrain Grid (EPSG:4978)', 'Weather Overlay (WMS)', 'City Vector Model'].map((l, i) => (
        <div key={l} className="d-flex align-items-center justify-content-between p-2 rounded" style={{ backgroundColor: 'var(--rdd-panel-card-bg)', border: '1px solid var(--rdd-panel-card-border)' }}>
          <span className="font-monospace small" style={{ color: 'var(--rdd-panel-text)' }}>{l}</span>
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" defaultChecked={i < 2} role="switch" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const TimeControl: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(50);
  return (
    <div className="w-100 h-100 p-3 bg-transparent text-start d-flex align-items-center gap-3" style={{ color: 'var(--rdd-panel-text)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        className="btn btn-outline-primary btn-sm font-monospace px-3"
      >
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <div className="flex-grow-1">
        <input
          type="range"
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          className="form-range"
        />
      </div>
      <span className="font-monospace small" style={{ minWidth: '100px', color: 'var(--rdd-panel-title-color)' }}>
        Frame: {time} / 100
      </span>
    </div>
  );
};

export const OverviewMap: React.FC = () => (
  <div className="w-100 h-100 bg-secondary d-flex align-items-center justify-content-center border border-dark">
    <div className="text-white font-monospace text-center">
      <div className="small text-white-50">Overview Locator</div>
      <div className="h6 text-info">2D Map Outline</div>
    </div>
  </div>
);

export const TablePanel: React.FC = () => (
  <div className="w-100 h-100 p-2 bg-transparent text-start" style={{ color: 'var(--rdd-panel-text)', overflow: 'auto' }}>
    <table className="table table-sm table-striped font-monospace" style={{ fontSize: '0.75rem', color: 'var(--rdd-panel-text)' }}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Feature</th>
          <th>Reference</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>01</td><td>Luciad 3D Earth</td><td>EPSG:4978</td><td>Active</td></tr>
        <tr><td>02</td><td>Layer Catalog</td><td>Properties</td><td>Ready</td></tr>
        <tr><td>03</td><td>Timeline control</td><td>Epoch Sync</td><td>Idle</td></tr>
      </tbody>
    </table>
  </div>
);

export const ToolPanel: React.FC = () => (
  <div className="w-100 h-100 p-3 bg-transparent text-start" style={{ color: 'var(--rdd-panel-text)', overflow: 'auto' }}>
    <h6 className="border-bottom pb-2" style={{ color: 'var(--rdd-panel-title-color)', borderColor: 'var(--rdd-panel-card-border)' }}>Operations Toolbox</h6>
    <div className="d-flex flex-wrap gap-2 mt-3">
      <button type="button" className="btn btn-sm btn-outline-primary font-monospace">Measure Line</button>
      <button type="button" className="btn btn-sm btn-outline-success font-monospace">Point Buffer</button>
      <button type="button" className="btn btn-sm btn-outline-info font-monospace">Export KML</button>
    </div>
  </div>
);

export const LuciadMapPanel: React.FC<{ panelId: string }> = ({ panelId }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<WebGLMap | null>(null);
  const contract = useFormContainer();
  const { focusPanel, showContextMenu } = useWindowManagerActions();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      // Create the WebGLMap on the HTML DOM element in EPSG:4978
      const map = new WebGLMap(container, {
        reference: getReference('EPSG:4978'),
      });
      mapRef.current = map;

      if (map) {
        map.onClick = () => {
          focusPanel(panelId);
          return false;
        };

        map.onShowContextMenu = (position: number[], contextMenu: ContextMenu) => {
          if (contextMenu.items.length === 0) return;
          const items: ContextMenuItem[] = contextMenu.items.map((item) =>
            item.separator
              ? { separator: true as const }
              : { label: item.label, action: item.action }
          );
          showContextMenu({ x: position[0], y: position[1], items });
        };
      }

      addMapLayers(map, (layer) => {
        layer.onCreateContextMenu = (contextMenu: ContextMenu, _map, info: unknown) => {
          const objects: unknown[] = (info as { objects?: unknown[] } | null)?.objects ?? [];
          if (objects.length === 0) return;
          const feature = objects[0] as Feature;
          contextMenu.addItem({
            id: 'fit',
            label: `Fit to ${feature.properties?.STATE_NAME ?? 'feature'}`,
            action: () => {
              const bounds = feature.shape?.bounds;
              if (bounds && mapRef.current) mapRef.current.mapNavigator.fit({ bounds, animate: true });
            }
          });
          contextMenu.addSeparator();
          contextMenu.addItem({
            id: 'properties',
            label: 'Properties',
            action: () => { console.log('Feature properties:', feature.properties); }
          });
        };
      });

      // Subscribe to the window resize emitter
      const unsubscribeResize = contract.onResize?.(throttle((_width, _height) => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      }, 200, {
        leading: true,
        trailing: true
      }));

      const unsubscribeMinimize = contract.onMinimize?.(() => {
        mapRef.current?.invalidate();
      });

      return () => {
        unsubscribeMinimize?.();
        unsubscribeResize?.();
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
      };
    } catch (e) {
      console.error("Failed to initialize LuciadRIA Map in EPSG:4978:", e);
    }
  }, [panelId, showContextMenu]);

  return (
    <div className="position-relative" style={{ overflow: 'hidden', width: '100%', height: "100%", backgroundColor: "orange" }}>
      <div ref={containerRef} className="map-mini luciad" style={{ width: '100%', height: "100%", backgroundColor: "pink" }} />
      <div className="position-absolute top-0 start-0 rounded bg-black bg-opacity-75 text-info font-monospace small" style={{ width: "100%", zIndex: 10, pointerEvents: 'none' }}>
        LuciadRIA 3D Earth (EPSG:4978)
      </div>
    </div>
  );
};

export const MainMap: React.FC<{ panelId: string }> = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<WebGLMap | null>(null);
  const { showContextMenu } = useWindowManagerActions();
  const panelSize = usePanelSize();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const map = new WebGLMap(container, {
        reference: getReference('EPSG:4978'),
      });
      mapRef.current = map;

      map.onShowContextMenu = (position: number[], contextMenu: ContextMenu) => {
        if (contextMenu.items.length === 0) return;
        const items: ContextMenuItem[] = contextMenu.items.map((item) =>
          item.separator
            ? { separator: true as const }
            : { label: item.label, action: item.action }
        );
        showContextMenu({ x: position[0], y: position[1], items });
      };

      addMapLayers(map, (layer) => {
        layer.onCreateContextMenu = (contextMenu: ContextMenu, _map, info: unknown) => {
          const objects: unknown[] = (info as { objects?: unknown[] } | null)?.objects ?? [];
          if (objects.length === 0) return;
          const feature = objects[0] as Feature;
          contextMenu.addItem({
            id: 'fit',
            label: `Fit to ${feature.properties?.STATE_NAME ?? 'feature'}`,
            action: () => {
              const bounds = feature.shape?.bounds;
              if (bounds && mapRef.current) mapRef.current.mapNavigator.fit({ bounds, animate: true });
            }
          });
          contextMenu.addSeparator();
          contextMenu.addItem({
            id: 'properties',
            label: 'Properties',
            action: () => { console.log('Feature properties:', feature.properties); }
          });
        };
      });

      return () => {
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
      };
    } catch (e) {
      console.error("Failed to initialize MainMap in EPSG:4978:", e);
    }
  }, [showContextMenu]);

  useEffect(() => {
    if (panelSize) mapRef.current?.resize();
  }, [panelSize]);

  return (
    <div className="w-100 h-100 position-relative bg-dark" style={{ overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} className="mini-me luciad" />
      <div className="position-absolute top-0 start-0 m-2 p-1 px-2 rounded bg-black bg-opacity-75 text-success font-monospace small" style={{ zIndex: 1, pointerEvents: 'none' }}>
        🗺️ Main Global Map View (EPSG:4978) [Locked Layout]
      </div>
    </div>
  );
};

// Register all panels
export function registerDemoPanels() {
  PanelRegistry.register('mainMap', MainMap, {
    title: 'Main Map',
    initialTarget: 'docked',
    canClose: false,
    canMinimize: false,
    canDrag: false,
    renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="mainMap" />
  });
  PanelRegistry.register('editor', CodeEditor, { 
    title: 'Code Editor', 
    initialTarget: 'docked',
    renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="editor" />
  });
  PanelRegistry.register('terminal', TerminalConsole, { title: 'Console Output', initialTarget: 'docked' });
  PanelRegistry.register('preview', PreviewOutput, { title: 'Sandbox Widget', initialTarget: 'floating' });
  PanelRegistry.register('help', HelpCenter, { title: 'Workspace Help', initialTarget: 'docked' });
  PanelRegistry.register('showcaseControl', ShowcaseControlCenter, { 
    title: 'Control Center', 
    initialTarget: 'docked',
    renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="showcaseControl" />
  });
  PanelRegistry.register('luciadMap', LuciadMapPanel, { title: 'LuciadRIA Earth 3D', initialTarget: 'docked' });
  PanelRegistry.register('layertree', LayerTree, { title: 'Layer tree', initialTarget: 'floating', favoritePosition: { x: 1000, y: 100, width: 300, height: 400 } });
  PanelRegistry.register('timecontrol', TimeControl, {
    title: 'Time Control bar',
    initialTarget: 'floating',
    favoritePosition: {
      x: '10px',
      y: 'calc(100% - 130px)',
      width: 'calc(100% - 20px)',
      height: '100px'
    }
  });
  PanelRegistry.register('overviewmap', OverviewMap, { title: 'Overview locator', initialTarget: 'floating', favoritePosition: { x: 80, y: 500, width: 220, height: 180 } });
  PanelRegistry.register('table', TablePanel, { title: 'Attribute Table', initialTarget: 'docked' });
  PanelRegistry.register('toolpanels', ToolPanel, { title: 'Toolbox Panel', initialTarget: 'docked' });
  PanelRegistry.register('panelmanager', PanelManagerForm, { title: 'Panel Registry Form', initialTarget: 'floating', favoritePosition: { x: 400, y: 150, width: 500, height: 420 } });
  PanelRegistry.register('dirtyForm', DirtyFormDemoPanel, { 
    title: 'Intercept Form', 
    initialTarget: 'floating', 
    favoritePosition: { x: 350, y: 150, width: 450, height: 420 },
    renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="dirtyForm" />
  });
  PanelRegistry.register('dirtyEditor', DirtyEditorDemoPanel, { 
    title: 'Intercept Editor', 
    initialTarget: 'docked',
    renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="dirtyForm" />
  });
}
