import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { usePanelState, usePanelActions } from './PanelProviderContext';
import { FormContainerProvider, type FormContainerContract, type CloseOptions } from './FormContainerContext';
import type { PanelInstance, ModalOptions, PanelTitle } from './PanelProviderContext';
import { useFormatMessage, formatLabel, useStyleClasses } from './WindowManagerContext';
import { DirtyWarningOverlay } from './DirtyWarningOverlay';

interface ModalRendererProps {
  modal: PanelInstance;
  index: number;
  isTopmost: boolean;
}

const ModalRenderer: React.FC<ModalRendererProps> = ({ modal, index, isTopmost }) => {
  const { close, updateInstance, setDirty } = usePanelActions();
  const formatMessage = useFormatMessage();
  const { modalClass, modalBodyClass } = useStyleClasses();
  const closeHandlerRef = useRef<(() => boolean | Promise<boolean>) | null>(null);

  const [showDirtyWarning, setShowDirtyWarning] = useState(false);
  const dirtyResolverRef = useRef<((discard: boolean) => void) | null>(null);

  const { id, Component, props, options, dirty } = modal;
  const modalOptions = options as ModalOptions;

  const [icon, setIconState] = useState<React.ReactNode>(modalOptions.icon || null);

  const optionsRef = useRef(modalOptions);
  optionsRef.current = modalOptions;

  const promptDirtyWarning = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      dirtyResolverRef.current = resolve;
      setShowDirtyWarning(true);
    });
  }, []);

  const handleDirtyDiscard = useCallback(() => {
    dirtyResolverRef.current?.(true);
    dirtyResolverRef.current = null;
    setShowDirtyWarning(false);
  }, []);

  const handleDirtyCancel = useCallback(() => {
    dirtyResolverRef.current?.(false);
    dirtyResolverRef.current = null;
    setShowDirtyWarning(false);
  }, []);

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
      const shouldDiscard = await promptDirtyWarning();
      if (!shouldDiscard) return;
    }

    close(id);
  }, [close, id, dirty, promptDirtyWarning]);

  const handleSetDirty = useCallback((dirty: boolean) => setDirty(id, dirty), [setDirty, id]);
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
    containerType: 'modal',
    instanceId: id,
  }), [handleClose, handleSetDirty, handleSetTitle, handleSetIcon, handleOnCloseRequested, id]);

  const baseTitle = formatLabel(modalOptions.title, formatMessage);
  const displayTitle = dirty ? `${baseTitle} *` : baseTitle;

  const sizeClass = modalOptions.size ? `v2-modal-size-${modalOptions.size}` : 'v2-modal-size-auto';
  const showCloseButton = modalOptions.closable !== false;

  useEffect(() => {
    if (!isTopmost || !showCloseButton || showDirtyWarning) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, showCloseButton, isTopmost, showDirtyWarning]);

  const baseZIndex = 10000;
  const modalZIndex = baseZIndex + (index * 10);
  const dirtyWarningZIndex = modalZIndex + 5;

  return (
    <>
      <div className="v2-modal-overlay" style={{ zIndex: modalZIndex }}>
        <div className="v2-modal-curtain" onClick={showCloseButton ? () => handleClose() : undefined} />
        <div className={`v2-modal-window ${sizeClass} ${modalClass ?? ''}`}>
          <div className="v2-modal-header">
            {icon && <div className="v2-modal-icon">{icon}</div>}
            <h4 className="v2-modal-title">{displayTitle}</h4>
            {showCloseButton && (
              <button
                className="v2-modal-close-button"
                onClick={() => handleClose()}
                title="Close"
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className={`v2-modal-body ${modalBodyClass ?? ''}`}>
            <FormContainerProvider value={contract}>
              <Component {...props} panelId={id} />
            </FormContainerProvider>
          </div>
        </div>
      </div>

      {showDirtyWarning && (
        <DirtyWarningOverlay
          zIndex={dirtyWarningZIndex}
          onDiscard={handleDirtyDiscard}
          onCancel={handleDirtyCancel}
        />
      )}
    </>
  );
};

export const ModalStackRenderer: React.FC = () => {
  const { modals } = usePanelState();

  if (modals.length === 0) return null;

  return (
    <>
      {modals.map((modal, index) => (
        <ModalRenderer
          key={modal.id}
          modal={modal}
          index={index}
          isTopmost={index === modals.length - 1}
        />
      ))}
    </>
  );
};

export default ModalStackRenderer;
