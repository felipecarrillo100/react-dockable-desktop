/**
 * @file panelMount.tsx
 * @description Where panels live: the slots that place a panel's preserved DOM (in a tab, a window, a taskbar preview), its lifecycle events and form container. The DOM, sizes and lifecycle handlers themselves belong to the workspace's own panel host (`panelHost.ts`).
 */
import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { restorePanelDom } from '../domPreservation';
import { useWindowManagerState, useWindowManagerActions, useFormatMessage, formatLabel, usePredefinedMessages, useRegistry } from '../WindowManagerContext';
import type { PanelInfo, MessageDescriptor, MessageFormatter } from '../../types';
import type { MessageKey } from '../predefinedMessages';
import type { PanelRegistry } from '../PanelRegistry';
import { FormContainerProvider } from '../FormContainerContext';
import type { FormContainerContract, ContainerType } from '../FormContainerContext';
import { usePanelHost } from './panelHost';

/**
 * Where a panel's element waits while no slot shows it. One per page, shared on purpose: every
 * workspace's elements are distinct, so parking them side by side in one hidden node is harmless.
 */
export const hiddenContainerId = 'preserved-dom-container';

const park = (el: HTMLElement): void => {
  let hiddenContainer = document.getElementById(hiddenContainerId);
  if (!hiddenContainer) {
    hiddenContainer = document.createElement('div');
    hiddenContainer.id = hiddenContainerId;
    hiddenContainer.style.display = 'none';
    document.body.appendChild(hiddenContainer);
  }
  hiddenContainer.appendChild(el);
};


// ==========================================
// 3. Persistent DOM Container Host & Slot
// ==========================================

export const renderPanelContent = (
  id: string,
  panel: PanelInfo,
  registry: PanelRegistry,
  messages: Record<MessageKey, MessageDescriptor>,
  formatMessage: MessageFormatter,
): React.ReactNode => {
  const componentKey = panel.component;
  const registryEntry = registry.get(componentKey);
  if (!registryEntry) {
    console.warn(
      `[react-dockable-desktop] Panel "${id}" references component key "${componentKey}" ` +
      `which is not registered. Add it to the workspace's panels:\n` +
      `  createWorkspace({ panels: { "${componentKey}": { component: YourComponent } } })`
    );
    return (
      <div className="rdd-unregistered-panel">
        <h6 className="rdd-unregistered-panel__title">⚠️ {formatLabel(messages.componentUnregistered, formatMessage)}</h6>
        <span className="rdd-unregistered-panel__key">{formatLabel({ ...messages.componentKey, values: { key: componentKey } }, formatMessage)}</span>
      </div>
    );
  }
  const Component = registryEntry.Component;
  // Props spread first, panelId second — a caller-supplied prop of the same name can never
  // shadow the injected id. Matches ModalStackRenderer/SidePanelRenderer's spread order exactly.
  return <Component {...(panel.props ?? {})} panelId={id} />;
};

export const PreservedDOMWrapper: React.FC<{ panelId: string }> = ({ panelId }) => {
  const panelHost = usePanelHost();
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Only the active panel gets focus back after a move (see domPreservation.ts). A selector, so
  // this wrapper re-renders only when this panel's active flag flips.
  const isActive = useWindowManagerState(s => s.activePanelId === panelId);
  const isActiveRef = useRef(isActive);
  useLayoutEffect(() => { isActiveRef.current = isActive; });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cachedEl = panelHost.getOrCreateElement(panelId);
    host.appendChild(cachedEl);
    restorePanelDom(cachedEl, { refocus: isActiveRef.current });

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          panelHost.setDimensions(panelId, { width, height });
          const lifecycle = panelHost.getLifecycle(panelId);
          if (lifecycle) {
            lifecycle.onResize.forEach(h => h(width, height));
          }
        }
      }
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      park(cachedEl);
    };
  }, [panelId, panelHost]);

  return <div ref={hostRef} className="rdd-panel-dom-host" />;
};

