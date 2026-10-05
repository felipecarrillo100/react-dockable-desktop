import React from 'react';

/** The four alert types the confirmation and alert dialogs take. */
export type DialogAlertType = 'info' | 'warning' | 'success' | 'danger';

// Built-in dialog icons, drawn in currentColor so the `rdd-dialog-icon-{type}` class colours them.
// Same 16-unit grid and stroke as the toast icons.

const QuestionIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6.25 6.25a1.75 1.75 0 1 1 2.6 1.53c-.5.28-.85.7-.85 1.27v.2M8 11.25v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 5v.01M8 7.5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const SuccessIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const WarningIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2.5L14 13.5H2L8 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M8 7v2.5M8 11.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const DangerIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const TYPE_ICONS: Record<DialogAlertType, React.FC> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  danger: DangerIcon,
};

/**
 * The icon slot left of a dialog's message. `icon` undefined draws the built-in icon (`question`
 * for a confirmation, the type's icon for an alert), `null` draws nothing, anything else is drawn
 * in its place.
 */
export const DialogIcon: React.FC<{ icon: React.ReactNode | undefined; type: DialogAlertType; question?: boolean }> = ({ icon, type, question }) => {
  if (icon === null) return null;
  const Builtin = question ? QuestionIcon : TYPE_ICONS[type];
  return (
    <div className={`rdd-dialog-icon rdd-dialog-icon-${type}`} data-rdd-dialog-icon={icon === undefined ? 'default' : 'custom'}>
      {icon === undefined ? <Builtin /> : icon}
    </div>
  );
};
