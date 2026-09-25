/**
 * The public API is exactly what api-surface.json lists — every runtime export and every type
 * export of src/index.ts. A rename, removal or accidental addition fails here, so the 7.0 names
 * (and the migration guide that documents them) can't drift. To change the API on purpose,
 * update api-surface.json in the same commit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as api from '../../index';

const ROOT = join(__dirname, '..', '..', '..');
const surface = JSON.parse(readFileSync(join(ROOT, 'api-surface.json'), 'utf8')) as { exports: string[]; types: string[] };

/** Names exported with `export type { … }` from src/index.ts (the public name after any `as`). */
function typeExports(): string[] {
  const src = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const names: string[] = [];
  for (const m of src.matchAll(/export type \{([^}]*)\}/g)) {
    for (const entry of m[1].split(',').map(e => e.trim()).filter(Boolean)) {
      names.push(entry.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return names.sort();
}

describe('public API surface', () => {
  it('runtime exports match api-surface.json', () => {
    expect(Object.keys(api).sort()).toEqual([...surface.exports].sort());
  });

  it('type exports match api-surface.json', () => {
    expect(typeExports()).toEqual([...surface.types].sort());
  });

  it('no 6.x name survives', () => {
    const removed = [
      'WindowManager', 'WindowManagerProvider', 'WorkspaceClient', 'Sidebar', 'SecondarySidebar', 'Toolbar',
      'ToolbarProvider', 'ModalStackRenderer', 'SidePanelRenderer', 'LeftPanelRenderer', 'RightPanelRenderer',
      'ToastContainer', 'ConfirmationForm', 'ContextMenu', 'ContextMenuProvider', 'DefaultContextMenuAdapter',
      'PanelProvider', 'PanelContributionProvider', 'FormContainerContext', 'FormContainerProvider',
      'PanelOverlayRoot', 'PanelToolbar', 'PanelFloatingWindow', 'ToolbarButton', 'ToolbarToggle', 'ToolbarSearchInput',
      'useWindowManagerState', 'useWindowManagerActions', 'useRegistry', 'usePanelContext', 'useFormContainer',
      'usePanelId', 'usePanelActions', 'usePanelState', 'usePanelFloatingWindow', 'usePanelFloatingWindowManager',
      'useShowContextMenu', 'useActivePanelContribution', 'usePredefinedMessages', 'useStyleClasses',
      'sidebarSectionToTab', 'defaultPredefinedMessages', 'PanelRegistryClass',
    ];
    const present = removed.filter(n => n in api || typeExports().includes(n));
    expect(present).toEqual([]);
    expect('default' in api).toBe(false);
  });
});
