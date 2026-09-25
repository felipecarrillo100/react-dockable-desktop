import { createContext, type Context } from 'react';
import type { WorkspaceClient } from '../WorkspaceClient';

/**
 * @internal The workspace object behind the nearest `<DockableDesktopProvider>`. `useWorkspace()`
 * reads it. Kept in its own module so the store (WindowManagerContext) and the workspace class
 * (WorkspaceClient) don't import each other at runtime.
 */
export const WorkspaceInstanceContext: Context<WorkspaceClient<object> | null> = createContext<WorkspaceClient<object> | null>(null);
