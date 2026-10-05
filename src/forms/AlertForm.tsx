import React, { useEffect, useRef } from 'react';
import { useFormContainer } from '../components/FormContainerContext';
import { useFormatMessage, usePredefinedMessages } from '../components/WindowManagerContext';
import { DialogIcon } from './dialogIcons';

/**
 * Props for the {@link RddAlert} component.
 */
export interface RddAlertProps {
  /** Optional custom title text or localizable descriptor for the dialog container. */
  title?: string | { id: string; defaultMessage?: string; values?: any } | (() => string);
  /** Main message text or localizable descriptor to display. */
  message: string | { id: string; defaultMessage?: string; values?: any };
  /** Picks the built-in icon and its colour. Defaults to `'info'`. */
  alertType?: 'info' | 'warning' | 'success' | 'danger';
  /**
   * The icon left of the message. Omit it for the built-in icon of `alertType`, pass `null` for
   * none, or pass your own node. It is coloured by `alertType`.
   */
  icon?: React.ReactNode | null;
  /** Label of the button. Defaults to the `ok` predefined message. */
  okLabel?: string | { id: string; defaultMessage?: string; values?: any };
  /**
   * Fired exactly once, however the dialog ends: the OK button, Enter, Escape, the backdrop, the ×
   * or the modal being closed by code.
   */
  onSettled?: () => void;
}

/**
 * RddAlert shows a message with a single OK button. Open it with `useModals().open` or
 * `useModals().alert()`.
 */
export const AlertForm: React.FC<RddAlertProps> = ({
  title,
  message,
  alertType = 'info',
  icon,
  okLabel,
  onSettled,
}) => {
  const { requestClose, setTitle, onClose } = useFormContainer();
  const formatMessage = useFormatMessage();
  const predefinedMessages = usePredefinedMessages();
  const okButtonRef = useRef<HTMLButtonElement>(null);

  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const settle = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettledRef.current?.();
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  useEffect(() => onClose?.(() => settleRef.current()), [onClose]);

  useEffect(() => {
    if (title) {
      const resolvedTitle = typeof title === 'string' ? title : typeof title === 'function' ? title() : formatMessage(title);
      setTitle(resolvedTitle);
    }
  }, [title, setTitle, formatMessage]);

  useEffect(() => {
    okButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const resolvedMessage = typeof message === 'string' ? message : formatMessage(message);
  const resolvedOk = okLabel === undefined
    ? formatMessage(predefinedMessages.ok)
    : typeof okLabel === 'string' ? okLabel : formatMessage(okLabel);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    settle();
    requestClose({ force: true });
  };

  return (
    <form onSubmit={handleSubmit} className="rdd-confirmation-form-body">
      <div className="rdd-dialog-content">
        <DialogIcon icon={icon} type={alertType} />
        <div className="rdd-confirmation-message">
          {resolvedMessage}
        </div>
      </div>

      <hr className="rdd-confirmation-divider" />

      <div className="rdd-confirmation-actions">
        <button
          type="submit"
          className="rdd-btn rdd-btn-sm rdd-btn-primary"
          ref={okButtonRef}
          data-rdd-alert-ok
        >
          {resolvedOk}
        </button>
      </div>
    </form>
  );
};

export default AlertForm;
