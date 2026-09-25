/**
 * What the library leaves alone on the host page, and what its runtime messages call things.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace, DockableDesktopProvider, RddDesktop } from '../../index';

afterEach(() => { document.documentElement.removeAttribute('data-color-scheme'); document.body.innerHTML = ''; });

function mountDesktop() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => { root.render(<DockableDesktopProvider workspace={createWorkspace()}><RddDesktop /></DockableDesktopProvider>); });
  return () => act(() => root.unmount());
}

describe("the host page's data-color-scheme", () => {
  for (const scheme of ['dark', 'light']) {
    it(`a host-set "${scheme}" survives the desktop's lifetime`, () => {
      document.documentElement.setAttribute('data-color-scheme', scheme);
      const unmount = mountDesktop();
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe(scheme);
      unmount();
      expect(document.documentElement.getAttribute('data-color-scheme')).toBe(scheme);
    });
  }

  it('a page without the attribute still gets none', () => {
    const unmount = mountDesktop();
    expect(document.documentElement.hasAttribute('data-color-scheme')).toBe(false);
    unmount();
  });
});

describe('runtime messages', () => {
  // The 6.x names removed in 7.0 (the same list ApiSurface.test.ts pins), as a message would
  // show them: a JSX tag, a hook call or a bare component name.
  const removed = ['WindowManager', 'WindowManagerProvider', 'WorkspaceClient', 'SecondarySidebar', 'ToolbarProvider',
    'ModalStackRenderer', 'SidePanelRenderer', 'LeftPanelRenderer', 'RightPanelRenderer', 'ToastContainer',
    'ConfirmationForm', 'ContextMenuProvider', 'DefaultContextMenuAdapter', 'PanelContributionProvider',
    'FormContainerProvider', 'PanelOverlayRoot', 'PanelFloatingWindow', 'ToolbarSearchInput', 'useFormContainer',
    'usePanelId', 'usePanelActions', 'usePanelState', 'usePanelFloatingWindow', 'usePanelFloatingWindowManager',
    'useRegistry', 'usePanelContext', 'useWindowManagerState', 'useWindowManagerActions', 'useShowContextMenu',
    'useActivePanelContribution', 'usePredefinedMessages', 'useStyleClasses', 'sidebarSectionToTab', 'defaultPredefinedMessages'];

  it('no warning or error text in the library names a removed 6.x export', () => {
    const src = join(__dirname, '..', '..');
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(n => {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p); } else if (/\.tsx?$/.test(n)) files.push(p);
    });
    walk(src);
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // String and template literals, minus import/export specifiers (module paths, not messages).
      for (const m of text.matchAll(/(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g)) {
        const lit = m[0];
        const before = text.slice(Math.max(0, m.index! - 8), m.index);
        if (/from\s*$|import\s*$/.test(before) || /^['"]\.\.?\//.test(lit)) continue;
        for (const name of removed) {
          if (new RegExp(`(<|\\b)${name}\\b`).test(lit)) hits.push(`${f.split('/src/')[1]}: ${name} in ${lit.slice(0, 60)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
