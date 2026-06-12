import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { usePanelState, usePanelActions } from './PanelProviderContext';
import { FormContainerProvider, type FormContainerContract, type CloseOptions } from './FormContainerContext';
import type { PanelInstance, SidePanelOptions, PanelTitle } from './PanelProviderContext';
import { useFormatMessage, formatLabel, useStyleClasses, usePredefinedMessages } from './WindowManagerContext';
import ConfirmationForm from '../forms/ConfirmationForm';

/**
 * Props for the internal {@link SidePanelRendererItem} component.
 */
interface SidePanelRendererItemProps {
  /** The panel instance containing metadata, component type, and rendering state. */
  panel: PanelInstance;
  /** Floating anchor edge side for the drawer panel. */
  position: 'left' | 'right';
  /** Default width applied if no panel override configuration is provided. */
  defaultWidth?: number | string;
}

/**
 * SidePanelRendererItem component renders an individual left or right drawer panel instance
 * wrapped inside the FormContainerProvider context. Handles dirty state verification before close.
 */
const SidePanelRendererItem: React.FC<SidePanelRendererItemProps> = ({ panel, position, defaultWidth }) => {
  const { close, openModal, updateInstance, setDirty, registerCloseHandler, unregisterCloseHandler } = usePanelActions();
  const { modals } = usePanelState();
  const formatMessage = useFormatMessage();
  const predefinedMessages = usePredefinedMessages();
  const { sidePanelClass, sidePanelBodyClass } = useStyleClasses();
  const closeHandlerRef = useRef<(() => boolean | Promise<boolean>) | null>(null);

  const { id, Component, props, options, dirty, dirtyOptions } = panel;
  const panelOptions = options as SidePanelOptions;
  const [icon, setIconState] = useState<React.ReactNode>(panelOptions.icon || null);

  const optionsRef = useRef(panelOptions);
  optionsRef.current = panelOptions;

  const baseTitle = formatLabel(panelOptions.title, formatMessage);

  const handleClose = useCallback(async (options?: CloseOptions) => {
    if (options?.force) {
      close(id);
      return;
    }

    if (closeHandlerRef.current) {
      const canClose = await closeHandlerRef.current();
      if (!canClose) return;
      close(id);
      return;
    }

    if (dirty) {
      openModal(
        ConfirmationForm,
        {
          title: dirtyOptions?.title || predefinedMessages.unsavedChangesTitle,
          message: dirtyOptions?.message || {
            id: predefinedMessages.unsavedChangesMessage.id,
            defaultMessage: predefinedMessages.unsavedChangesMessage.defaultMessage,
            values: { title: baseTitle }
          },
          alert: dirtyOptions?.alert,
          alertType: dirtyOptions?.alertType || 'danger',
          useYesNoTitles: true,
          onOK: () => close(id),
        },
        { size: 'small' }
      );
      return;
    }

    close(id);
  }, [close, openModal, id, dirty, dirtyOptions, baseTitle, predefinedMessages]);

  const canClose = useCallback(async (): Promise<boolean> => {
    if (closeHandlerRef.current) {
      return await closeHandlerRef.current();
    }
    return !dirty;
  }, [dirty]);

  useEffect(() => {
    registerCloseHandler(id, canClose);
    return () => unregisterCloseHandler(id);
  }, [id, canClose, registerCloseHandler, unregisterCloseHandler]);

  const handleSetDirty = useCallback((dirty: boolean, options?: any) => setDirty(id, dirty, options), [setDirty, id]);
  const handleSetTitle = useCallback((title: PanelTitle) => updateInstance(id, { options: { ...optionsRef.current, title } }), [updateInstance, id]);
  const handleSetIcon = useCallback((newIcon: React.ReactNode) => setIconState(newIcon), []);
  const handleOnCloseRequested = useCallback((handler: () => boolean | Promise<boolean>) => {
    closeHandlerRef.current = handler;
    return () => { closeHandlerRef.current = null; };
  }, []);

  const contract: FormContainerContract = useMemo(() => ({
    requestClose: handleClose,
    setDirty: handleSetDirty,
    setTitle: handleSetTitle,
    setIcon: handleSetIcon,
    onCloseRequested: handleOnCloseRequested,
    containerType: position === 'left' ? 'left-panel' : 'right-panel',
    instanceId: id,
  }), [handleClose, handleSetDirty, handleSetTitle, handleSetIcon, handleOnCloseRequested, position, id]);

  const displayTitle = dirty ? `${baseTitle} *` : baseTitle;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modals.length === 0) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, modals.length]);

  const width = panelOptions.width || defaultWidth || 400;
  const widthStyle = typeof width === 'number' ? `${width}px` : width;

  return (
    <div 
      className={`v2-side-panel v2-side-panel-${position} v2-side-panel-visible ${sidePanelClass ?? ''}`}
      style={{ width: widthStyle }}
    >
      <div className="v2-side-panel-window">
        <div className="v2-side-panel-header">
          {icon && <div className="v2-side-panel-icon">{icon}</div>}
          <h4 className="v2-side-panel-title">{displayTitle}</h4>
          <button
            className="v2-side-panel-close-button"
            onClick={() => handleClose()}
            title={formatMessage(predefinedMessages.closeTooltip)}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={`v2-side-panel-body ${sidePanelBodyClass ?? ''}`}>
          <FormContainerProvider value={contract}>
            <Component {...props} panelId={id} />
          </FormContainerProvider>
        </div>
      </div>
    </div>
  );
};

export interface SidePanelRendererProps {
  /**
   * Default panel width applied when openLeftPanel/openRightPanel do not specify one.
   * Accepts a number (treated as px) or any CSS width string (e.g. '40vw').
   * Falls back to 400px if omitted.
   */
  defaultWidth?: number | string;
}

/**
 * SidePanelRenderer component acts as the global container rendering both
 * left and right side drawers if they are currently active.
 */
export const SidePanelRenderer: React.FC<SidePanelRendererProps> = ({ defaultWidth }) => {
  const { leftPanel, rightPanel } = usePanelState();
  return (
    <>
      {leftPanel  && <SidePanelRendererItem key={leftPanel.id}  panel={leftPanel}  position="left"  defaultWidth={defaultWidth} />}
      {rightPanel && <SidePanelRendererItem key={rightPanel.id} panel={rightPanel} position="right" defaultWidth={defaultWidth} />}
    </>
  );
};

/**
 * LeftPanelRenderer component renders ONLY the left side drawer if it is currently active.
 */
export const LeftPanelRenderer: React.FC<SidePanelRendererProps> = ({ defaultWidth }) => {
  const { leftPanel } = usePanelState();
  if (!leftPanel) return null;
  return <SidePanelRendererItem key={leftPanel.id} panel={leftPanel} position="left" defaultWidth={defaultWidth} />;
};

/**
 * RightPanelRenderer component renders ONLY the right side drawer if it is currently active.
 */
export const RightPanelRenderer: React.FC<SidePanelRendererProps> = ({ defaultWidth }) => {
  const { rightPanel } = usePanelState();
  if (!rightPanel) return null;
  return <SidePanelRendererItem key={rightPanel.id} panel={rightPanel} position="right" defaultWidth={defaultWidth} />;
};

export default SidePanelRenderer;
