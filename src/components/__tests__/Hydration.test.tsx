/**
 * Hydrating server-rendered HTML must not report a mismatch, and must end up showing the
 * client's real colour scheme. The server can't know the scheme, so it renders 'dark'; a page
 * whose <html> says light must still switch to light after hydration.
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react';
import { useColorScheme, ToastContainer } from '../../index';

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

  it('ToastContainer hydrates from empty server output and then mounts its region', async () => {
    const { recoverable, unmount } = await hydrate('', <ToastContainer />);
    expect(recoverable).toEqual([]);
    expect(document.body.querySelector('.rdd-toast-container')).not.toBeNull();
    unmount();
  });
});
