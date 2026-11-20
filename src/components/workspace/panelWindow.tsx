/**
 * @file panelWindow.tsx
 * @description The window a panel is in (7.12.0, S4): the main one, or its pop-out's. Panel code
 * reads it with `usePanelWindow()`; the app's `popoutWrapper` gets it as props, so a CSS-in-JS
 * cache can follow the panel into the pop-out's document.
 */
import { createContext, useContext, type ComponentType, type Context, type ReactNode } from 'react';

/** The window and document a panel is shown in. See {@link usePanelWindow}. (7.12.0) */
export interface PanelWindow {
  window: Window;
  document: Document;
}

/** The props of `<DockableDesktopProvider popoutWrapper>`. (7.12.0) */
export interface PopoutWrapperProps extends PanelWindow {
  children: ReactNode;
}

/** @internal The panel's window, from its `PanelMount`. Null outside a workspace panel. */
export const PanelWindowContext: Context<PanelWindow | null> = createContext<PanelWindow | null>(null);

/** @internal The provider's `popoutWrapper`. */
export const PopoutWrapperContext: Context<ComponentType<PopoutWrapperProps> | null> = createContext<ComponentType<PopoutWrapperProps> | null>(null);

/**
 * The window and document the panel is shown in (7.12.0): the pop-out's while the panel is in its
 * own window, the main ones otherwise (and outside a workspace panel, or with `popOut` off). It
 * changes when the panel pops out and when it returns, so code that listens on the window, uses
 * its `requestAnimationFrame`, `devicePixelRatio` or `matchMedia`, or creates elements, can follow.
 *
 * @example
 * ```tsx
 * function Chart() {
 *   const { window: win } = usePanelWindow();
 *   useEffect(() => {
 *     const onResize = () => redraw(win.devicePixelRatio);
 *     win.addEventListener('resize', onResize);
 *     return () => win.removeEventListener('resize', onResize);
 *   }, [win]);
 * }
 * ```
 */
export function usePanelWindow(): PanelWindow {
  const here = useContext(PanelWindowContext);
  return here ?? mainWindow();
}

let main: PanelWindow | null = null;
/** The main window, as one stable object (on the server, where there is none, empty). */
export function mainWindow(): PanelWindow {
  if (typeof window === 'undefined') return {} as PanelWindow;
  if (!main || main.window !== window) main = { window, document };
  return main;
}
