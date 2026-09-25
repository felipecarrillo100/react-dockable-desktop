/**
 * Hydrating server-rendered HTML must not report a mismatch, and must end up showing the
 * client's real colour scheme. The server can't know the scheme, so it renders 'dark'; a page
 * whose <html> says light must still switch to light after hydration.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { useColorScheme, RddToasts, createWorkspace, DockableDesktopProvider, RddDesktop } from '../../index';

afterEach(() => { document.documentElement.removeAttribute('data-color-scheme'); document.body.innerHTML = ''; });

/** Hydrates `element` over `serverHtml`; returns the mismatch errors React reported. */
async function hydrate(serverHtml: string, element: React.ReactElement) {
  const container = document.createElement('div');
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  const recoverable: string[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: (e) => { recoverable.push(String((e as Error)?.message ?? e)); } });
  });
  return { container, recoverable, unmount: () => act(() => root!.unmount()) };
}

describe('hydration', () => {
  it('useColorScheme hydrates from the server value, then shows the client scheme', async () => {
    document.documentElement.setAttribute('data-color-scheme', 'light');
    const Probe = () => <span>{useColorScheme()}</span>;
    const { container, recoverable, unmount } = await hydrate('<span>dark</span>', <Probe />);
    expect(recoverable).toEqual([]);
    expect(container.textContent).toBe('light');
    unmount();
  });

  it('a workspace with open panels hydrates without a mismatch, then mounts the panel bodies', async () => {
    const Body = () => <div className="ssr-panel-body">body</div>;
    const make = () => {
      const ws = createWorkspace({ panels: { b: { component: Body } } });
      ws.openPanel('docked', 'b', { title: 'Docked' });
      ws.openPanel('float', 'b', { title: 'Float', initialTarget: 'floating' });
      return ws;
    };
    const tree = (ws: ReturnType<typeof make>) => <DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>;
    const serverHtml = renderToString(tree(make()));
    expect(serverHtml).not.toContain('ssr-panel-body');
    const { container, recoverable, unmount } = await hydrate(serverHtml, tree(make()));
    expect(recoverable).toEqual([]);
    expect(container.querySelectorAll('.ssr-panel-body').length).toBe(2);
    unmount();
  });

  it('RddToasts hydrates from empty server output and then mounts its region', async () => {
    const { recoverable, unmount } = await hydrate('', <RddToasts />);
    expect(recoverable).toEqual([]);
    expect(document.body.querySelector('.rdd-toast-container')).not.toBeNull();
    unmount();
  });
});