export const PreviewDOMWrapper: React.FC<{ panelId: string }> = ({ panelId }) => {
  const panelHost = usePanelHost();
  const panel = useWindowManagerState(s => s.panels[panelId]);
  const registry = useRegistry();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const hostRef = useRef<HTMLDivElement | null>(null);

  const regEntry = panel ? registry.get(panel.component) : null;
  const disableLivePreview = regEntry?.defaultOptions?.disableLivePreview || false;

  const lastSize = panelHost.getDimensions(panelId) || { width: 800, height: 500 };
  const origW = lastSize.width;
  const origH = lastSize.height;
  const maxW = 220;
  const maxH = 140;
  const scale = Math.min(maxW / origW, maxH / origH);

  useEffect(() => {
    if (disableLivePreview) return;

    const host = hostRef.current;
    if (!host) return;

    const cachedEl = panelHost.getElement(panelId);
    if (!cachedEl) return;

    host.appendChild(cachedEl);
    restorePanelDom(cachedEl, { refocus: false }); // a preview shows the panel's place; it never takes focus

    return () => park(cachedEl);
  }, [panelId, disableLivePreview, panelHost]);

  if (disableLivePreview) {
    const displayW = origW * scale;
    const displayH = origH * scale;
    const rawTitle = panel?.title || regEntry?.defaultOptions?.title || messages.untitledPanel;
    const title = formatLabel(rawTitle, formatMessage);
    const initialChar = (Array.from(title)[0] || 'P').toUpperCase();

    return (
      <div
        className="rdd-taskbar-item-preview-frame rdd-taskbar-item-preview-frame--empty"
        style={{ width: `${displayW}px`, height: `${displayH}px` }}
      >
        <div className="rdd-taskbar-item-preview-initial">
          {initialChar}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rdd-taskbar-item-preview-frame"
      style={{
        width: `${origW * scale}px`,
        height: `${origH * scale}px`,
      }}
    >
      <div
        ref={hostRef}
        className="rdd-taskbar-item-preview-host"
        style={{
          width: `${origW}px`,
          height: `${origH}px`,
          transform: `scale(${scale})`,
          ['--rdd-preview-scale' as string]: scale
        }}
      />
    </div>
  );
};

export const FormContainerProviderWrapper: React.FC<{ panelId: string; children: React.ReactNode }> = ({ panelId, children }) => {
  const panelHost = usePanelHost();
  const { requestClosePanel, setPanelDirty, registerCloseGuard, unregisterCloseGuard, registerStateProvider, unregisterStateProvider, updatePanelTitle, setPanelIcon, minimizePanel } = useWindowManagerActions();

  // ── minimize / restore ──────────────────────────────────────────────────
  const isMin = useWindowManagerState(s => s.minimized.some(m => m.id === panelId));
  const prevMinRef = useRef(isMin);

  useEffect(() => {
    const entry = panelHost.getLifecycle(panelId);
    if (!entry) return;

    if (isMin && !prevMinRef.current) {
      entry.onMinimize.forEach(h => h());
    } else if (!isMin && prevMinRef.current) {
      entry.onRestore.forEach(h => h());
    }
    prevMinRef.current = isMin;
  }, [isMin, panelId, panelHost]);

  // ── activate / deactivate ───────────────────────────────────────────────
  const isActive = useWindowManagerState(s => s.activePanelId === panelId);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive; // always sync the ref, even if no handler is registered yet
    const entry = panelHost.getLifecycle(panelId);
    if (!entry) return;

    if (isActive && !wasActive) {
      entry.onActivate.forEach(h => h());
    } else if (!isActive && wasActive) {
      entry.onDeactivate.forEach(h => h());
    }
  }, [isActive, panelId, panelHost]);

  // ── container-type change ───────────────────────────────────────────────
  const rawPanelState = useWindowManagerState(s => s.panels[panelId]?.state);
  const derivedContainerType: ContainerType =
    rawPanelState === 'floating' ? 'floating-window' : 'dockable-panel';
  const prevContainerTypeRef = useRef(derivedContainerType);

  useEffect(() => {
    if (rawPanelState === 'minimized') return; // minimize/restore is onMinimize's domain; intentionally skip ref update
    const prevType = prevContainerTypeRef.current;
    prevContainerTypeRef.current = derivedContainerType; // always sync, even if no handler registered yet
    const entry = panelHost.getLifecycle(panelId);
    if (!entry) return;

    if (derivedContainerType !== prevType) {
      entry.onContainerTypeChange.forEach(h => h(derivedContainerType));
    }
  }, [derivedContainerType, rawPanelState, panelId, panelHost]);

  // ── cleanup: fire onDeactivate (if active) then onClose ─────────────────
  useEffect(() => {
    return () => {
      const entry = panelHost.getLifecycle(panelId);
      if (entry) {
        if (prevActiveRef.current) entry.onDeactivate.forEach(h => h());
        entry.onClose.forEach(h => h());
        panelHost.deleteLifecycle(panelId);
      }
    };
  }, [panelId, panelHost]);

  // Capture the container type at mount so the static `containerType` field is
  // correct ('dockable-panel' or 'floating-window') rather than the default 'standalone'.
  const initialContainerTypeRef = useRef<ContainerType>(derivedContainerType);

  const contract = React.useMemo<FormContainerContract>(() => ({
    requestClose: (options) => requestClosePanel(panelId, options),
    setDirty: (dirty, options) => setPanelDirty(panelId, dirty, options),
    onCloseRequested: (handler) => {
      registerCloseGuard(panelId, handler);
      return () => unregisterCloseGuard(panelId);
    },
    registerStateProvider: (getState) => {
      registerStateProvider(panelId, getState);
      return () => unregisterStateProvider(panelId);
    },
    setTitle: (title) => updatePanelTitle(panelId, title),
    setIcon: (icon) => setPanelIcon(panelId, icon ?? null),
    instanceId: panelId,
    containerType: initialContainerTypeRef.current,
    onClose: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onClose.add(handler);
      return () => reg.onClose.delete(handler);
    },
    onMinimize: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onMinimize.add(handler);
      return () => reg.onMinimize.delete(handler);
    },
    onRestore: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onRestore.add(handler);
      return () => reg.onRestore.delete(handler);
    },
    onResize: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onResize.add(handler);
      return () => reg.onResize.delete(handler);
    },
    requestMinimize: () => minimizePanel(panelId),
    getDimensions: () => panelHost.getDimensions(panelId) ?? null,
    onActivate: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onActivate.add(handler);
      return () => reg.onActivate.delete(handler);
    },
    onDeactivate: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onDeactivate.add(handler);
      return () => reg.onDeactivate.delete(handler);
    },
    onContainerTypeChange: (handler) => {
      const reg = panelHost.getOrCreateLifecycle(panelId);
      reg.onContainerTypeChange.add(handler);
      return () => reg.onContainerTypeChange.delete(handler);
    },
  }), [panelId, panelHost, requestClosePanel, setPanelDirty, registerCloseGuard, unregisterCloseGuard, registerStateProvider, unregisterStateProvider, updatePanelTitle, setPanelIcon, minimizePanel]);

  return (
    <FormContainerProvider value={contract}>
      {children}
    </FormContainerProvider>
  );
};

/**
 * One open panel's body, portaled into its preserved element (the slots then place that element in
 * a tab, a window or a preview). Memoised and given only the id: it reads its own entry and the
 * direction, so it re-renders when its panel changes, never because another panel did (7.7.2).
 */
export const PanelMount: React.FC<{ panelId: string }> = React.memo(({ panelId }) => {
  const panelHost = usePanelHost();
  const panel = useWindowManagerState(s => s.panels[panelId]);
  const dir = useWindowManagerState(s => s.dir);
  const registry = useRegistry();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  if (!panel) return null;
  return createPortal(
    <FormContainerProviderWrapper panelId={panelId}>
      <div className="rdd-panel-content" data-rdd-panel={panelId} dir={dir}>
        {renderPanelContent(panelId, panel, registry, messages, formatMessage)}
      </div>
    </FormContainerProviderWrapper>,
    panelHost.getOrCreateElement(panelId),
  );
});
PanelMount.displayName = 'PanelMount';
