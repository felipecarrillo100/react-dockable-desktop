import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Mocks keyed by export name: one of these keys is a name the 7.0 migration renames.
vi.mock('react-dockable-desktop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dockable-desktop')>();
  return {
    ...actual,
    toast: vi.fn(),
    useHostClasses: () => ({ modalClass: 'mocked-modal-class' }),
  };
});

import { App, workspace } from './App';

describe('migration fixture', () => {
  it('renders, opens a panel, and uses the mocked style classes', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => { root.render(<App />); });
    expect(el.querySelector('[data-testid="status"]')!.className).toBe('mocked-modal-class');
    act(() => { (el.querySelector('[data-testid="open-notes"]') as HTMLButtonElement).click(); });
    expect(el.querySelector('[data-testid="count"]')!.textContent).toBe('1');
    expect(workspace.isOpen('notes-1')).toBe(true);
    expect(el.querySelector('.kit-toolbar')).not.toBeNull();
    act(() => root.unmount());
    el.remove();
  });

  it('a panel whose effect lists the usePanel() handle and writes its title and dirty flag settles', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      act(() => { root.render(<App />); });
      act(() => { workspace.openPanel('document-1', 'document'); });
      act(() => { (el.querySelector('[data-testid="rename"]') as HTMLButtonElement).click(); });
      expect(el.querySelector('[data-tab-id="document-1"]')!.textContent).toContain('Report.docx');
      expect(errors.mock.calls.filter(c => String(c[0]).includes('Maximum update depth'))).toEqual([]);
    } finally {
      errors.mockRestore();
      act(() => root.unmount());
      el.remove();
    }
  });
});
