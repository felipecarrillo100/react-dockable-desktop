import { createWorkspace } from '../src/index';

// The app's workspace. Panels are registered on its registry (registerDemoPanels) and it is
// passed to <DockableDesktopProvider workspace={workspace}> in App.tsx.
export const workspace = createWorkspace();
