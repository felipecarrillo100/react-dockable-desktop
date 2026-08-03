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
    <form onSubmit={handleSubmit} className="rdd-confirmation-form-body">
      {alert && (
        <div className={`rdd-confirmation-alert confirmation-alert-${alertType}`}>
          <span>ℹ️</span>
          <span>{alert}</span>
        </div>
      )}

      <div style={{ fontSize: '0.9rem', color: 'inherit', lineHeight: 1.5 }}>
        {resolvedMessage}
      </div>

      <hr style={{ marginTop: '0.5rem', marginBottom: '0.5rem', opacity: 0.1 }} />

      <div className="rdd-confirmation-actions">
        <button
          type="button"
          className="rdd-btn rdd-btn-sm rdd-btn-outline"
          onClick={handleCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="rdd-btn rdd-btn-sm rdd-btn-primary"
          ref={confirmButtonRef}
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
};

export default ConfirmationForm;
