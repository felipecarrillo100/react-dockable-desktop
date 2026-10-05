import React, { useEffect, useRef } from 'react';
import { useFormContainer } from '../components/FormContainerContext';
import { useFormatMessage, usePredefinedMessages } from '../components/WindowManagerContext';
import { DialogIcon } from './dialogIcons';

/**
 * Props for the {@link RddConfirm} component.
 */
export interface RddConfirmProps {
  /** Optional custom title text or localizable descriptor for the dialog container. */
  title?: string | { id: string; defaultMessage?: string; values?: any } | (() => string);
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
  /**
   * Fired exactly once, however the dialog ends: `true` for the confirm button (or Enter),
   * `false` for the cancel button, Escape, the backdrop, the × or the modal being closed by code.
   */
  onSettled?: (ok: boolean) => void;
  /**
   * The icon left of the message. Omit it for the built-in question icon, pass `null` for none,
   * or pass your own node. It is coloured by `alertType`.
   */
  icon?: React.ReactNode | null;
}

/**
 * RddConfirm component renders a standard dialog content layout,
 * allowing users to confirm actions or abort them. Exposes action callbacks.
 */
export const ConfirmationForm: React.FC<RddConfirmProps> = ({
  title,
  message,
  alert,
  alertType = 'info',
  useYesNoTitles = false,
  onOK,
  onCancel,
  onSettled,
  icon,
}) => {
  const { requestClose, setTitle, onClose } = useFormContainer();
  const formatMessage = useFormatMessage();
  const predefinedMessages = usePredefinedMessages();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Settle once. The container reports every close, so Escape, the backdrop, the × and a close by
  // code settle as "not confirmed"; after a button the guard swallows that report.
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const settle = (ok: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettledRef.current?.(ok);
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  useEffect(() => onClose?.(() => settleRef.current(false)), [onClose]);

  useEffect(() => {
    if (title) {
      const resolvedTitle = typeof title === 'string' ? title : typeof title === 'function' ? title() : formatMessage(title);
      setTitle(resolvedTitle);
    }
  }, [title, setTitle, formatMessage]);

  useEffect(() => {
    confirmButtonRef.current?.focus({ preventScroll: true });
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
    settle(true);
    onOK?.();
    requestClose();
  };

  const handleCancel = () => {
    settle(false);
    onCancel?.();
    requestClose();
  };

  return (
    <form onSubmit={handleSubmit} className="rdd-confirmation-form-body">
      {alert && (
        <div className={`rdd-confirmation-alert rdd-confirmation-alert-${alertType}`}>
          <span>ℹ️</span>
          <span>{alert}</span>
        </div>
      )}

      <div className="rdd-dialog-content">
        <DialogIcon icon={icon} type={alertType} question />
        <div className="rdd-confirmation-message">
          {resolvedMessage}
        </div>
      </div>

      <hr className="rdd-confirmation-divider" />

      <div className="rdd-confirmation-actions">
        <button
          type="button"
          className="rdd-btn rdd-btn-sm rdd-btn-outline"
          onClick={handleCancel}
          data-rdd-confirm-cancel
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="rdd-btn rdd-btn-sm rdd-btn-primary"
          ref={confirmButtonRef}
          data-rdd-confirm-ok
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
};

export default ConfirmationForm;
