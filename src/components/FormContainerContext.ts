import { createContext, useContext } from 'react';

export interface CloseOptions {
  force?: boolean;
}

export type ContainerType = 'left-panel' | 'right-panel' | 'modal' | 'dockable-panel' | 'standalone';

export interface FormContainerContract {
  requestClose: (options?: CloseOptions) => void;
  setDirty: (dirty: boolean) => void;
  onCloseRequested: (handler: () => boolean | Promise<boolean>) => (() => void);
  setTitle: (title: string | { id: string; defaultMessage: string; values?: Record<string, any> }) => void;
  setIcon?: (icon: React.ReactNode) => void;
  containerType?: ContainerType;
  instanceId: string;
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
};

export const FormContainerContext = createContext<FormContainerContract>(defaultContract);
export const FormContainerProvider = FormContainerContext.Provider;

export const useFormContainer = (): FormContainerContract => {
  return useContext(FormContainerContext);
};

