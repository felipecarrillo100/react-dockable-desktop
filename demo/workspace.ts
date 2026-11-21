import { createWorkspace } from '../src/index';

// The app's workspace. Panels are registered on its registry (registerDemoPanels) and it is
// passed to <DockableDesktopProvider workspace={workspace}> in App.tsx.
// popOut: panel types with canPopOut (the Leaflet map) and the Cameras widget can open in their own
// browser window (7.12.0).
export const workspace = createWorkspace({ popOut: true });
