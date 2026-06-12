import { createContext, useContext, type Context, type Provider } from 'react';
import type { DirtyStateOptions } from './dirtyOptions';

/**
 * Options used when requesting to close a container.
 */
export interface CloseOptions {
  /** If true, bypasses any dirty state warnings or custom close guards. */
  force?: boolean;
}

/** Represents the type of container context a panel/form is currently rendered inside. */
export type ContainerType = 'left-panel' | 'right-panel' | 'modal' | 'dockable-panel' | 'standalone';

/**
 * Contract interface exposed by a container (like a tab, window, modal, or side-panel)
 * to its children forms, enabling them to control or listen to container events.
 */
export interface FormContainerContract {
  /** Request the container to close itself. Bypassed by default unless options.force is true. */
  requestClose: (options?: CloseOptions) => void;
  /** Mark the form's content as dirty (having unsaved changes), triggering alert dialogs on close. */
  setDirty: (dirty: boolean, options?: DirtyStateOptions) => void;
  /** Register a custom close guard handler. Returning false or a promise resolving to false blocks closing. */
  onCloseRequested: (handler: () => boolean | Promise<boolean>) => (() => void);
  /** Change the display title of the containing tab or window dynamically. */
  setTitle: (title: string | { id: string; defaultMessage: string; values?: Record<string, any> }) => void;
  /** Change the tab or window icon dynamically. */
  setIcon?: (icon: React.ReactNode) => void;
  /** The type of container the panel is mounted in. */
  containerType?: ContainerType;
  /** Unique identifier of the panel or window instance. */
  instanceId: string;
  /** Subscribe to the container's close event. Returns an unsubscribe function. */
  onClose?: (handler: () => void) => () => void;
  /** Subscribe to the container's minimize event. Returns an unsubscribe function. */
  onMinimize?: (handler: () => void) => () => void;
  /** Subscribe to the container's restore event. Returns an unsubscribe function. */
  onRestore?: (handler: () => void) => () => void;
  /** Subscribe to the container's window resize event, returning width and height. */
  onResize?: (handler: (width: number, height: number) => void) => () => void;
}

const defaultContract: FormContainerContract = {
  requestClose: () => {
    console.warn('FormContainerContract: requestClose called but no container is present');
  },
  setDirty: () => {},
  onCloseRequested: () => () => {},
  setTitle: () => {},
  setIcon: () => {},
  containerType: 'standalone',
  instanceId: 'standalone',
  onClose: () => () => {},
  onMinimize: () => () => {},
  onRestore: () => () => {},
  onResize: () => () => {},
};

/**
 * Context that supplies the {@link FormContainerContract} to panels inside the Window Manager.
 */
export const FormContainerContext: Context<FormContainerContract> = createContext<FormContainerContract>(defaultContract);
export const FormContainerProvider: Provider<FormContainerContract> = FormContainerContext.Provider;

/**
 * React hook to retrieve the current {@link FormContainerContract} from context.
 * Enables sub-forms to trigger close requests, mark themselves dirty, rename their tabs, or listen to resize events.
 */
export const useFormContainer = (): FormContainerContract => {
  return useContext(FormContainerContext);
};

