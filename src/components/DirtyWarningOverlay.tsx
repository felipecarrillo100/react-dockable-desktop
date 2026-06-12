import React, { useEffect, useRef } from 'react';
import { useFormatMessage } from './WindowManagerContext';

/**
 * Props for the {@link DirtyWarningOverlay} component.
 */
export interface DirtyWarningOverlayProps {
  /** The z-index applied to the modal overlay container to ensure it renders on top. */
  zIndex: number;
  /** Callback fired when the user decides to discard unsaved changes and close the panel. */
  onDiscard: () => void;
  /** Callback fired when the user cancels the close request, keeping the panel open. */
  onCancel: () => void;
  /** Optional custom warning description message. */
  message?: string;
  /** Optional custom title for the warning modal dialog. */
  title?: string;
}

/**
 * DirtyWarningOverlay component renders a confirmation dialog to intercept
 * closing panels that have unsaved changes (dirty state).
 * Binds the 'Escape' key to cancel the close action and focuses the cancel button on mount.
 */
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
