import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { DirtyStateOptions } from './dirtyOptions';
import { usePredefinedMessages } from './WindowManagerContext';
import { sameTitle, sameDirtyOptions } from './sameUpdate';
export type { DirtyStateOptions };

/** Unique string identifier for panel/modal instances. */
export type OverlayId = string;

/**
 * Descriptor object for localizable panel titles, supporting context translation systems.
 */
export interface PanelTitleDescriptor {
  /** The translation dictionary key. */
  id: string;
  /** Fallback string if translation key is missing. */
  defaultMessage?: string;
  /** Parameters to inject into the translated text string. */
  values?: Record<string, string | number>;
}

/** Union type representing either a plain string or a localizable title descriptor. */
export type PanelTitle = string | PanelTitleDescriptor;

/** Configuration options applied when opening a SidePanel. */
export interface SidePanelOptions {
  /** Display title for the side-panel header. */
  title?: PanelTitle;
  /** Icon displayed next to the panel title. */
  icon?: React.ReactNode;
  /** Specific CSS width (e.g. 300, '40%') for the panel container. */
  width?: number | string;
  /**
   * CSS padding for the panel body content — a number (px) or any CSS value/shorthand
   * (e.g. `'10px 16px'`). Default: `0` (edge-to-edge) — pass `10` to restore the pre-v6.0.0
   * default, or any value your content needs.
   */
  bodyPadding?: number | string;
}

/** Configuration options applied when opening a Modal. */
export interface ModalOptions {
  /** Display title for the modal header. */
  title?: PanelTitle;
  /** Icon displayed in the modal title bar. */
  icon?: React.ReactNode;
  /** Size modifier affecting CSS max-width rules. */
  size?: 'small' | 'medium' | 'large' | 'fullscreen' | 'auto';
  /** If false, hides the modal backdrop exit click and header close button. */
  closable?: boolean;
  /**
   * CSS padding for the modal body content — a number (px) or any CSS value/shorthand
   * (e.g. `'10px 16px'`). Default: `0` (edge-to-edge) — pass `10` to restore the pre-v6.0.0
   * default, or any value your content needs.
   */
  bodyPadding?: number | string;
}

/**
 * Represents a rendered instance of a panel or modal in the layout.
 */
export interface OverlayInstance {
  /** Unique ID generated for this instance. */
  id: OverlayId;
  /** React Component to mount inside the panel. */
  Component: ComponentType<any>;
  /** Property props passed to the Component. */
  props: Record<string, any>;
  /** The target rendering layout zone. */
  containerType: 'left-panel' | 'right-panel' | 'modal';
  /** Configuration metadata settings. */
  options: SidePanelOptions | ModalOptions;
  /** True if the form container has unsaved user edits. */
  dirty?: boolean;
  /** Custom warning options applied to the automatic unsaved changes modal. */
  dirtyOptions?: DirtyStateOptions;
}

/** Stores the active layout structures for floating overlays. */
export interface OverlayState {
  /** The currently open left drawer panel instance, or null. */
  leftPanel: OverlayInstance | null;
  /** The currently open right drawer panel instance, or null. */
  rightPanel: OverlayInstance | null;
  /** Stack containing all active floating modal instances. */
  modals: OverlayInstance[];
}

/** Exposes methods to trigger state actions on drawers and modals. */
export interface PanelActions {
  /** Mounts a panel in the left-side container drawer. */
  openLeftPanel: <P extends object>(Component: ComponentType<P>, props: P, options?: SidePanelOptions) => Promise<OverlayId | null>;
  /** Mounts a panel in the right-side container drawer. */
  openRightPanel: <P extends object>(Component: ComponentType<P>, props: P, options?: SidePanelOptions) => Promise<OverlayId | null>;
  /** Pushes a new modal component instance to the top of the stack. */
  openModal: <P extends object>(Component: ComponentType<P>, props: P, options?: ModalOptions) => OverlayId;
  /** Closes an instance by ID. */
  close: (id: OverlayId) => void;
  /** Closes all drawers and modals in a single action. */
  closeAll: () => void;
  /** Closes all open modals. */
  closeAllModals: () => void;
  /** Retrieves metadata for an active instance by ID. */
  getInstance: (id: OverlayId) => OverlayInstance | undefined;
  /** Updates the props, configuration options, or dirty flag of an active panel. */
  updateInstance: (id: OverlayId, updates: Partial<Pick<OverlayInstance, 'props' | 'options' | 'dirty' | 'dirtyOptions'>>) => void;
  /** Flags an instance as dirty (contains unsaved changes). */
  setDirty: (id: OverlayId, dirty: boolean, options?: DirtyStateOptions) => void;
  /** Subscribes a custom close confirmation intercept handler. */
  registerCloseHandler: (id: OverlayId, handler: () => Promise<boolean>) => void;
  /** Unsubscribes close confirmation handler. */
  unregisterCloseHandler: (id: OverlayId) => void;
}

let idCounter = 0;
const generateId = (): OverlayId => `panel-${++idCounter}-${Date.now()}`;

const closeHandlers = new Map<OverlayId, () => Promise<boolean>>();

