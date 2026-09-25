import React, { useCallback, useRef, useState, useMemo } from 'react';
import { usePanelState, usePanelActions } from './PanelProviderContext';
import { FormContainerProvider, type FormContainerContract, type CloseOptions } from './FormContainerContext';
import type { OverlayInstance, ModalOptions, PanelTitle } from './PanelProviderContext';
import type { DirtyStateOptions } from './dirtyOptions';
import { useFormatMessage, formatLabel, useStyleClasses, usePredefinedMessages, useWindowManagerState } from './WindowManagerContext';
import ConfirmationForm from '../forms/ConfirmationForm';
import { useEscapeLayer } from '../utils/escapeStack';

/**
 * Interface representing props for the internal {@link ModalRenderer} component.
 */
interface ModalRendererProps {
  /** The panel instance containing component structure, state, and option flags. */
  modal: OverlayInstance;
  /** The 0-based depth index of the modal within the active stack. */
  index: number;
  /** True if this modal is currently at the top of the stack. */
}

/**
 * ModalRenderer component renders a single modal window wrapped inside
 * the FormContainerProvider context, enabling subcomponents to request closes and set dirty states.
 */
const ModalRenderer: React.FC<ModalRendererProps> = ({ modal, index }) => {
  const { close, openModal, updateInstance, setDirty } = usePanelActions();
  const formatMessage = useFormatMessage();
  const predefinedMessages = usePredefinedMessages();
  const { dir } = useWindowManagerState();
  const { modalClass, modalBodyClass } = useStyleClasses();
  const closeHandlerRef = useRef<(() => boolean | Promise<boolean>) | null>(null);

  const { id, Component, props, options, dirty, dirtyOptions } = modal;
  const modalOptions = options as ModalOptions;

  const [icon, setIconState] = useState<React.ReactNode>(modalOptions.icon || null);

  const optionsRef = useRef(modalOptions);
  optionsRef.current = modalOptions;

  const baseTitle = formatLabel(modalOptions.title, formatMessage);

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

  const handleSetDirty = useCallback((dirty: boolean, options?: DirtyStateOptions) => setDirty(id, dirty, options), [setDirty, id]);
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

  const displayTitle = dirty ? `${baseTitle} *` : baseTitle;

  const sizeClass = modalOptions.size ? `rdd-modal-size-${modalOptions.size}` : 'rdd-modal-size-auto';
  const showCloseButton = modalOptions.closable !== false;

  const bodyPadding = modalOptions.bodyPadding;
  const bodyPaddingStyle = bodyPadding != null
    ? (typeof bodyPadding === 'number' ? `${bodyPadding}px` : bodyPadding)
    : undefined;

  // Every mounted modal takes its place on the shared Escape stack, where the most recently
  // opened one is on top. One that can't be closed still consumes the key, so Escape never
  // reaches a drawer behind it.
  useEscapeLayer(true, 'modal', () => {
    if (showCloseButton) handleClose();
  });

  // Reads the same --rdd-z-base a WindowManagerProvider's zIndexBase config mirrors
  // onto documentElement (falls back to 1000 so this also works standalone, with
  // no WindowManager mounted, matching the :root default in index.css).
  const modalZIndex = `calc(var(--rdd-z-base, 1000) + 9000 + ${index * 10})`;

  return (
    <div className="rdd-modal-overlay" style={{ zIndex: modalZIndex }} dir={dir}>
      <div className="rdd-modal-curtain" onClick={showCloseButton ? () => handleClose() : undefined} />
      <div className={`rdd-modal-window ${sizeClass} ${modalClass ?? ''}`}>
        <div className="rdd-modal-header">
          {icon && <div className="rdd-modal-icon">{icon}</div>}
          <h4 className="rdd-modal-title">{displayTitle}</h4>
          {showCloseButton && (
            <button
              className="rdd-modal-close-button"
              onClick={() => handleClose()}
              title={formatMessage(predefinedMessages.closeTooltip)}
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div
          className={`rdd-modal-body ${modalBodyClass ?? ''}`}
          style={bodyPaddingStyle != null ? { padding: bodyPaddingStyle } : undefined}
        >
          <FormContainerProvider value={contract}>
            <Component {...props} panelId={id} />
          </FormContainerProvider>
        </div>
      </div>
    </div>
  );
};

/**
 * Renders the modals opened through `useModals()`, stacked, topmost last. Mount one, inside
 * `<DockableDesktopProvider>`.
 */
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
        />
      ))}
    </>
  );
};

export default ModalStackRenderer;
