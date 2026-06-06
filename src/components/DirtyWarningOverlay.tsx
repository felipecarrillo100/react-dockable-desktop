import React, { useEffect, useRef } from 'react';
import { useFormatMessage } from './WindowManagerContext';

export interface DirtyWarningOverlayProps {
  zIndex: number;
  onDiscard: () => void;
  onCancel: () => void;
  message?: string;
  title?: string;
}

export const DirtyWarningOverlay: React.FC<DirtyWarningOverlayProps> = ({
  zIndex,
  onDiscard,
  onCancel,
  message,
  title,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const resolvedTitle = title || 'Unsaved Changes';
  const resolvedMessage = message || 'You have unsaved changes that will be lost.';
  const question = 'Do you want to discard your changes and close?';

  return (
    <div className="close-warning-overlay" style={{ zIndex }}>
      <div className="close-warning-modal">
        <div className="close-warning-header">
          <div className="close-warning-icon">⚠️</div>
          <h5 className="close-warning-title">{resolvedTitle}</h5>
        </div>
        <p className="close-warning-message">{resolvedMessage}</p>
        <p className="close-warning-message" style={{ fontWeight: 500, margin: 0 }}>{question}</p>
        <div className="close-warning-footer">
          <button
            type="button"
            className="btn-warning-action btn-warning-cancel"
            onClick={onCancel}
            ref={cancelButtonRef}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-warning-action btn-warning-discard"
            onClick={onDiscard}
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default DirtyWarningOverlay;
