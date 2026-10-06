/**
 * Deprecation, as STABILITY.md describes it: an old name stays as an alias, marked `@deprecated`
 * in its TSDoc (editors strike it through), and calls this, so a developer sees once, in the
 * console, what to use instead and when the old name goes. Development only: never in production.
 *
 * @example
 * ```ts
 * /** @deprecated Since 7.9.0. Use {@link useWorkspace}; removed in 8.0.0. *\/
 * export function useOldName(): Workspace {
 *   warnDeprecated('useOldName()', 'useWorkspace()', '8.0.0');
 *   return useWorkspace();
 * }
 * ```
 */
const warned = new Set<string>();

export function warnDeprecated(oldName: string, replacement: string, removedIn: string): void {
  if (process.env.NODE_ENV !== 'development' || warned.has(oldName)) return;
  warned.add(oldName);
  console.warn(
    `[react-dockable-desktop] ${oldName} is deprecated and will be removed in ${removedIn}. ` +
    `Use ${replacement} instead. See https://felipecarrillo100.github.io/react-dockable-desktop/guide/stability`
  );
}
