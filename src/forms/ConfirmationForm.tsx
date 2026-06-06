import React, { useEffect, useRef } from 'react';
import { useFormContainer } from '../components/FormContainerContext';

export interface ConfirmationFormProps {
  title?: string | { id: string; defaultMessage?: string; values?: any };
  message: string | { id: string; defaultMessage?: string; values?: any };
  alert?: string;
  alertType?: 'info' | 'warning' | 'success' | 'danger';
  useYesNoTitles?: boolean;
  onOK?: () => void;
  onCancel?: () => void;
}

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
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (title) {
      const resolvedTitle = typeof title === 'string' ? title : title.defaultMessage || title.id;
      setTitle(resolvedTitle);
    }
    
    if (setIcon) {
      setIcon(<span>❓</span>);
    }
  }, [title, setTitle, setIcon]);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  const resolvedMessage = typeof message === 'string' ? message : message.defaultMessage || message.id;

  const cancelLabel = useYesNoTitles ? 'No' : 'Cancel';
  const confirmLabel = useYesNoTitles ? 'Yes' : 'OK';

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
