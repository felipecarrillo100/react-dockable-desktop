/**
 * @file ToolbarContext.tsx
 * @description Toolbar state context — radio group selection and toggle modifier state.
 * Provided by DockableDesktopProvider; consumed via useToolbar() from anywhere in the tree.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';

export interface ToolbarContextValue {
  /** Returns the active item id in a radio group, or null if none. */
  getActiveInGroup: (group: string) => string | null;
  /** Set the active item in a radio group (pass null to deselect all). */
  setActiveInGroup: (group: string, id: string | null) => void;
  /** Returns whether a toggle modifier is currently active. */
  isModifierActive: (id: string) => boolean;
  /** Explicitly set a toggle modifier's active state. */
  setModifierActive: (id: string, active: boolean) => void;
  /** Flip a toggle modifier between active and inactive. */
  toggleModifier: (id: string) => void;
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

export const ToolbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [radioGroups, setRadioGroups] = useState<Record<string, string | null>>({});
  const [modifiers, setModifiers] = useState<Record<string, boolean>>({});

  const value = useMemo<ToolbarContextValue>(() => ({
    getActiveInGroup: (group) => radioGroups[group] ?? null,
    setActiveInGroup: (group, id) => setRadioGroups(prev => ({ ...prev, [group]: id })),
    isModifierActive: (id) => modifiers[id] ?? false,
    setModifierActive: (id, active) => setModifiers(prev => ({ ...prev, [id]: active })),
    toggleModifier: (id) => setModifiers(prev => ({ ...prev, [id]: !prev[id] })),
  }), [radioGroups, modifiers]);

  return <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>;
};

/**
 * Returns toolbar state and control functions from anywhere inside
 * a `<DockableDesktopProvider>` tree.
 *
 * @throws Error if used outside of a {@link DockableDesktopProvider}.
 */
export function useToolbar(): ToolbarContextValue {
  const ctx = useContext(ToolbarContext);
  if (!ctx) throw new Error('useToolbar must be used within DockableDesktopProvider');
  return ctx;
}
