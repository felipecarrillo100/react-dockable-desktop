/**
 * @file dirtyOptions.ts
 * @description Type definitions for customizing automatic close warning overlays.
 */

import type { MessageDescriptor } from './WindowManagerContext';

/**
 * Represents custom configuration options applied to the automatic unsaved changes modal.
 */
export interface DirtyStateOptions {
  /**
   * Custom header title text or localizable message descriptor.
   * Replaces the default "Unsaved Changes" title.
   */
  title?: string | MessageDescriptor;

  /**
   * Custom warning explanation text or localizable message descriptor.
   * Replaces the standard default message body templates.
   */
  message?: string | MessageDescriptor;

  /**
   * Optional custom alert notification banner text.
   * Typically lists missing validation field requirements or backup statuses.
   */
  alert?: string;

  /**
   * Color scheme severity level of the validation banner.
   * Maps to theme highlight alerts. Default: 'info'
   */
  alertType?: 'info' | 'warning' | 'success' | 'danger';
}
