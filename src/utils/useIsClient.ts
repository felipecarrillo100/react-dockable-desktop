import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};
const isClient = () => true;
const isServer = () => false;

/**
 * False on the server and during hydration, true once mounted on the client — without a
 * hydration mismatch (`useSyncExternalStore` renders the server value while hydrating, then
 * re-renders with the client one). Gate anything that needs the DOM (portals, created elements)
 * behind it.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNever, isClient, isServer);
}
