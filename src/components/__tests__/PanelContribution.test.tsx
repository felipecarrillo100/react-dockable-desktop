/**
 * Tests for PanelContributionContext:
 * - PC1: useActivePanelContribution() is null when no panel is active
 * - PC2: A published contribution is reflected once its panel becomes active
 * - PC3: Switching active panel switches which contribution is read
 * - PC4: Two independent map instances keep independent controller state,
 *        preserved exactly when switching away and back (the core use case)
 * - PC5: Unmounting the active panel clears its contribution
 * - PC6: A panel can contribute multiple sidebar sections at once
 * - PC7: usePanelContribution() outside provider warns and no-ops
 * - PC8: useActivePanelContribution() outside provider warns and returns null
 * - PC9: sidebarSectionToTab() converts, using fallbackIcon when section.icon is omitted
 * - PC10: useMergedToolbarItems() appends contributed items behind a separator, unchanged when empty
 * - PC11: useMergedSidebarTabs() appends contributed sections as tabs, unchanged when empty
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WindowManagerProvider, useWindowManagerActions } from '../WindowManagerContext';
import { PanelProvider } from '../PanelProviderContext';
import { PanelRegistry } from '../PanelRegistry';
import WindowManager from '../WindowManager';
import {
  PanelContributionProvider,
  usePanelContribution,
  useActivePanelContribution,
  sidebarSectionToTab,
  useMergedToolbarItems,
  useMergedSidebarTabs,
} from '../PanelContributionContext';
import type { PanelContribution } from '../PanelContributionContext';
import type { ToolbarItem } from '../Toolbar';
import type { SidebarTab } from '../Sidebar';

const Icon: React.FC = () => <svg data-testid="icon" />;

// A mock map panel with its own independent "controller" state, mirroring the
// LuciadRIA-style use case: exactly one of pan/draw/measure is active at a time,
// per instance, contributed as three independently-controlled toggle items.
const MapPanel: React.FC<{ panelId: string }> = ({ panelId }) => {
  const [controller, setController] = useState<'pan' | 'draw' | 'measure'>('pan');
  usePanelContribution({
    toolbarItems: (['pan', 'draw', 'measure'] as const).map(id => ({
      type: 'toggle' as const,
      id,
      label: id,
      icon: <Icon />,
      active: controller === id,
      onToggle: () => setController(id),
    })),
  });
  return (
    <div data-testid={`map-${panelId}`} data-controller={controller}>
      <button data-testid={`map-${panelId}-set-draw`} onClick={() => setController('draw')}>Set Draw</button>
      <button data-testid={`map-${panelId}-set-measure`} onClick={() => setController('measure')}>Set Measure</button>
    </div>
  );
};
PanelRegistry.register('mapPanel', MapPanel);

// A panel contributing multiple sidebar sections at once.
const RichPanel: React.FC<{ panelId: string }> = () => {
  usePanelContribution({
    sidebarSections: [
      { id: 'layers', label: 'Layers', content: <div data-testid="layers-content" /> },
      { id: 'legend', label: 'Legend', content: <div data-testid="legend-content" /> },
    ],
  });
  return <div />;
};
PanelRegistry.register('richPanel', RichPanel);

// A panel that contributes nothing.
const PlainPanel: React.FC<{ panelId: string }> = () => <div />;
PanelRegistry.register('plainPanel', PlainPanel);

let lastActions: any = null;
let lastContribution: PanelContribution | null = null;

const ContributionProbe: React.FC = () => {
  lastActions = useWindowManagerActions();
  lastContribution = useActivePanelContribution();
  return null;
};

describe('PanelContribution', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    lastActions = null;
    lastContribution = null;
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
    const preserved = document.getElementById('preserved-dom-container');
    if (preserved?.parentNode) preserved.parentNode.removeChild(preserved);
  });

  const mount = () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelContributionProvider>
            <PanelProvider>
              <ContributionProbe />
              <WindowManager />
            </PanelProvider>
          </PanelContributionProvider>
        </WindowManagerProvider>
      );
    });
  };

  it('PC1: is null when no panel is active', () => {
    mount();
    expect(lastContribution).toBeNull();
  });

  it('PC2: a published contribution is reflected once its panel becomes active', () => {
    mount();
    act(() => { lastActions.openPanel('map-1', 'mapPanel', { initialTarget: 'docked' }); });
    act(() => { lastActions.focusPanel('map-1'); });

    expect(lastContribution).not.toBeNull();
    expect(lastContribution!.toolbarItems).toHaveLength(3);
    const pan = lastContribution!.toolbarItems!.find((i: any) => i.id === 'pan');
    expect((pan as any).active).toBe(true);
  });

  it('PC3: switching active panel switches which contribution is read', () => {
    mount();
    act(() => {
      lastActions.openPanel('map-1', 'mapPanel', { initialTarget: 'docked' });
      lastActions.openPanel('rich-1', 'richPanel', { initialTarget: 'docked' });
    });

    act(() => { lastActions.focusPanel('map-1'); });
    expect(lastContribution!.toolbarItems).toBeDefined();
    expect(lastContribution!.sidebarSections).toBeUndefined();

    act(() => { lastActions.focusPanel('rich-1'); });
    expect(lastContribution!.sidebarSections).toHaveLength(2);
    expect(lastContribution!.toolbarItems).toBeUndefined();
  });

  it('PC4: two independent map instances keep independent, preserved controller state', () => {
    mount();
    act(() => {
      lastActions.openPanel('map-1', 'mapPanel', { initialTarget: 'docked' });
      lastActions.openPanel('map-2', 'mapPanel', { initialTarget: 'docked' });
    });

    // Map 1 becomes active, defaults to 'pan'.
    act(() => { lastActions.focusPanel('map-1'); });
    let active = () => lastContribution!.toolbarItems!.find((i: any) => i.active)!.id;
    expect(active()).toBe('pan');

    // User switches Map 1 to 'draw' via its own toolbar contribution's onToggle.
    const map1Draw = lastContribution!.toolbarItems!.find((i: any) => i.id === 'draw')! as any;
    act(() => { map1Draw.onToggle(true); });
    expect(active()).toBe('draw');

    // Switch to Map 2 — independent instance, still on its own default 'pan'.
    act(() => { lastActions.focusPanel('map-2'); });
    expect(active()).toBe('pan');

    // User switches Map 2 to 'measure'.
    const map2Measure = lastContribution!.toolbarItems!.find((i: any) => i.id === 'measure')! as any;
    act(() => { map2Measure.onToggle(true); });
    expect(active()).toBe('measure');

    // Switch back to Map 1 — its 'draw' selection must be exactly as left, untouched by Map 2.
    act(() => { lastActions.focusPanel('map-1'); });
    expect(active()).toBe('draw');

    // And Map 2 again — still 'measure'.
    act(() => { lastActions.focusPanel('map-2'); });
    expect(active()).toBe('measure');
  });

  it('PC5: unmounting the active panel clears its contribution', () => {
    mount();
    act(() => { lastActions.openPanel('map-1', 'mapPanel', { initialTarget: 'docked' }); });
    act(() => { lastActions.focusPanel('map-1'); });
    expect(lastContribution).not.toBeNull();

    act(() => { lastActions.closePanel('map-1'); });
    expect(lastContribution).toBeNull();
  });

  it('PC6: a panel can contribute multiple sidebar sections at once', () => {
    mount();
    act(() => { lastActions.openPanel('rich-1', 'richPanel', { initialTarget: 'docked' }); });
    act(() => { lastActions.focusPanel('rich-1'); });

    expect(lastContribution!.sidebarSections).toHaveLength(2);
    expect(lastContribution!.sidebarSections!.map((s: any) => s.id)).toEqual(['layers', 'legend']);
  });

  it('a panel contributing nothing yields null while active', () => {
    mount();
    act(() => { lastActions.openPanel('plain-1', 'plainPanel', { initialTarget: 'docked' }); });
    act(() => { lastActions.focusPanel('plain-1'); });
    expect(lastContribution).toBeNull();
  });

  it('PC7: usePanelContribution() outside provider warns and no-ops', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Publisher: React.FC = () => {
      usePanelContribution({ toolbarItems: [] });
      return null;
    };
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelProvider>
            <Publisher />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('usePanelContribution()'));
    warnSpy.mockRestore();
  });

  it('PC8: useActivePanelContribution() outside provider warns and returns null', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let result: PanelContribution | null = { toolbarItems: [] }; // sentinel, must become null
    const Reader: React.FC = () => {
      result = useActivePanelContribution();
      return null;
    };
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelProvider>
            <Reader />
          </PanelProvider>
        </WindowManagerProvider>
      );
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('useActivePanelContribution()'));
    warnSpy.mockRestore();
  });

  it('PC9: sidebarSectionToTab() converts, using fallbackIcon when section.icon is omitted', () => {
    const content = <div data-testid="section-content" />;
    const withIcon = sidebarSectionToTab({ id: 'toc', label: 'Table of Contents', icon: <Icon />, content });
    expect(withIcon.id).toBe('toc');
    expect(withIcon.label).toBe('Table of Contents');
    expect(withIcon.icon).not.toBeNull();
    expect(withIcon.renderContent('toc', () => {}, () => {})).toBe(content);

    const withoutIcon = sidebarSectionToTab({ id: 'legend', label: 'Legend', content }, <Icon />);
    expect(withoutIcon.icon).toEqual(<Icon />);

    const withoutIconOrFallback = sidebarSectionToTab({ id: 'plain', label: 'Plain', content });
    expect(withoutIconOrFallback.icon).toBeNull();
  });

  it('PC10: useMergedToolbarItems() appends contributed items behind a separator, unchanged when empty', () => {
    const staticItems: ToolbarItem[] = [{ type: 'action', id: 'save', label: 'Save', icon: <Icon />, onClick: () => {} }];
    let merged: ToolbarItem[] = [];
    let actions: any = null;

    const Probe: React.FC = () => {
      actions = useWindowManagerActions();
      merged = useMergedToolbarItems(staticItems);
      return null;
    };

    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelContributionProvider>
            <PanelProvider>
              <Probe />
              <WindowManager />
            </PanelProvider>
          </PanelContributionProvider>
        </WindowManagerProvider>
      );
    });
    expect(merged).toEqual(staticItems);

    act(() => { actions.openPanel('map-1', 'mapPanel', { initialTarget: 'docked' }); });
    act(() => { actions.focusPanel('map-1'); });

    expect(merged).toHaveLength(1 + 1 + 3); // static + separator + 3 contributed toggles
    expect(merged[1]).toEqual({ type: 'separator' });
    expect(merged.slice(2).map((i: any) => i.id)).toEqual(['pan', 'draw', 'measure']);
  });

  it('PC11: useMergedSidebarTabs() appends contributed sections as tabs, unchanged when empty', () => {
    const staticTabs: SidebarTab[] = [{ id: 'settings', label: 'Settings', icon: <Icon />, renderContent: () => <div /> }];
    let merged: SidebarTab[] = [];
    let actions: any = null;

    const Probe: React.FC = () => {
      actions = useWindowManagerActions();
      merged = useMergedSidebarTabs(staticTabs, <Icon />);
      return null;
    };

    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <PanelContributionProvider>
            <PanelProvider>
              <Probe />
              <WindowManager />
            </PanelProvider>
          </PanelContributionProvider>
        </WindowManagerProvider>
      );
    });
    expect(merged).toEqual(staticTabs);

    act(() => { actions.openPanel('rich-1', 'richPanel', { initialTarget: 'docked' }); });
    act(() => { actions.focusPanel('rich-1'); });

    expect(merged).toHaveLength(3); // 1 static + 2 contributed
    expect(merged.map(t => t.id)).toEqual(['settings', 'layers', 'legend']);
    expect(merged[1].renderContent('layers', () => {}, () => {})).not.toBeNull();
  });
});
