/**
 * @file menuKeyboard.ts
 * @description Focus movement shared by the library's WAI-ARIA menus (the context menu and the
 * toolbar group flyout).
 */

/** The enabled items of a menu element, in order. */
export const enabledItems = (menu: HTMLElement | null): HTMLElement[] =>
  menu ? Array.from(menu.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]:not(:disabled)')) : [];

/**
 * Up/Down/Home/End focus movement within one menu (WAI-ARIA menu pattern). Returns true when the
 * key was handled. Wraps around at either end; disabled items are skipped.
 */
export function moveMenuFocus(menu: HTMLElement | null, key: string): boolean {
  const items = enabledItems(menu);
  if (items.length === 0) return false;
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next: HTMLElement | undefined;
  if (key === 'ArrowDown') next = items[(i + 1) % items.length];
  else if (key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
  else if (key === 'Home') next = items[0];
  else if (key === 'End') next = items[items.length - 1];
  if (!next) return false;
  next.focus();
  return true;
}