/** True when applying `updates` to `current` would leave every field as it is. */
function changesNothing(current: OverlayInstance, updates: Partial<Pick<OverlayInstance, 'props' | 'options' | 'dirty' | 'dirtyOptions'>>): boolean {
  if ('props' in updates && updates.props !== current.props) return false;
  if ('dirty' in updates && !!updates.dirty !== !!current.dirty) return false;
  if ('dirtyOptions' in updates && !sameDirtyOptions(updates.dirtyOptions, current.dirtyOptions)) return false;
  if ('options' in updates && updates.options !== current.options) {
    const next = updates.options as Record<string, unknown>, prev = current.options as Record<string, unknown>;
    const keys = new Set([...Object.keys(next), ...Object.keys(prev)]);
    for (const k of keys) {
      if (k === 'title' ? !sameTitle(next[k] as never, prev[k] as never) : next[k] !== prev[k]) return false;
    }
  }
  return true;
}

const initialState: OverlayState = {
  leftPanel: null,
  rightPanel: null,
  modals: [],
};

const PanelStateContext = createContext<OverlayState | null>(null);
const PanelActionsContext = createContext<PanelActions | null>(null);

/**
 * PanelProvider component manages the state and action handlers
 * for drawers (left/right) and active stacked modal overlays.
 */
export const PanelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<OverlayState>(initialState);
  // A message descriptor, not a string: titles are formatted when rendered, so the default title
  // follows the app's formatter and `predefinedMessages` like every other label.
  const defaultModalTitle = usePredefinedMessages().modalTitle;

  const stateRef = useRef(state);
  stateRef.current = state;

  const registerCloseHandler = useCallback((id: OverlayId, handler: () => Promise<boolean>) => {
    closeHandlers.set(id, handler);
  }, []);

  const unregisterCloseHandler = useCallback((id: OverlayId) => {
    closeHandlers.delete(id);
  }, []);

  const openLeftPanel = useCallback(
    async <P extends object>(
      Component: ComponentType<P>,
      props: P,
      options: SidePanelOptions = {}
    ): Promise<OverlayId | null> => {
      const currentPanel = stateRef.current.leftPanel;
      if (currentPanel) {
        const handler = closeHandlers.get(currentPanel.id);
        if (handler) {
          const canClose = await handler();
          if (!canClose) return null;
        }
      }

      const id = generateId();
      const instance: OverlayInstance = {
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
    ): Promise<OverlayId | null> => {
      const currentPanel = stateRef.current.rightPanel;
      if (currentPanel) {
        const handler = closeHandlers.get(currentPanel.id);
        if (handler) {
          const canClose = await handler();
          if (!canClose) return null;
        }
      }

      const id = generateId();
      const instance: OverlayInstance = {
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
    ): OverlayId => {
      const id = generateId();
      const formTitle = (props as any).title;
      
      const modalOptions: ModalOptions = {
        ...options,
        title: options.title || formTitle || defaultModalTitle,
      };

      const instance: OverlayInstance = {
        id,
        Component: Component as ComponentType<any>,
        props: props as Record<string, any>,
        containerType: 'modal',
        options: modalOptions,
      };
      setState(s => ({ ...s, modals: [...s.modals, instance] }));
      return id;
    },
    [defaultModalTitle]
  );

  const close = useCallback((id: OverlayId) => {
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
    (id: OverlayId): OverlayInstance | undefined => {
      if (state.leftPanel?.id === id) return state.leftPanel;
      if (state.rightPanel?.id === id) return state.rightPanel;
      return state.modals.find(m => m.id === id);
    },
    [state]
  );

  const updateInstance = useCallback(
    (
      id: OverlayId,
      updates: Partial<Pick<OverlayInstance, 'props' | 'options' | 'dirty' | 'dirtyOptions'>>
    ) => {
      setState(s => {
        const target = s.leftPanel?.id === id ? s.leftPanel : s.rightPanel?.id === id ? s.rightPanel : s.modals.find(m => m.id === id);
        if (!target || changesNothing(target, updates)) return s;
        return {
          leftPanel: s.leftPanel?.id === id ? { ...s.leftPanel, ...updates } : s.leftPanel,
          rightPanel: s.rightPanel?.id === id ? { ...s.rightPanel, ...updates } : s.rightPanel,
          modals: s.modals.map(m => m.id === id ? { ...m, ...updates } : m),
        };
      });
    },
    []
  );

  const setDirty = useCallback((id: OverlayId, dirty: boolean, options?: DirtyStateOptions) => {
    updateInstance(id, { dirty, dirtyOptions: options });
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

/**
 * React hook to retrieve the active floating/drawer panels state.
 * @throws Error if used outside of a {@link PanelProvider}.
 */
export const usePanelState = (): OverlayState => {
  const ctx = useContext(PanelStateContext);
  if (!ctx) throw new Error('useModals / useSidePanels must be used within <DockableDesktopProvider>');
  return ctx;
};

/**
 * React hook to retrieve actions enabling drawer toggles and modal push actions.
 * @throws Error if used outside of a {@link PanelProvider}.
 */
export const usePanelActions = (): PanelActions => {
  const ctx = useContext(PanelActionsContext);
  if (!ctx) throw new Error('useModals / useSidePanels must be used within <DockableDesktopProvider>');
  return ctx;
};
