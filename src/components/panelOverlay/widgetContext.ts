/**
 * @file widgetContext.ts
 * @description `useWidget()`: what a managed widget's own content knows about the widget (7.11.0).
 */
import { createContext, useContext, type Context } from 'react';
import type { WidgetLocation } from './types';

/**
 * What `useWidget()` returns inside a managed widget's content (7.11.0).
 *
 * `usePanel()` there is still the **owner** panel, so content bound to its owner (a table bound to
 * its map) keeps working wherever the widget is. This is the widget's own side.
 */
export interface WidgetHandle {
  /** The widget's id, as given to `useFloatingWidgets().open()`. */
  id: string;
  /** The workspace panel that owns it, or `null` when its overlay isn't in one. */
  ownerPanelId: string | null;
  /** Where it is shown now. A component that reads it re-renders when it changes. */
  location: WidgetLocation;
  /**
   * Called just before the widget's content element moves to another container: into or out of
   * its panel, between docked, tabbed and floating, minimised or restored. Save what a move would
   * disturb here, such as a map's view. Returns the unsubscribe function.
   */
  onWillMove(cb: () => void): () => void;
  /**
   * Called once the element is in its new container and has its new size (or, with no size, as
   * when minimised, on the next frames). Restore what you saved in `onWillMove` here. Returns the
   * unsubscribe function.
   */
  onMoved(cb: () => void): () => void;
}

/** @internal */
export const WidgetContext: Context<WidgetHandle | null> = createContext<WidgetHandle | null>(null);

/**
 * The managed widget this component is rendered in, or `null` outside one (7.11.0).
 * @example
 * function TableWidget() {
 *   const widget = useWidget();
 *   useEffect(() => widget?.onMoved(() => grid.current?.resize()), [widget]);
 *   return <Grid ref={grid} compact={widget?.location === 'panel'} />;
 * }
 */
export function useWidget(): WidgetHandle | null {
  return useContext(WidgetContext);
}
