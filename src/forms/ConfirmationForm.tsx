import React, { useEffect, useRef } from 'react';
import { useFormContainer } from '../components/FormContainerContext';
import { useFormatMessage, usePredefinedMessages } from '../components/WindowManagerContext';

/**
 * Props for the {@link ConfirmationForm} component.
 */
export interface ConfirmationFormProps {
  /** Optional custom title text or localizable descriptor for the dialog container. */
  title?: string | { id: string; defaultMessage?: string; values?: any };
  /** Main message text or localizable descriptor to display. */
  message: string | { id: string; defaultMessage?: string; values?: any };
  /** Optional auxiliary top alert notification text. */
  alert?: string;
  /** Type style classification for the alert notice banner. */
  alertType?: 'info' | 'warning' | 'success' | 'danger';
  /** If true, changes action button labels to 'Yes' and 'No' instead of 'OK' and 'Cancel'. */
  useYesNoTitles?: boolean;
  /** Callback fired when the user selects the confirm button. */
  onOK?: () => void;
  /** Callback fired when the user selects the cancel button. */
  onCancel?: () => void;
}

/**
 * ConfirmationForm component renders a standard dialog content layout,
 * allowing users to confirm actions or abort them. Exposes action callbacks.
 */
export const ConfirmationForm: React.FC<ConfirmationFormProps> = ({
  title,
  message,
  alert,
  alertType = 'info',
  useYesNoTitles = false,
  onOK,
  onCancel,
}) => {
  const { requestClose, setIcon, setTitle } = useFormContainer();
  const formatMessage = useFormatMessage();
  const predefinedMessages = usePredefinedMessages();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (title) {
      const resolvedTitle = typeof title === 'string' ? title : formatMessage(title);
      setTitle(resolvedTitle);
    }
    
    if (setIcon) {
      setIcon(<span>❓</span>);
    }
  }, [title, setTitle, setIcon, formatMessage]);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  const resolvedMessage = typeof message === 'string' ? message : formatMessage(message);

  const cancelLabel = useYesNoTitles
    ? formatMessage(predefinedMessages.no)
    : formatMessage(predefinedMessages.cancel);

  const confirmLabel = useYesNoTitles
    ? formatMessage(predefinedMessages.yes)
    : formatMessage(predefinedMessages.ok);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onOK?.();
    requestClose();
  };

  const handleCancel = () => {
    onCancel?.();
    requestClose();
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 d-flex flex-column gap-3">
      {alert && (
        <div className={`alert alert-${alertType === 'danger' ? 'danger' : alertType} d-flex align-items-center gap-2 m-0 p-2.5 small`}>
          <span>ℹ️</span>
          <span>{alert}</span>
        </div>
      )}

      <div style={{ fontSize: '0.9rem', color: 'inherit', lineHeight: 1.5 }}>
        {resolvedMessage}
      </div>

      <hr className="my-2 opacity-10" />

      <div className="d-flex justify-content-end gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary font-monospace"
          onClick={handleCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="btn btn-sm btn-primary font-monospace"
          ref={confirmButtonRef}
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
};

export default ConfirmationForm;
