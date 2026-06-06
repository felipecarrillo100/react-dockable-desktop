import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { ComponentType, ReactNode } from 'react';

export type PanelInstanceId = string;

export interface PanelTitleDescriptor {
  id: string;
  defaultMessage?: string;
  values?: Record<string, string | number>;
}

export type PanelTitle = string | PanelTitleDescriptor;

export interface SidePanelOptions {
  title?: PanelTitle;
  icon?: React.ReactNode;
  width?: number | string;
}

export interface ModalOptions {
  title?: PanelTitle;
  icon?: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen' | 'auto';
  closable?: boolean;
}

export interface PanelInstance {
  id: PanelInstanceId;
  Component: ComponentType<any>;
  props: Record<string, any>;
  containerType: 'left-panel' | 'right-panel' | 'modal';
  options: SidePanelOptions | ModalOptions;
  dirty?: boolean;
}

export interface PanelState {
  leftPanel: PanelInstance | null;
  rightPanel: PanelInstance | null;
  modals: PanelInstance[];
}

export interface PanelActions {
  openLeftPanel: <P extends object>(Component: ComponentType<P>, props: P, options?: SidePanelOptions) => Promise<PanelInstanceId | null>;
  openRightPanel: <P extends object>(Component: ComponentType<P>, props: P, options?: SidePanelOptions) => Promise<PanelInstanceId | null>;
  openModal: <P extends object>(Component: ComponentType<P>, props: P, options?: ModalOptions) => PanelInstanceId;
  close: (id: PanelInstanceId) => void;
  closeAll: () => void;
  closeAllModals: () => void;
  getInstance: (id: PanelInstanceId) => PanelInstance | undefined;
  updateInstance: (id: PanelInstanceId, updates: Partial<Pick<PanelInstance, 'props' | 'options' | 'dirty'>>) => void;
  setDirty: (id: PanelInstanceId, dirty: boolean) => void;
  registerCloseHandler: (id: PanelInstanceId, handler: () => Promise<boolean>) => void;
  unregisterCloseHandler: (id: PanelInstanceId) => void;
}

let idCounter = 0;
const generateId = (): PanelInstanceId => `panel-${++idCounter}-${Date.now()}`;

const closeHandlers = new Map<PanelInstanceId, () => Promise<boolean>>();

const initialState: PanelState = {
  leftPanel: null,
  rightPanel: null,
  modals: [],
};

const PanelStateContext = createContext<PanelState | null>(null);
const PanelActionsContext = createContext<PanelActions | null>(null);

export const PanelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PanelState>(initialState);

  const stateRef = useRef(state);
  stateRef.current = state;

  const registerCloseHandler = useCallback((id: PanelInstanceId, handler: () => Promise<boolean>) => {
    closeHandlers.set(id, handler);
  }, []);

  const unregisterCloseHandler = useCallback((id: PanelInstanceId) => {
    closeHandlers.delete(id);
  }, []);

  const openLeftPanel = useCallback(
    async <P extends object>(
      Component: ComponentType<P>,
      props: P,
      options: SidePanelOptions = {}
    ): Promise<PanelInstanceId | null> => {
      const currentPanel = stateRef.current.leftPanel;
      if (currentPanel) {
        const handler = closeHandlers.get(currentPanel.id);
        if (handler) {
          const canClose = await handler();
          if (!canClose) return null;
        }
      }

      const id = generateId();
      const instance: PanelInstance = {
        id,
        Component: Component as ComponentType<any>,
        props: props as Record<string, any>,
        containerType: 'left-panel',
        options,
      };
      setState(s => ({ ...s, leftPanel: instance }));
      return id;
    },
    []
  );

  const openRightPanel = useCallback(
    async <P extends object>(
      Component: ComponentType<P>,
      props: P,
      options: SidePanelOptions = {}
    ): Promise<PanelInstanceId | null> => {
      const currentPanel = stateRef.current.rightPanel;
      if (currentPanel) {
        const handler = closeHandlers.get(currentPanel.id);
        if (handler) {
          const canClose = await handler();
          if (!canClose) return null;
        }
      }

      const id = generateId();
      const instance: PanelInstance = {
        id,
        Component: Component as ComponentType<any>,
        props: props as Record<string, any>,
        containerType: 'right-panel',
        options,
      };
      setState(s => ({ ...s, rightPanel: instance }));
      return id;
    },
    []
  );

  const openModal = useCallback(
    <P extends object>(
      Component: ComponentType<P>,
      props: P,
      options: ModalOptions = {}
    ): PanelInstanceId => {
      const id = generateId();
      const formTitle = (props as any).title;
      
      const modalOptions: ModalOptions = {
        ...options,
        title: options.title || formTitle || 'Confirmation',
      };

      const instance: PanelInstance = {
        id,
        Component: Component as ComponentType<any>,
        props: props as Record<string, any>,
        containerType: 'modal',
        options: modalOptions,
      };
      setState(s => ({ ...s, modals: [...s.modals, instance] }));
      return id;
    },
    []
  );

  const close = useCallback((id: PanelInstanceId) => {
    setState(s => ({
      leftPanel: s.leftPanel?.id === id ? null : s.leftPanel,
      rightPanel: s.rightPanel?.id === id ? null : s.rightPanel,
      modals: s.modals.filter(m => m.id !== id),
    }));
  }, []);

  const closeAll = useCallback(() => {
    setState(initialState);
  }, []);

  const closeAllModals = useCallback(() => {
    setState(s => ({ ...s, modals: [] }));
  }, []);

  const getInstance = useCallback(
    (id: PanelInstanceId): PanelInstance | undefined => {
      if (state.leftPanel?.id === id) return state.leftPanel;
      if (state.rightPanel?.id === id) return state.rightPanel;
      return state.modals.find(m => m.id === id);
    },
    [state]
  );

  const updateInstance = useCallback(
    (
      id: PanelInstanceId,
      updates: Partial<Pick<PanelInstance, 'props' | 'options' | 'dirty'>>
    ) => {
      setState(s => ({
        leftPanel: s.leftPanel?.id === id ? { ...s.leftPanel, ...updates } : s.leftPanel,
        rightPanel: s.rightPanel?.id === id ? { ...s.rightPanel, ...updates } : s.rightPanel,
        modals: s.modals.map(m => m.id === id ? { ...m, ...updates } : m),
      }));
    },
    []
  );

  const setDirty = useCallback((id: PanelInstanceId, dirty: boolean) => {
    updateInstance(id, { dirty });
  }, [updateInstance]);

  const actions = useMemo<PanelActions>(
    () => ({
      openLeftPanel,
      openRightPanel,
      openModal,
      close,
      closeAll,
      closeAllModals,
      getInstance,
      updateInstance,
      setDirty,
      registerCloseHandler,
      unregisterCloseHandler,
    }),
    [
      openLeftPanel,
      openRightPanel,
      openModal,
      close,
      closeAll,
      closeAllModals,
      getInstance,
      updateInstance,
      setDirty,
      registerCloseHandler,
      unregisterCloseHandler,
    ]
  );

  return (
    <PanelStateContext.Provider value={state}>
      <PanelActionsContext.Provider value={actions}>
        {children}
      </PanelActionsContext.Provider>
    </PanelStateContext.Provider>
  );
};

export const usePanelState = (): PanelState => {
  const ctx = useContext(PanelStateContext);
  if (!ctx) throw new Error('usePanelState must be used within PanelProvider');
  return ctx;
};

export const usePanelActions = (): PanelActions => {
  const ctx = useContext(PanelActionsContext);
  if (!ctx) throw new Error('usePanelActions must be used within PanelProvider');
  return ctx;
};
